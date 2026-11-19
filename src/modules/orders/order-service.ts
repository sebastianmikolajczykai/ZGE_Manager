import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import type { StepKind } from '../work-types/work-type-definition.js';
import { WorkTypeRepository } from '../work-types/work-type-repository.js';
import { parseOrderInput, type OrderInput } from './order-input.js';

export type StepStatus = 'pending' | 'active' | 'done';
export type HistoryAction = 'created' | 'step_done' | 'checked' | 'undone';

export interface OrderStep {
  position: number;
  name: string;
  kind: StepKind;
  limitDays: number | null;
  provisional: boolean;
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
  happenedOn: LocalDate;
  person: string;
  action: HistoryAction;
  stepPosition: number | null;
  stepName: string | null;
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
        `INSERT INTO order_steps (order_id, position, name, kind, limit_days, provisional, status, started_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
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
        'SELECT happened_on, person, action, step_position, step_name FROM order_history WHERE order_id = ? ORDER BY id',
      )
      .all(orderId) as HistoryRow[];
    return rows.map((r) => ({
      happenedOn: r.happened_on,
      person: r.person,
      action: r.action,
      stepPosition: r.step_position,
      stepName: r.step_name,
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

  private log(orderId: number, person: string, action: HistoryAction, step: OrderStep | null): void {
    this.db.connection
      .prepare(
        'INSERT INTO order_history (order_id, happened_on, person, action, step_position, step_name) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(orderId, this.today(), person, action, step?.position ?? null, step?.name ?? null);
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
      status: r.status,
      startedOn: r.started_on,
      doneOn: r.done_on,
      doneBy: r.done_by,
      lastCheckedOn: r.last_checked_on,
      lastCheckedBy: r.last_checked_by,
    }));
  }
}

function requirePerson(person: string): string {
  const who = person.trim();
  if (!who) throw new Error('Wybierz, kto wykonał czynność');
  return who;
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
  status: StepStatus;
  started_on: string | null;
  done_on: string | null;
  done_by: string | null;
  last_checked_on: string | null;
  last_checked_by: string | null;
}

interface HistoryRow {
  happened_on: string;
  person: string;
  action: HistoryAction;
  step_position: number | null;
  step_name: string | null;
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
