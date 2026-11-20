import type { AppDatabase } from '../../db.js';
import { DayCounter, type LocalDate } from '../urgency/day-counter.js';
import { UrgencyRules, type Urgency } from '../urgency/urgency-rules.js';
import { WorkTypeRepository } from '../work-types/work-type-repository.js';
import { requirePerson, optional } from '../common/form-fields.js';
import { parseOfferInput, type OfferInput } from './offer-input.js';

/** Po tylu dniach roboczych od wysłania lub ostatniego telefonu trzeba zadzwonić do klienta. */
export const OFFER_FOLLOW_UP_DAYS = 7;

export type OfferStatus = 'open' | 'accepted' | 'rejected' | 'closed';
export type OfferAction = 'created' | 'called' | 'contact_ended' | 'rejected' | 'accepted';
/** Co dalej po telefonie: przypomnieć znów za 7 dni albo zakończyć kontakt. */
export type AfterCall = 'again' | 'end';

export interface Offer extends Omit<OfferInput, 'workTypeId'> {
  id: number;
  workTypeId: number;
  sentBy: string;
  lastContactOn: LocalDate;
  status: OfferStatus;
  closedOn: LocalDate | null;
  orderId: number | null;
}

export interface OfferRow {
  offerId: number;
  clientName: string;
  town: string | null;
  workTypeName: string;
  pricePln: number | null;
  sentOn: LocalDate;
  lastContactOn: LocalDate;
  lastPerson: string;
  /** Dni robocze od wysłania lub ostatniego telefonu (dzień 0 = dzień kontaktu). */
  daysSinceContact: number;
  urgency: Urgency;
}

export interface OfferHistoryEntry {
  happenedOn: LocalDate;
  person: string;
  action: OfferAction;
  note: string | null;
}

const GROSZE_PER_PLN = 100;

/** Oferty: dodawanie, telefony z przypomnieniem po 7 dniach roboczych, przyjęcie, odrzucenie, historia. */
export class OfferService {
  private readonly workTypes: WorkTypeRepository;
  private readonly workingDays = new DayCounter('working');

  constructor(
    private readonly db: AppDatabase,
    private readonly today: () => LocalDate,
    private readonly rules: UrgencyRules,
    /** Po ilu dniach roboczych przypomnieć o ofercie (z Ustawień). */
    private readonly followUpDays: () => number = () => OFFER_FOLLOW_UP_DAYS,
  ) {
    this.workTypes = new WorkTypeRepository(db);
  }

