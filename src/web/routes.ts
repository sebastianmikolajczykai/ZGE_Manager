import type { MessageSettingsService } from '../modules/settings/message-settings.js';
import { paymentMessageBox } from './message-views.js';
import { paymentText } from './unpaid-routes.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { BoardService } from '../modules/board/board-service.js';
import type { OrderService, PeopleAssignment } from '../modules/orders/order-service.js';
import type { OrderInput } from '../modules/orders/order-input.js';
import type { PeopleRepository } from '../modules/people/people-repository.js';
import type { WorkTypeRepository } from '../modules/work-types/work-type-repository.js';
import type { LocalDate } from '../modules/urgency/day-counter.js';
import type { OfferService } from '../modules/offers/offer-service.js';
import { boardPage, orderDetail, orderForm, parseBoardFilter, type OrderFormValues } from './views.js';
import { settingsFormValues, settingsPage, type SavedNote } from './settings-views.js';
import { registerOfferRoutes } from './offer-routes.js';
import { registerUnpaidRoutes } from './unpaid-routes.js';
import { monitorPage } from './monitor-views.js';
import type { PaymentService } from '../modules/payments/payment-service.js';
import type { StatsService } from '../modules/stats/stats-service.js';
import { statsPage } from './stats-views.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_NOT_FOUND,
  HTTP_SEE_OTHER,
  message,
  optionalField,
  priceField,
  type Form,
  type PageRenderer,
} from './http.js';
import {
  SettingsValidationError,
  type SettingErrors,
  type SettingsService,
} from '../modules/settings/settings-service.js';
import { nearLimitNotice } from '../modules/settings/settings-validation.js';
import type { DaysOffRepository } from '../modules/settings/days-off-repository.js';
import type { WorkTypeAdmin } from '../modules/work-types/work-type-admin.js';
import { registerWorkTypeRoutes } from './work-type-routes.js';
import { registerCalendarRoutes, type CalendarAccount } from './calendar-routes.js';
import type { CalendarSyncService } from '../modules/calendar-sync/calendar-sync-service.js';

export interface WebServices {
  orders: OrderService;
  board: BoardService;
  people: PeopleRepository;
  workTypes: WorkTypeRepository;
  offers: OfferService;
  payments: PaymentService;
  stats: StatsService;
  today: () => LocalDate;
  settings: SettingsService;
  messages: MessageSettingsService;
  daysOff: DaysOffRepository;
  workTypeAdmin: WorkTypeAdmin;
  pages: PageRenderer;
  calendarSync: CalendarSyncService;
  calendarAccount: CalendarAccount | null;
}

