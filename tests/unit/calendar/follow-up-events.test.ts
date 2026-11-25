import { describe, it, expect } from 'vitest';
import { offerCallEvent, paymentReminderEvent } from '../../../src/modules/calendar/follow-up-events.js';

describe('offerCallEvent: przypomnienie o telefonie w sprawie oferty', () => {
  const offer = {
    clientName: 'Zofia Przykładowa',
    phone: '600 100 200',
    town: 'Brzesko',
    plot: '12/3',
    workTypeName: 'Podział nieruchomości',
  };

  it('keeps the client name out of the title (it shows on phone notifications)', () => {
    const event = offerCallEvent(offer, '2026-12-03');
    expect(event.title).toBe('Zadzwoń w sprawie oferty: Podział nieruchomości, Brzesko');
    expect(event.title).not.toContain('Zofia');
  });

  it('puts who to call and the phone in the details, on the call day', () => {
    const event = offerCallEvent(offer, '2026-12-03');
    expect(event.date).toBe('2026-12-03');
    expect(event.location).toBe('Brzesko, dz. 12/3');
    expect(event.details).toContain('Klient: Zofia Przykładowa');
    expect(event.details).toContain('Telefon: 600 100 200');
  });

  it('works without a town', () => {
    const event = offerCallEvent({ ...offer, town: null, plot: null }, '2026-12-03');
    expect(event.title).toBe('Zadzwoń w sprawie oferty: Podział nieruchomości');
    expect(event.location).toBe('');
  });

  it('never puts the price in the event', () => {
    expect(JSON.stringify(offerCallEvent(offer, '2026-12-03'))).not.toMatch(/zł/);
  });
});

describe('paymentReminderEvent: przypomnienie o zapłacie', () => {
  const order = {
    orderNumber: '125 podział',
    clientName: 'Jan Przykładowy',
    phone: '600 100 200',
    town: 'Brzesko',
  };

  it('uses the order number in the title instead of the client name', () => {
    const event = paymentReminderEvent(order, '2026-12-08');
    expect(event.title).toBe('Przypomnij o zapłacie: 125 podział');
    expect(event.details).toContain('Klient: Jan Przykładowy');
    expect(event.details).toContain('Telefon: 600 100 200');
    expect(event.date).toBe('2026-12-08');
  });

  it('falls back to the client name when the order has no number', () => {
    expect(paymentReminderEvent({ ...order, orderNumber: null }, '2026-12-08').title).toBe(
      'Przypomnij o zapłacie: Jan Przykładowy',
    );
  });
});
