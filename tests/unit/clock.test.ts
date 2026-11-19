import { describe, it, expect } from 'vitest';
import { warsawDate } from '../../src/clock.js';

describe('warsawDate', () => {
  it('returns the calendar date in Poland, not in UTC', () => {
    // 23:30 UTC on 19.11 is already 00:30 on 20.11 in Warsaw (UTC+1 in winter)
    expect(warsawDate(new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-20');
  });

  it('handles summer time (UTC+2)', () => {
    expect(warsawDate(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
  });
});
