import type { LocalDate } from '../urgency/day-counter.js';
import { orderLabel } from '../orders/order-label.js';
import type { CalendarEvent } from './google-calendar-link.js';

/**
 * Przypomnienia „zadzwoń” do Kalendarza Google (oferta, zapłata). To tylko treść wydarzenia
 * do zwykłego linku: nic nie jest wysyłane, dopóki użytkownik sam nie kliknie i nie zapisze go w Google.
 * Tytuł bez imienia i nazwiska (widać go w powiadomieniach na telefonie); kto i telefon są w opisie. Bez kwot.
 */

export interface OfferForReminder {
  clientName: string;
  phone: string;
  town: string | null;
  plot: string | null;
  workTypeName: string;
}

export interface OrderForReminder {
  orderNumber: string | null;
  clientName: string;
  phone: string;
  town: string;
}

const APP_NOTE = 'Przypomnienie z ZGE Menedżera';

export function offerCallEvent(offer: OfferForReminder, callOn: LocalDate): CalendarEvent {
  const where = offer.town ? `, ${offer.town}` : '';
  return {
    title: `Zadzwoń w sprawie oferty: ${offer.workTypeName}${where}`,
    date: callOn,
    location: place(offer.town, offer.plot),
    details: [`Klient: ${offer.clientName}`, `Telefon: ${offer.phone}`, APP_NOTE].join('\n'),
  };
}

export function paymentReminderEvent(order: OrderForReminder, remindOn: LocalDate): CalendarEvent {
  return {
    title: `Przypomnij o zapłacie: ${orderLabel(order)}`,
    date: remindOn,
    location: order.town,
    details: [`Klient: ${order.clientName}`, `Telefon: ${order.phone}`, APP_NOTE].join('\n'),
  };
}

function place(town: string | null, plot: string | null): string {
  if (!town) return '';
  return plot ? `${town}, dz. ${plot}` : town;
}