/** Ekrany aplikacji: tablica z kartą zlecenia, formularz nowego zlecenia, ustawienia. */
export function registerRoutes(app: FastifyInstance, s: WebServices): void {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
  app.addHook('preHandler', rejectForeignOrigin);

  app.get('/', (req, reply) => {
    const query = req.query as Form;
    const id = Number(query.zlecenie);
    return renderBoard(reply, s, Number.isInteger(id) && id > 0 ? id : null, null, 200, query);
  });

  app.get('/zlecenia/nowe', (req, reply) => {
    const offerId = Number((req.query as Form).oferta);
    const offer = Number.isInteger(offerId) && offerId > 0 ? s.offers.get(offerId) : null;
    return s.pages.send(
      reply,
      'Nowe zlecenie',
      orderForm(s.workTypes.findActive(), s.people.list(), offer ? valuesFromOffer(offer) : {}, null),
    );
  });

  app.post('/zlecenia', (req, reply) => {
    const form = req.body as Form;
    try {
      const offerId = optionalField(form, 'offerId');
      if (offerId !== null) s.offers.requireOpen(Number(offerId)); // przed zapisem: nie twórz zlecenia z zamkniętej oferty
      const id = s.orders.create(toOrderInput(form), form.person ?? '');
      if (offerId !== null) s.offers.markAccepted(Number(offerId), form.person ?? '', id);
      return reply.redirect(`/?zlecenie=${id}`, HTTP_SEE_OTHER);
    } catch (err) {
      return s.pages.send(
        reply,
        'Nowe zlecenie',
        orderForm(s.workTypes.findActive(), s.people.list(), form as OrderFormValues, message(err)),
        HTTP_BAD_REQUEST,
      );
    }
  });

  const orderAction = (
    path: string,
    act: (orderId: number, position: number, person: string, form: Form) => void,
  ) =>
    app.post(path, (req, reply) => {
      const params = req.params as Form;
      const orderId = Number(params.id);
      try {
        const form = req.body as Form;
        act(orderId, Number(params.position), form.person ?? '', form);
        return reply.redirect(`/?zlecenie=${orderId}`, HTTP_SEE_OTHER);
      } catch (err) {
        return renderBoard(reply, s, orderId, message(err), HTTP_BAD_REQUEST);
      }
    });
  orderAction('/zlecenia/:id/kroki/:position/zrobione', (o, p, who) => s.orders.completeStep(o, p, who));
  orderAction('/zlecenia/:id/kroki/:position/sprawdzone', (o, p, who) => s.orders.checkToday(o, p, who));
  orderAction('/zlecenia/:id/kroki/:position/limit', (o, p, who, f) =>
    s.orders.changeStepLimit(o, p, f.limitDays ?? '', who),
  );
  orderAction('/zlecenia/:id/pomiar', (o, _p, who, f) =>
    s.orders.setMeasurementDate(o, f.measurementOn ?? '', who),
  );
  orderAction('/zlecenia/:id/numer', (o, _p, who, f) => s.orders.setOrderNumber(o, f.orderNumber ?? '', who));
  orderAction('/zlecenia/:id/cofnij', (o, _p, who) => s.orders.undoLastStep(o, who));
  orderAction('/zlecenia/:id/osoby', (o, _p, who, f) => s.orders.assignPeople(o, toAssignment(f), who));
  registerHistoryUndo(app, s);

  app.get('/statystyki', (_req, reply) =>
    s.pages.send(reply, 'Statystyki', statsPage(s.stats.summary(), s.stats.clients())),
  );

  app.get('/ustawienia', (req, reply) =>
    renderSettings(reply, s, null, { saved: savedNoteFrom(req.query as Form) }),
  );
  app.post('/ustawienia/osoby', (req, reply) => {
    try {
      s.people.add((req.body as Form).name ?? '');
      return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
    } catch (err) {
      return renderSettings(reply, s, message(err));
    }
  });
  app.post('/ustawienia/osoby/:id/usun', (req, reply) => {
    s.people.remove(Number((req.params as Form).id));
    return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
  });

  app.post('/ustawienia/progi', (req, reply) => {
    const form = req.body as Form;
    try {
      const count = s.settings.update(form, form.person ?? '');
      return reply.redirect(savedUrl(count, form.person ?? ''), HTTP_SEE_OTHER);
    } catch (err) {
      if (!(err instanceof SettingsValidationError))
        return renderSettings(reply, s, message(err), { typed: form });
      const count = Object.keys(err.fieldErrors).length;
      const summary = `Nie zapisano. Popraw zaznaczone pola (${count}).`;
      return renderSettings(reply, s, summary, { typed: form, fieldErrors: err.fieldErrors });
    }
  });
  app.post('/ustawienia/progi/domyslne', (req, reply) => {
    try {
      const person = (req.body as Form).person ?? '';
      const count = s.settings.resetToDefaults(person);
      return reply.redirect(savedUrl(count, person), HTTP_SEE_OTHER);
    } catch (err) {
      return renderSettings(reply, s, message(err));
    }
  });

  app.post('/ustawienia/dni-wolne', (req, reply) => {
    const form = req.body as Form;
    try {
      const input = { fromOn: form.fromOn ?? '', toOn: form.toOn ?? '', note: form.note ?? null };
      s.daysOff.add(input, form.person ?? '');
      return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
    } catch (err) {
      return renderSettings(reply, s, message(err));
    }
  });
  app.post('/ustawienia/wiadomosc', (req, reply) => {
    const form = req.body as Form;
    try {
      s.messages.update(form, form.person ?? '');
      return reply.redirect('/ustawienia#wiadomosc', HTTP_SEE_OTHER);
    } catch (err) {
      return renderSettings(reply, s, message(err), { typedMessage: form });
    }
  });
  app.post('/ustawienia/dni-wolne/:id/usun', (req, reply) => {
    s.daysOff.remove(Number((req.params as Form).id));
    return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
  });

  registerWorkTypeRoutes(app, s, (reply, error) => renderSettings(reply, s, error));
  registerCalendarRoutes(app, s, (reply, error) => renderSettings(reply, s, error));
  registerOfferRoutes(app, s);
  registerUnpaidRoutes(app, s);

  // Widok na monitor (styl D): osobna strona bez menu, duże kafle, samoodświeżanie.
  app.get('/monitor', (_req, reply) =>
    reply
      .type('text/html; charset=utf-8')
      .send(monitorPage(s.board.rows(), s.pages.counts(), s.pages.refreshSeconds())),
  );
}

