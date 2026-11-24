import { describe, it, expect } from 'vitest';
import { DayCounter } from '../../../src/modules/urgency/day-counter.js';

describe('DayCounter (working days, Mon–Fri)', () => {
  const working = new DayCounter('working');

  it('counts 0 days for the same date', () => {
    expect(working.daysBetween('2026-11-16', '2026-11-16')).toBe(0);
  });

  it('counts consecutive weekdays', () => {
    // Mon → Wed
    expect(working.daysBetween('2026-11-16', '2026-11-18')).toBe(2);
  });

  it('skips the weekend: Friday → Monday is 1 working day', () => {
    expect(working.daysBetween('2026-11-20', '2026-11-23')).toBe(1);
  });

  it('counts 0 working days from Friday to Sunday', () => {
    expect(working.daysBetween('2026-11-20', '2026-11-22')).toBe(0);
  });

  it('handles month and year boundaries', () => {
    // Wed 30.12.2026 → Mon 4.01.2027: Thu 31.12, (Fri 1.01 = Nowy Rok), Mon 4.01
    expect(working.daysBetween('2026-12-30', '2027-01-04')).toBe(2);
  });

  it('is not affected by the DST change (last Sunday of March)', () => {
    // Fri 27.03.2026 → Tue 31.03.2026: Mon, Tue
    expect(working.daysBetween('2026-03-27', '2026-03-31')).toBe(2);
  });

  it('rejects an end date earlier than the start date', () => {
    expect(() => working.daysBetween('2026-11-18', '2026-11-16')).toThrow(/wcześniejsza/);
  });

  it('rejects a malformed date', () => {
    expect(() => working.daysBetween('16.11.2026', '2026-11-18')).toThrow(/Nieprawidłowa data/);
    expect(() => working.daysBetween('2026-02-30', '2026-03-02')).toThrow(/Nieprawidłowa data/);
  });
});

describe('DayCounter (working days skip Polish public holidays)', () => {
  const working = new DayCounter('working');

  it('skips 11 November (Wed 2026)', () => {
    // Tue 10.11 → Thu 12.11: only Thu counts
    expect(working.daysBetween('2026-11-10', '2026-11-12')).toBe(1);
  });

  it('skips Christmas Eve, Christmas and Boxing Day', () => {
    // Wed 23.12.2026 → Mon 28.12.2026: 24 (Thu), 25 (Fri) holidays, weekend, Mon counts
    expect(working.daysBetween('2026-12-23', '2026-12-28')).toBe(1);
  });

  it('skips New Year and Epiphany', () => {
    // Wed 31.12.2025 → Wed 7.01.2026: 1.01 Thu hol., 2.01 Fri, 5.01 Mon, 6.01 Tue hol., 7.01 Wed
    expect(working.daysBetween('2025-12-31', '2026-01-07')).toBe(3);
  });

  it('skips Easter Monday (moving date: 29.03.2027)', () => {
    // Fri 26.03.2027 → Tue 30.03.2027: Mon is Easter Monday, only Tue counts
    expect(working.daysBetween('2027-03-26', '2027-03-30')).toBe(1);
  });

  it('skips Corpus Christi (Easter + 60 days: 4.06.2026)', () => {
    // Wed 3.06 → Fri 5.06: Thu is Corpus Christi, only Fri counts
    expect(working.daysBetween('2026-06-03', '2026-06-05')).toBe(1);
  });

  it('skips 1 and 3 May and 15 August', () => {
    // Thu 30.04.2026 → Mon 4.05.2026: 1.05 Fri hol., weekend (3.05 Sun), Mon counts
    expect(working.daysBetween('2026-04-30', '2026-05-04')).toBe(1);
    // Thu 14.08.2025 → Mon 18.08.2025: 15.08 Fri hol.
    expect(working.daysBetween('2025-08-14', '2025-08-18')).toBe(1);
  });

  it('knows whether a single date is a working day', () => {
    expect(working.isWorkingDay('2026-11-11')).toBe(false);
    expect(working.isWorkingDay('2026-11-21')).toBe(false);
    expect(working.isWorkingDay('2026-11-19')).toBe(true);
  });
});

describe('DayCounter (calendar days)', () => {
  const calendar = new DayCounter('calendar');

  it('counts every day including the weekend', () => {
    expect(calendar.daysBetween('2026-11-20', '2026-11-23')).toBe(3);
  });

  it('is not affected by the DST change', () => {
    expect(calendar.daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('DayCounter: company days off (Ustawienia → Dni wolne firmy)', () => {
  const dayOff = (date: string) => date === '2026-11-17';
  const withDayOff = new DayCounter('working', undefined, dayOff);

  it('does not count a company day off, like a holiday', () => {
    // pn 16.11 → śr 18.11: wtorek wolny, zostaje tylko środa
    expect(withDayOff.daysBetween('2026-11-16', '2026-11-18')).toBe(1);
    expect(withDayOff.isWorkingDay('2026-11-17')).toBe(false);
    expect(withDayOff.isWorkingDay('2026-11-18')).toBe(true);
  });

  it('calendar mode ignores days off', () => {
    expect(new DayCounter('calendar', undefined, dayOff).daysBetween('2026-11-16', '2026-11-18')).toBe(2);
  });
});

describe('DayCounter: termin po N dniach (do przypomnień w kalendarzu)', () => {
  const working = new DayCounter('working');

  it('adds working days, skipping the weekend (Fri + 1 = Mon)', () => {
    expect(working.addDays('2026-11-20', 1)).toBe('2026-11-23');
  });

  it('7 working days from Monday is Wednesday next week', () => {
    expect(working.addDays('2026-11-16', 7)).toBe('2026-11-25');
  });

  it('skips holidays (Christmas)', () => {
    // Wed 23.12 + 1 = Mon 28.12 (24, 25 holidays, 26–27 weekend)
    expect(working.addDays('2026-12-23', 1)).toBe('2026-12-28');
  });

  it('0 days returns the same date', () => {
    expect(working.addDays('2026-11-22', 0)).toBe('2026-11-22');
  });

  it('result agrees with daysBetween', () => {
    const due = working.addDays('2026-11-16', 14);
    expect(working.daysBetween('2026-11-16', due)).toBe(14);
  });

  it('rejects a negative number of days', () => {
    expect(() => working.addDays('2026-11-16', -1)).toThrow(/ujemna/);
  });

  it('calendar mode adds plain days', () => {
    expect(new DayCounter('calendar').addDays('2026-11-20', 2)).toBe('2026-11-22');
  });

  it('next working day on or after: Saturday → Monday, Monday stays', () => {
    expect(working.workingDayOnOrAfter('2026-11-21')).toBe('2026-11-23');
    expect(working.workingDayOnOrAfter('2026-11-23')).toBe('2026-11-23');
  });

  it('respects company days off', () => {
    const withDayOff = new DayCounter('working', undefined, (d) => d === '2026-11-23');
    expect(withDayOff.workingDayOnOrAfter('2026-11-21')).toBe('2026-11-24');
  });
});
