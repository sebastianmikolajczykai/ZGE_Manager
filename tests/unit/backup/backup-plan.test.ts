import { describe, it, expect } from 'vitest';
import { backupFileName, backupsToDelete } from '../../../src/backup/backup-plan.js';

describe('backupFileName', () => {
  it('names the copy after the day it was made', () => {
    expect(backupFileName('2026-11-24')).toBe('zge-2026-11-24.db');
  });
});

describe('backupsToDelete', () => {
  it('keeps the newest copies and returns the oldest ones above the limit', () => {
    const files = ['zge-2026-11-22.db', 'zge-2026-11-20.db', 'zge-2026-11-24.db', 'zge-2026-11-21.db'];
    expect(backupsToDelete(files, 2)).toEqual(['zge-2026-11-20.db', 'zge-2026-11-21.db']);
  });

  it('deletes nothing while the number of copies is within the limit', () => {
    expect(backupsToDelete(['zge-2026-11-24.db'], 1)).toEqual([]);
    expect(backupsToDelete([], 30)).toEqual([]);
  });

  it('never touches files that are not daily copies (user files, unfinished copies)', () => {
    const files = [
      'notatki.txt',
      'zge-2026-11-23.db',
      'zge-2026-11-24.db.tmp',
      'zge-2026-11-24.db',
      'zge.db',
    ];
    expect(backupsToDelete(files, 1)).toEqual(['zge-2026-11-23.db']);
  });
});
