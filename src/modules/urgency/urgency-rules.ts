import { DayCounter, type DayMode, type LocalDate } from './day-counter.js';

export type Colour = 'green' | 'yellow' | 'red';

/** own = krok robimy my; waiting = czekamy na urząd lub klienta (liczy się tylko limit kroku). */
export type StepKind = 'own' | 'waiting';

export interface UrgencySettings {
  yellowAfterIdleDays: number;
  redAfterIdleDays: number;
  /** Miganie, gdy sprawa jest czerwona dłużej niż tyle dni. */
  blinkAfterRedDays: number;
  dayMode: DayMode;
}

export const DEFAULT_URGENCY_SETTINGS: UrgencySettings = {
  yellowAfterIdleDays: 2,
  redAfterIdleDays: 3,
  blinkAfterRedDays: 7,
  dayMode: 'working',
};

export interface StepState {
  kind: StepKind;
  /** Ile dni może trwać krok; null = bez limitu. */
  limitDays: number | null;
  startedOn: LocalDate;
  /** Ostatnie odhaczenie (ruch) w sprawie. */
  lastActivityOn: LocalDate;
}

export interface Urgency {
  colour: Colour;
  /** Ile dni sprawa jest na czerwono (0, gdy nie jest czerwona). */
  daysOverdue: number;
  blink: boolean;
}

export interface BoardItem {
  urgency: Urgency;
  /** Od kiedy sprawa czeka (np. data przyjęcia zlecenia). */
  waitingSince: LocalDate;
}

const COLOUR_RANK: Record<Colour, number> = { red: 2, yellow: 1, green: 0 };

/** Reguły kolorów i kolejności spraw na tablicy. */
export class UrgencyRules {
  private readonly counter: DayCounter;

  constructor(private readonly settings: UrgencySettings) {
    validateSettings(settings);
    this.counter = new DayCounter(settings.dayMode);
  }

  evaluate(step: StepState, today: LocalDate): Urgency {
    this.validateStep(step);
    const idle = this.counter.daysBetween(step.lastActivityOn, today);
    const elapsed = this.counter.daysBetween(step.startedOn, today);
    const overLimit = step.limitDays === null ? null : elapsed - step.limitDays;

    const idleRules = step.kind === 'own';
    const idleOverdue = idleRules ? idle - this.settings.redAfterIdleDays + 1 : 0;
    const daysOverdue = Math.max(0, idleOverdue, overLimit ?? 0);

    if (daysOverdue > 0) {
      return { colour: 'red', daysOverdue, blink: daysOverdue > this.settings.blinkAfterRedDays };
    }
    const lastDayOfLimit = overLimit === 0;
    const idleWarning = idleRules && idle >= this.settings.yellowAfterIdleDays;
    const colour: Colour = lastDayOfLimit || idleWarning ? 'yellow' : 'green';
    return { colour, daysOverdue: 0, blink: false };
  }

  private validateStep(step: StepState): void {
    if (step.limitDays !== null && (!Number.isInteger(step.limitDays) || step.limitDays < 0)) {
      throw new Error(`Limit kroku musi być nieujemną liczbą całkowitą (jest ${step.limitDays})`);
    }
    // Rzuca błąd, gdy ostatni ruch jest wcześniejszy niż start kroku.
    this.counter.daysBetween(step.startedOn, step.lastActivityOn);
  }

  /** Do Array.sort: najdłużej czerwone na górze, potem żółte, zielone; przy remisie najdłużej czekające. */
  static compare(a: BoardItem, b: BoardItem): number {
    return (
      b.urgency.daysOverdue - a.urgency.daysOverdue ||
      COLOUR_RANK[b.urgency.colour] - COLOUR_RANK[a.urgency.colour] ||
      a.waitingSince.localeCompare(b.waitingSince)
    );
  }
}

function validateSettings(s: UrgencySettings): void {
  const values = [s.yellowAfterIdleDays, s.redAfterIdleDays, s.blinkAfterRedDays];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) {
    throw new Error('Progi dni muszą być nieujemnymi liczbami całkowitymi');
  }
  if (s.yellowAfterIdleDays > s.redAfterIdleDays) {
    throw new Error('Próg żółty nie może być większy niż próg czerwony');
  }
}