/** Ekran Ustawień; przy błędzie pokazuje wpisane wartości, żeby nie trzeba było ich wpisywać od nowa. */
/** Co dodatkowo pokazać na ekranie Ustawień. */
interface SettingsExtras {
  /** To, co ktoś wpisał (przy błędzie zostaje w polach). */
  typed?: Form;
  fieldErrors?: SettingErrors;
  saved?: SavedNote | null;
  /** To, co ktoś wpisał w sekcji „Wiadomość do klienta (SMS)” (przy błędzie). */
  typedMessage?: Form;
}

function renderSettings(
  reply: FastifyReply,
  s: WebServices,
  error: string | null,
  extras: SettingsExtras = {},
) {
  const values = extras.typed ?? settingsFormValues(s.settings.get());
  const workTypes = s.workTypes.findAll();
  const view = {
    values,
    fieldErrors: extras.fieldErrors ?? {},
    fieldNotices: limitNotices(values, workTypes),
    saved: extras.saved ?? null,
    history: s.settings.history(),
    daysOff: s.daysOff.list(s.today()),
    workTypes,
    workTypeHistory: s.workTypeAdmin.history(),
    message: { values: extras.typedMessage ?? { ...s.messages.get() }, history: s.messages.history() },
    calendar: s.calendarSync.status(),
  };
  return s.pages.send(
    reply,
    'Ustawienia',
    settingsPage(s.people.list(), view, error),
    error ? HTTP_BAD_REQUEST : 200,
  );
}

/** Po zapisie wracamy na Ustawienia z potwierdzeniem „Zapisano N zmian (osoba)”. */
function savedUrl(count: number, person: string): string {
  return `/ustawienia?zapisano=${count}&kto=${encodeURIComponent(person.trim())}#kolory`;
}

function savedNoteFrom(query: Form): SavedNote | null {
  const count = query.zapisano ?? '';
  const person = (query.kto ?? '').trim();
  if (!/^\d+$/.test(count) || !person) return null;
  return { count: Number(count), person };
}

/** Uwaga przy „Żółte przed limitem”, liczona od wartości widocznej w polu i kroków aktywnych rodzajów prac. */
function limitNotices(values: Form, workTypes: ReturnType<WorkTypeRepository['findAll']>): SettingErrors {
  const typed = (values.warnDaysBeforeLimit ?? '').trim();
  if (!/^\d+$/.test(typed)) return {};
  const steps = workTypes.filter((w) => !w.hidden).flatMap((w) => w.steps);
  const notice = nearLimitNotice(Number(typed), steps);
  return notice ? { warnDaysBeforeLimit: notice } : {};
}

/** Formularz zlecenia wypełniony danymi z przyjętej oferty. */
function valuesFromOffer(o: NonNullable<ReturnType<OfferService['get']>>): OrderFormValues {
  const values: OrderFormValues = {
    offerId: String(o.id),
    clientName: o.clientName,
    phone: o.phone,
    workTypeId: String(o.workTypeId),
  };
  if (o.town) values.town = o.town;
  if (o.plot) values.plot = o.plot;
  if (o.pricePln !== null) values.pricePln = String(o.pricePln).replace('.', ',');
  if (o.note) values.note = o.note;
  return values;
}

