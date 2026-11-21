import { describe, it, expect } from 'vitest';
import { paymentMessage, formatAmount } from '../../../src/modules/payments/payment-message.js';

const ACCOUNT = '66 1050 1445 1000 0090 3021 6767';
const REVIEW = 'https://g.page/r/przyklad/review';
const order = { town: 'Radłów', plot: '57/9', pricePln: 2900 };

describe('paymentMessage: SMS do klienta po oddaniu pracy', () => {
  it('builds the full message from the order, work type and Settings', () => {
    const message = paymentMessage(order, 'Podział nieruchomości', {
      bankAccount: ACCOUNT,
      reviewLink: REVIEW,
    });
    expect(message).toBe(
      'Dzień dobry, w związku z zakończeniem pracy „Podział nieruchomości” (Radłów, dz. 57/9) ' +
        'kwota do zapłaty to 2 900,00 zł, tak jak się umawialiśmy. ' +
        `Prosimy o przelew na konto: ${ACCOUNT}. ` +
        `Z góry dziękujemy i bylibyśmy bardzo wdzięczni za opinię: ${REVIEW}`,
    );
  });

  it('without a review link the sentence about the review is left out', () => {
    const message = paymentMessage(order, 'Podział nieruchomości', { bankAccount: ACCOUNT, reviewLink: '' });
    expect(message).toMatch(/konto: 66 1050 1445 1000 0090 3021 6767\. Z góry dziękujemy\.$/);
    expect(message).not.toContain('opinię');
  });

  it('without a plot only the town is given', () => {
    const message = paymentMessage({ ...order, plot: null }, 'Mapa', {
      bankAccount: ACCOUNT,
      reviewLink: '',
    });
    expect(message).toContain('pracy „Mapa” (Radłów) kwota');
  });

  it('without a price there is no amount, only the information that the work is finished', () => {
    const message = paymentMessage({ ...order, pricePln: null }, 'Mapa', {
      bankAccount: ACCOUNT,
      reviewLink: '',
    });
    expect(message).toContain(
      'Dzień dobry, informujemy o zakończeniu pracy „Mapa” (Radłów, dz. 57/9). Prosimy',
    );
    expect(message).not.toContain('zł');
  });

  it('without a bank account there is no message (nothing to copy)', () => {
    expect(paymentMessage(order, 'Mapa', { bankAccount: '', reviewLink: REVIEW })).toBeNull();
  });
});

describe('formatAmount: kwota jak w SMS', () => {
  it.each([
    [2900, '2 900,00 zł'],
    [350.5, '350,50 zł'],
    [0, '0,00 zł'],
    [1234567.89, '1 234 567,89 zł'],
  ])('%d → %s', (pln, text) => {
    expect(formatAmount(pln)).toBe(text);
  });
});
