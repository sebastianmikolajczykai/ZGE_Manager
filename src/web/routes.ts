import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { BoardService } from '../modules/board/board-service.js';
import type { OrderService } from '../modules/orders/order-service.js';
import type { OrderInput } from '../modules/orders/order-input.js';
import type { PeopleRepository } from '../modules/people/people-repository.js';
import type { WorkTypeRepository } from '../modules/work-types/work-type-repository.js';
import type { LocalDate } from '../modules/urgency/day-counter.js';
import type { OfferService } from '../modules/offers/offer-service.js';
import { boardPage, orderDetail, orderForm, type OrderFormValues } from './views.js';
import { settingsFormValues, settingsPage } from './settings-views.js';
import { registerOfferRoutes } from './offer-routes.js';
import { registerUnpaidRoutes } from './unpaid-routes.js';
import type { PaymentService } from '../modules/payments/payment-service.js';
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

export interface WebServices {
  orders: OrderService;
  board: BoardService;
  people: PeopleRepository;
  workTypes: WorkTypeRepository;
  offers: OfferService;
  payments: PaymentService;
  today: () => LocalDate;
  settings: SettingsService;
  pages: PageRenderer;
}

/** Ekrany aplikacji: tablica z kartą zlecenia, formularz nowego zlecenia, ustawienia. */
export function registerRoutes(app: FastifyInstance, s: WebServices): void {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
  app.addHook('preHandler', rejectForeignOrigin);

  app.get('/', (req, reply) => {
    const id = Number((req.query as Form).zlecenie);
    return renderBoard(reply, s, Number.isInteger(id) && id > 0 ? id : null, null);
  });

  app.get('/zlecenia/nowe', (req, reply) => {
    const offerId = Number((req.query as Form).oferta);
    const offer = Number.isInteger(offerId) && offerId > 0 ? s.offers.get(offerId) : null;
    return s.pages.send(
      reply,
      'Nowe zlecenie',
      orderForm(s.workTypes.findAll(), s.people.list(), offer ? valuesFromOffer(offer) : {}, null),
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
        orderForm(s.workTypes.findAll(), s.people.list(), form as OrderFormValues, message(err)),
        HTTP_BAD_REQUEST,
      );
    }
  });

  const orderAction = (path: string, act: (orderId: number, position: number, person: string) => void) =>
    app.post(path, (req, reply) => {
      const params = req.params as Form;
      const orderId = Number(params.id);
      try {
        act(orderId, Number(params.position), (req.body as Form).person ?? '');
        return reply.redirect(`/?zlecenie=${orderId}`, HTTP_SEE_OTHER);
      } catch (err) {
        return renderBoard(reply, s, orderId, message(err), HTTP_BAD_REQUEST);
      }
    });
  orderAction('/zlecenia/:id/kroki/:position/zrobione', (o, p, who) => s.orders.completeStep(o, p, who));
  orderAction('/zlecenia/:id/kroki/:position/sprawdzone', (o, p, who) => s.orders.checkToday(o, p, who));
  orderAction('/zlecenia/:id/cofnij', (o, _p, who) => s.orders.undoLastStep(o, who));

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
  const view = { values: typed ?? settingsFormValues(s.settings.get()), history: s.settings.history() };
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

function renderBoard(
  reply: FastifyReply,
  s: WebServices,
  orderId: number | null,
  error: string | null,
  status = 200,
) {
  let detail = null;
  if (orderId !== null) {
    const order = s.orders.get(orderId);
    if (!order)
      return s.pages.send(
        reply,
        'Nie znaleziono',
        boardPage(s.board.rows(), null, `Nie ma zlecenia o numerze ${orderId}`),
        HTTP_NOT_FOUND,
      );
    const active = order.steps.find((st) => st.status === 'active');
    const urgency = active ? s.board.urgencyOf(order, active, s.today()) : null;
    const workType = s.workTypes.findById(order.workTypeId)?.name ?? '?';
    detail = orderDetail(order, workType, urgency, s.orders.history(orderId), s.people.list());
  }
  return s.pages.send(reply, 'ZGE Menedżer', boardPage(s.board.rows(), detail, error, orderId), status);
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
