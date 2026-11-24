import { describe, it, expect } from 'vitest';
import { planReminders, type ReminderSource } from '../../../src/modules/calendar-sync/reminder-plan.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../../../src/modules/urgency/urgency-rules.js';

const rules = new UrgencyRules(DEFAULT_URGENCY_SETTINGS); // dni robocze pn–pt bez świąt
const APP = 'http://localhost:3000';

const offer = (over: Partial<ReminderSource> = {}): ReminderSource => ({
  kind: 'offer',
  id: 12,
  lastContactOn: '2026-11-16', // poniedziałek
  limitDays: 7,
  ...over,
});

describe('planReminders: kiedy i jakie wydarzenie „Zadzwoń”', () => {
  it('offer: event on the day the follow-up is due (7 working days after the contact)', () => {
    const [r] = planReminders([offer()], rules, '2026-11-16', APP);
    expect(r).toMatchObject({ key: 'oferta-12', date: '2026-11-25', title: 'Zadzwoń: oferta nr 12' });
  });

  it('unpaid order: title names the order and payment', () => {
    const src = offer({ kind: 'payment', id: 34, limitDays: 14 });
    const [r] = planReminders([src], rules, '2026-11-16', APP);
    expect(r).toMatchObject({
      key: 'zaplata-34',
      date: '2026-12-04',
      title: 'Zadzwoń: zapłata, zlecenie nr 34',
    });
  });

  it('a new call (later last contact) moves the date: counted again from the call', () => {
    const [r] = planReminders([offer({ lastContactOn: '2026-11-25' })], rules, '2026-11-25', APP);
    expect(r?.date).toBe('2026-12-04');
  });

  it('overdue and not ticked off: moved to today when today is a working day', () => {
    const [r] = planReminders([offer()], rules, '2026-11-27', APP); // termin 25.11 minął, dziś piątek
    expect(r?.date).toBe('2026-11-27');
  });

  it('overdue on a weekend: moved to the next working day (Monday)', () => {
    const [r] = planReminders([offer()], rules, '2026-11-28', APP); // sobota
    expect(r?.date).toBe('2026-11-30');
  });

  it('due today stays today', () => {
    const [r] = planReminders([offer()], rules, '2026-11-25', APP);
    expect(r?.date).toBe('2026-11-25');
  });

  it('no limit (payment step without days limit): no reminder', () => {
    expect(planReminders([offer({ kind: 'payment', limitDays: null })], rules, '2026-11-16', APP)).toEqual(
      [],
    );
  });

  it('empty input: nothing planned', () => {
    expect(planReminders([], rules, '2026-11-16', APP)).toEqual([]);
  });

  it('description has only the number and a link to the card in the app (no client data)', () => {
    const [o] = planReminders([offer()], rules, '2026-11-16', APP);
    const [p] = planReminders([offer({ kind: 'payment', id: 34 })], rules, '2026-11-16', APP);
    expect(o?.description).toContain('http://localhost:3000/oferty?oferta=12');
    expect(p?.description).toContain('http://localhost:3000/niezaplacone?zlecenie=34');
    expect(o?.description).toContain('oferta nr 12');
  });

  it('company days off count like holidays', () => {
    const withDayOff = new UrgencyRules({
      ...DEFAULT_URGENCY_SETTINGS,
      isDayOff: (d) => d === '2026-11-25',
    });
    const [r] = planReminders([offer()], withDayOff, '2026-11-16', APP);
    expect(r?.date).toBe('2026-11-26');
  });
});
