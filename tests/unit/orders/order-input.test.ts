import { describe, it, expect } from 'vitest';
import { parseOrderInput, type OrderInput } from '../../../src/modules/orders/order-input.js';

const valid: OrderInput = {
  clientName: 'Jan Przykładowy',
  phone: '600 100 200',
  town: 'Przykładowo',
  workTypeId: 1,
  plot: null,
  office: null,
  pricePln: null,
  note: null,
  measurementOn: null,
};

describe('parseOrderInput', () => {
  it('accepts required fields only and trims text', () => {
    const parsed = parseOrderInput({ ...valid, clientName: '  Jan Przykładowy ' });
    expect(parsed.clientName).toBe('Jan Przykładowy');
  });

  it('turns empty optional text into null', () => {
    expect(parseOrderInput({ ...valid, plot: '  ', note: '' })).toMatchObject({ plot: null, note: null });
  });

  it.each([
    ['clientName', ''],
    ['town', '   '],
  ] as const)('rejects empty %s', (field, value) => {
    expect(() => parseOrderInput({ ...valid, [field]: value })).toThrow(/wymagan/);
  });

  it.each(['12345', 'abc defg hij', ''])('rejects phone "%s"', (phone) => {
    expect(() => parseOrderInput({ ...valid, phone })).toThrow(/telefon/i);
  });

  it.each(['+48 600 100 200', '600-100-200', '14 684 00 00'])('accepts phone "%s"', (phone) => {
    expect(() => parseOrderInput({ ...valid, phone })).not.toThrow();
  });

  it.each([-1, 12.345, Number.NaN])('rejects price %s', (pricePln) => {
    expect(() => parseOrderInput({ ...valid, pricePln })).toThrow(/cen/i);
  });

  it('accepts a price with grosze', () => {
    expect(parseOrderInput({ ...valid, pricePln: 2500.5 }).pricePln).toBe(2500.5);
  });

  it('accepts a measurement date and rejects a malformed one', () => {
    expect(parseOrderInput({ ...valid, measurementOn: '2026-11-20' }).measurementOn).toBe('2026-11-20');
    expect(() => parseOrderInput({ ...valid, measurementOn: '20.11.2026' })).toThrow(/pomiaru/);
  });

  it('rejects a missing work type', () => {
    expect(() => parseOrderInput({ ...valid, workTypeId: 0 })).toThrow(/rodzaj pracy/i);
  });
});
