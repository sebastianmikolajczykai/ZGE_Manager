import { describe, it, expect } from 'vitest';
import { orderDetail } from '../../../src/web/views.js';
import type { HistoryEntry, Order, OrderStep } from '../../../src/modules/orders/order-service.js';

const PEOPLE = [{ id: 1, name: 'Bartek' }];

function step(position: number, status: OrderStep['status']): OrderStep {
  return {
    position,
    name: `Krok ${position}`,
    kind: 'own',
    limitDays: 2,
    provisional: false,
    payment: false,
    status,
    startedOn: status === 'pending' ? null : '2026-11-02',
    doneOn: status === 'done' ? '2026-11-03' : null,
    doneBy: status === 'done' ? 'Bartek' : null,
    lastCheckedOn: null,
    lastCheckedBy: null,
  };
}

function order(steps: OrderStep[]): Order {
  return {
    id: 7,
    clientName: 'Klient (przykład)',
    phone: '500 000 000',
    town: 'Brzesko',
    plot: null,
    office: null,
    pricePln: null,
    note: null,
    measurementOn: null,
    workTypeId: 1,
    receivedOn: '2026-11-02',
    status: 'active',
    completedOn: null,
    steps,
  };
}

const HISTORY: HistoryEntry[] = [
  {
    happenedOn: '2026-11-02',
    person: 'Bartek',
    action: 'created',
    stepPosition: null,
    stepName: null,
    note: null,
  },
  {
    happenedOn: '2026-11-03',
    person: 'Bartek',
    action: 'step_done',
    stepPosition: 1,
    stepName: 'Krok 1',
    note: null,
  },
];

function render(steps: OrderStep[]): string {
  return orderDetail(order(steps), 'Podział', null, HISTORY, PEOPLE).value;
}

/** Fragment HTML od otwarcia <details> z daną nazwą do jego zamknięcia. */
function fold(page: string, name: string): string {
  const start = page.indexOf(`data-fold="${name}"`);
  expect(start, `brak zwijanej sekcji ${name}`).toBeGreaterThan(-1);
  return page.slice(start, page.indexOf('</details>', start));
}

describe('karta zlecenia: zwijane sekcje', () => {
  it('puts done steps in a collapsible section with their count, closed by default', () => {
    const page = render([step(1, 'done'), step(2, 'done'), step(3, 'active'), step(4, 'pending')]);
    const done = fold(page, 'steps-done');
    expect(done).toContain('Zrobione kroki (2)');
    expect(done).toContain('Krok 1');
    expect(done).toContain('Krok 2');
    expect(done).not.toContain('Krok 3');
    expect(page).toMatch(/<details class="fold" data-fold="steps-done">/);
  });

  it('keeps the active and upcoming steps visible with their original numbers', () => {
    const page = render([step(1, 'done'), step(2, 'done'), step(3, 'active'), step(4, 'pending')]);
    expect(page).toMatch(/<li value="3" class="step active">/);
    expect(page).toMatch(/<li value="4" class="step pending">/);
  });

  it('shows no done-steps section before anything is ticked', () => {
    const page = render([step(1, 'active'), step(2, 'pending')]);
    expect(page).not.toContain('data-fold="steps-done"');
  });

  it('puts the history in a collapsible section with the number of entries', () => {
    const history = fold(render([step(1, 'done'), step(2, 'active')]), 'history');
    expect(history).toContain('Historia (2)');
    expect(history).toContain('Bartek: zrobione „Krok 1”');
  });
});

describe('karta zlecenia: przycisk cofania', () => {
  it('shows undo as a proper button (not the default triangle) once something is done', () => {
    const page = render([step(1, 'done'), step(2, 'active')]);
    expect(page).toMatch(/<summary class="button undo-toggle">[\s\S]*Cofnij ostatnie odhaczenie \(pomyłka\)/);
    expect(page).toContain('Cofnij: Bartek');
  });

  it('has no undo button when nothing was ticked yet', () => {
    expect(render([step(1, 'active')])).not.toContain('Cofnij ostatnie odhaczenie');
  });
});
