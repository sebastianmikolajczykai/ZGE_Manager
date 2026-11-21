import { describe, it, expect } from 'vitest';
import { statsPage } from '../../../src/web/stats-views.js';
import type { ClientStats, StatsSummary } from '../../../src/modules/stats/stats-service.js';

const SUMMARY: StatsSummary = {
  totalClients: 12,
  totalOrders: 15,
  incomeTotalPln: 30500,
  incomeThisMonthPln: 7000,
  paidWithoutPrice: 1,
  unpaidPln: 4000,
  inProgressPln: 9800,
  months: [
    {
      month: '2026-11',
      newClients: 3,
      orders: 4,
      incomePln: 7000,
      paidOrders: 2,
      offersSent: 5,
      offersAccepted: 2,
    },
    {
      month: '2026-10',
      newClients: 2,
      orders: 2,
      incomePln: 14000,
      paidOrders: 4,
      offersSent: 1,
      offersAccepted: 0,
    },
  ],
};
const CLIENTS: ClientStats[] = [
  {
    name: 'Jan Kowalski (przykład)',
    phone: '600 100 200',
    orders: 2,
    paidPln: 5000,
    firstOrderOn: '2026-10-02',
    lastOrderOn: '2026-11-10',
    lastOrderId: 7,
  },
];

/** Kafelek: fragment od klasy do końca kafelka. */
function stat(page: string, label: string): string {
  const at = page.indexOf(label);
  expect(at, `brak kafelka „${label}”`).toBeGreaterThan(-1);
  return page.slice(page.lastIndexOf('<div class="stat', at), at + label.length);
}

describe('Statystyki', () => {
  const page = statsPage(SUMMARY, CLIENTS).value;

  it('shows totals: all clients, income this month and in total, still to be paid, in progress', () => {
    expect(stat(page, 'Wszyscy klienci')).toContain('<b>12</b>');
    expect(stat(page, 'Nowi klienci w tym miesiącu')).toContain('<b>3</b>');
    expect(stat(page, 'Dochód w tym miesiącu')).toMatch(/<b>7[\s\u00a0]?000 zł<\/b>/);
    expect(stat(page, 'Dochód łącznie')).toMatch(/<b>30[\s\u00a0]500 zł<\/b>/);
    expect(stat(page, 'Czeka na zapłatę')).toMatch(/<b>4[\s\u00a0]?000 zł<\/b>/);
    expect(stat(page, 'W realizacji')).toMatch(/<b>9[\s\u00a0]?800 zł<\/b>/);
  });

  it('has a month table with Polish month names, income bars scaled to the best month and new clients', () => {
    expect(page).toContain('listopad 2026');
    expect(page).toContain('październik 2026');
    expect(page).toContain('style="width:50%"');
    expect(page).toContain('style="width:100%"');
    const november = page.slice(
      page.indexOf('listopad 2026'),
      page.indexOf('</tr>', page.indexOf('listopad 2026')),
    );
    expect(november).toMatch(/<td class="num">3<\/td>/);
    expect(november).toContain('5 / 2');
  });

  it('lists clients with a link to their last order and a search box', () => {
    expect(page).toContain('Jan Kowalski (przykład)');
    expect(page).toContain('href="/?zlecenie=7"');
    expect(page).toMatch(/<input[^>]*type="search"[^>]*id="szukaj"/);
    expect(page).toContain('data-search-list');
  });

  it('explains how the numbers are counted and warns about paid orders without a price', () => {
    expect(page).toContain('Jak liczymy');
    expect(page).toContain('1 zapłacone zlecenie bez wpisanej ceny');
  });

  it('says so when there are no clients yet', () => {
    expect(statsPage({ ...SUMMARY, paidWithoutPrice: 0 }, []).value).toContain('Brak klientów');
  });

  it.each([
    [2, '2 zapłacone zlecenia'],
    [5, '5 zapłaconych zleceń'],
    [12, '12 zapłaconych zleceń'],
    [22, '22 zapłacone zlecenia'],
  ])('Polish plural for %i paid orders without a price', (n, words) => {
    expect(statsPage({ ...SUMMARY, paidWithoutPrice: n }, CLIENTS).value).toContain(words);
  });
});