/**
 * Cofnięcie wpisu z historii zlecenia („cofnij” = najnowszy wpis, „cofnij-do” = ten wpis i wszystkie nowsze).
 * Z karty w Niezapłaconych (pole „widok”) wracamy tam, jeśli zlecenie nadal czeka na zapłatę; w innym razie na kartę zlecenia.
 */
function registerHistoryUndo(app: FastifyInstance, s: WebServices): void {
  const undoRoute = (url: string, undo: (orderId: number, entryId: number, person: string) => void) =>
    app.post(url, (req, reply) => {
      const params = req.params as Form;
      const form = req.body as Form;
      const orderId = Number(params.id);
      try {
        undo(orderId, Number(params.entry), form.person ?? '');
        const stillUnpaid = s.payments.rows().some((r) => r.orderId === orderId);
        const back =
          form.widok === 'niezaplacone' && stillUnpaid
            ? `/niezaplacone?zlecenie=${orderId}`
            : `/?zlecenie=${orderId}`;
        return reply.redirect(back, HTTP_SEE_OTHER);
      } catch (err) {
        return renderBoard(reply, s, s.orders.get(orderId) ? orderId : null, message(err), HTTP_BAD_REQUEST);
      }
    });
  undoRoute('/zlecenia/:id/historia/:entry/cofnij', (o, e, who) => s.orders.undoEntry(o, e, who));
  undoRoute('/zlecenia/:id/historia/:entry/cofnij-do', (o, e, who) => {
    s.orders.undoBackTo(o, e, who);
  });
}

function renderBoard(
  reply: FastifyReply,
  s: WebServices,
  orderId: number | null,
  error: string | null,
  status = 200,
  query: Form = {},
) {
  const options = {
    counts: s.pages.counts(),
    filter: parseBoardFilter(query.kolor),
    person: optionalField(query, 'osoba'),
    people: s.people.list(),
  };
  let detail = null;
  if (orderId !== null) {
    const order = s.orders.get(orderId);
    if (!order)
      return s.pages.send(
        reply,
        'Nie znaleziono',
        boardPage(s.board.rows(), null, `Nie ma zlecenia o numerze ${orderId}`, null, options),
        HTTP_NOT_FOUND,
      );
    const active = order.steps.find((st) => st.status === 'active');
    const urgency = active ? s.board.urgencyOf(order, active, s.today()) : null;
    const workType = s.workTypes.findById(order.workTypeId)?.name ?? '?';
    detail = orderDetail(
      order,
      workType,
      urgency,
      s.orders.history(orderId),
      s.people.list(),
      s.orders.undoableEntryIds(orderId),
      active?.payment ? paymentMessageBox(paymentText(s, order), order.phone) : null,
    );
  }
  return s.pages.send(
    reply,
    'ZGE Menedżer',
    boardPage(s.board.rows(), detail, error, orderId, options),
    status,
  );
}

/** Ochrona przed formularzem wysłanym z obcej strony (CSRF): POST tylko z tej samej aplikacji. */
async function rejectForeignOrigin(req: FastifyRequest, reply: FastifyReply) {
  if (req.method !== 'POST') return;
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    await reply.code(HTTP_FORBIDDEN).send('Odrzucono: formularz z innej strony');
  }
}

function toOrderInput(f: Form): OrderInput {
  const opt = (k: string) => optionalField(f, k);
  return {
    clientName: f.clientName ?? '',
    phone: f.phone ?? '',
    town: f.town ?? '',
    workTypeId: Number(f.workTypeId),
    plot: opt('plot'),
    office: opt('office'),
    pricePln: priceField(f),
    note: opt('note'),
    measurementOn: opt('measurementOn'),
    leadPerson: opt('leadPerson'),
    orderNumber: opt('orderNumber'),
  };
}

/** Pola „Osoby w zleceniu”: leadPerson oraz step_<numer kroku>. */
function toAssignment(f: Form): PeopleAssignment {
  const steps: Record<number, string> = {};
  for (const [key, value] of Object.entries(f)) {
    const match = /^step_(\d+)$/.exec(key);
    if (match) steps[Number(match[1])] = value;
  }
  return { leadPerson: f.leadPerson ?? '', steps };
}
