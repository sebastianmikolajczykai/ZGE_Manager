import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { StepKind } from '../work-types/work-type-definition.js';
import { WorkTypeRepository } from '../work-types/work-type-repository.js';
import { parseMeasurementDate, parseOrderInput, type OrderInput } from './order-input.js';
import { optional, requirePerson } from '../common/form-fields.js';

export type StepStatus = 'pending' | 'active' | 'done';
export type HistoryAction =
  'created' | 'step_done' | 'checked' | 'undone' | 'payment_call' | 'limit_changed' | 'measurement_set';

export interface OrderStep {
  position: number;
  name: string;
  kind: StepKind;
  limitDays: number | null;
  provisional: boolean;
  /** Krok „Zapłata”: zlecenie widać wtedy w zakładce Niezapłacone. */
  payment: boolean;
  status: StepStatus;
  startedOn: LocalDate | null;
  doneOn: LocalDate | null;
  doneBy: string | null;
  lastCheckedOn: LocalDate | null;
  lastCheckedBy: string | null;
}

export interface Order extends Omit<OrderInput, 'workTypeId'> {
  id: number;
  workTypeId: number;
  receivedOn: LocalDate;
  status: 'active' | 'completed';
  completedOn: LocalDate | null;
  steps: OrderStep[];
}

export interface HistoryEntry {
  /** Numer wpisu (do cofania). */
  id: number;
  happenedOn: LocalDate;
  person: string;
  action: HistoryAction;
  stepPosition: number | null;
  stepName: string | null;
  /** Notatka, np. z rozmowy o zapłacie. */
  note: string | null;
  /** Wpis cofnięty później (pokazywany jako przekreślony). */
  reverted: boolean;
}

/** Jak opisać w historii, co zostało cofnięte. */
const UNDO_LABEL: Record<UndoableAction, string> = {
  step_done: 'zrobione',
  checked: 'sprawdzone dziś',
  payment_call: 'przypomnienie o zapłacie',
  limit_changed: 'zmiana limitu',
  measurement_set: 'data pomiaru',
};
/** Cofnięcia, przy których w historii widać też, co się zmieniało (np. „2 → 6 dni”). */
const UNDO_WITH_NOTE: readonly UndoableAction[] = ['limit_changed', 'measurement_set'];
type UndoableAction = Exclude<HistoryAction, 'created' | 'undone'>;

/** Poprzedni stan kroku zapisany przy wpisie, żeby dało się go przywrócić. */
interface CheckUndoData {
  on: LocalDate | null;
  by: string | null;
}
interface LimitUndoData {
  limitDays: number | null;
  provisional: boolean;
}
interface MeasurementUndoData {
  measurementOn: LocalDate | null;
}
type UndoData = CheckUndoData | LimitUndoData | MeasurementUndoData;

const GROSZE_PER_PLN = 100;

/** Zlecenia: tworzenie z szablonu, odhaczanie, „Sprawdzone dziś”, cofanie i historia. */
export class OrderService {
  private readonly workTypes: WorkTypeRepository;

  /** @param today zwraca dzisiejszą datę (wstrzykiwane, żeby dało się testować). */
  constructor(
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
  ) {
    this.workTypes = new WorkTypeRepository(db);
  }

