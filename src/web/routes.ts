import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { BoardService } from '../modules/board/board-service.js';
import type { OrderService } from '../modules/orders/order-service.js';
import type { OrderInput } from '../modules/orders/order-input.js';
import type { PeopleRepository } from '../modules/people/people-repository.js';
import type { WorkTypeRepository } from '../modules/work-types/work-type-repository.js';
import type { LocalDate } from '../modules/urgency/day-counter.js';
import type { OfferService } from '../modules/offers/offer-service.js';
import { boardPage, orderDetail, orderForm, parseColourFilter, type OrderFormValues } from './views.js';
import { settingsFormValues, settingsPage } from './settings-views.js';
import { registerOfferRoutes } from './offer-routes.js';
import { registerUnpaidRoutes } from './unpaid-routes.js';
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
import type { SettingsService } from '../modules/settings/settings-service.js';
import type { DaysOffRepository } from '../modules/settings/days-off-repository.js';
import type { WorkTypeAdmin } from '../modules/work-types/work-type-admin.js';
import { registerWorkTypeRoutes } from './work-type-routes.js';

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
  daysOff: DaysOffRepository;
  workTypeAdmin: WorkTypeAdmin;
  pages: PageRenderer;
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
    return renderBoard(reply, s, Number.isInteger(id) && id > 0 ? id : null, null, 200, query.kolor);
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
  orderAction('/zlecenia/:id/cofnij', (o, _p, who) => s.orders.undoLastStep(o, who));
  registerHistoryUndo(app, s);

  app.get('/statystyki', (_req, reply) =>
    s.pages.send(reply, 'Statystyki', statsPage(s.stats.summary(), s.stats.clients())),
  );

  app.get('/ustawienia', (_req, reply) => renderSettings(reply, s, null));
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
      s.settings.update(form, form.person ?? '');
      return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
    } catch (err) {
      return renderSettings(reply, s, message(err), form);
    }
  });
  app.post('/ustawienia/progi/domyslne', (req, reply) => {
    try {
      s.settings.resetToDefaults((req.body as Form).person ?? '');
      return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
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
  app.post('/ustawienia/dni-wolne/:id/usun', (req, reply) => {
    s.daysOff.remove(Number((req.params as Form).id));
    return reply.redirect('/ustawienia', HTTP_SEE_OTHER);
  });

  registerWorkTypeRoutes(app, s, (reply, error) => renderSettings(reply, s, error));
  registerOfferRoutes(app, s);
  registerUnpaidRoutes(app, s);
}

/** Ekran Ustawień; przy błędzie pokazuje wpisane wartości, żeby nie trzeba było ich wpisywać od nowa. */
function renderSettings(
  reply: FastifyReply,
  s: WebServices,
  error: string | null,
  typed: Form | null = null,
) {
  const view = {
    values: typed ?? settingsFormValues(s.settings.get()),
    history: s.settings.history(),
    daysOff: s.daysOff.list(s.today()),
    workTypes: s.workTypes.findAll(),
    workTypeHistory: s.workTypeAdmin.history(),
  };
  return s.pages.send(
    reply,
    'Ustawienia',
    settingsPage(s.people.list(), view, error),
    error ? HTTP_BAD_REQUEST : 200,
  );
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
 * Cofnięcie wpisu z historii zlecenia. Z karty w Niezapłaconych (pole „widok”) wracamy tam,
 * jeśli zlecenie nadal czeka na zapłatę; w innym razie na kartę zlecenia.
 */
function registerHistoryUndo(app: FastifyInstance, s: WebServices): void {
  app.post('/zlecenia/:id/historia/:entry/cofnij', (req, reply) => {
    const params = req.params as Form;
    const form = req.body as Form;
    const orderId = Number(params.id);
    try {
      s.orders.undoEntry(orderId, Number(params.entry), form.person ?? '');
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
}

function renderBoard(
  reply: FastifyReply,
  s: WebServices,
  orderId: number | null,
  error: string | null,
  status = 200,
  colour?: string,
) {
  const options = { counts: s.pages.counts(), filter: parseColourFilter(colour) };
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
      s.orders.undoableEntryId(orderId),
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
  };
}
