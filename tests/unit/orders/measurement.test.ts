import { describe, it, expect } from 'vitest';
import { isWaitingForMeasurementDate } from '../../../src/modules/orders/measurement.js';
import type { OrderStep } from '../../../src/modules/orders/order-service.js';

function step(kind: OrderStep['kind'], status: OrderStep['status']): OrderStep {
  return {
    position: 1,
    name: kind,
    kind,
    limitDays: null,
    provisional: false,
    payment: false,
    status,
    startedOn: null,
    doneOn: null,
    doneBy: null,
    lastCheckedOn: null,
    lastCheckedBy: null,
    assignee: null,
  };
}

describe('isWaitingForMeasurementDate: zlecenie czeka na termin pomiaru', () => {
  it('is true when the measurement step is still ahead and there is no date', () => {
    const order = { measurementOn: null, steps: [step('own', 'active'), step('scheduled', 'pending')] };
    expect(isWaitingForMeasurementDate(order)).toBe(true);
  });

  it('is true when the measurement step is the current one and there is no date', () => {
    const order = { measurementOn: null, steps: [step('own', 'done'), step('scheduled', 'active')] };
    expect(isWaitingForMeasurementDate(order)).toBe(true);
  });

  it('is false once the date is filled in', () => {
    const order = { measurementOn: '2026-11-25', steps: [step('scheduled', 'active')] };
    expect(isWaitingForMeasurementDate(order)).toBe(false);
  });

  it('is false for work without a measurement step', () => {
    const order = { measurementOn: null, steps: [step('own', 'active'), step('waiting', 'pending')] };
    expect(isWaitingForMeasurementDate(order)).toBe(false);
  });

  it('is false when the measurement is already done (nothing left to plan)', () => {
    const order = { measurementOn: null, steps: [step('scheduled', 'done'), step('own', 'active')] };
    expect(isWaitingForMeasurementDate(order)).toBe(false);
  });
});
