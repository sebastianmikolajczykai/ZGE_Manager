import { describe, it, expect } from 'vitest';
import { orderLabel } from '../../../src/modules/orders/order-label.js';

describe('orderLabel: jak nazywać zlecenie na listach', () => {
  it('uses the office number when it is given', () => {
    expect(orderLabel({ orderNumber: '125 podział', clientName: 'Jan Przykładowy' })).toBe('125 podział');
  });

  it('falls back to the client name for orders without a number', () => {
    expect(orderLabel({ orderNumber: null, clientName: 'Jan Przykładowy' })).toBe('Jan Przykładowy');
  });
});
