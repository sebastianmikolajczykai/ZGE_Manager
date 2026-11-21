import type { AppDatabase } from '../../db.js';
import type { LocalDate } from '../urgency/day-counter.js';

/** Miesiąc w formacie RRRR-MM, np. „2026-11”. */
export type Month = string;

/** Jeden wiersz tabeli miesięcy. */
export interface MonthStats {
  month: Month;
  /** Klienci, których pierwsze zlecenie przyjęto w tym miesiącu. */
  newClients: number;
  /** Zlecenia przyjęte w tym miesiącu. */
  orders: number;
  /** Suma cen zleceń oznaczonych „Zapłacone” w tym miesiącu. */
  incomePln: number;
  paidOrders: number;
  offersSent: number;
  offersAccepted: number;
}

export interface StatsSummary {
  totalClients: number;
  totalOrders: number;
  incomeTotalPln: number;
  incomeThisMonthPln: number;
  /** Zapłacone zlecenia bez wpisanej ceny (nie liczą się do dochodu). */
  paidWithoutPrice: number;
  /** Czeka na zapłatę (zlecenia na kroku „Zapłata”). */
  unpaidPln: number;
  /** Wartość zleceń w trakcie pracy (jeszcze przed zapłatą). */
  inProgressPln: number;
  /** Najnowszy miesiąc na górze; od pierwszego miesiąca z danymi do bieżącego. */
  months: MonthStats[];
}

export interface ClientStats {
  name: string;
  phone: string;
  orders: number;
  paidPln: number;
  firstOrderOn: LocalDate;
  lastOrderOn: LocalDate;
  lastOrderId: number;
}

const GROSZE_PER_PLN = 100;
const POLISH_PREFIX = '48';
const PHONE_WITH_PREFIX_DIGITS = 11;
const MONTHS_PER_YEAR = 12;

/** Zlecenie z tym, co potrzebne do statystyk (dzień zapłaty liczony z kroku „Zapłata”). */
interface OrderFacts {
  id: number;
  clientName: string;
  phone: string;
  pricePln: number | null;
  receivedOn: LocalDate;
  paidOn: LocalDate | null;
  waitingForPayment: boolean;
  active: boolean;
}

/**
 * Statystyki firmy (CRM): klienci, dochód ogólny i miesięczny, nowi klienci, oferty.
 * Tylko odczyt; wszystko liczone z zapisanych zleceń i ofert, bez osobnych danych.
 * Klient = numer telefonu (cyfry, bez +48); dochód = ceny zleceń „Zapłacone” wg dnia zapłaty.
 */
export class StatsService {
  constructor(
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
  ) {}

  summary(): StatsSummary {
    const orders = this.orderFacts();
    const thisMonth = monthOf(this.today());
    const paid = orders.filter((o) => o.paidOn !== null);
    const income = (list: OrderFacts[]) => roundPln(list.reduce((sum, o) => sum + (o.pricePln ?? 0), 0));
    return {
      totalClients: new Set(orders.map(clientKey)).size,
      totalOrders: orders.length,
      incomeTotalPln: income(paid),
      incomeThisMonthPln: income(paid.filter((o) => monthOf(o.paidOn as LocalDate) === thisMonth)),
      paidWithoutPrice: paid.filter((o) => o.pricePln === null).length,
      unpaidPln: income(orders.filter((o) => o.waitingForPayment)),
      inProgressPln: income(orders.filter((o) => o.active && !o.waitingForPayment)),
      months: this.months(orders, thisMonth),
    };
  }

  /** Lista klientów: liczba zleceń, suma zapłacona, pierwsze i ostatnie zlecenie (ostatnio aktywni na górze). */
  clients(): ClientStats[] {
    const byClient = new Map<string, ClientStats>();
    for (const o of this.orderFacts()) {
      const key = clientKey(o);
      const known = byClient.get(key);
      const paid = o.paidOn !== null ? (o.pricePln ?? 0) : 0;
      byClient.set(key, {
        name: o.clientName,
        phone: o.phone,
        orders: (known?.orders ?? 0) + 1,
        paidPln: roundPln((known?.paidPln ?? 0) + paid),
        firstOrderOn: known?.firstOrderOn ?? o.receivedOn,
        lastOrderOn: o.receivedOn,
        lastOrderId: o.id,
      });
    }
    return [...byClient.values()].sort(
      (a, b) => b.lastOrderOn.localeCompare(a.lastOrderOn) || b.lastOrderId - a.lastOrderId,
    );
  }

