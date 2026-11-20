import { describe, it, expect } from 'vitest';
import {
  avatar,
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
