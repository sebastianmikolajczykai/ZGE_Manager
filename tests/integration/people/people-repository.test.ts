import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AppDatabase } from '../../../src/db.js';
import { PeopleRepository } from '../../../src/modules/people/people-repository.js';

describe('PeopleRepository (osoby do przycisków „kto zrobił”)', () => {
  let dir: string;
  let db: AppDatabase;
  let people: PeopleRepository;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    people = new PeopleRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('adds people and lists them in the order they were added', () => {
    people.add('Anna');
    people.add(' Piotr ');
    expect(people.list().map((p) => p.name)).toEqual(['Anna', 'Piotr']);
  });

  it('rejects an empty name and a duplicate', () => {
    people.add('Anna');
    expect(() => people.add('  ')).toThrow(/imię/i);
    expect(() => people.add('anna')).toThrow(/już jest/);
  });

  it('removing a person hides them from buttons; history keeps their name', () => {
    const id = people.add('Anna');
    people.remove(id);
    expect(people.list()).toEqual([]);
  });

  it('seeds names only when the list is empty', () => {
    people.seedIfEmpty(['Anna', 'Piotr']);
    people.seedIfEmpty(['Ktoś']);
    expect(people.list().map((p) => p.name)).toEqual(['Anna', 'Piotr']);
  });
});
