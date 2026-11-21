import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { MessageSettingsService } from '../../../src/modules/settings/message-settings.js';

const ACCOUNT = '66 1050 1445 1000 0090 3021 6767';
const REVIEW = 'https://g.page/r/przyklad/review';

describe('MessageSettingsService: numer konta i link do opinii', () => {
  let dir: string;
  let db: AppDatabase;
  let service: MessageSettingsService;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    service = new MessageSettingsService(db, () => '2026-11-21');
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is empty at the start (nothing invented)', () => {
    expect(service.get()).toEqual({ bankAccount: '', reviewLink: '' });
  });

  it('saves both fields and logs who changed what', () => {
    service.update({ bankAccount: '66105014451000009030216767', reviewLink: REVIEW }, 'Łukasz');
    expect(service.get()).toEqual({ bankAccount: ACCOUNT, reviewLink: REVIEW });
    expect(service.history()).toEqual([
      {
        happenedOn: '2026-11-21',
        person: 'Łukasz',
        label: 'Link do opinii Google',
        oldValue: '',
        newValue: REVIEW,
      },
      { happenedOn: '2026-11-21', person: 'Łukasz', label: 'Numer konta', oldValue: '', newValue: ACCOUNT },
    ]);
  });

  it('does not log fields that did not change', () => {
    service.update({ bankAccount: ACCOUNT, reviewLink: '' }, 'Łukasz');
    service.update({ bankAccount: ACCOUNT, reviewLink: REVIEW }, 'Bartek');
    expect(service.history().map((h) => h.label)).toEqual(['Link do opinii Google', 'Numer konta']);
  });

  it('saves nothing when one field is wrong', () => {
    expect(() => service.update({ bankAccount: ACCOUNT, reviewLink: 'http://zle' }, 'Łukasz')).toThrow();
    expect(service.get()).toEqual({ bankAccount: '', reviewLink: '' });
    expect(service.history()).toEqual([]);
  });

  it('requires a person', () => {
    expect(() => service.update({ bankAccount: ACCOUNT, reviewLink: '' }, ' ')).toThrow();
  });
});
