import { describe, it, expect } from 'vitest';
import { boardPage, parseBoardFilter } from '../../../src/web/views.js';
import type { BoardRow } from '../../../src/modules/board/board-service.js';
import type { Colour } from '../../../src/modules/urgency/urgency-rules.js';

function row(orderId: number, colour: Colour, extra: Partial<BoardRow> = {}): BoardRow {
  return {
    orderId,
    clientName: `Klient ${orderId} (przykład)`,
    town: 'Brzesko',
    plot: null,
    workTypeName: 'Podział nieruchomości',
    currentStepName: 'Wysłanie zawiadomień',
    currentStepPosition: 3,
    stepCount: 13,
    daysOnStep: 4,
    lastPerson: 'Bartek',
    pricePln: 2500,
    measurementMissing: false,
    owner: null,
    urgency: { colour, blink: false, daysOverdue: colour === 'red' ? 3 : 0 },
    ...extra,
  };
}

const ROWS = [row(1, 'red'), row(2, 'red'), row(3, 'yellow'), row(4, 'green')];
const COUNTS = { offersToCall: 2, unpaidToRemind: 1 };

/** Kafelek z licznikiem: fragment od otwarcia do zamknięcia linku. */
function tile(page: string, kind: string): string {
  const start = page.indexOf(`class="tile ${kind}`);
  expect(start, `brak kafelka ${kind}`).toBeGreaterThan(-1);
  return page.slice(start, page.indexOf('</a>', start));
}

describe('Tablica: kafelki-liczniki', () => {
  const page = boardPage(ROWS, null, null, null, { counts: COUNTS, filter: null }).value;

  it('counts orders after the deadline, on the last day and on time', () => {
    expect(tile(page, 'red')).toMatch(/<b>2<\/b\s*>[\s\S]*po terminie/);
    expect(tile(page, 'yellow')).toMatch(/<b>1<\/b\s*>[\s\S]*ostatni dzień/);
    expect(tile(page, 'green')).toMatch(/<b>1<\/b\s*>[\s\S]*w terminie/);
  });

  it('shows offers to call and payments to remind, linking to their tabs', () => {
    expect(tile(page, 'offers')).toMatch(/href="\/oferty"[\s\S]*<b>2<\/b\s*>/);
    expect(tile(page, 'unpaid')).toMatch(/href="\/niezaplacone"[\s\S]*<b>1<\/b\s*>/);
  });

  it('colour tiles work as filters', () => {
    expect(tile(page, 'red')).toContain('href="/?kolor=red"');
    expect(tile(page, 'green')).toContain('href="/?kolor=green"');
  });
});

describe('Tablica: filtr koloru', () => {
  const page = boardPage(ROWS, null, null, null, { counts: COUNTS, filter: 'red' }).value;

  it('shows only the chosen colour, but the tiles still count everything', () => {
    expect(page).toContain('Klient 1 (przykład)');
    expect(page).toContain('Klient 2 (przykład)');
    expect(page).not.toContain('Klient 3 (przykład)');
    expect(tile(page, 'green')).toMatch(/<b>1<\/b\s*>/);
  });

  it('marks the active tile and offers a way back to all orders', () => {
    expect(page).toContain('class="tile red on"');
    expect(page).toMatch(/href="\/"[^>]*>Pokaż wszystkie \(4\)/);
  });

  it('keeps the filter when an order is opened', () => {
    expect(page).toContain('href="/?zlecenie=1&amp;kolor=red"');
  });

  it('says so when nothing has the chosen colour', () => {
    const empty = boardPage([row(4, 'green')], null, null, null, { counts: COUNTS, filter: 'red' }).value;
    expect(empty).toContain('Brak zleceń w tym kolorze.');
  });
});

