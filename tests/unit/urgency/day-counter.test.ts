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
    // Wed 30.12.2026 → Mon 4.01.2027: Thu, Fri, Mon
    expect(working.daysBetween('2026-12-30', '2027-01-04')).toBe(3);
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

describe('DayCounter (calendar days)', () => {
  const calendar = new DayCounter('calendar');

  it('counts every day including the weekend', () => {
    expect(calendar.daysBetween('2026-11-20', '2026-11-23')).toBe(3);
  });

  it('is not affected by the DST change', () => {
    expect(calendar.daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});
