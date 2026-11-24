import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';
import { UrgencyRules, type Urgency } from '../urgency/urgency-rules.js';
import type { Order, OrderService, OrderStep } from '../orders/order-service.js';

/** Jeden wiersz zakładki Niezapłacone. */
export interface UnpaidRow {
  orderId: number;
  /** Numer zlecenia z biura (null = starsze zlecenie bez numeru). */
  orderNumber: string | null;
  clientName: string;
  phone: string;
  town: string;
  pricePln: number | null;
  /** Dzień oddania klientowi = start kroku „Zapłata”. */
  handedOverOn: LocalDate;
  /** Oddanie albo ostatnia rozmowa o zapłacie (od tego dnia liczy się limit). */
  lastContactOn: LocalDate;
  daysSinceContact: number;
  /** Limit dni kroku „Zapłata” (null = bez limitu); od niego liczy się termin przypomnienia. */
  limitDays: number | null;
  lastPerson: string | null;
  urgency: Urgency;
  /** Kiedy zadzwonić o zapłatę (do przypomnienia w Kalendarzu Google): koniec limitu, najwcześniej dziś. */
  remindOn: LocalDate;
}

/** Zlecenie oznaczone „Zapłacone” (do listy „Ostatnio zapłacone”, skąd można wejść na kartę i cofnąć). */
export interface PaidRow {
  orderId: number;
  orderNumber: string | null;
  clientName: string;
  pricePln: number | null;
  paidOn: LocalDate;
  paidBy: string | null;
}

/** Ile ostatnich zapłat pokazać pod listą. */
export const RECENT_LIMIT = 10;
const GROSZE_PER_PLN = 100;

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

  /** Ostatnio oznaczone „Zapłacone”, najnowsze na górze. */
  recentlyPaid(limit = RECENT_LIMIT): PaidRow[] {
    const rows = this.db.connection
      .prepare(
        `SELECT o.id, o.order_number, o.client_name, o.price_grosze, s.done_on, s.done_by
         FROM orders o JOIN order_steps s ON s.order_id = o.id AND s.payment = 1 AND s.status = 'done'
         ORDER BY s.done_on DESC, o.id DESC LIMIT ?`,
      )
      .all(limit) as {
      id: number;
      order_number: string | null;
      client_name: string;
      price_grosze: number | null;
      done_on: string;
      done_by: string | null;
    }[];
    return rows.map((r) => ({
      orderId: r.id,
      orderNumber: r.order_number,
      clientName: r.client_name,
      pricePln: r.price_grosze === null ? null : r.price_grosze / GROSZE_PER_PLN,
      paidOn: r.done_on,
      paidBy: r.done_by,
    }));
  }

  private toRow(order: Order, step: OrderStep, today: LocalDate): UnpaidRow {
    const lastContactOn = lastContactOf(step);
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      clientName: order.clientName,
      phone: order.phone,
      town: order.town,
      pricePln: order.pricePln,
      handedOverOn: step.startedOn ?? today,
      lastContactOn,
      daysSinceContact: this.rules.daysBetween(lastContactOn, today),
      limitDays: step.limitDays,
      lastPerson: this.lastPerson(order.id),
      urgency: this.urgencyOf(step, today),
      remindOn: this.rules.dueOn(lastContactOn, step.limitDays, today),
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
