import { describe, it, expect } from 'vitest';
import { parseBankAccount, parseReviewLink } from '../../../src/modules/settings/message-settings.js';

describe('numer konta (Ustawienia → Wiadomość do klienta)', () => {
  it('accepts a correct Polish account number and writes it in groups of four', () => {
    expect(parseBankAccount('66105014451000009030216767')).toBe('66 1050 1445 1000 0090 3021 6767');
    expect(parseBankAccount(' PL66 1050-1445 1000 0090 3021 6767 ')).toBe('66 1050 1445 1000 0090 3021 6767');
  });

  it('an empty field clears the account', () => {
    expect(parseBankAccount('  ')).toBe('');
  });

  it('rejects a wrong number of digits', () => {
    expect(() => parseBankAccount('12 1050 1445')).toThrow('Numer konta musi mieć 26 cyfr');
  });

  it('rejects a typo (check digits do not match)', () => {
    expect(() => parseBankAccount('66 1050 1445 1000 0090 3021 6768')).toThrow(/literówk/);
  });

  it('rejects letters', () => {
    expect(() => parseBankAccount('66 1050 1445 1000 0090 3021 676X')).toThrow(
      'Numer konta musi mieć 26 cyfr',
    );
  });
});

describe('link do opinii Google', () => {
  it('accepts an https link', () => {
    expect(parseReviewLink(' https://g.page/r/abc/review ')).toBe('https://g.page/r/abc/review');
  });

  it('an empty field clears the link', () => {
    expect(parseReviewLink('')).toBe('');
  });

  it.each(['http://g.page/r/abc', 'g.page/r/abc', 'javascript:alert(1)', 'https://'])(
    'rejects %s',
    (link) => {
      expect(() => parseReviewLink(link)).toThrow('Link do opinii musi zaczynać się od https://');
    },
  );
});
