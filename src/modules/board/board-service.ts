import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import { UrgencyRules, type Urgency } from '../urgency/urgency-rules.js';
import { currentOwners, type Order, type OrderService, type OrderStep } from '../orders/order-service.js';
import { WorkTypeRepository } from '../work-types/work-type-repository.js';
import { isWaitingForMeasurementDate } from '../orders/measurement.js';

/** Jeden wiersz tablicy „Na dziś”. */
export interface BoardRow {
  orderId: number;
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
  /** Do kogo należą bieżące kroki (filtr „Moje”; przy krokach równoległych kilka osób); pusta = nikt. */
  owners: string[];
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

  /** Kolor każdego bieżącego kroku (przy krokach równoległych każdy ma własny limit i kolor). */
  stepUrgencies(order: Order, today: LocalDate): Map<number, Urgency> {
    const result = new Map<number, Urgency>();
    for (const step of activeSteps(order)) result.set(step.position, this.urgencyOf(order, step, today));
    return result;
  }

  /** Kolor zlecenia = najpilniejszy z bieżących kroków; null, gdy nic nie trwa (zlecenie zakończone). */
  orderUrgency(order: Order, today: LocalDate): Urgency | null {
    return mostUrgent([...this.stepUrgencies(order, today).values()]);
  }

  /** Kolor jednego kroku zlecenia. */
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
    const running = activeSteps(order);
    const step = running[0];
    const urgency = this.orderUrgency(order, today);
    if (!step || !urgency) throw new Error(`Zlecenie ${order.id} jest aktywne, ale nie ma aktywnego kroku`);
    const row: BoardRow = {
      orderId: order.id,
      clientName: order.clientName,
      town: order.town,
      plot: order.plot,
      workTypeName: this.workTypes.findById(order.workTypeId)?.name ?? '?',
      currentStepName: running.map((s) => s.name).join(' + '),
      currentStepPosition: step.position,
      stepCount: order.steps.length,
      daysOnStep: this.rules.daysBetween(step.startedOn ?? order.receivedOn, today),
      lastPerson: this.lastPerson(order.id),
      pricePln: order.pricePln,
      measurementMissing: isWaitingForMeasurementDate(order),
      owners: currentOwners(order),
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

function activeSteps(order: Order): OrderStep[] {
  return order.steps.filter((s) => s.status === 'active');
}

/** Najpilniejszy kolor (ta sama kolejność co na tablicy: najdłużej czerwone, potem żółte, zielone). */
function mostUrgent(urgencies: Urgency[]): Urgency | null {
  const sorted = urgencies.map((urgency) => ({ urgency, waitingSince: '' })).sort(UrgencyRules.compare);
  return sorted[0]?.urgency ?? null;
}

function maxDate(a: LocalDate, b: LocalDate | null): LocalDate {
  return b !== null && b > a ? b : a;
}
