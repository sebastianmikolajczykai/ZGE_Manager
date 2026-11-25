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

describe('UrgencyRules: own step without a limit, idle thresholds (2 yellow / 3 red)', () => {
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

  it('a step with a limit ignores the "no movement" rule: limit 5 is still green after 3 idle days', () => {
    expect(rules.evaluate(ownStep({ limitDays: 5 }), '2026-11-04').colour).toBe('green');
  });

  it('a step with a limit is yellow only the day before the limit, never earlier because of idling', () => {
    const step = ownStep({ limitDays: 10 });
    expect(rules.evaluate(step, '2026-11-09').colour).toBe('green');
    expect(rules.evaluate(step, '2026-11-10').colour).toBe('yellow');
    expect(rules.evaluate(step, '2026-11-11')).toMatchObject({ colour: 'red', daysOverdue: 1 });
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

describe('UrgencyRules.evaluateDaily: "check every day" steps', () => {
  it.each([
    ['2026-11-02', 'green', 0],
    ['2026-11-03', 'yellow', 0],
    ['2026-11-04', 'red', 1],
    ['2026-11-06', 'red', 3],
  ])('last checked 2026-11-02, on %s → %s (%i days overdue)', (today, colour, daysOverdue) => {
    expect(rules.evaluateDaily('2026-11-02', today)).toMatchObject({ colour, daysOverdue });
  });

  it('blinks after more than 7 red days', () => {
    expect(rules.evaluateDaily('2026-11-01', '2026-11-10').blink).toBe(true);
  });
});

describe('UrgencyRules.evaluateScheduled: step on a fixed date (field measurement)', () => {
  it.each([
    ['2026-11-19', 'green', 0],
    ['2026-11-20', 'yellow', 0],
    ['2026-11-21', 'red', 1],
  ])('measurement on 2026-11-20, on %s → %s', (today, colour, daysOverdue) => {
    expect(rules.evaluateScheduled('2026-11-20', today)).toMatchObject({ colour, daysOverdue });
  });

  it('counts only working days after the date (working-day rules)', () => {
    const working = new UrgencyRules(DEFAULT_URGENCY_SETTINGS);
    // pomiar w piątek 20.11, poniedziałek 23.11 = 1 dzień po terminie
    expect(working.evaluateScheduled('2026-11-20', '2026-11-23')).toMatchObject({
      colour: 'red',
      daysOverdue: 1,
    });
  });
});

describe('UrgencyRules: settings changed in Ustawienia', () => {
  const step = (limitDays: number, today: string) =>
    ownStep({ limitDays, startedOn: '2026-11-01', lastActivityOn: today });

  it('warns N days before the limit when the owner sets N = 2', () => {
    const warnTwo = new UrgencyRules({
      ...DEFAULT_URGENCY_SETTINGS,
      dayMode: 'calendar',
      warnDaysBeforeLimit: 2,
    });
    expect(warnTwo.evaluate(step(5, '2026-11-03'), '2026-11-03').colour).toBe('green');
    expect(warnTwo.evaluate(step(5, '2026-11-04'), '2026-11-04').colour).toBe('yellow');
    expect(warnTwo.evaluate(step(5, '2026-11-05'), '2026-11-05').colour).toBe('yellow');
    expect(warnTwo.evaluate(step(5, '2026-11-06'), '2026-11-06').colour).toBe('red');
  });

  it('gives no warning before the limit when set to 0', () => {
    const noWarn = new UrgencyRules({
      ...DEFAULT_URGENCY_SETTINGS,
      dayMode: 'calendar',
      warnDaysBeforeLimit: 0,
    });
    expect(noWarn.evaluate(step(5, '2026-11-05'), '2026-11-05').colour).toBe('green');
    expect(noWarn.evaluate(step(5, '2026-11-06'), '2026-11-06').colour).toBe('red');
  });

  it('never blinks when blinking is switched off', () => {
    const calm = new UrgencyRules({ ...DEFAULT_URGENCY_SETTINGS, dayMode: 'calendar', blinkEnabled: false });
    const longOverdue = calm.evaluate(step(1, '2026-11-30'), '2026-11-30');
    expect(longOverdue.colour).toBe('red');
    expect(longOverdue.blink).toBe(false);
  });

  it('reads the current settings on every check, so a change works without restarting', () => {
    let settings = { ...DEFAULT_URGENCY_SETTINGS, dayMode: 'calendar' as const };
    const live = new UrgencyRules(() => settings);
    expect(live.evaluate(ownStep(), '2026-11-03').colour).toBe('yellow');
    settings = { ...settings, yellowAfterIdleDays: 4, redAfterIdleDays: 5 };
    expect(live.evaluate(ownStep(), '2026-11-03').colour).toBe('green');
  });

  it('rejects a warning period that is negative', () => {
    expect(() => new UrgencyRules({ ...DEFAULT_URGENCY_SETTINGS, warnDaysBeforeLimit: -1 })).toThrow();
  });
});

describe('UrgencyRules: company days off', () => {
  const working = { ...DEFAULT_URGENCY_SETTINGS };
  const withDayOff = { ...working, isDayOff: (date: string) => date === '2026-11-17' };
  // Krok z limitem 2 dni zaczęty w pn 16.11; w śr 18.11 bez dnia wolnego = czerwone, z wolnym wtorkiem = żółte.
  const step = ownStep({ limitDays: 2, startedOn: '2026-11-16', lastActivityOn: '2026-11-16' });

  it('a company day off pushes the limit by a day', () => {
    expect(new UrgencyRules(working).evaluate(step, '2026-11-18').colour).toBe('red');
    expect(new UrgencyRules(withDayOff).evaluate(step, '2026-11-18').colour).toBe('yellow');
  });

  it('counts working days for the lists the same way as the colours', () => {
    expect(new UrgencyRules(withDayOff).daysBetween('2026-11-16', '2026-11-18')).toBe(1);
  });
});

describe('UrgencyRules.dueOn: kiedy zadzwonić (dzień, w którym sprawa robi się czerwona)', () => {
  it('is the day the limit runs out, counted from the last contact', () => {
    expect(rules.dueOn('2026-11-01', 7, '2026-11-02')).toBe('2026-11-08');
  });

  it('is today when the deadline has already passed (no reminders in the past)', () => {
    expect(rules.dueOn('2026-11-01', 7, '2026-11-20')).toBe('2026-11-20');
  });

  it('is today when there is no limit', () => {
    expect(rules.dueOn('2026-11-01', null, '2026-11-05')).toBe('2026-11-05');
  });

  it('agrees with the colour: red exactly on that day', () => {
    const due = rules.dueOn('2026-11-01', 7, '2026-11-01');
    const step: StepState = {
      kind: 'waiting',
      limitDays: 7,
      startedOn: '2026-11-01',
      lastActivityOn: '2026-11-01',
    };
    expect(rules.evaluate(step, due).colour).toBe('red');
  });
});