  private months(orders: OrderFacts[], thisMonth: Month): MonthStats[] {
    const offers = this.db.connection.prepare('SELECT sent_on, status, closed_on FROM offers').all() as {
      sent_on: string;
      status: string;
      closed_on: string | null;
    }[];
    const firstOrderOf = new Map<string, LocalDate>();
    for (const o of orders) if (!firstOrderOf.has(clientKey(o))) firstOrderOf.set(clientKey(o), o.receivedOn);
    const accepted = offers.filter((f) => f.status === 'accepted' && f.closed_on !== null);
    const dates = [
      ...orders.map((o) => o.receivedOn),
      ...offers.map((f) => f.sent_on),
      ...orders.flatMap((o) => (o.paidOn ? [o.paidOn] : [])),
    ];
    const first = dates.length > 0 ? monthOf(dates.reduce((a, b) => (a < b ? a : b))) : thisMonth;
    const count = <T>(list: T[], month: Month, dateOf: (item: T) => string | null) =>
      list.filter((item) => monthOf(dateOf(item) ?? '') === month);
    return monthsBetween(first < thisMonth ? first : thisMonth, thisMonth)
      .reverse()
      .map((month) => {
        const paid = count(orders, month, (o) => o.paidOn);
        return {
          month,
          newClients: [...firstOrderOf.values()].filter((d) => monthOf(d) === month).length,
          orders: count(orders, month, (o) => o.receivedOn).length,
          incomePln: roundPln(paid.reduce((sum, o) => sum + (o.pricePln ?? 0), 0)),
          paidOrders: paid.length,
          offersSent: count(offers, month, (f) => f.sent_on).length,
          offersAccepted: count(accepted, month, (f) => f.closed_on).length,
        };
      });
  }

  private orderFacts(): OrderFacts[] {
    const rows = this.db.connection
      .prepare(
        `SELECT o.id, o.client_name, o.phone, o.price_grosze, o.received_on, o.status, o.completed_on,
           (SELECT max(s.done_on) FROM order_steps s WHERE s.order_id = o.id AND s.payment = 1 AND s.status = 'done') AS paid_on,
           (SELECT count(*) FROM order_steps s WHERE s.order_id = o.id AND s.payment = 1) AS payment_steps,
           (SELECT count(*) FROM order_steps s WHERE s.order_id = o.id AND s.payment = 1 AND s.status = 'active') AS waiting
         FROM orders o ORDER BY o.received_on, o.id`,
      )
      .all() as OrderStatsRow[];
    return rows.map((r) => ({
      id: r.id,
      clientName: r.client_name,
      phone: r.phone,
      pricePln: r.price_grosze === null ? null : r.price_grosze / GROSZE_PER_PLN,
      receivedOn: r.received_on,
      // Rodzaj pracy bez kroku „Zapłata”: liczymy dzień zakończenia zlecenia.
      paidOn: r.paid_on ?? (r.payment_steps === 0 && r.status === 'completed' ? r.completed_on : null),
      waitingForPayment: r.waiting > 0,
      active: r.status === 'active',
    }));
  }
}

interface OrderStatsRow {
  id: number;
  client_name: string;
  phone: string;
  price_grosze: number | null;
  received_on: string;
  status: 'active' | 'completed';
  completed_on: string | null;
  paid_on: string | null;
  payment_steps: number;
  waiting: number;
}

/** Ten sam klient = ten sam numer telefonu (same cyfry, bez +48); bez numeru – po nazwie. */
function clientKey(o: { clientName: string; phone: string }): string {
  let digits = o.phone.replace(/\D/g, '');
  if (digits.length === PHONE_WITH_PREFIX_DIGITS && digits.startsWith(POLISH_PREFIX)) {
    digits = digits.slice(POLISH_PREFIX.length);
  }
  return digits || `nazwa:${o.clientName.trim().toLowerCase()}`;
}

function monthOf(date: LocalDate): Month {
  return date.slice(0, 7);
}

/** Kolejne miesiące od `from` do `to` włącznie (RRRR-MM). */
function monthsBetween(from: Month, to: Month): Month[] {
  const result: Month[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  for (let current = from; current <= to;) {
    result.push(current);
    month += 1;
    if (month > MONTHS_PER_YEAR) {
      month = 1;
      year += 1;
    }
    current = `${year}-${String(month).padStart(2, '0')}`;
  }
  return result;
}

/** Zaokrąglenie do grosza (sumy liczb z przecinkiem). */
function roundPln(value: number): number {
  return Math.round(value * GROSZE_PER_PLN) / GROSZE_PER_PLN;
}
