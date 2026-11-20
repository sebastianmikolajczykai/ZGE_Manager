import type { AppDatabase } from '../db.js';
import { DayCounter, type LocalDate } from '../modules/urgency/day-counter.js';
import { OrderService } from '../modules/orders/order-service.js';
import { PeopleRepository } from '../modules/people/people-repository.js';
import { WorkTypeRepository } from '../modules/work-types/work-type-repository.js';
import { OfferService } from '../modules/offers/offer-service.js';
import { UrgencyRules, DEFAULT_URGENCY_SETTINGS } from '../modules/urgency/urgency-rules.js';

/**
 * Przykładowe (zmyślone) zlecenie do demo. Daty liczone w dniach roboczych wstecz od „dziś”.
 * - createdAgo: kiedy przyjęto zlecenie,
 * - doneAgo: kiedy odhaczono kolejne kroki (od pierwszego),
 * - checkedAgo: kiedy kliknięto „Sprawdzone dziś” na aktywnym kroku „codziennie”,
 * - measurementAgo: data pomiaru w terenie (0 = dziś).
 */
interface DemoOrder {
  client: string;
  town: string;
  plot: string;
  price: number;
  createdAgo: number;
  doneAgo: number[];
  checkedAgo?: number;
  measurementAgo: number;
}

const DEMO_ORDERS: readonly DemoOrder[] = [
  {
    client: 'Jan Kowalski (przykład)',
    town: 'Brzesko',
    plot: '123/4',
    price: 2500,
    createdAgo: 0,
    doneAgo: [],
    measurementAgo: -8,
  },
  {
    client: 'Anna Nowak (przykład)',
    town: 'Bochnia',
    plot: '56/2',
    price: 3000,
    createdAgo: 1,
    doneAgo: [],
    measurementAgo: -6,
  },
  {
    client: 'Maria Wiśniewska (przykład)',
    town: 'Jurków',
    plot: '781',
    price: 2800,
    createdAgo: 6,
    doneAgo: [5, 4],
    measurementAgo: -3,
  },
  {
    client: 'Piotr Wójcik (przykład)',
    town: 'Szczurowa',
    plot: '12/7',
    price: 3500,
    createdAgo: 12,
    doneAgo: [],
    measurementAgo: -2,
  },
  {
    client: 'Katarzyna Lewandowska (przykład)',
    town: 'Dębno',
    plot: '402/1',
    price: 2600,
    createdAgo: 8,
    doneAgo: [7, 6, 5, 4],
    checkedAgo: 0,
    measurementAgo: -5,
  },
  {
    client: 'Tomasz Zieliński (przykład)',
    town: 'Czchów',
    plot: '90',
    price: 4000,
    createdAgo: 10,
    doneAgo: [9, 8, 7, 6, 5, 4],
    measurementAgo: 0,
  },
  {
    client: 'Agnieszka Kamińska (przykład)',
    town: 'Gnojnik',
    plot: '215/3',
    price: 3200,
    createdAgo: 16,
    doneAgo: [15, 14, 13, 12, 11, 10, 8, 7, 6, 5],
    measurementAgo: 8,
  },
  // Oddane klientowi, czekają na zapłatę (zakładka Niezapłacone): 16 i 3 dni robocze temu.
  {
    client: 'Ryszard Kowalczyk (przykład)',
    town: 'Wojnicz',
    plot: '311/2',
    price: 3300,
    createdAgo: 45,
    doneAgo: [44, 43, 42, 40, 38, 36, 35, 32, 28, 22, 18, 16],
    measurementAgo: 35,
  },
  {
    client: 'Ewa Grabowska (przykład)',
    town: 'Radłów',
    plot: '57/9',
    price: 2900,
    createdAgo: 30,
    doneAgo: [29, 28, 27, 25, 23, 21, 20, 17, 13, 8, 5, 3],
    measurementAgo: 20,
  },
];

const DEMO_PHONE = '500 000 000';
const DEMO_OFFICE = 'Urząd Miejski (przykład)';

