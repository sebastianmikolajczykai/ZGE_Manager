import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { StepKind } from '../work-types/work-type-definition.js';
import { WorkTypeRepository } from '../work-types/work-type-repository.js';
import { parseOrderInput, type OrderInput } from './order-input.js';
import { optional, requirePerson } from '../common/form-fields.js';

export type StepStatus = 'pending' | 'active' | 'done';
export type HistoryAction =
  | 'created'
  | 'step_done'
  | 'checked'
  | 'undone'
  | 'payment_call'
  | 'limit_changed'
  | 'lead_changed'
  | 'step_assigned';

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
  /** Osoba przypisana do kroku; null = krok należy do osoby prowadzącej zlecenie. */
  assignee: string | null;
}

export interface Order extends Omit<OrderInput, 'workTypeId'> {
  id: number;
  workTypeId: number;
  receivedOn: LocalDate;
  status: 'active' | 'completed';
  completedOn: LocalDate | null;
  leadPerson: string | null;
  steps: OrderStep[];
}

/** Przypisanie osób: prowadzący zlecenie i osoby kroków (numer kroku → imię; pusty tekst = nikt). */
export interface PeopleAssignment {
  leadPerson: string;
  steps: Record<number, string>;
}

const NOBODY = 'brak';

/** Do kogo należy bieżący krok: osoba przypisana do kroku, a gdy jej nie ma, prowadzący zlecenie. */
export function currentOwner(order: Order): string | null {
  const active = order.steps.find((st) => st.status === 'active');
  return active?.assignee ?? order.leadPerson;
}

export interface HistoryEntry {
  happenedOn: LocalDate;
  person: string;
  action: HistoryAction;
  stepPosition: number | null;
  stepName: string | null;
  /** Notatka, np. z rozmowy o zapłacie. */
  note: string | null;
}

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
    this.validateMeasurement(
      input,
      workType.steps.some((s) => s.kind === 'scheduled'),
      today,
    );

    return this.inTransaction(() => {
      const id = Number(
        this.db.connection
          .prepare(
            `INSERT INTO orders (client_name, phone, town, work_type_id, plot, office, price_grosze, note, measurement_on, received_on, lead_person)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            input.leadPerson ?? null,
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
      this.log(orderId, who, 'payment_call', step, optional(note));
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
      this.log(orderId, who, 'limit_changed', step, `${step.limitDays} → ${limit} dni`);
    });
  }

  /**
   * Ustawia prowadzącego i osoby kroków (także z góry, dla przyszłych kroków).
   * Zrobionych kroków nie zmienia; do historii trafia tylko to, co się zmieniło.
   */
  assignPeople(orderId: number, assignment: PeopleAssignment, person: string): void {
    const who = requirePerson(person);
    const order = this.require(orderId);
    const lead = optional(assignment.leadPerson);
    this.inTransaction(() => {
      if (lead !== order.leadPerson) {
        this.db.connection.prepare('UPDATE orders SET lead_person = ? WHERE id = ?').run(lead, orderId);
        this.log(orderId, who, 'lead_changed', null, change(order.leadPerson, lead));
      }
      for (const step of order.steps) {
        const wanted = assignment.steps[step.position];
        if (step.status === 'done' || wanted === undefined) continue;
        const assignee = optional(wanted);
        if (assignee === step.assignee) continue;
        this.db.connection
          .prepare('UPDATE order_steps SET assignee = ? WHERE order_id = ? AND position = ?')
          .run(assignee, orderId, step.position);
        this.log(orderId, who, 'step_assigned', step, change(step.assignee, assignee));
      }
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
      this.log(orderId, who, 'checked', step);
    });
  }

  /** Cofa ostatnio odhaczony krok (pomyłka); ślad zostaje w historii. */
  undoLastStep(orderId: number, person: string): void {
    const who = requirePerson(person);
    const order = this.require(orderId);
    const lastDone = [...order.steps].reverse().find((s) => s.status === 'done');
    if (!lastDone) throw new Error('Nie ma czego cofnąć: żaden krok nie jest odhaczony');
    this.inTransaction(() => {
      const conn = this.db.connection;
      conn
        .prepare(
          "UPDATE order_steps SET status = 'pending', started_on = NULL, last_checked_on = NULL, last_checked_by = NULL WHERE order_id = ? AND position = ?",
        )
        .run(orderId, lastDone.position + 1);
      conn
        .prepare(
          "UPDATE order_steps SET status = 'active', done_on = NULL, done_by = NULL WHERE order_id = ? AND position = ?",
        )
        .run(orderId, lastDone.position);
      conn.prepare("UPDATE orders SET status = 'active', completed_on = NULL WHERE id = ?").run(orderId);
      this.log(orderId, who, 'undone', lastDone);
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
    const rows = this.db.connection
      .prepare(
        'SELECT happened_on, person, action, step_position, step_name, note FROM order_history WHERE order_id = ? ORDER BY id',
      )
      .all(orderId) as HistoryRow[];
    return rows.map((r) => ({
      happenedOn: r.happened_on,
      person: r.person,
      action: r.action,
      stepPosition: r.step_position,
      stepName: r.step_name,
      note: r.note,
    }));
  }

  private validateMeasurement(input: OrderInput, needsMeasurement: boolean, today: LocalDate): void {
    if (needsMeasurement && input.measurementOn === null) {
      throw new Error('Podaj datę pomiaru w terenie');
    }
    // Daty RRRR-MM-DD (sprawdzone w parseOrderInput) porównują się poprawnie jako tekst.
    if (input.measurementOn !== null && input.measurementOn < today) {
      throw new Error(`Data pomiaru ${input.measurementOn} jest w przeszłości`);
    }
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
  ): void {
    this.db.connection
      .prepare(
        'INSERT INTO order_history (order_id, happened_on, person, action, step_position, step_name, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(orderId, this.today(), person, action, step?.position ?? null, step?.name ?? null, note);
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
      assignee: r.assignee,
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
  lead_person: string | null;
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
  assignee: string | null;
}

interface HistoryRow {
  happened_on: string;
  person: string;
  action: HistoryAction;
  step_position: number | null;
  step_name: string | null;
  note: string | null;
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
    leadPerson: r.lead_person,
    steps,
  };
}

const MAX_STEP_LIMIT_DAYS = 365;

/** Opis zmiany osoby do historii, np. „brak → Bartek”. */
function change(from: string | null, to: string | null): string {
  return `${from ?? NOBODY} → ${to ?? NOBODY}`;
}

function parseStepLimit(text: string): number {
  const value = Number(text.trim());
  if (text.trim() === '' || !Number.isInteger(value) || value < 1 || value > MAX_STEP_LIMIT_DAYS) {
    throw new Error(`Limit musi być liczbą dni roboczych od 1 do ${MAX_STEP_LIMIT_DAYS}`);
  }
  return value;
}
