import type { LocalDate } from '../urgency/day-counter.js';
import type { StepKind } from '../work-types/work-type-definition.js';

/** Tyle wystarczy, żeby ocenić, czy zlecenie czeka na termin pomiaru. */
export interface MeasurementInfo {
  measurementOn: LocalDate | null;
  steps: readonly { kind: StepKind; status: 'pending' | 'active' | 'done' }[];
}

/**
 * Zlecenie czeka na termin pomiaru: ma krok „w ustalonym dniu”, który jeszcze się nie odbył,
 * a daty pomiaru nie wpisano (termin bywa uzgadniany z urzędem, więc dopisuje się go później).
 */
export function isWaitingForMeasurementDate(order: MeasurementInfo): boolean {
  return (
    order.measurementOn === null && order.steps.some((s) => s.kind === 'scheduled' && s.status !== 'done')
  );
}
