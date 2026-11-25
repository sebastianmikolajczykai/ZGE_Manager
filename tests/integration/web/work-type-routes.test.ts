import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

/** Pola edytora dla prostego rodzaju pracy z dwoma krokami. */
function editorFields(change: Record<string, string> = {}): Record<string, string> {
  return {
    workTypeName: 'Mapa do celów projektowych',
    stepCount: '2',
    stepName_1: 'Pomiar',
    stepKind_1: 'own',
    stepLimit_1: '3',
    stepName_2: 'Zapłata',
    stepKind_2: 'waiting',
    stepLimit_2: '14',
    payment: '2',
    ...change,
  };
}

describe('Ustawienia → Rodzaje prac (edytor)', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    app = buildApp({ db, today: () => '2026-11-16', defaultPeople: ['Anna', 'Piotr'] });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, fields: Record<string, string>) =>
    app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });
  const get = async (url: string) => (await app.inject({ method: 'GET', url })).body;
  const createMapa = () => post('/ustawienia/prace', { ...editorFields(), person: 'Anna' });

  it('the settings page lists work types with links to edit and add a new one', async () => {
    const page = await get('/ustawienia');
    expect(page).toContain('Rodzaje prac');
    expect(page).toMatch(/href="\/ustawienia\/prace\/1"[^>]*>\s*Podział nieruchomości/);
    expect(page).toContain('13 kroków');
    expect(page).toContain('href="/ustawienia/prace/nowy"');
  });

  it('the editor shows the steps with their kind and limit', async () => {
    const page = await get('/ustawienia/prace/1');
    expect(page).toMatch(/name="stepName_1"[^>]*value="Ustalenie terminu pomiaru w terenie"/);
    expect(page).toMatch(/<option value="daily" selected>/);
    expect(page).toMatch(/name="stepLimit_11"[^>]*value="30"/);
    expect(page).toMatch(/name="payment"\s+value="13"\s+checked/);
  });

  it('the editor shows "w tym samym czasie co poprzedni" (checked for Analiza materiałów; none for step 1)', async () => {
    const page = await get('/ustawienia/prace/1');
    expect(page).toMatch(/name="stepParallel_2"[^>]*checked/);
    expect(page).not.toMatch(/name="stepParallel_3"[^>]*checked/);
    expect(page).not.toContain('name="stepParallel_1"');
  });

  it('saving with the parallel checkbox marks the step as parallel for new orders', async () => {
    const res = await post('/ustawienia/prace', {
      ...editorFields({
        stepCount: '3',
        stepName_2: 'Analiza',
        stepKind_2: 'own',
        stepLimit_2: '2',
        stepParallel_2: '1',
        stepName_3: 'Zapłata',
        stepKind_3: 'waiting',
        stepLimit_3: '14',
        payment: '3',
      }),
      person: 'Anna',
    });
    expect(res.statusCode).toBe(303);
    const page = await get(res.headers.location as string);
    expect(page).toMatch(/name="stepParallel_2"[^>]*checked/);
  });

  it('a payment step marked as parallel is refused with a readable message', async () => {
    const res = await post('/ustawienia/prace', { ...editorFields({ stepParallel_2: '1' }), person: 'Anna' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('nie może iść równolegle');
  });

  it('each step limit has − / + buttons (empty limit = no limit stays possible)', async () => {
    const page = await get('/ustawienia/prace/1');
    expect(page).toContain('aria-label="Zwiększ: Limit kroku 11 (dni roboczych)"');
    expect(page).toContain('aria-label="Zmniejsz: Limit kroku 11 (dni roboczych)"');
    expect(page).not.toMatch(/name="stepLimit_11"[^>]*required/);
  });

  it('buttons like "+ Dodaj krok" change only the draft, nothing is saved yet', async () => {
    const res = await post('/ustawienia/prace/1', { ...editorFields({ stepCount: '2' }), op: 'add' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('name="stepName_3"');
    expect(res.body).toContain('Zmiany nie są jeszcze zapisane');
    expect(await get('/ustawienia/prace/1')).toContain('Ustalenie terminu pomiaru w terenie');
  });

  it('creates a new work type that can be chosen for a new order', async () => {
    const res = await createMapa();
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/ustawienia/prace/2?zapisano=1');
    expect(await get('/ustawienia/prace/2?zapisano=1')).toContain('Zapisano');
    expect(await get('/zlecenia/nowe')).toContain('Mapa do celów projektowych');
  });

  it('a changed limit applies to new orders only', async () => {
    const order = (client: string) =>
      post('/zlecenia', {
        clientName: client,
        phone: '600 100 200',
        town: 'Przykładowo',
        workTypeId: '2',
        person: 'Anna',
      });
    await createMapa();
    await order('Stary Klient');
    await post('/ustawienia/prace/2', { ...editorFields({ stepLimit_1: '5' }), person: 'Piotr' });
    await order('Nowy Klient');
    expect(await get('/?zlecenie=1')).toMatch(/Pomiar<\/span>\s*<small\s*>limit 3 dni/);
    expect(await get('/?zlecenie=2')).toMatch(/Pomiar<\/span>\s*<small\s*>limit 5 dni/);
  });

  it('a wrong draft shows a readable error and keeps what was typed', async () => {
    const res = await post('/ustawienia/prace', { ...editorFields({ stepLimit_1: 'dwa' }), person: 'Anna' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/role="alert"[^>]*>Krok 1 \(„Pomiar”\): limit/);
    expect(res.body).toMatch(/name="stepLimit_1"[^>]*value="dwa"/);
  });

  it('hides a work type from new orders and offers, and shows it again', async () => {
    await createMapa();
    await post('/ustawienia/prace/2/ukryj', { person: 'Anna' });
    expect(await get('/zlecenia/nowe')).not.toContain('Mapa do celów projektowych');
    expect(await get('/oferty/nowa')).not.toContain('Mapa do celów projektowych');
    expect(await get('/ustawienia')).toContain('(ukryty)');
    await post('/ustawienia/prace/2/pokaz', { person: 'Anna' });
    expect(await get('/zlecenia/nowe')).toContain('Mapa do celów projektowych');
  });

  it('copies a work type and opens the copy in the editor', async () => {
    const res = await post('/ustawienia/prace/1/kopiuj', { person: 'Anna' });
    expect(res.headers.location).toBe('/ustawienia/prace/2');
    expect(await get('/ustawienia/prace/2')).toMatch(
      /name="workTypeName"[^>]*value="Podział nieruchomości \(kopia\)"/,
    );
  });

  it('deletes an unused work type; a used one can only be hidden', async () => {
    await createMapa();
    const used = await post('/ustawienia/prace/1/usun', { person: 'Anna' });
    expect(used.statusCode).toBe(303);
    await post('/zlecenia', {
      clientName: 'K',
      phone: '600 100 200',
      town: 'M',
      workTypeId: '2',
      person: 'Anna',
    });
    const refused = await post('/ustawienia/prace/2/usun', { person: 'Anna' });
    expect(refused.statusCode).toBe(400);
    expect(refused.body).toContain('możesz go tylko ukryć');
    expect(await get('/ustawienia')).not.toContain('href="/ustawienia/prace/1"');
  });

  it('logs changes on the settings page', async () => {
    await createMapa();
    await post('/ustawienia/prace/2/ukryj', { person: 'Piotr' });
    const page = await get('/ustawienia');
    expect(page).toContain('Historia zmian rodzajów prac (2)');
    expect(page).toContain('Piotr: ukrycie „Mapa do celów projektowych”');
    expect(page).toContain('Anna: dodanie „Mapa do celów projektowych”');
  });

  it('an unknown work type gives 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/ustawienia/prace/999' });
    expect(res.statusCode).toBe(404);
  });
});