/** Przykładowa oferta: wysłana `sentAgo` dni roboczych temu, opcjonalnie telefon `calledAgo` dni temu. */
interface DemoOffer {
  client: string;
  town: string;
  price: number;
  sentAgo: number;
  call?: { ago: number; note: string };
}

const DEMO_OFFERS: readonly DemoOffer[] = [
  { client: 'Zofia Mazur (przykład)', town: 'Brzesko', price: 2400, sentAgo: 9 },
  { client: 'Adam Krawczyk (przykład)', town: 'Iwkowa', price: 3100, sentAgo: 6 },
  {
    client: 'Barbara Duda (przykład)',
    town: 'Borzęcin',
    price: 2700,
    sentAgo: 10,
    call: { ago: 3, note: 'myśli, oddzwoni' },
  },
  { client: 'Michał Pawlak (przykład)', town: 'Zakliczyn', price: 3600, sentAgo: 1 },
];

/**
 * Wypełnia PUSTĄ bazę zmyślonymi zleceniami do pokazu (demo na Renderze).
 * Gdy w bazie jest choć jedno zlecenie, nic nie robi – nie dotknie prawdziwych danych.
 * Wymaga bazy po migracji, z wgranymi rodzajami prac i osobami (robi to buildApp).
 */
export function seedDemo(db: AppDatabase, today: LocalDate): void {
  if (hasAnyOrder(db)) return;
  const workType = new WorkTypeRepository(db).findAll()[0];
  const people = new PeopleRepository(db).list().map((p) => p.name);
  if (!workType || people.length === 0) throw new Error('Demo wymaga rodzaju pracy i osób w bazie');

  const calendar = new WorkingDayCalendar(today);
  let clock = today;
  const orders = new OrderService(db, () => clock);
  const person = (i: number): string => people[i % people.length] ?? '';

  DEMO_ORDERS.forEach((demo, n) => {
    clock = calendar.ago(demo.createdAgo);
    const id = orders.create(
      {
        clientName: demo.client,
        phone: DEMO_PHONE,
        town: demo.town,
        workTypeId: workType.id,
        plot: demo.plot,
        office: DEMO_OFFICE,
        pricePln: demo.price,
        note: null,
        measurementOn: calendar.ago(demo.measurementAgo),
      },
      person(n),
    );
    demo.doneAgo.forEach((ago, i) => {
      clock = calendar.ago(ago);
      orders.completeStep(id, i + 1, person(n + i + 1));
    });
    if (demo.checkedAgo !== undefined) {
      clock = calendar.ago(demo.checkedAgo);
      orders.checkToday(id, demo.doneAgo.length + 1, person(n + 2));
    }
  });

  const offers = new OfferService(db, () => clock, new UrgencyRules(DEFAULT_URGENCY_SETTINGS));
  DEMO_OFFERS.forEach((demo, n) => {
    clock = today;
    const id = offers.create(
      {
        clientName: demo.client,
        phone: DEMO_PHONE,
        workTypeId: workType.id,
        sentOn: calendar.ago(demo.sentAgo),
        town: demo.town,
        plot: null,
        pricePln: demo.price,
        note: null,
      },
      person(n + 1),
    );
    if (demo.call) {
      clock = calendar.ago(demo.call.ago);
      offers.recordCall(id, person(n), demo.call.note, 'again');
    }
  });
}

function hasAnyOrder(db: AppDatabase): boolean {
  return db.connection.prepare('SELECT 1 FROM orders LIMIT 1').get() !== undefined;
}

/** Przesuwa datę o dni robocze (wstecz dla dodatnich, w przód dla ujemnych). */
class WorkingDayCalendar {
  private readonly counter = new DayCounter('working');

  constructor(private readonly today: LocalDate) {}

  ago(workingDays: number): LocalDate {
    const step = workingDays >= 0 ? -1 : 1;
    let date = this.today;
    for (let left = Math.abs(workingDays); left > 0;) {
      date = shiftCalendarDay(date, step);
      if (this.counter.isWorkingDay(date)) left--;
    }
    return date;
  }
}

function shiftCalendarDay(date: LocalDate, days: number): LocalDate {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
