import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CalendarSyncScheduler,
  SYNC_INTERVAL_MS,
  NUDGE_DELAY_MS,
} from '../../../src/modules/calendar-sync/calendar-sync-scheduler.js';

describe('CalendarSyncScheduler: kiedy synchronizować', () => {
  afterEach(() => vi.useRealTimers());

  it('syncs right after start and then every few minutes; stop ends it', () => {
    vi.useFakeTimers();
    const syncNow = vi.fn().mockResolvedValue({ ok: true, error: null });
    const scheduler = new CalendarSyncScheduler({ syncNow });
    scheduler.start();
    expect(syncNow).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(SYNC_INTERVAL_MS);
    expect(syncNow).toHaveBeenCalledTimes(2);
    scheduler.stop();
    vi.advanceTimersByTime(SYNC_INTERVAL_MS * 3);
    expect(syncNow).toHaveBeenCalledTimes(2);
  });

  it('after a click in the app: one sync shortly after, many clicks = one sync', () => {
    vi.useFakeTimers();
    const syncNow = vi.fn().mockResolvedValue({ ok: true, error: null });
    const scheduler = new CalendarSyncScheduler({ syncNow });
    scheduler.nudge();
    scheduler.nudge();
    scheduler.nudge();
    expect(syncNow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(NUDGE_DELAY_MS);
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('stop cancels a pending nudge', () => {
    vi.useFakeTimers();
    const syncNow = vi.fn().mockResolvedValue({ ok: true, error: null });
    const scheduler = new CalendarSyncScheduler({ syncNow });
    scheduler.nudge();
    scheduler.stop();
    vi.advanceTimersByTime(NUDGE_DELAY_MS * 2);
    expect(syncNow).not.toHaveBeenCalled();
  });
});