  create(raw: OrderInput, person: string): number {
    const who = requirePerson(person);
    const input = parseOrderInput(raw);
    const workType = this.workTypes.findById(input.workTypeId);
    if (!workType) throw new Error(`Nieznany rodzaj pracy (numer ${input.workTypeId})`);
    const today = this.today();
    if (input.measurementOn !== null) validateNotPast(input.measurementOn, today);

    return this.inTransaction(() => {
      const id = Number(
        this.db.connection
          .prepare(
            `INSERT INTO orders (client_name, phone, town, work_type_id, plot, office, price_grosze, note, measurement_on, received_on)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.clientName,
            input.phone,
            input.town,
            input.workTypeId,
            input.plot,
            input.office,
            input.pricePln === null ? null : Math.round(input.pricePln * GROSZE_PER_PLN),
            input.note,
            input.measurementOn,
            today,
          ).lastInsertRowid,
      );
      const insertStep = this.db.connection.prepare(
        `INSERT INTO order_steps (order_id, position, name, kind, limit_days, provisional, payment, status, started_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of workType.steps) {
        const first = s.position === 1;
        insertStep.run(
          id,
          s.position,
          s.name,
          s.kind,
          s.limitDays,
          s.provisional ? 1 : 0,
          s.payment ? 1 : 0,
          first ? 'active' : 'pending',
          first ? today : null,
        );
      }
      this.log(id, who, 'created', null);
      return id;
    });
  }

  completeStep(orderId: number, position: number, person: string): void {
    const who = requirePerson(person);
    const step = this.requireActiveStep(orderId, position);
    const today = this.today();
    this.inTransaction(() => {
      this.db.connection
        .prepare(
          "UPDATE order_steps SET status = 'done', done_on = ?, done_by = ? WHERE order_id = ? AND position = ?",
        )
        .run(today, who, orderId, position);
      const next = this.db.connection
        .prepare(
          "UPDATE order_steps SET status = 'active', started_on = ? WHERE order_id = ? AND position = ?",
        )
        .run(today, orderId, position + 1);
      if (next.changes === 0) {
        this.db.connection
          .prepare("UPDATE orders SET status = 'completed', completed_on = ? WHERE id = ?")
          .run(today, orderId);
      }
      this.log(orderId, who, 'step_done', step);
    });
  }

  /** „Sprawdzone dziś” w kroku codziennym: zapis kontroli, krok zostaje otwarty. */
  /** Rozmowa z klientem o zapłacie: zapisuje datę kontaktu (licznik od nowa) i notatkę w historii. */
  recordPaymentCall(orderId: number, person: string, note: string | null): void {
    const who = requirePerson(person);
    const step = this.require(orderId).steps.find((s) => s.status === 'active');
    if (!step?.payment) throw new Error(`Zlecenie nr ${orderId} nie czeka na zapłatę`);
    this.inTransaction(() => {
      this.db.connection
        .prepare(
          'UPDATE order_steps SET last_checked_on = ?, last_checked_by = ? WHERE order_id = ? AND position = ?',
        )
        .run(this.today(), who, orderId, step.position);
      this.log(orderId, who, 'payment_call', step, optional(note), checkUndoData(step));
    });
  }

  /** Zmienia limit aktywnego kroku tylko w tym zleceniu (np. urząd zapowiedział dłuższy termin). */
  changeStepLimit(orderId: number, position: number, limitText: string, person: string): void {
    const who = requirePerson(person);
    const step = this.requireActiveStep(orderId, position);
    if (step.limitDays === null) throw new Error(`Krok „${step.name}” nie ma limitu dni`);
    const limit = parseStepLimit(limitText);
    this.inTransaction(() => {
      this.db.connection
        .prepare('UPDATE order_steps SET limit_days = ?, provisional = 0 WHERE order_id = ? AND position = ?')
        .run(limit, orderId, position);
      const before: LimitUndoData = { limitDays: step.limitDays, provisional: step.provisional };
      this.log(orderId, who, 'limit_changed', step, `${step.limitDays} → ${limit} dni`, before);
    });
  }

  /** Wpisuje albo zmienia datę pomiaru (np. gdy urząd potwierdził termin); zmiana trafia do historii i da się ją cofnąć. */
  setMeasurementDate(orderId: number, dateText: string, person: string): void {
    const who = requirePerson(person);
    const order = this.require(orderId);
    if (order.status !== 'active') throw new Error(`Zlecenie nr ${orderId} jest zakończone`);
    if (dateText.trim() === '') throw new Error('Podaj datę pomiaru');
    const date = parseMeasurementDate(dateText.trim()) as LocalDate;
    validateNotPast(date, this.today());
    if (date === order.measurementOn) throw new Error('To ta sama data pomiaru, nic się nie zmienia');
    this.inTransaction(() => {
      this.db.connection.prepare('UPDATE orders SET measurement_on = ? WHERE id = ?').run(date, orderId);
      const before: MeasurementUndoData = { measurementOn: order.measurementOn };
      const change = `${dateOrNone(order.measurementOn)} → ${dateOrNone(date)}`;
      this.log(orderId, who, 'measurement_set', null, change, before);
    });
  }

  checkToday(orderId: number, position: number, person: string): void {
    const who = requirePerson(person);
    const step = this.requireActiveStep(orderId, position);
    if (step.kind !== 'daily') throw new Error(`Krok „${step.name}” nie jest krokiem codziennym`);
    this.inTransaction(() => {
      this.db.connection
        .prepare(
          'UPDATE order_steps SET last_checked_on = ?, last_checked_by = ? WHERE order_id = ? AND position = ?',
        )
        .run(this.today(), who, orderId, position);
      this.log(orderId, who, 'checked', step, null, checkUndoData(step));
    });
  }

  /** Cofa ostatnio odhaczony krok (pomyłka); ślad zostaje w historii. */
  undoLastStep(orderId: number, person: string): void {
    const who = requirePerson(person);
    const order = this.require(orderId);
    const lastDone = [...order.steps].reverse().find((s) => s.status === 'done');
    if (!lastDone) throw new Error('Nie ma czego cofnąć: żaden krok nie jest odhaczony');
    this.inTransaction(() => this.revertStepDone(orderId, lastDone, who));
  }

  /**
   * Wpis historii, który można teraz cofnąć: najnowszy, który wciąż działa
   * (cofamy po kolei od góry, żeby stan zlecenia zawsze się zgadzał). Null = nic do cofnięcia.
   */
  undoableEntryId(orderId: number): number | null {
    const order = this.require(orderId);
    const candidate = this.historyRows(orderId)
      .reverse()
      .find((r) => r.reverted === 0 && isUndoable(r.action) && canRevert(order, r));
    return candidate?.id ?? null;
  }

  /** Cofa wpis z historii (przywraca stan sprzed kliknięcia); cofnięcie też trafia do historii. */
  undoEntry(orderId: number, entryId: number, person: string): void {
    const who = requirePerson(person);
    const order = this.require(orderId);
    const entry = this.historyRows(orderId).find((r) => r.id === entryId);
    if (!entry || entry.reverted === 1 || !isUndoable(entry.action)) {
      throw new Error('Tego wpisu nie można cofnąć');
    }
    if (this.undoableEntryId(orderId) !== entryId) {
      throw new Error('Najpierw cofnij nowsze wpisy w historii (cofamy po kolei, od najnowszego)');
    }
    const action = entry.action;
    const step = order.steps.find((s) => s.position === entry.step_position) ?? null;
    this.inTransaction(() => {
      if (action === 'step_done') return this.revertStepDone(orderId, step as OrderStep, who);
      if (action === 'measurement_set') this.restoreMeasurement(orderId, entry);
      else this.restoreStep(orderId, (step as OrderStep).position, entry);
      this.db.connection.prepare('UPDATE order_history SET reverted = 1 WHERE id = ?').run(entryId);
      const label = UNDO_LABEL[action];
      this.log(
        orderId,
        who,
        'undone',
        step,
        UNDO_WITH_NOTE.includes(action) ? `${label} ${entry.note}` : label,
      );
    });
  }

  /** Przywraca datę pomiaru sprzed wpisu (także „brak daty”). */
  private restoreMeasurement(orderId: number, entry: HistoryRow): void {
    const data = JSON.parse(entry.undo_data ?? '{}') as MeasurementUndoData;
    this.db.connection
      .prepare('UPDATE orders SET measurement_on = ? WHERE id = ?')
      .run(data.measurementOn ?? null, orderId);
  }

  /** Przywraca stan kroku zapisany przy wpisie (kontrola / rozmowa o zapłacie / limit). */
  private restoreStep(orderId: number, position: number, entry: HistoryRow): void {
    const data = JSON.parse(entry.undo_data ?? '{}') as CheckUndoData & LimitUndoData;
    if (entry.action === 'limit_changed') {
      this.db.connection
        .prepare('UPDATE order_steps SET limit_days = ?, provisional = ? WHERE order_id = ? AND position = ?')
        .run(data.limitDays, data.provisional ? 1 : 0, orderId, position);
      return;
    }
    this.db.connection
      .prepare(
        'UPDATE order_steps SET last_checked_on = ?, last_checked_by = ? WHERE order_id = ? AND position = ?',
      )
      .run(data.on, data.by, orderId, position);
  }

  /**
   * Odhaczony krok wraca do „aktywny”, następny do „czeka”. Kontrole i rozmowy na następnym kroku
   * przestają obowiązywać, więc zaznaczamy je jako cofnięte (tak samo wpis „zrobione”).
   */
  private revertStepDone(orderId: number, step: OrderStep, who: string): void {
    const conn = this.db.connection;
    conn
      .prepare(
        "UPDATE order_steps SET status = 'pending', started_on = NULL, last_checked_on = NULL, last_checked_by = NULL WHERE order_id = ? AND position = ?",
      )
      .run(orderId, step.position + 1);
    conn
      .prepare(
        "UPDATE order_steps SET status = 'active', done_on = NULL, done_by = NULL WHERE order_id = ? AND position = ?",
      )
      .run(orderId, step.position);
    conn.prepare("UPDATE orders SET status = 'active', completed_on = NULL WHERE id = ?").run(orderId);
    conn
      .prepare(
        `UPDATE order_history SET reverted = 1 WHERE order_id = ? AND reverted = 0 AND (
           (action = 'step_done' AND step_position = ?) OR (action IN ('checked', 'payment_call') AND step_position = ?))`,
      )
      .run(orderId, step.position, step.position + 1);
    this.log(orderId, who, 'undone', step, UNDO_LABEL.step_done);
  }

  /** Czy w zleceniu nie odhaczono jeszcze żadnego kroku (wtedy wolno je usunąć przy cofnięciu przyjęcia oferty). */
  isUntouched(orderId: number): boolean {
    const order = this.get(orderId);
    return order !== null && order.steps.every((s) => s.status !== 'done');
  }

  /** Usuwa zlecenie razem z krokami i historią; tylko gdy nic w nim jeszcze nie zrobiono. */
  deleteUntouched(orderId: number): void {
    this.require(orderId);
    if (!this.isUntouched(orderId)) {
      throw new Error(`W zleceniu nr ${orderId} odhaczono już krok, więc nie można go usunąć`);
    }
    this.inTransaction(() => {
      this.db.connection.prepare('UPDATE offers SET order_id = NULL WHERE order_id = ?').run(orderId);
      this.db.connection.prepare('DELETE FROM orders WHERE id = ?').run(orderId);
    });
  }

  get(orderId: number): Order | null {
    const row = this.db.connection.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
      OrderRow | undefined;
    return row ? toOrder(row, this.stepsOf(orderId)) : null;
  }

  listActive(): Order[] {
    const rows = this.db.connection
      .prepare("SELECT * FROM orders WHERE status = 'active' ORDER BY received_on, id")
      .all() as OrderRow[];
    return rows.map((r) => toOrder(r, this.stepsOf(r.id)));
  }

  history(orderId: number): HistoryEntry[] {
    return this.historyRows(orderId).map((r) => ({
      id: r.id,
      happenedOn: r.happened_on,
      person: r.person,
      action: r.action,
      stepPosition: r.step_position,
      stepName: r.step_name,
      note: r.note,
      reverted: r.reverted === 1,
    }));
  }

  private historyRows(orderId: number): HistoryRow[] {
    return this.db.connection
      .prepare('SELECT * FROM order_history WHERE order_id = ? ORDER BY id')
      .all(orderId) as HistoryRow[];
  }

  private require(orderId: number): Order {
    const order = this.get(orderId);
    if (!order) throw new Error(`Nie ma zlecenia o numerze ${orderId}`);
    return order;
  }

  private requireActiveStep(orderId: number, position: number): OrderStep {
    const step = this.require(orderId).steps.find((s) => s.position === position);
    if (!step || step.status !== 'active') throw new Error(`Krok ${position} nie jest aktywny`);
    return step;
  }

  private log(
    orderId: number,
    person: string,
    action: HistoryAction,
    step: OrderStep | null,
    note: string | null = null,
    undoData: UndoData | null = null,
  ): void {
    this.db.connection
      .prepare(
        'INSERT INTO order_history (order_id, happened_on, person, action, step_position, step_name, note, undo_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        orderId,
        this.today(),
        person,
        action,
        step?.position ?? null,
        step?.name ?? null,
        note,
        undoData === null ? null : JSON.stringify(undoData),
      );
  }

  private inTransaction<T>(work: () => T): T {
    return this.db.connection.transaction(work)();
  }

  private stepsOf(orderId: number): OrderStep[] {
    const rows = this.db.connection
      .prepare('SELECT * FROM order_steps WHERE order_id = ? ORDER BY position')
      .all(orderId) as StepRow[];
    return rows.map((r) => ({
      position: r.position,
      name: r.name,
      kind: r.kind,
      limitDays: r.limit_days,
      provisional: r.provisional === 1,
      payment: r.payment === 1,
      status: r.status,
      startedOn: r.started_on,
      doneOn: r.done_on,
      doneBy: r.done_by,
      lastCheckedOn: r.last_checked_on,
      lastCheckedBy: r.last_checked_by,
    }));
  }
}

interface OrderRow {
  id: number;
  client_name: string;
  phone: string;
  town: string;
  work_type_id: number;
  plot: string | null;
  office: string | null;
  price_grosze: number | null;
  note: string | null;
  measurement_on: string | null;
  received_on: string;
  status: 'active' | 'completed';
  completed_on: string | null;
}

interface StepRow {
  position: number;
  name: string;
  kind: StepKind;
  limit_days: number | null;
  provisional: number;
  payment: number;
  status: StepStatus;
  started_on: string | null;
  done_on: string | null;
  done_by: string | null;
  last_checked_on: string | null;
  last_checked_by: string | null;
}

interface HistoryRow {
  id: number;
  happened_on: string;
  person: string;
  action: HistoryAction;
  step_position: number | null;
  step_name: string | null;
  note: string | null;
  undo_data: string | null;
  reverted: number;
}

function isUndoable(action: HistoryAction): action is UndoableAction {
  return action !== 'created' && action !== 'undone';
}

/** Czy wpis wciąż działa i da się go bezpiecznie cofnąć (stare wpisy bez zapisanego stanu: tylko „zrobione”). */
function canRevert(order: Order, entry: HistoryRow): boolean {
  if (entry.action === 'measurement_set') return order.status === 'active' && entry.undo_data !== null;
  const step = order.steps.find((s) => s.position === entry.step_position);
  if (!step) return false;
  if (entry.action === 'step_done') {
    return (
      step.status === 'done' && !order.steps.some((s) => s.position > step.position && s.status === 'done')
    );
  }
  return step.status === 'active' && entry.undo_data !== null;
}

function checkUndoData(step: OrderStep): CheckUndoData {
  return { on: step.lastCheckedOn, by: step.lastCheckedBy };
}

function toOrder(r: OrderRow, steps: OrderStep[]): Order {
  return {
    id: r.id,
    clientName: r.client_name,
    phone: r.phone,
    town: r.town,
    workTypeId: r.work_type_id,
    plot: r.plot,
    office: r.office,
    pricePln: r.price_grosze === null ? null : r.price_grosze / GROSZE_PER_PLN,
    note: r.note,
    measurementOn: r.measurement_on,
    receivedOn: r.received_on,
    status: r.status,
    completedOn: r.completed_on,
    steps,
  };
}

/** Data pomiaru nie może być w przeszłości (dziś wolno). */
function validateNotPast(date: LocalDate, today: LocalDate): void {
  // Daty RRRR-MM-DD (sprawdzone wcześniej) porównują się poprawnie jako tekst.
  if (date < today) throw new Error(`Data pomiaru ${date} jest w przeszłości`);
}

/** Data do historii: DD.MM.RRRR albo „brak”. */
function dateOrNone(date: LocalDate | null): string {
  if (date === null) return 'brak';
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

const MAX_STEP_LIMIT_DAYS = 365;

function parseStepLimit(text: string): number {
  const value = Number(text.trim());
  if (text.trim() === '' || !Number.isInteger(value) || value < 1 || value > MAX_STEP_LIMIT_DAYS) {
    throw new Error(`Limit musi być liczbą dni roboczych od 1 do ${MAX_STEP_LIMIT_DAYS}`);
  }
  return value;
}
