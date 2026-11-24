import { describe, it, expect, vi, afterEach } from 'vitest';
import { BackupScheduler, BACKUP_CHECK_INTERVAL_MS } from '../../../src/backup/backup-scheduler.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('BackupScheduler', () => {
  afterEach(() => vi.useRealTimers());

  it('makes a copy right after start and checks again every hour', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const runIfDue = vi.fn().mockResolvedValue('created');
    const scheduler = new BackupScheduler({ runIfDue }, () => '2026-11-24', vi.fn());

    scheduler.start();
    expect(runIfDue).toHaveBeenCalledWith('2026-11-24');
    vi.advanceTimersByTime(BACKUP_CHECK_INTERVAL_MS);
    expect(runIfDue).toHaveBeenCalledTimes(2);

    scheduler.stop();
    vi.advanceTimersByTime(BACKUP_CHECK_INTERVAL_MS * 3);
    expect(runIfDue).toHaveBeenCalledTimes(2);
  });

  it('reports a failed copy instead of stopping the application', async () => {
    const log = vi.fn();
    const runIfDue = vi.fn().mockRejectedValue(new Error('Brak dostępu do folderu'));
    const scheduler = new BackupScheduler({ runIfDue }, () => '2026-11-24', log);

    scheduler.start();
    await flush();
    scheduler.stop();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Brak dostępu do folderu'));
  });
});
