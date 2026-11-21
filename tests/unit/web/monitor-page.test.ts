import { describe, it, expect } from 'vitest';
import { monitorPage } from '../../../src/web/monitor-views.js';
import type { BoardRow } from '../../../src/modules/board/board-service.js';
import type { Colour } from '../../../src/modules/urgency/urgency-rules.js';

function row(orderId: number, colour: Colour, extra: Partial<BoardRow> = {}): BoardRow {
  return {
    orderId,
    clientName: `Klient ${orderId} (przykład)`,
    town: 'Brzesko',
    plot: '123/4',
    workTypeName: 'Podział nieruchomości',
    currentStepName: 'Wysłanie zawiadomień',
    currentStepPosition: 3,
    stepCount: 13,
    daysOnStep: 4,
    lastPerson: 'Bartek',
    pricePln: 2500,
    owner: null,
    measurementMissing: false,
    urgency: { colour, blink: false, daysOverdue: colour === 'red' ? 3 : 0 },
    ...extra,
  };
}

const ROWS = [row(1, 'red'), row(2, 'yellow'), row(3, 'green'), row(4, 'green')];
const COUNTS = { offersToCall: 2, unpaidToRemind: 1 };

/** Kafel zlecenia: fragment od otwarcia do następnego kafla. */
function tile(page: string, client: string): string {
  const at = page.indexOf(client);
  expect(at, `brak kafla ${client}`).toBeGreaterThan(-1);
  const start = page.lastIndexOf('<article', at);
  return page.slice(start, page.indexOf('</article>', at));
}

describe('Widok na monitor (styl D)', () => {
  const page = monitorPage(ROWS, COUNTS, 60);

  it('is a full page of its own, without the side menu (nothing to click on a TV)', () => {
    expect(page).toMatch(/^<!doctype html>/);
    expect(page).toContain('widok na monitor');
    expect(page).not.toContain('<aside');
  });

  it('sums up orders by colour and what waits in Oferty and Niezapłacone', () => {
    const sum = page.slice(page.indexOf('class="sum"'), page.indexOf('class="wall"'));
    expect(sum).toMatch(/<b>1<\/b>\s*⚠ po terminie/);
    expect(sum).toMatch(/<b>1<\/b>\s*⏰ ostatni dzień/);
    expect(sum).toMatch(/<b>2<\/b>\s*✓ w terminie/);
    expect(sum).toMatch(/<b>2<\/b>\s*📞 oferty do telefonu/);
    expect(sum).toMatch(/<b>1<\/b>\s*💰 przypomnij o zapłacie/);
  });

  it('shows one big tile per order in the board order (most urgent first)', () => {
    const order = ROWS.map((r) => page.indexOf(r.clientName));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(page.match(/<article/g)).toHaveLength(4);
  });

  it('a tile has colour + icon + word, client, place, current step, progress, person and days', () => {
    const t = tile(page, 'Klient 1 (przykład)');
    expect(t).toContain('class="t red"');
    expect(t).toContain('⚠ po terminie · 3 dni');
    expect(t).toContain('Brzesko, dz. 123/4');
    expect(t).toContain('Wysłanie zawiadomień');
    expect(t).toContain('krok 3/13');
    expect(t).toContain('Bartek');
    expect(t).toMatch(/<b>4<\/b>\s*dni na kroku/);
  });

  it('says "1 dzień" in Polish, and shows a dash when nobody has done anything yet', () => {
    const t = tile(
      monitorPage([row(9, 'green', { daysOnStep: 1, lastPerson: null })], COUNTS, 60),
      'Klient 9',
    );
    expect(t).toMatch(/<b>1<\/b>\s*dzień na kroku/);
    expect(t).toContain('–');
  });

  it('a tile blinks only when the settings say so (Ustawienia → Miganie)', () => {
    const blinking = row(5, 'red', { urgency: { colour: 'red', blink: true, daysOverdue: 8 } });
    expect(tile(monitorPage([blinking], COUNTS, 60), 'Klient 5')).toContain('class="t red blink"');
    expect(tile(page, 'Klient 1 (przykład)')).not.toContain('blink');
  });

  it('shows a calm message when there are no active orders', () => {
    expect(monitorPage([], COUNTS, 60)).toContain('Brak aktywnych zleceń');
  });

  it('refreshes itself on the interval from settings, always (nobody types on a TV)', () => {
    const script = monitorPage(ROWS, COUNTS, 45).slice(page.indexOf('<script>'));
    expect(script).toContain('45000');
    expect(script).toContain('location.reload()');
    expect(() => monitorPage(ROWS, COUNTS, 0)).toThrow('Nieprawidłowy czas odświeżania');
  });

  it('shows a live clock with the date', () => {
    expect(page).toContain('id="zegar"');
    expect(page).toContain("toLocaleDateString('pl-PL'");
  });

  it('escapes client data', () => {
    expect(monitorPage([row(6, 'green', { clientName: '<img src=x>' })], COUNTS, 60)).toContain(
      '&lt;img src=x&gt;',
    );
  });

  it('has a small link back to the board', () => {
    expect(page).toContain('href="/"');
  });

  it('shows whose turn it is when someone owns the current step, otherwise who did something last', () => {
    const owned = tile(monitorPage([row(7, 'green', { owner: 'Marcelina' })], COUNTS, 60), 'Klient 7');
    expect(owned).toContain('Marcelina');
    expect(owned).not.toContain('Bartek');
    expect(tile(page, 'Klient 1 (przykład)')).toMatch(/ostatnio[\s\S]*Bartek/);
  });

  it('says clearly when the measurement date is still missing', () => {
    const shown = monitorPage([row(8, 'green', { measurementMissing: true }), row(9, 'green')], COUNTS, 60);
    expect(tile(shown, 'Klient 8')).toContain('Uzupełnij datę pomiaru');
    expect(tile(shown, 'Klient 9')).not.toContain('Uzupełnij datę pomiaru');
  });
});
