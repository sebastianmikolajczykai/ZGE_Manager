import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import { UrgencyRules, type Urgency } from '../urgency/urgency-rules.js';
import { currentOwner, type Order, type OrderService, type OrderStep } from '../orders/order-service.js';
import { WorkTypeRepository } from '../work-types/work-type-repository.js';
import { isWaitingForMeasurementDate } from '../orders/measurement.js';

/** Jeden wiersz tablicy „Na dziś”. */
export interface BoardRow {
  orderId: number;
  /** Numer zlecenia z biura, pokazywany na liście zamiast klienta (null = starsze zlecenie bez numeru). */
  orderNumber: string | null;
  clientName: string;
  town: string;
  plot: string | null;
  workTypeName: string;
  currentStepName: string;
  currentStepPosition: number;
  stepCount: number;
  daysOnStep: number;
  lastPerson: string | null;
  pricePln: number | null;
  /** Zlecenie czeka na termin pomiaru (data do uzupełnienia). */
  measurementMissing: boolean;
  /** Do kogo należy bieżący krok (filtr „Moje”); null = nikt nie przypisany. */
  owner: string | null;
  urgency: Urgency;
}

/** Składa tablicę: aktywne zlecenia, ich bieżący krok, kolor i kolejność pilności. */
export class BoardService {
  private readonly workTypes: WorkTypeRepository;

  constructor(
    private readonly db: AppDatabase,
    private readonly orders: OrderService,
    private readonly rules: UrgencyRules,
    private readonly today: () => LocalDate,
  ) {
    this.workTypes = new WorkTypeRepository(db);
  }

  rows(): BoardRow[] {
    const today = this.today();
    return this.orders
      .listActive()
      .filter((order) => !order.steps.some((st) => st.status === 'active' && st.payment)) // te są w Niezapłaconych
      .map((order) => this.toRow(order, today))
      .sort((a, b) => UrgencyRules.compare(a.sortKey, b.sortKey))
      .map((r) => r.row);
  }

  /** Kolor bieżącego kroku zlecenia (używany też na karcie zlecenia). */
  urgencyOf(order: Order, step: OrderStep, today: LocalDate): Urgency {
    const startedOn = step.startedOn ?? order.receivedOn;
    switch (step.kind) {
      case 'daily':
        return this.rules.evaluateDaily(maxDate(startedOn, step.lastCheckedOn), today);
      case 'scheduled':
        if (order.measurementOn !== null) return this.rules.evaluateScheduled(order.measurementOn, today);
        // Bez daty pomiaru: trzeba ustalić termin, więc liczymy jak krok „robimy my” (progi bezczynności).
        return this.rules.evaluate(
          { kind: 'own', limitDays: null, startedOn, lastActivityOn: startedOn },
          today,
        );
      default:
        return this.rules.evaluate(
          { kind: step.kind, limitDays: step.limitDays, startedOn, lastActivityOn: startedOn },
          today,
        );
    }
  }

  private toRow(order: Order, today: LocalDate) {
    const step = order.steps.find((s) => s.status === 'active');
    if (!step) throw new Error(`Zlecenie ${order.id} jest aktywne, ale nie ma aktywnego kroku`);
    const urgency = this.urgencyOf(order, step, today);
    const row: BoardRow = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientName: order.clientName,
      town: order.town,
      plot: order.plot,
      workTypeName: this.workTypes.findById(order.workTypeId)?.name ?? '?',
      currentStepName: step.name,
      currentStepPosition: step.position,
      stepCount: order.steps.length,
      daysOnStep: this.rules.daysBetween(step.startedOn ?? order.receivedOn, today),
      lastPerson: this.lastPerson(order.id),
      pricePln: order.pricePln,
      measurementMissing: isWaitingForMeasurementDate(order),
      owner: currentOwner(order),
      urgency,
    };
    return { row, sortKey: { urgency, waitingSince: order.receivedOn } };
  }

  private lastPerson(orderId: number): string | null {
    const row = this.db.connection
      .prepare('SELECT person FROM order_history WHERE order_id = ? ORDER BY id DESC LIMIT 1')
      .get(orderId) as { person: string } | undefined;
    return row?.person ?? null;
  }
}

function maxDate(a: LocalDate, b: LocalDate | null): LocalDate {
  return b !== null && b > a ? b : a;
}
