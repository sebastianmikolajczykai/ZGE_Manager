import { describe, it, expect } from 'vitest';
import { html } from '../../../src/web/html.js';
import {
  avatar,
  entriesText,
  numberStepper,
  historyList,
  personButtons,
  personColour,
  progressBar,
  statusChip,
} from '../../../src/web/view-helpers.js';

describe('kolor osoby (rozpoznawanie, kto co zrobił)', () => {
  it('gives the same person the same colour every time', () => {
    expect(personColour('Bartek')).toBe(personColour('Bartek'));
  });

  it('gives Łukasz, Bartek and Marcelina three different colours', () => {
    const colours = new Set(['Łukasz', 'Bartek', 'Marcelina'].map(personColour));
    expect(colours.size).toBe(3);
  });

  it('shows the first letter of the name in a coloured circle, hidden from screen readers', () => {
    const html = avatar('Łukasz').value;
    expect(html).toContain('>Ł<');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`--p:${personColour('Łukasz')}`);
  });
});

describe('chip statusu (kolor + ikona + słowo)', () => {
  it.each([
    ['red', '⚠', 'po terminie'],
    ['yellow', '⏰', 'ostatni dzień'],
    ['green', '✓', 'w terminie'],
  ] as const)('%s chip has its icon and the word, not only the colour', (colour, icon, label) => {
    const html = statusChip(colour, label).value;
    expect(html).toContain(`chip chip-${colour}`);
    expect(html).toContain(icon);
    expect(html).toContain(label);
  });

  it('escapes the label', () => {
    expect(statusChip('green', '<b>').value).toContain('&lt;b&gt;');
  });
});

describe('pasek postępu kroków', () => {
  it('shows "krok 3/13" and fills the bar proportionally', () => {
    const html = progressBar(3, 13).value;
    expect(html).toContain('krok 3/13');
    expect(html).toContain('width:23%');
  });

  it('is full on the last step and empty-safe for zero steps', () => {
    expect(progressBar(13, 13).value).toContain('width:100%');
    expect(progressBar(0, 0).value).toContain('width:0%');
  });
});

