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
import type { CalendarApi } from './modules/calendar-sync/calendar-api.js';
import { CalendarSyncService } from './modules/calendar-sync/calendar-sync-service.js';
import { CalendarSyncScheduler } from './modules/calendar-sync/calendar-sync-scheduler.js';
import type { ReminderSource } from './modules/calendar-sync/reminder-plan.js';
import type { CalendarAccount } from './web/calendar-routes.js';
import { calendarBanner } from './web/calendar-sync-views.js';

/** Osoby wpisywane przy pierwszym uruchomieniu (potem edycja w Ustawieniach). */
export const DEFAULT_PEOPLE: readonly string[] = ['Łukasz', 'Bartek', 'Marcelina'];

export interface AppDeps {
  db: AppDatabase;
  today?: () => LocalDate;
  defaultPeople?: readonly string[];
  /** Kalendarz Google: brak = brak kluczy w .env (synchronizacja niedostępna, reszta działa). */
  calendar?: { api: CalendarApi; account: CalendarAccount };
  /** Adres aplikacji w biurze (link w opisie wydarzenia w kalendarzu). */
  appUrl?: string;
  /** Synchronizacja w tle (po starcie, co 5 minut i po każdej zmianie). Włącza tylko server.ts, testy nie. */
  calendarAutoSync?: boolean;
}

/** Domyślny adres aplikacji na komputerze w biurze. */
export const DEFAULT_APP_URL = 'http://localhost:3000';

/** Składa aplikację: wgrywa domyślne dane (tylko raz) i rejestruje ekrany. Baza musi być po migracji. */
export function buildApp({
  db,
  today = () => warsawDate(),
  defaultPeople = DEFAULT_PEOPLE,
  calendar,
  appUrl = DEFAULT_APP_URL,
  calendarAutoSync = false,
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
  const calendarSync = new CalendarSyncService({
    db,
    api: calendar?.api ?? null,
    isConnected: () => calendar?.account.isConnected() ?? false,
    sources: () => reminderSources(offers, payments, () => settings.get().offerFollowUpDays),
    days: rules,
    today,
    appUrl,
  });
  const isRed = (row: { urgency: { colour: string } }) => row.urgency.colour === 'red';
  const pages = new PageRenderer(
    () => settings.get().refreshSeconds,
    () => ({
      offersToCall: offers.rows().filter(isRed).length,
      unpaidToRemind: payments.rows().filter(isRed).length,
    }),
    () => settings.get().confirmActions,
    () => calendarBanner(calendarSync.status()),
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
    calendarSync,
    calendarAccount: calendar?.account ?? null,
  });
  if (calendarAutoSync) startCalendarAutoSync(app, calendarSync);
  return app;
}

/** Otwarte oferty i niezapłacone zlecenia jako sprawy do przypomnienia (tylko numer i daty). */
function reminderSources(
  offers: OfferService,
  payments: PaymentService,
  offerFollowUpDays: () => number,
): ReminderSource[] {
  return [
    ...offers.rows().map((o) => ({
      kind: 'offer' as const,
      id: o.offerId,
      lastContactOn: o.lastContactOn,
      limitDays: offerFollowUpDays(),
    })),
    ...payments.rows().map((p) => ({
      kind: 'payment' as const,
      id: p.orderId,
      number: p.orderNumber,
      lastContactOn: p.lastContactOn,
      limitDays: p.limitDays,
    })),
  ];
}

/** Synchronizacja w tle: po starcie, co 5 minut i chwilę po każdym kliknięciu, które coś zapisuje. */
function startCalendarAutoSync(app: FastifyInstance, sync: CalendarSyncService): void {
  const scheduler = new CalendarSyncScheduler(sync);
  scheduler.start();
  app.addHook('onResponse', async (req) => {
    if (req.method === 'POST') scheduler.nudge();
  });
  app.addHook('onClose', async () => scheduler.stop());
}
