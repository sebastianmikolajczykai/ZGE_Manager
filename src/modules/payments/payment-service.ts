import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import { UrgencyRules, type Urgency } from '../urgency/urgency-rules.js';
import type { Order, OrderService, OrderStep } from '../orders/order-service.js';

/** Jeden wiersz zakładki Niezapłacone. */
export interface UnpaidRow {
  orderId: number;
  clientName: string;
  phone: string;
  town: string;
  pricePln: number | null;
  /** Dzień oddania klientowi = start kroku „Zapłata”. */
  handedOverOn: LocalDate;
  /** Oddanie albo ostatnia rozmowa o zapłacie (od tego dnia liczy się limit). */
  lastContactOn: LocalDate;
  daysSinceContact: number;
  lastPerson: string | null;
  urgency: Urgency;
}

/**
 * Zakładka Niezapłacone: zlecenia na kroku zapłaty, kolor wg limitu dni roboczych,
 * rozmowy z przypomnieniem i „Zapłacone”. Zapis w zleceniach robi OrderService.
 */
export class PaymentService {
  constructor(
    private readonly db: AppDatabase,
    private readonly orders: OrderService,
    private readonly rules: UrgencyRules,
    private readonly today: () => LocalDate,
  ) {}

  rows(): UnpaidRow[] {
    const today = this.today();
    return this.orders
      .listActive()
      .flatMap((order) => {
        const step = paymentStepOf(order);
        return step ? [this.toRow(order, step, today)] : [];
      })
      .sort((a, b) =>
        UrgencyRules.compare(
          { urgency: a.urgency, waitingSince: a.lastContactOn },
          { urgency: b.urgency, waitingSince: b.lastContactOn },
        ),
      );
  }

  /** Kolor zlecenia czekającego na zapłatę (używany też na karcie). */
  urgencyOf(step: OrderStep, today: LocalDate): Urgency {
    const since = lastContactOf(step);
    return this.rules.evaluate(
      { kind: 'waiting', limitDays: step.limitDays, startedOn: since, lastActivityOn: since },
      today,
    );
  }

  recordCall(orderId: number, person: string, note: string | null): void {
    this.orders.recordPaymentCall(orderId, person, note);
  }

  markPaid(orderId: number, person: string): void {
    const order = this.orders.get(orderId);
    if (!order) throw new Error(`Nie ma zlecenia o numerze ${orderId}`);
    const step = paymentStepOf(order);
    if (!step) throw new Error(`Zlecenie nr ${orderId} nie czeka na zapłatę`);
    this.orders.completeStep(orderId, step.position, person);
  }

  private toRow(order: Order, step: OrderStep, today: LocalDate): UnpaidRow {
    const lastContactOn = lastContactOf(step);
    return {
      orderId: order.id,
      clientName: order.clientName,
      phone: order.phone,
      town: order.town,
      pricePln: order.pricePln,
      handedOverOn: step.startedOn ?? today,
      lastContactOn,
      daysSinceContact: this.rules.daysBetween(lastContactOn, today),
      lastPerson: this.lastPerson(order.id),
      urgency: this.urgencyOf(step, today),
    };
  }

  private lastPerson(orderId: number): string | null {
    const row = this.db.connection
      .prepare('SELECT person FROM order_history WHERE order_id = ? ORDER BY id DESC LIMIT 1')
      .get(orderId) as { person: string } | undefined;
    return row?.person ?? null;
  }
}

/** Aktywny krok zapłaty zlecenia albo null, gdy zlecenie jest na innym etapie. */
export function paymentStepOf(order: Order): OrderStep | null {
  return order.steps.find((s) => s.status === 'active' && s.payment) ?? null;
}

function lastContactOf(step: OrderStep): LocalDate {
  const started = step.startedOn ?? '';
  // Daty RRRR-MM-DD porównują się poprawnie jako tekst.
  return step.lastCheckedOn !== null && step.lastCheckedOn > started ? step.lastCheckedOn : started;
}
