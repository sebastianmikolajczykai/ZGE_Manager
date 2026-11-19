import { describe, it, expect } from 'vitest';
import {
  UrgencyRules,
  DEFAULT_URGENCY_SETTINGS,
  type StepState,
} from '../../../src/modules/urgency/urgency-rules.js';

// Kalendarzowe dni upraszczają czytanie dat w testach reguł; dni robocze testuje DayCounter.
const rules = new UrgencyRules({ ...DEFAULT_URGENCY_SETTINGS, dayMode: 'calendar' });

function ownStep(overrides: Partial<StepState> = {}): StepState {
  return {
    kind: 'own',
    limitDays: null,
    startedOn: '2026-11-01',
    lastActivityOn: '2026-11-01',
    ...overrides,
  };
}

describe('UrgencyRules: own step, idle thresholds (2 yellow / 3 red)', () => {
  it.each([
    ['2026-11-01', 'green'],
    ['2026-11-02', 'green'],
    ['2026-11-03', 'yellow'],
    ['2026-11-04', 'red'],
  ])('on %s the colour is %s', (today, colour) => {
    expect(rules.evaluate(ownStep(), today).colour).toBe(colour);
  });

  it('a recent tick resets the idle counter', () => {
    const step = ownStep({ lastActivityOn: '2026-11-10' });
    expect(rules.evaluate(step, '2026-11-11').colour).toBe('green');
  });
});

describe('UrgencyRules: step limit (tick day = day 0, yellow on day N-1, red on day N)', () => {
  const limited = (limitDays: number, today: string) =>
    rules.evaluate(ownStep({ limitDays, startedOn: '2026-11-01', lastActivityOn: today }), today);

  it.each([
    [2, '2026-11-01', 'green'],
    [2, '2026-11-02', 'yellow'],
    [2, '2026-11-03', 'red'],
    [5, '2026-11-04', 'green'],
    [5, '2026-11-05', 'yellow'],
    [5, '2026-11-06', 'red'],
    [1, '2026-11-01', 'yellow'],
    [1, '2026-11-02', 'red'],
  ])('limit %i days, on %s → %s', (limitDays, today, colour) => {
    expect(limited(limitDays, today).colour).toBe(colour);
  });

  it('counts days overdue from the first red day', () => {
    expect(limited(5, '2026-11-06').daysOverdue).toBe(1);
    expect(limited(5, '2026-11-08').daysOverdue).toBe(3);
  });

  it('red at the limit even with a recent tick', () => {
    const step = ownStep({ limitDays: 5, startedOn: '2026-11-01', lastActivityOn: '2026-11-06' });
    expect(rules.evaluate(step, '2026-11-06').colour).toBe('red');
  });

  it('the earlier trigger wins: idle red before the limit ends', () => {
    expect(rules.evaluate(ownStep({ limitDays: 10 }), '2026-11-04').colour).toBe('red');
  });
});

describe('UrgencyRules: waiting step (urząd / klient)', () => {
  const waiting = (today: string) => rules.evaluate(ownStep({ kind: 'waiting', limitDays: 14 }), today);

  it('ignores idle thresholds while within its own limit', () => {
    expect(waiting('2026-11-10').colour).toBe('green');
  });

  it('is yellow the day before and red on the day its own limit is reached', () => {
    expect(waiting('2026-11-14').colour).toBe('yellow');
    expect(waiting('2026-11-15').colour).toBe('red');
  });

  it('without a limit it never turns red', () => {
    const step = ownStep({ kind: 'waiting', limitDays: null });
    expect(rules.evaluate(step, '2026-12-31').colour).toBe('green');
  });
});

describe('UrgencyRules: blinking', () => {
  it('does not blink on the 7th day in red', () => {
    // pierwszy czerwony dzień: 4.11 (daysOverdue 1); 7. dzień: 10.11
    expect(rules.evaluate(ownStep(), '2026-11-10')).toMatchObject({ daysOverdue: 7, blink: false });
  });

  it('blinks after more than 7 days in red', () => {
    expect(rules.evaluate(ownStep(), '2026-11-11')).toMatchObject({ daysOverdue: 8, blink: true });
  });
});

describe('UrgencyRules: working days by default', () => {
  it('a step ticked on Friday is still green on Monday', () => {
    const working = new UrgencyRules(DEFAULT_URGENCY_SETTINGS);
    const step = ownStep({ startedOn: '2026-11-20', lastActivityOn: '2026-11-20' });
    expect(working.evaluate(step, '2026-11-23').colour).toBe('green');
  });
});

describe('UrgencyRules: rejecting bad input', () => {
  it('rejects negative thresholds', () => {
    expect(() => new UrgencyRules({ ...DEFAULT_URGENCY_SETTINGS, yellowAfterIdleDays: -1 })).toThrow(
      /nieujemn/,
    );
  });

  it('rejects a yellow threshold above the red one', () => {
    expect(
      () => new UrgencyRules({ ...DEFAULT_URGENCY_SETTINGS, yellowAfterIdleDays: 4, redAfterIdleDays: 3 }),
    ).toThrow(/żółt/);
  });

  it.each([-2, 0, 1.5])('rejects a step limit of %s (must be a whole number ≥ 1)', (limitDays) => {
    expect(() => rules.evaluate(ownStep({ limitDays }), '2026-11-02')).toThrow(/limit/i);
  });

  it('rejects activity dated before the step started', () => {
    expect(() =>
      rules.evaluate(ownStep({ startedOn: '2026-11-05', lastActivityOn: '2026-11-04' }), '2026-11-06'),
    ).toThrow(/wcześniejsza/);
  });

  it('rejects dates from the future', () => {
    expect(() => rules.evaluate(ownStep({ lastActivityOn: '2026-11-09' }), '2026-11-08')).toThrow(
      /wcześniejsza/,
    );
  });
});

describe('UrgencyRules.compare: board order', () => {
  const item = (today: string, step: Partial<StepState>, waitingSince = '2026-11-01') => ({
    urgency: rules.evaluate(ownStep(step), today),
    waitingSince,
  });

  it('puts the longest-red item first, then yellow, then green', () => {
    const today = '2026-11-10';
    const green = item(today, { startedOn: '2026-11-10', lastActivityOn: '2026-11-10' });
    const yellow = item(today, { startedOn: '2026-11-08', lastActivityOn: '2026-11-08' });
    const redShort = item(today, { startedOn: '2026-11-07', lastActivityOn: '2026-11-07' });
    const redLong = item(today, { startedOn: '2026-11-01', lastActivityOn: '2026-11-01' });
    const sorted = [green, redShort, yellow, redLong].sort(UrgencyRules.compare);
    expect(sorted).toEqual([redLong, redShort, yellow, green]);
  });

  it('on a tie, the item waiting longest comes first', () => {
    const today = '2026-11-02';
    const newer = item(today, {}, '2026-10-20');
    const older = item(today, {}, '2026-09-01');
    expect([newer, older].sort(UrgencyRules.compare)).toEqual([older, newer]);
  });
});
