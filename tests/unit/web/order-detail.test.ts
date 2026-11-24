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
    assignee: null,
    parallel: false,
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
    leadPerson: null,
    steps,
  };
}

const HISTORY: HistoryEntry[] = [
  {
    id: 1,
    reverted: false,
    happenedOn: '2026-11-02',
    person: 'Bartek',
    action: 'created',
    stepPosition: null,
    stepName: null,
    note: null,
  },
  {
    id: 2,
    reverted: false,
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

  it('keeps the active step visible and the upcoming ones with their original numbers', () => {
    const page = render([step(1, 'done'), step(2, 'done'), step(3, 'active'), step(4, 'pending')]);
    expect(page).toMatch(/<li value="3" class="step active">/);
    expect(page).toMatch(/<li value="4" class="step pending">/);
  });

  it('puts the steps still to do in their own collapsible section, the active step stays outside', () => {
    const page = render([step(1, 'done'), step(2, 'active'), step(3, 'pending'), step(4, 'pending')]);
    const todo = fold(page, 'steps-todo');
    expect(todo).toContain('Do zrobienia (2)');
    expect(todo).toContain('Krok 3');
    expect(todo).toContain('Krok 4');
    expect(todo).not.toContain('Krok 2');
    expect(page.indexOf('data-fold="steps-todo"')).toBeGreaterThan(page.indexOf('<li value="2"'));
  });

  it('shows no to-do section on the last step', () => {
    expect(render([step(1, 'done'), step(2, 'active')])).not.toContain('data-fold="steps-todo"');
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

describe('karta zlecenia: termin pomiaru w Kalendarzu Google', () => {
  const withMeasurement = (status: Order['status'] = 'active'): string =>
    orderDetail(
      { ...order([step(1, 'active')]), measurementOn: '2026-11-30', plot: '123/4', status },
      'Podział',
      null,
      HISTORY,
      PEOPLE,
    ).value;

  it('offers "Dodaj do Kalendarza Google" next to the measurement date, opening in a new tab', () => {
    const page = withMeasurement();
    const link = page.match(/<a[^>]*href="(https:\/\/calendar\.google\.com[^"]*)"[^>]*>([\s\S]*?)<\/a/);
    expect(link?.[2]).toContain('Dodaj do Kalendarza Google');
    const url = new URL((link?.[1] ?? '').replaceAll('&amp;', '&'));
    expect(url.searchParams.get('text')).toBe('Pomiar: Klient (przykład), Brzesko');
    expect(url.searchParams.get('dates')).toBe('20261130/20261201');
    expect(url.searchParams.get('location')).toBe('Brzesko, dz. 123/4');
    expect(url.searchParams.get('details')).toContain('Telefon: 500 000 000');
    expect(page).toMatch(/href="https:\/\/calendar\.google\.com[^"]*"[^>]*target="_blank"/);
  });

  it('has no calendar button without a measurement date or for a finished order', () => {
    expect(render([step(1, 'active')])).not.toContain('calendar.google.com');
    expect(withMeasurement('completed')).not.toContain('calendar.google.com');
  });
});

describe('karta zlecenia: zmiana limitu w tym zleceniu', () => {
  it('offers changing the limit of the active step (e.g. the office announced a longer deadline)', () => {
    const page = render([step(1, 'done'), step(2, 'active')]);
    expect(page).toContain('Zmień limit tego kroku');
    expect(page).toContain('action="/zlecenia/7/kroki/2/limit"');
    expect(page).toMatch(/name="limitDays"[^>]*value="2"/);
    expect(page).toContain('Zmień limit: Bartek');
  });

  it('does not offer it for steps without a limit', () => {
    const daily = { ...step(1, 'active'), kind: 'daily' as const, limitDays: null };
    expect(render([daily])).not.toContain('Zmień limit tego kroku');
  });
});

describe('karta zlecenia: styl C', () => {
  it('marks the active step as "CO TERAZ" with its limit', () => {
    const page = render([step(1, 'done'), step(2, 'active'), step(3, 'pending')]);
    const active = page.slice(page.indexOf('<li value="2"'), page.indexOf('<li value="3"'));
    expect(active).toContain('CO TERAZ');
    expect(active).toContain('limit 2 dni rob.');
  });

  it('says how many days the active step is late', () => {
    const late = orderDetail(
      order([step(1, 'active')]),
      'Podział',
      { colour: 'red', daysOverdue: 4, blink: false },
      HISTORY,
      PEOPLE,
    ).value;
    expect(late).toContain('4 dni po terminie');
    expect(late).toContain('chip chip-red');
  });

  it('shows step progress of the whole order', () => {
    expect(render([step(1, 'done'), step(2, 'active'), step(3, 'pending')])).toContain('krok 2/3');
  });

  it('shows the person colour next to each history entry', () => {
    const history = fold(render([step(1, 'done'), step(2, 'active')]), 'history');
    expect(history).toMatch(/class="av"[^>]*>B</);
  });
});

describe('karta zlecenia: data pomiaru do uzupełnienia', () => {
  const measured = (measurementOn: string | null, status: Order['status'] = 'active') => {
    const pomiar = {
      ...step(2, 'pending'),
      kind: 'scheduled' as const,
      limitDays: null,
      name: 'Pomiar w terenie',
    };
    return orderDetail(
      { ...order([step(1, 'active'), pomiar]), measurementOn, status },
      'Podział',
      null,
      HISTORY,
      PEOPLE,
    ).value;
  };

  it('says the date is missing and offers a form to fill it in', () => {
    const page = measured(null);
    expect(page).toContain('Brak terminu: uzupełnij datę pomiaru');
    expect(page).toContain('action="/zlecenia/7/pomiar"');
    expect(page).toMatch(/<input[^>]*type="date"[^>]*name="measurementOn"/);
    expect(page).toContain('Zapisz datę: Bartek');
  });

  it('lets the date be changed later, prefilled with the current one', () => {
    const page = measured('2026-11-30');
    expect(page).not.toContain('Brak terminu');
    expect(page).toContain('Zmień datę pomiaru');
    expect(page).toMatch(/name="measurementOn"[^>]*value="2026-11-30"/);
  });

  it('has no date form for a finished order or work without a measurement step', () => {
    expect(measured('2026-11-30', 'completed')).not.toContain('/zlecenia/7/pomiar');
    expect(render([step(1, 'active')])).not.toContain('/zlecenia/7/pomiar');
  });

  it('describes setting the date in the history', () => {
    const entry: HistoryEntry = {
      id: 9,
      reverted: false,
      happenedOn: '2026-11-04',
      person: 'Bartek',
      action: 'measurement_set',
      stepPosition: null,
      stepName: null,
      note: 'brak → 25.11.2026',
    };
    const page = orderDetail(order([step(1, 'active')]), 'Podział', null, [entry], PEOPLE).value;
    expect(page).toContain('Bartek: data pomiaru (brak → 25.11.2026)');
  });
});

describe('karta zlecenia: osoba prowadząca i osoby kroków', () => {
  const PEOPLE2 = [
    { id: 1, name: 'Bartek' },
    { id: 2, name: 'Marcelina' },
  ];
  const withPeople = (lead: string | null, steps: OrderStep[]) =>
    orderDetail({ ...order(steps), leadPerson: lead }, 'Podział', null, HISTORY, PEOPLE2).value;
  const assignForm = (page: string) =>
    page.slice(
      page.indexOf('action="/zlecenia/7/osoby"'),
      page.indexOf('</form>', page.indexOf('action="/zlecenia/7/osoby"')),
    );

  it('shows who leads the order, or that nobody does yet', () => {
    expect(withPeople('Marcelina', [step(1, 'active')])).toMatch(/<dt>Prowadzi<\/dt>\s*<dd>[\s\S]*Marcelina/);
    expect(withPeople(null, [step(1, 'active')])).toMatch(/<dt>Prowadzi<\/dt>\s*<dd>[\s\S]*nikt/);
  });

  it('shows the person assigned to a step next to it', () => {
    const page = withPeople('Bartek', [step(1, 'active'), { ...step(2, 'pending'), assignee: 'Marcelina' }]);
    const second = page.slice(page.indexOf('<li value="2"'));
    expect(second).toMatch(/class="assignee"[\s\S]*Marcelina/);
  });

  it('one form sets the lead person and plans people for all steps not done yet', () => {
    const page = withPeople('Bartek', [
      step(1, 'done'),
      step(2, 'active'),
      { ...step(3, 'pending'), assignee: 'Marcelina' },
    ]);
    const form = assignForm(page);
    expect(page).toContain('Osoby w zleceniu');
    expect(form).toMatch(/<select name="leadPerson"[\s\S]*<option value="Bartek" selected>/);
    expect(form).not.toContain('name="step_1"');
    expect(form).toContain('name="step_2"');
    expect(form).toMatch(/name="step_3"[\s\S]*<option value="Marcelina" selected>/);
    expect(form).toContain('prowadzący');
    expect(form).toContain('Zapisz osoby: Marcelina');
  });

  it('keeps a person removed from Ustawienia visible in the form, so saving does not drop them', () => {
    const form = assignForm(withPeople('Zofia', [step(1, 'active')]));
    expect(form).toMatch(/<option value="Zofia" selected>/);
  });

  it('describes changes of people in the history', () => {
    const entries: HistoryEntry[] = [
      {
        id: 3,
        reverted: false,
        happenedOn: '2026-11-04',
        person: 'Bartek',
        action: 'lead_changed',
        stepPosition: null,
        stepName: null,
        note: 'brak → Marcelina',
      },
      {
        id: 4,
        reverted: false,
        happenedOn: '2026-11-04',
        person: 'Bartek',
        action: 'step_assigned',
        stepPosition: 2,
        stepName: 'Krok 2',
        note: 'brak → Bartek',
      },
    ];
    const page = orderDetail(order([step(1, 'active')]), 'Podział', null, entries, PEOPLE).value;
    expect(page).toContain('Bartek: osoba prowadząca (brak → Marcelina)');
    expect(page).toContain('Bartek: osoba do kroku „Krok 2” (brak → Bartek)');
  });
});

describe('karta zlecenia: kroki równoległe', () => {
  const parallel = (s: OrderStep): OrderStep => ({ ...s, parallel: true });
  const steps = [step(1, 'active'), parallel(step(2, 'active')), step(3, 'pending')];
  const colours = new Map([
    [1, { colour: 'red' as const, daysOverdue: 2, blink: false }],
    [2, { colour: 'green' as const, daysOverdue: 0, blink: false }],
  ]);
  const page = orderDetail(
    order(steps),
    'Podział',
    colours.get(1) ?? null,
    HISTORY,
    PEOPLE,
    [],
    null,
    colours,
  ).value;
  const item = (position: number) => {
    const start = page.indexOf(`<li value="${position}"`);
    return page.slice(start, page.indexOf('</li>', start));
  };

  it('shows two separate "Zrobione" buttons, one for each running step', () => {
    expect(item(1)).toContain('/zlecenia/7/kroki/1/zrobione');
    expect(item(2)).toContain('/zlecenia/7/kroki/2/zrobione');
  });

  it('each running step shows its own colour and lateness', () => {
    expect(item(1)).toContain('chip-red');
    expect(item(1)).toContain('2 dni po terminie');
    expect(item(2)).toContain('chip-green');
    expect(item(2)).not.toContain('po terminie');
  });

  it('marks the steps as running at the same time', () => {
    expect(item(1)).toContain('równolegle');
    expect(item(2)).toContain('równolegle');
  });

  it('a single running step looks as before (no extra colour chip, no "równolegle")', () => {
    const single = orderDetail(
      order([step(1, 'active'), step(2, 'pending')]),
      'Podział',
      null,
      HISTORY,
      PEOPLE,
    ).value;
    expect(single).not.toContain('równolegle');
  });
});
