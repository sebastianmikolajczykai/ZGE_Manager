import type { FastifyInstance, FastifyReply } from 'fastify';
import type { OfferService, AfterCall } from '../modules/offers/offer-service.js';
import type { OfferInput } from '../modules/offers/offer-input.js';
import type { PeopleRepository } from '../modules/people/people-repository.js';
import type { WorkTypeRepository } from '../modules/work-types/work-type-repository.js';
import type { LocalDate } from '../modules/urgency/day-counter.js';
import { offerDetail, offerForm, offersPage } from './offer-views.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  HTTP_SEE_OTHER,
  message,
  optionalField,
  priceField,
  type Form,
  type PageRenderer,
} from './http.js';

export interface OfferWebServices {
  offers: OfferService;
  people: PeopleRepository;
  workTypes: WorkTypeRepository;
  today: () => LocalDate;
  pages: PageRenderer;
}

const TITLE = 'Oferty';

/** Zakładka Oferty: lista, formularz nowej oferty, telefon, odrzucenie. Przyjęcie idzie przez formularz zlecenia. */
export function registerOfferRoutes(app: FastifyInstance, s: OfferWebServices): void {
  app.get('/oferty', (req, reply) => {
    const id = Number((req.query as Form).oferta);
    return renderOffers(reply, s, Number.isInteger(id) && id > 0 ? id : null, null);
  });

  app.get('/oferty/nowa', (_req, reply) =>
    s.pages.send(
      reply,
      'Nowa oferta',
      offerForm(s.workTypes.findActive(), s.people.list(), { sentOn: s.today() }, null),
    ),
  );

  app.post('/oferty', (req, reply) => {
    const form = req.body as Form;
    try {
      const id = s.offers.create(toOfferInput(form), form.person ?? '');
      return reply.redirect(`/oferty?oferta=${id}`, HTTP_SEE_OTHER);
    } catch (err) {
      return s.pages.send(
        reply,
        'Nowa oferta',
        offerForm(s.workTypes.findActive(), s.people.list(), form, message(err)),
        HTTP_BAD_REQUEST,
      );
    }
  });

  const offerAction = (path: string, act: (offerId: number, person: string, form: Form) => void) =>
    app.post(path, (req, reply) => {
      const offerId = Number((req.params as Form).id);
      const form = req.body as Form;
      try {
        act(offerId, form.person ?? '', form);
        return reply.redirect(`/oferty?oferta=${offerId}`, HTTP_SEE_OTHER);
      } catch (err) {
        return renderOffers(reply, s, offerId, message(err), HTTP_BAD_REQUEST);
      }
    });
  offerAction('/oferty/:id/telefon', (id, who, f) =>
    s.offers.recordCall(id, who, f.note ?? null, f.next === 'end' ? 'end' : ('again' satisfies AfterCall)),
  );
  offerAction('/oferty/:id/odrzucona', (id, who, f) => s.offers.reject(id, who, f.reason ?? null));
  app.post('/oferty/:id/historia/:entry/cofnij', (req, reply) => {
    const params = req.params as Form;
    const offerId = Number(params.id);
    try {
      s.offers.undoEntry(offerId, Number(params.entry), (req.body as Form).person ?? '');
      return reply.redirect(`/oferty?oferta=${offerId}`, HTTP_SEE_OTHER);
    } catch (err) {
      const known = s.offers.get(offerId) !== null;
      return renderOffers(reply, s, known ? offerId : null, message(err), HTTP_BAD_REQUEST);
    }
  });
}

function renderOffers(
  reply: FastifyReply,
  s: OfferWebServices,
  offerId: number | null,
  error: string | null,
  status = 200,
) {
  let detail = null;
  if (offerId !== null) {
    const offer = s.offers.get(offerId);
    if (!offer) {
      return s.pages.send(
        reply,
        'Nie znaleziono',
        offersPage(s.offers.rows(), null, `Nie ma oferty o numerze ${offerId}`),
        HTTP_NOT_FOUND,
      );
    }
    const workType = s.workTypes.findById(offer.workTypeId)?.name ?? '?';
    const urgency = s.offers.urgencyOf(offer.lastContactOn, s.today());
    detail = offerDetail(
      offer,
      workType,
      urgency,
      s.offers.history(offerId),
      s.people.list(),
      s.offers.reminderDays(),
      s.offers.undoableEntryId(offerId),
      offer.status === 'open' ? s.offers.callDueOn(offerId) : null,
    );
  }
  return s.pages.send(
    reply,
    TITLE,
    offersPage(s.offers.rows(), detail, error, offerId, s.offers.recentlyClosed()),
    status,
  );
}

function toOfferInput(f: Form): OfferInput {
  return {
    clientName: f.clientName ?? '',
    phone: f.phone ?? '',
    workTypeId: Number(f.workTypeId),
    sentOn: f.sentOn ?? '',
    town: optionalField(f, 'town'),
    plot: optionalField(f, 'plot'),
    pricePln: priceField(f),
    note: optionalField(f, 'note'),
  };
}