describe('przyciski osób', () => {
  it('keep the readable name "Zrobione: Bartek" (the coloured letter is decoration only)', () => {
    const html = personButtons('/x', 'Zrobione', [{ id: 1, name: 'Bartek' }], 'primary').value;
    const button = html.slice(html.indexOf('<button'), html.indexOf('</button>'));
    expect(button).toContain('class="primary person"');
    expect(button).toContain('aria-hidden="true"');
    expect(button.replace(/<span[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, '')).toMatch(
      />\s*Zrobione: Bartek\s*$/,
    );
  });
});

describe('przyciski − / + przy polu liczbowym', () => {
  const input = html`<input type="number" name="redAfterIdleDays" min="1" max="30" value="3" />`;
  const out = numberStepper('Czerwone po', input).value;

  it('puts the field first, so the surrounding label still names the field (not the minus button)', () => {
    expect(out.indexOf('name="redAfterIdleDays"')).toBeLessThan(out.indexOf('<button'));
    expect(out.indexOf('data-step="-1"')).toBeLessThan(out.indexOf('data-step="1"'));
    expect(out).toContain('class="step-btn minus"');
  });

  it('the buttons do not send the form (type="button"), they only change the number', () => {
    expect(out.match(/<button type="button"/g)).toHaveLength(2);
    expect(out).toContain('data-step="-1"');
    expect(out).toContain('data-step="1"');
  });

  it('names the buttons for screen readers with the field name', () => {
    expect(out).toContain('aria-label="Zmniejsz: Czerwone po"');
    expect(out).toContain('aria-label="Zwiększ: Czerwone po"');
  });

  it('escapes the field name', () => {
    expect(numberStepper('<b>', input).value).toContain('Zmniejsz: &lt;b&gt;');
  });
});

describe('historia z cofaniem', () => {
  const people = [{ id: 1, name: 'Bartek' }];
  const entries = [
    { id: 1, person: 'Łukasz', happenedOn: '2026-11-18', reverted: false },
    { id: 2, person: 'Bartek', happenedOn: '2026-11-19', reverted: true },
    { id: 3, person: 'Łukasz', happenedOn: '2026-11-20', reverted: false },
  ];
  const text = (h: { id: number }) => html`wpis ${h.id}`;
  const page = historyList(entries, text, { entryId: 3, action: (id) => `/x/${id}/cofnij`, people }).value;

  it('shows the newest entry first', () => {
    expect(page.indexOf('wpis 3')).toBeLessThan(page.indexOf('wpis 1'));
  });

  it('the newest working entry opens with a click and offers "Cofnij" for each person', () => {
    const item = page.slice(
      page.indexOf('<li class="can-undo"'),
      page.indexOf('</li>', page.indexOf('can-undo')),
    );
    expect(item).toContain('<details class="undo-entry">');
    expect(item).toContain('wpis 3');
    expect(item).toContain('action="/x/3/cofnij"');
    expect(item).toContain('Cofnij: Bartek');
  });

  it('undone entries are crossed out and marked, without a button', () => {
    expect(page).toMatch(/<li class="reverted"[^>]*>[\s\S]*<s>[\s\S]*wpis 2[\s\S]*<\/s>[\s\S]*cofnięte/);
    expect(page).not.toContain('/x/2/cofnij');
    expect(page).not.toContain('/x/1/cofnij');
  });

  it('without anything to undo there is no undo form', () => {
    const none = historyList(entries, text, { entryId: null, action: (id) => `/x/${id}`, people }).value;
    expect(none).not.toContain('undo-entry');
  });
});

describe('historia: cofanie do wybranego wpisu (kilka wpisów naraz)', () => {
  const people = [{ id: 1, name: 'Bartek' }];
  const entries = [1, 2, 3, 4, 5, 6, 7].map((id) => ({
    id,
    person: 'Łukasz',
    happenedOn: '2026-11-20',
    reverted: false,
  }));
  const text = (h: { id: number }) => html`wpis ${h.id}`;
  const page = historyList(entries, text, {
    entryId: 7,
    olderEntryIds: [6, 5, 4, 3],
    olderAction: (id) => `/x/${id}/cofnij-do`,
    action: (id) => `/x/${id}/cofnij`,
    people,
  }).value;
  const itemOf = (id: number) => {
    const start = page.indexOf(`wpis ${id}`);
    return page.slice(page.lastIndexOf('<li', start), page.indexOf('</li>', start));
  };

  it('an older entry offers going back to it and says how many entries it undoes', () => {
    const item = itemOf(5);
    expect(item).toContain('cofnij do tego miejsca');
    expect(item).toContain('action="/x/5/cofnij-do"');
    expect(item).toContain('Cofnie 3 wpisy (ten i nowsze), tylko w tym zleceniu.');
    expect(item).toContain('data-label="Cofnij 3 wpisy: Bartek"');
  });

  it('uses the right Polish form for 5 and more entries', () => {
    expect(itemOf(3)).toContain('Cofnij 5 wpisów: Bartek');
  });

  it('going back over several entries always asks "Czy na pewno?"', () => {
    expect(itemOf(6)).toMatch(/<form[^>]*data-confirm="1"/);
  });

  it('the newest entry keeps the normal "cofnij"; entries that cannot be reached have no button', () => {
    expect(itemOf(7)).toContain('action="/x/7/cofnij"');
    expect(itemOf(7)).not.toContain('cofnij do tego miejsca');
    expect(itemOf(2)).not.toContain('cofnij');
    expect(itemOf(1)).not.toContain('cofnij');
  });
});

describe('entriesText: polska odmiana liczby wpisów', () => {
  it.each([
    [1, '1 wpis'],
    [2, '2 wpisy'],
    [4, '4 wpisy'],
    [5, '5 wpisów'],
    [12, '12 wpisów'],
    [14, '14 wpisów'],
    [22, '22 wpisy'],
    [25, '25 wpisów'],
  ])('%i → %s', (count, expected) => {
    expect(entriesText(count)).toBe(expected);
  });
});
