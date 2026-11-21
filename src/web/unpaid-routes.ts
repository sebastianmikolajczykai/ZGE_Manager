import type { FastifyInstance, FastifyReply } from 'fastify';
import type { PaymentService } from '../modules/payments/payment-service.js';
import type { OrderService } from '../modules/orders/order-service.js';
import type { PeopleRepository } from '../modules/people/people-repository.js';
import type { LocalDate } from '../modules/urgency/day-counter.js';
import { unpaidDetail, unpaidPage } from './unpaid-views.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  HTTP_SEE_OTHER,
  message,
  type PageRenderer,
  type Form,
} from './http.js';

export interface UnpaidWebServices {
  payments: PaymentService;
  orders: OrderService;
  people: PeopleRepository;
  today: () => LocalDate;
  pages: PageRenderer;
}

const TITLE = 'Niezapłacone';

/** Zakładka Niezapłacone: lista, rozmowa z przypomnieniem, „Zapłacone”. */
export function registerUnpaidRoutes(app: FastifyInstance, s: UnpaidWebServices): void {
  app.get('/niezaplacone', (req, reply) => {
    const id = Number((req.query as Form).zlecenie);
    return renderUnpaid(reply, s, Number.isInteger(id) && id > 0 ? id : null, null);
  });

  const action = (
    path: string,
    act: (orderId: number, person: string, form: Form) => void,
    after: (id: number) => string,
  ) =>
    app.post(path, (req, reply) => {
      const orderId = Number((req.params as Form).id);
      const form = req.body as Form;
      try {
        act(orderId, form.person ?? '', form);
        return reply.redirect(after(orderId), HTTP_SEE_OTHER);
      } catch (err) {
        return renderUnpaid(reply, s, null, message(err), HTTP_BAD_REQUEST);
      }
    });
  action(
    '/niezaplacone/:id/rozmowa',
    (id, who, f) => s.payments.recordCall(id, who, f.note ?? null),
    (id) => `/niezaplacone?zlecenie=${id}`,
  );
  action(
    '/niezaplacone/:id/zaplacone',
    (id, who) => s.payments.markPaid(id, who),
    () => '/niezaplacone',
  );
}

function renderUnpaid(
  reply: FastifyReply,
  s: UnpaidWebServices,
  orderId: number | null,
  error: string | null,
  status = 200,
) {
  const rows = s.payments.rows();
  let detail = null;
  if (orderId !== null) {
    const row = rows.find((r) => r.orderId === orderId);
    if (!row) {
      const known = s.orders.get(orderId) !== null;
      const msg = known
        ? `Zlecenie nr ${orderId} nie czeka na zapłatę`
        : `Nie ma zlecenia o numerze ${orderId}`;
      return s.pages.send(reply, 'Nie znaleziono', unpaidPage(rows, null, msg), HTTP_NOT_FOUND);
    }
    detail = unpaidDetail(
      row,
      row.urgency,
      s.orders.history(orderId),
      s.people.list(),
      s.orders.undoableEntryIds(orderId),
    );
  }
  return s.pages.send(
    reply,
    TITLE,
    unpaidPage(rows, detail, error, orderId, s.payments.recentlyPaid()),
    status,
  );
}
