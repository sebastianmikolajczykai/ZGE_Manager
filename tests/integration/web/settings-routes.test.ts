import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AppDatabase } from '../../../src/db.js';
import { buildApp } from '../../../src/app.js';

const FORM = { 'content-type': 'application/x-www-form-urlencoded' };

const THRESHOLDS = {
  yellowAfterIdleDays: '2',
  redAfterIdleDays: '3',
  warnDaysBeforeLimit: '1',
  blinkEnabled: '1',
  confirmActions: '1',
  blinkAfterRedDays: '7',
  offerFollowUpDays: '7',
  refreshSeconds: '60',
};

describe('Ustawienia: kolory i przypomnienia (ekran)', () => {
  let dir: string;
  let db: AppDatabase;
  let app: FastifyInstance;
  let today: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'zge-'));
    db = AppDatabase.open(path.join(dir, 'zge.db'));
    db.migrate();
    today = '2026-11-16'; // poniedziałek
    app = buildApp({ db, today: () => today, defaultPeople: ['Anna', 'Piotr'] });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (url: string, fields: Record<string, string>) =>
    app.inject({ method: 'POST', url, headers: FORM, payload: new URLSearchParams(fields).toString() });
  const saveThresholds = (change: Record<string, string>, person = 'Anna') =>
    post('/ustawienia/progi', { ...THRESHOLDS, ...change, person });
  const settingsPage = async () => (await app.inject({ method: 'GET', url: '/ustawienia' })).body;

  it('has a short menu jumping to each settings section', async () => {
    const page = await settingsPage();
    for (const [id, name] of [
      ['kolory', 'Kolory i przypomnienia'],
      ['rodzaje-prac', 'Rodzaje prac'],
      ['dni-wolne', 'Dni wolne firmy'],
      ['wiadomosc', 'Wiadomość do klienta'],
      ['kalendarz', 'Kalendarz Google'],
      ['osoby', 'Osoby'],
    ]) {
      expect(page).toContain(`href="#${id}"`);
      expect(oneLine(page)).toMatch(new RegExp(`id="${id}"[^>]*> <summary><h3>${name}`));
    }
  });

  /** Prettier łamie długie znaczniki na kilka linii; w testach sklejamy odstępy w jedną spację. */
  const oneLine = (body: string) => body.replace(/\s+/g, ' ');

  it('every section is a fold, closed by default, so the page is short', async () => {
    const page = oneLine(await settingsPage());
    const sections = [...page.matchAll(/<details class="fold settings-section"([^>]*)>/g)];
    expect(sections.map((m) => (m[1] ?? '').match(/id="([^"]+)"/)?.[1])).toEqual([
      'kolory',
      'rodzaje-prac',
      'dni-wolne',
      'wiadomosc',
      'kalendarz',
      'osoby',
    ]);
    for (const [, attrs] of sections) {
      expect(attrs).toMatch(/data-fold="ustawienia-[a-z-]+"/);
      expect(attrs).not.toContain('open');
    }
  });

  it('has the light / dark switch at the top, visible without opening any section', async () => {
    const page = oneLine(await settingsPage());
    const group = page.match(
      /<div class="appearance" role="group" aria-label="Wygląd ekranu">.*?<\/div>/,
    )?.[0];
    expect(group).toBeDefined();
    expect(group).toMatch(
      /<button type="button"[^>]*data-motyw="jasny"[^>]*aria-pressed="true"[^>]*>☀️ Jasny/,
    );
    expect(group).toMatch(
      /<button type="button"[^>]*data-motyw="ciemny"[^>]*aria-pressed="false"[^>]*>🌙 Ciemny/,
    );
    expect(page.indexOf('class="appearance"')).toBeLessThan(page.indexOf('class="fold settings-section"'));
  });

  it('section titles show how many items are inside', async () => {
    const page = await settingsPage();
    expect(page).toMatch(/<h3>Rodzaje prac <small class="count">\(\d+\)<\/small><\/h3>/);
    expect(page).toContain('<h3>Dni wolne firmy <small class="count">(0)</small></h3>');
    expect(page).toContain('<h3>Osoby (przyciski „kto zrobił”) <small class="count">(2)</small></h3>');
  });

  it('change history stays a separate fold inside its section', async () => {
    const page = await settingsPage();
    expect(page).toMatch(/id="kolory"[\s\S]*data-fold="settings-history"[\s\S]*id="rodzaje-prac"/);
    expect(page).toMatch(/id="rodzaje-prac"[\s\S]*data-fold="work-type-history"[\s\S]*id="dni-wolne"/);
  });

  it('after saving or a refused save the "Kolory" section is shown open', async () => {
    await saveThresholds({ redAfterIdleDays: '5' });
    const saved = oneLine((await app.inject({ method: 'GET', url: '/ustawienia?zapisano=1&kto=Anna' })).body);
    expect(saved).toMatch(/<details class="fold settings-section" id="kolory"[^>]*\bopen ?>/);
    const refused = oneLine((await saveThresholds({ redAfterIdleDays: 'abc' })).body);
    expect(refused).toMatch(/<details class="fold settings-section" id="kolory"[^>]*\bopen ?>/);
    expect(refused).toMatch(/<details class="fold settings-section" id="osoby"[^>]*data-fold="[^"]+" ?>/);
  });

  it('adding people and days off returns to the right section', async () => {
    expect((await post('/ustawienia/osoby', { name: 'Ewa' })).headers.location).toBe('/ustawienia#osoby');
    expect((await post('/ustawienia/osoby/3/usun', {})).headers.location).toBe('/ustawienia#osoby');
    const added = await post('/ustawienia/dni-wolne', { fromOn: '2026-12-28', person: 'Anna' });
    expect(added.headers.location).toBe('/ustawienia#dni-wolne');
    expect((await post('/ustawienia/dni-wolne/1/usun', {})).headers.location).toBe('/ustawienia#dni-wolne');
  });

  it('shows the current values in editable fields with "Zapisz zmiany: osoba" buttons', async () => {
    const page = await settingsPage();
    expect(page).toContain('Kolory i przypomnienia');
    expect(page).toMatch(/name="redAfterIdleDays"[^>]*value="3"/);
    expect(page).toMatch(/name="blinkEnabled"[^>]*checked/);
    expect(page).toMatch(/name="confirmActions"[^>]*checked/);
    expect(page).toContain('💾 Zapisz zmiany: Anna');
  });

  it('has − / + buttons at every number field (thresholds, reminders, refresh)', async () => {
    const page = await settingsPage();
    for (const label of ['Przypomnienie o ofercie po', 'Odświeżanie ekranu co (sekund)']) {
      expect(page).toContain(`aria-label="Zmniejsz: ${label}"`);
      expect(page).toContain(`aria-label="Zwiększ: ${label}"`);
    }
    expect(page).not.toContain('aria-label="Zwiększ: Miganie włączone"');
  });

  it('the "Czy na pewno?" window is on by default and can be switched off in Ustawienia', async () => {
    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('data-all="1"');
    await saveThresholds({ confirmActions: '' });
    // okienko zostaje tylko dla cofania kilku wpisów naraz
    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('data-all="0"');
  });

  it('saves a change, shows the new value, a green "saved" note and logs who changed it', async () => {
    const res = await saveThresholds({ redAfterIdleDays: '4', refreshSeconds: '90' }, 'Piotr');
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/ustawienia?zapisano=2&kto=Piotr#kolory');
    const page = (await app.inject({ method: 'GET', url: res.headers.location as string })).body;
    expect(page).toMatch(/name="redAfterIdleDays"[^>]*value="4"/);
    expect(page).toContain('Piotr: „Czerwone, gdy brak ruchu przez” 3 → 4');
    expect(page).toMatch(/class="saved"[^>]*>✓ Zapisano 2 zmiany \(Piotr\)/);
  });

  it('saving without any change says so instead of pretending to save', async () => {
    const res = await saveThresholds({}, 'Piotr');
    expect(res.headers.location).toBe('/ustawienia?zapisano=0&kto=Piotr#kolory');
    const page = (await app.inject({ method: 'GET', url: res.headers.location as string })).body;
    expect(page).toContain('Nic nie zmieniono');
  });

  it('has a clear "Zapisz zmiany" box asking who saves, with person buttons', async () => {
    const page = await settingsPage();
    expect(page).toContain('class="save-box"');
    expect(page).toContain('Kto zapisuje? Kliknij swoje imię');
    expect(page).toContain('💾 Zapisz zmiany: Anna');
    expect(page).toContain('data-dirty-form');
  });

  it('wrong values: every error under its own field, typed values kept, nothing saved', async () => {
    const res = await saveThresholds({
      yellowAfterIdleDays: '5',
      redAfterIdleDays: '4',
      refreshSeconds: 'abc',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatch(/role="alert"[^>]*>Nie zapisano\. Popraw zaznaczone pola \(2\)/);
    expect(res.body).toMatch(
      /name="redAfterIdleDays"[\s\S]*?class="field-error"[^>]*>Czerwone musi przyjść później niż żółte: wpisz co najmniej 6\./,
    );
    expect(res.body).toMatch(
      /name="refreshSeconds"[\s\S]*?class="field-error"[^>]*>Wpisz liczbę całkowitą od 15 do 600\./,
    );
    expect(res.body).toMatch(/name="yellowAfterIdleDays"[^>]*value="5"/);
    expect(res.body).toMatch(/name="refreshSeconds"[^>]*value="abc"/);
    expect(res.body).toMatch(/name="redAfterIdleDays"[^>]*aria-invalid="true"/);
    expect(await settingsPage()).toMatch(/name="redAfterIdleDays"[^>]*value="3"/);
  });

  it('"Żółte przed limitem" ≥ a step limit is saved, with a yellow notice under the field', async () => {
    expect(await settingsPage()).not.toContain('class="field-notice"');
    const res = await saveThresholds({ warnDaysBeforeLimit: '2' });
    expect(res.statusCode).toBe(303);
    expect(await settingsPage()).toMatch(
      /name="warnDaysBeforeLimit"[\s\S]*?class="field-notice"[^>]*>Uwaga: kroki z limitem do 2 dni \(np\. „[^”]+”\) będą żółte już od pierwszego dnia\./,
    );
  });

  it('a "zapisano" link with nonsense in it shows no note', async () => {
    const page = (await app.inject({ method: 'GET', url: '/ustawienia?zapisano=abc&kto=X' })).body;
    expect(page).not.toContain('class="saved"');
  });

  it('the board colours follow the new settings at once', async () => {
    await post('/zlecenia', {
      clientName: 'Jan Przykładowy',
      phone: '600 100 200',
      town: 'Przykładowo',
      workTypeId: '1',
      measurementOn: '2026-11-30',
      person: 'Anna',
    });
    today = '2026-11-17'; // dzień przed limitem 2 dni pierwszego kroku → żółte
    const rowOf = async () =>
      (await app.inject({ method: 'GET', url: '/' })).body.match(/<tr\s+class="([^"]*)"/)?.[1];
    expect(await rowOf()).toContain('c-yellow');
    await saveThresholds({ warnDaysBeforeLimit: '0' });
    expect(await rowOf()).toContain('c-green');
  });

  it('the auto-refresh uses the interval from settings', async () => {
    await saveThresholds({ refreshSeconds: '120' });
    expect(await settingsPage()).toContain('120000');
  });

  it('the offer card offers the reminder period from settings', async () => {
    await saveThresholds({ offerFollowUpDays: '10' });
    await post('/oferty', {
      clientName: 'Ewa Ofertowa',
      phone: '600 100 200',
      workTypeId: '1',
      sentOn: '2026-11-16',
      person: 'Anna',
    });
    const card = await app.inject({ method: 'GET', url: '/oferty?oferta=1' });
    expect(card.body).toMatch(/Przypomnij znów za 10 dni\s+roboczych/);
  });

  it('"Przywróć domyślne" puts the agreed values back', async () => {
    await saveThresholds({ redAfterIdleDays: '6' });
    const res = await post('/ustawienia/progi/domyslne', { person: 'Piotr' });
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/ustawienia?zapisano=1&kto=Piotr#kolory');
    const page = await settingsPage();
    expect(page).toMatch(/name="redAfterIdleDays"[^>]*value="3"/);
    expect(page).toContain('Piotr: „Czerwone, gdy brak ruchu przez” 6 → 3');
  });

  it('saving without choosing a person is refused', async () => {
    const res = await post('/ustawienia/progi', { ...THRESHOLDS, redAfterIdleDays: '5' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('Wybierz, kto');
  });

  describe('Dni wolne firmy', () => {
    const addDaysOff = (fields: Record<string, string>) =>
      post('/ustawienia/dni-wolne', { fromOn: '', toOn: '', note: '', person: 'Anna', ...fields });

    it('adds a period that shows in the list with the reason and who added it', async () => {
      const res = await addDaysOff({ fromOn: '2026-12-28', toOn: '2026-12-31', note: 'urlop' });
      expect(res.statusCode).toBe(303);
      const page = await settingsPage();
      expect(page).toContain('28.12.2026 – 31.12.2026');
      expect(page).toContain('urlop');
      expect(page).toContain('kto wpisał: Anna');
    });

    it('a day off is not counted on the board (limit moves by a day)', async () => {
      await post('/zlecenia', {
        clientName: 'Jan Przykładowy',
        phone: '600 100 200',
        town: 'Przykładowo',
        workTypeId: '1',
        measurementOn: '2026-11-30',
        person: 'Anna',
      });
      today = '2026-11-18'; // limit 2 dni od pn 16.11 → w środę czerwone
      const rowOf = async () =>
        (await app.inject({ method: 'GET', url: '/' })).body.match(/<tr\s+class="([^"]*)"/)?.[1];
      expect(await rowOf()).toContain('c-red');
      await addDaysOff({ fromOn: '2026-11-17' });
      expect(await rowOf()).toContain('c-yellow');
    });

    it('removes a period', async () => {
      await addDaysOff({ fromOn: '2026-12-28', note: 'do usunięcia' });
      const res = await post('/ustawienia/dni-wolne/1/usun', {});
      expect(res.statusCode).toBe(303);
      expect(await settingsPage()).not.toContain('do usunięcia');
    });

    it('a wrong period shows a readable error', async () => {
      const res = await addDaysOff({ fromOn: '2026-12-31', toOn: '2026-12-28' });
      expect(res.statusCode).toBe(400);
      expect(res.body).toContain('nie może być przed');
    });
  });
});