  create(raw: OfferInput, person: string): number {
    const who = requirePerson(person);
    const input = parseOfferInput(raw, this.today());
    if (!this.workTypes.findById(input.workTypeId)) {
      throw new Error(`Nieznany rodzaj pracy (numer ${input.workTypeId})`);
    }
    return this.inTransaction(() => {
      const id = Number(
        this.db.connection
          .prepare(
            `INSERT INTO offers (client_name, phone, work_type_id, town, plot, price_grosze, note, sent_on, sent_by, last_contact_on)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.clientName,
            input.phone,
            input.workTypeId,
            input.town,
            input.plot,
            input.pricePln === null ? null : Math.round(input.pricePln * GROSZE_PER_PLN),
            input.note,
            input.sentOn,
            who,
            input.sentOn,
          ).lastInsertRowid,
      );
      this.log(id, who, 'created', null, input.sentOn);
      return id;
    });
  }

  /** Telefon do klienta: „again” = przypomnij znów za 7 dni, „end” = kontakt zakończony (oferta znika z listy). */
  recordCall(offerId: number, person: string, note: string | null, next: AfterCall): void {
    const who = requirePerson(person);
    this.requireOpen(offerId);
    this.inTransaction(() => {
      if (next === 'again') {
        this.db.connection
          .prepare('UPDATE offers SET last_contact_on = ? WHERE id = ?')
          .run(this.today(), offerId);
        this.log(offerId, who, 'called', optional(note));
      } else {
        this.close(offerId, 'closed', null);
        this.log(offerId, who, 'contact_ended', optional(note));
      }
    });
  }

  reject(offerId: number, person: string, reason: string | null): void {
    const who = requirePerson(person);
    this.requireOpen(offerId);
    this.inTransaction(() => {
      this.close(offerId, 'rejected', null);
      this.log(offerId, who, 'rejected', optional(reason));
    });
  }

  /** Klient przyjął ofertę i powstało z niej zlecenie. */
  markAccepted(offerId: number, person: string, orderId: number): void {
    const who = requirePerson(person);
    this.requireOpen(offerId);
    this.inTransaction(() => {
      this.close(offerId, 'accepted', orderId);
      this.log(offerId, who, 'accepted', `zlecenie nr ${orderId}`);
    });
  }

  get(offerId: number): Offer | null {
    const row = this.db.connection.prepare('SELECT * FROM offers WHERE id = ?').get(offerId) as
      OfferDbRow | undefined;
    return row ? toOffer(row) : null;
  }

  /** Otwarte oferty z kolorem pilności; najpilniejsze na górze. */
  rows(): OfferRow[] {
    const today = this.today();
    const rows = this.db.connection
      .prepare(
        `SELECT o.*, w.name AS work_type_name,
                (SELECT person FROM offer_history h WHERE h.offer_id = o.id ORDER BY h.id DESC LIMIT 1) AS last_person
         FROM offers o JOIN work_types w ON w.id = o.work_type_id
         WHERE o.status = 'open'`,
      )
      .all() as (OfferDbRow & { work_type_name: string; last_person: string })[];
    return rows
      .map((r) => ({
        offerId: r.id,
        clientName: r.client_name,
        town: r.town,
        workTypeName: r.work_type_name,
        pricePln: r.price_grosze === null ? null : r.price_grosze / GROSZE_PER_PLN,
        sentOn: r.sent_on,
        lastContactOn: r.last_contact_on,
        lastPerson: r.last_person,
        daysSinceContact: this.workingDays.daysBetween(r.last_contact_on, today),
        urgency: this.urgencyOf(r.last_contact_on, today),
      }))
      .sort((a, b) =>
        UrgencyRules.compare(
          { urgency: a.urgency, waitingSince: a.lastContactOn },
          { urgency: b.urgency, waitingSince: b.lastContactOn },
        ),
      );
  }

  /** Po ilu dniach roboczych od kontaktu przypominamy o ofercie. */
  reminderDays(): number {
    return this.followUpDays();
  }

  urgencyOf(lastContactOn: LocalDate, today: LocalDate): Urgency {
    // Typ „waiting”: liczy się tylko limit dni z Ustawień (bez reguły bezczynności z kroków zleceń).
    return this.rules.evaluate(
      {
        kind: 'waiting',
        limitDays: this.followUpDays(),
        startedOn: lastContactOn,
        lastActivityOn: lastContactOn,
      },
      today,
    );
  }

  history(offerId: number): OfferHistoryEntry[] {
    const rows = this.db.connection
      .prepare('SELECT happened_on, person, action, note FROM offer_history WHERE offer_id = ? ORDER BY id')
      .all(offerId) as { happened_on: string; person: string; action: OfferAction; note: string | null }[];
    return rows.map((r) => ({ happenedOn: r.happened_on, person: r.person, action: r.action, note: r.note }));
  }

  /** Rzuca błąd, gdy oferty nie ma albo jest już zamknięta. */
  requireOpen(offerId: number): Offer {
    const offer = this.get(offerId);
    if (!offer) throw new Error(`Nie ma oferty o numerze ${offerId}`);
    if (offer.status !== 'open') throw new Error(`Oferta nr ${offerId} jest już zamknięta`);
    return offer;
  }

  private close(offerId: number, status: Exclude<OfferStatus, 'open'>, orderId: number | null): void {
    this.db.connection
      .prepare('UPDATE offers SET status = ?, closed_on = ?, order_id = ? WHERE id = ?')
      .run(status, this.today(), orderId, offerId);
  }

  private log(
    offerId: number,
    person: string,
    action: OfferAction,
    note: string | null,
    on = this.today(),
  ): void {
    this.db.connection
      .prepare(
        'INSERT INTO offer_history (offer_id, happened_on, person, action, note) VALUES (?, ?, ?, ?, ?)',
      )
      .run(offerId, on, person, action, note);
  }

  private inTransaction<T>(work: () => T): T {
    return this.db.connection.transaction(work)();
  }
}

interface OfferDbRow {
  id: number;
  client_name: string;
  phone: string;
  work_type_id: number;
  town: string | null;
  plot: string | null;
  price_grosze: number | null;
  note: string | null;
  sent_on: string;
  sent_by: string;
  last_contact_on: string;
  status: OfferStatus;
  closed_on: string | null;
  order_id: number | null;
}

function toOffer(r: OfferDbRow): Offer {
  return {
    id: r.id,
    clientName: r.client_name,
    phone: r.phone,
    workTypeId: r.work_type_id,
    sentOn: r.sent_on,
    town: r.town,
    plot: r.plot,
    pricePln: r.price_grosze === null ? null : r.price_grosze / GROSZE_PER_PLN,
    note: r.note,
    sentBy: r.sent_by,
    lastContactOn: r.last_contact_on,
    status: r.status,
    closedOn: r.closed_on,
    orderId: r.order_id,
  };
}