describe('Tablica: wiersz zlecenia', () => {
  const page = boardPage([row(1, 'red')], null, null, null, { counts: COUNTS, filter: null }).value;

  it('keeps the colour class on the row (used by the blinking and by tests of colours)', () => {
    expect(page).toMatch(/<tr\s+class="c-red/);
  });

  it('shows a status chip, step progress and who did the last step', () => {
    expect(page).toContain('chip chip-red');
    expect(page).toContain('krok 3/13');
    expect(page).toMatch(/class="av"[^>]*>\s*B<\/span\s*>\s*<span class="who-name">Bartek/);
  });

  it('has a search box that filters the list as you type', () => {
    expect(page).toMatch(/<input[^>]*type="search"[^>]*id="szukaj"/);
    expect(page).toContain('data-search-list');
  });
});

describe('Tablica: zlecenia bez daty pomiaru', () => {
  const rows = [
    row(1, 'green', { measurementMissing: true }),
    row(2, 'green'),
    row(3, 'red', { measurementMissing: true }),
  ];
  const page = boardPage(rows, null, null, null, { counts: COUNTS, filter: null }).value;

  it('marks the row with a clear "fill in the measurement date" label', () => {
    const first = page.slice(page.indexOf('Klient 1 (przykład)'), page.indexOf('Klient 2 (przykład)'));
    expect(first).toContain('class="missing-date"');
    expect(first).toContain('Uzupełnij datę pomiaru');
    const second = page.slice(page.indexOf('Klient 2 (przykład)'), page.indexOf('Klient 3 (przykład)'));
    expect(second).not.toContain('Uzupełnij datę pomiaru');
  });

  it('counts them on a tile that filters the list', () => {
    expect(tile(page, 'no-date')).toMatch(
      /href="\/\?kolor=bez-daty"[\s\S]*<b>2<\/b\s*>[\s\S]*bez daty pomiaru/,
    );
    const filtered = boardPage(rows, null, null, null, { counts: COUNTS, filter: 'bez-daty' }).value;
    expect(filtered).toContain('Klient 1 (przykład)');
    expect(filtered).not.toContain('Klient 2 (przykład)');
    expect(filtered).toContain('class="tile no-date on"');
  });

  it('hides the tile when every order has its date', () => {
    const all = boardPage([row(2, 'green')], null, null, null, { counts: COUNTS, filter: null }).value;
    expect(all).not.toContain('tile no-date');
  });

  it('reads the filter from the address', () => {
    expect(parseBoardFilter('bez-daty')).toBe('bez-daty');
    expect(parseBoardFilter('red')).toBe('red');
    expect(parseBoardFilter('cos')).toBeNull();
  });
});

describe('Tablica: filtr „Moje” (bez logowania)', () => {
  const PEOPLE = [
    { id: 1, name: 'Łukasz' },
    { id: 2, name: 'Bartek' },
  ];
  const OWNED = [
    row(1, 'red', { owner: 'Bartek' }),
    row(2, 'yellow', { owner: 'Łukasz' }),
    row(3, 'green', { owner: 'Bartek' }),
    row(4, 'green', { owner: null }),
  ];
  const mine = boardPage(OWNED, null, null, null, {
    counts: COUNTS,
    filter: null,
    person: 'Bartek',
    people: PEOPLE,
  }).value;

  it('shows only orders whose current step belongs to the chosen person', () => {
    expect(mine).toContain('Klient 1 (przykład)');
    expect(mine).toContain('Klient 3 (przykład)');
    expect(mine).not.toContain('Klient 2 (przykład)');
    expect(mine).not.toContain('Klient 4 (przykład)');
  });

  it('the tiles count only that person’s orders and keep the person when clicked', () => {
    expect(tile(mine, 'red')).toMatch(/<b>1<\/b\s*>/);
    expect(tile(mine, 'yellow')).toMatch(/<b>0<\/b\s*>/);
    expect(tile(mine, 'red')).toContain('href="/?kolor=red&amp;osoba=Bartek"');
  });

  it('keeps the person when an order is opened', () => {
    expect(mine).toContain('href="/?zlecenie=1&amp;osoba=Bartek"');
  });

  it('has a person picker with "all" and each person, the chosen one selected', () => {
    const picker = mine.slice(
      mine.indexOf('<select id="osoba"'),
      mine.indexOf('</select>', mine.indexOf('<select id="osoba"')),
    );
    expect(picker).toContain('aria-label="Pokaż zlecenia osoby"');
    expect(picker).toMatch(/<option value="">[^<]*Wszyscy/);
    expect(picker).toMatch(/<option value="Bartek" selected>/);
    expect(picker).toMatch(/<option value="Łukasz"\s*>/);
  });

  it('says so when the person has nothing on the board', () => {
    const empty = boardPage([row(4, 'green')], null, null, null, {
      counts: COUNTS,
      filter: null,
      person: 'Łukasz',
      people: PEOPLE,
    }).value;
    expect(empty).toContain('Łukasz nie ma teraz żadnego kroku do zrobienia.');
  });

  it('shows the owner of the current step in the list', () => {
    expect(mine).toMatch(/class="assignee"[\s\S]*Bartek/);
  });
});
