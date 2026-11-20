import { describe, it, expect } from 'vitest';
import { parseOfferInput, type OfferInput } from '../../../src/modules/offers/offer-input.js';

const TODAY = '2026-11-20';
const valid = (): OfferInput => ({
  clientName: ' Jan Przykładowy ',
  phone: '600 100 200',
  workTypeId: 1,
  sentOn: '2026-11-18',
  town: '  ',
  plot: null,
  pricePln: 2500,
  note: null,
});

describe('parseOfferInput', () => {
  it('accepts a complete offer and tidies optional fields', () => {
    const offer = parseOfferInput(valid(), TODAY);
    expect(offer.clientName).toBe('Jan Przykładowy');
    expect(offer.town).toBeNull();
    expect(offer.pricePln).toBe(2500);
  });

  it('accepts an offer sent today (day 0)', () => {
    expect(parseOfferInput({ ...valid(), sentOn: TODAY }, TODAY).sentOn).toBe(TODAY);
  });

  it.each([
    [{ clientName: '' }, /Klient/],
    [{ phone: '12' }, /telefonu/],
    [{ workTypeId: 0 }, /rodzaj pracy/],
    [{ sentOn: '2026-13-01' }, /data wysłania/i],
    [{ sentOn: '2026-11-21' }, /w przyszłości/],
    [{ pricePln: -1 }, /cena/i],
  ])('rejects bad data %o', (change, error) => {
    expect(() => parseOfferInput({ ...valid(), ...change } as OfferInput, TODAY)).toThrow(error);
  });
});
