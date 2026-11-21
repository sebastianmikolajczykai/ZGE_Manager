import Fastify, { type FastifyInstance } from 'fastify';
import type { AppDatabase } from './db.js';
import { warsawDate } from './clock.js';
import type { LocalDate } from './modules/urgency/day-counter.js';
import { UrgencyRules } from './modules/urgency/urgency-rules.js';
import { SettingsService } from './modules/settings/settings-service.js';
import { DaysOffRepository } from './modules/settings/days-off-repository.js';
import { MessageSettingsService } from './modules/settings/message-settings.js';
import { PageRenderer } from './web/http.js';
import { WorkTypeRepository } from './modules/work-types/work-type-repository.js';
import { DEFAULT_WORK_TYPES } from './modules/work-types/default-work-types.js';
import { WorkTypeAdmin } from './modules/work-types/work-type-admin.js';
import { OrderService } from './modules/orders/order-service.js';
import { BoardService } from './modules/board/board-service.js';
import { PeopleRepository } from './modules/people/people-repository.js';
import { OfferService } from './modules/offers/offer-service.js';
import { PaymentService } from './modules/payments/payment-service.js';
import { StatsService } from './modules/stats/stats-service.js';
import { registerRoutes } from './web/routes.js';

/** Osoby wpisywane przy pierwszym uruchomieniu (potem edycja w Ustawieniach). */
export const DEFAULT_PEOPLE: readonly string[] = ['Łukasz', 'Bartek', 'Marcelina'];

export interface AppDeps {
  db: AppDatabase;
  today?: () => LocalDate;
  defaultPeople?: readonly string[];
}

/** Składa aplikację: wgrywa domyślne dane (tylko raz) i rejestruje ekrany. Baza musi być po migracji. */
export function buildApp({
  db,
  today = () => warsawDate(),
  defaultPeople = DEFAULT_PEOPLE,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  const workTypes = new WorkTypeRepository(db);
  const people = new PeopleRepository(db);
  workTypes.seedDefaults(DEFAULT_WORK_TYPES);
  people.seedIfEmpty(defaultPeople);
  const orders = new OrderService(db, today);
  const settings = new SettingsService(db, today);
  const daysOff = new DaysOffRepository(db);
  const workTypeAdmin = new WorkTypeAdmin(workTypes, db, today);
  // Funkcje zamiast wartości: zmiana w Ustawieniach działa od razu, bez restartu.
  const rules = new UrgencyRules(() => settings.urgency());
  const board = new BoardService(db, orders, rules, today);
  const offers = new OfferService(db, today, rules, () => settings.get().offerFollowUpDays, orders);
  const payments = new PaymentService(db, orders, rules, today);
  const isRed = (row: { urgency: { colour: string } }) => row.urgency.colour === 'red';
  const pages = new PageRenderer(
    () => settings.get().refreshSeconds,
    () => ({
      offersToCall: offers.rows().filter(isRed).length,
      unpaidToRemind: payments.rows().filter(isRed).length,
    }),
    () => settings.get().confirmActions,
  );

  app.get('/health', async (_req, reply) => {
    try {
      db.ping();
      return { status: 'ok', db: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'error', db: 'down' });
    }
  });

  registerRoutes(app, {
    orders,
    board,
    people,
    workTypes,
    offers,
    payments,
    stats: new StatsService(db, today),
    today,
    settings,
    messages: new MessageSettingsService(db, today),
    daysOff,
    workTypeAdmin,
    pages,
  });
  return app;
}
