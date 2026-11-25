import type { FastifyInstance, FastifyReply } from 'fastify';
import type { CalendarSyncService } from '../modules/calendar-sync/calendar-sync-service.js';
import { requirePerson } from '../modules/common/form-fields.js';
import { HTTP_SEE_OTHER, message, type Form } from './http.js';

/** Konto Google widziane przez ekrany (prawdziwe: GoogleOAuth, w testach atrapa). */
export interface CalendarAccount {
  startAuthorization(): string;
  finishAuthorization(code: string, state: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export interface CalendarWebServices {
  calendarSync: CalendarSyncService;
  /** null = brak kluczy Google w .env. */
  calendarAccount: CalendarAccount | null;
}

const BACK_TO_SETTINGS = '/ustawienia#kalendarz';
const NO_KEYS = 'Brak kluczy Google w pliku .env: połączenie z Kalendarzem Google jest niedostępne.';

/**
 * Ustawienia → Kalendarz Google: połącz / odłącz konto, włącz / wyłącz synchronizację, „Synchronizuj teraz”.
 * `showError` pokazuje ekran Ustawień z komunikatem (kod 400).
 */
export function registerCalendarRoutes(
  app: FastifyInstance,
  s: CalendarWebServices,
  showError: (reply: FastifyReply, error: string) => unknown,
): void {
  // Kto kliknął „Połącz” (do historii po powrocie z Google). Aplikacja ma jeden komputer i jedno logowanie naraz.
  let connectingPerson = '';

  app.post('/kalendarz-google/polacz', (req, reply) => {
    try {
      connectingPerson = requirePerson((req.body as Form).person ?? '');
      if (!s.calendarAccount) throw new Error(NO_KEYS);
      return reply.redirect(s.calendarAccount.startAuthorization(), HTTP_SEE_OTHER);
    } catch (err) {
      return showError(reply, message(err));
    }
  });

  // Tu wraca przeglądarka po zalogowaniu w Google (adres podany w Google Cloud jako adres powrotu).
  app.get('/kalendarz-google/oauth', async (req, reply) => {
    const q = req.query as Form;
    try {
      if (!s.calendarAccount) throw new Error(NO_KEYS);
      if (q.error || !q.code) {
        throw new Error('Nie połączono z Kalendarzem Google: logowanie anulowane albo odmówiono dostępu.');
      }
      await s.calendarAccount.finishAuthorization(q.code, q.state ?? '');
      s.calendarSync.logAccount('connected', connectingPerson || 'nieznana osoba');
      void s.calendarSync.syncNow();
      return reply.redirect(BACK_TO_SETTINGS, HTTP_SEE_OTHER);
    } catch (err) {
      return showError(reply, message(err));
    }
  });

  app.post('/kalendarz-google/odlacz', async (req, reply) => {
    try {
      const person = requirePerson((req.body as Form).person ?? '');
      await s.calendarAccount?.disconnect();
      s.calendarSync.logAccount('disconnected', person);
      return reply.redirect(BACK_TO_SETTINGS, HTTP_SEE_OTHER);
    } catch (err) {
      return showError(reply, message(err));
    }
  });

  app.post('/kalendarz-google/wlacz', (req, reply) => {
    const form = req.body as Form;
    try {
      s.calendarSync.setEnabled(form.on === '1', form.person ?? '');
      void s.calendarSync.syncNow();
      return reply.redirect(BACK_TO_SETTINGS, HTTP_SEE_OTHER);
    } catch (err) {
      return showError(reply, message(err));
    }
  });

  // Czeka na wynik, żeby po powrocie na Ustawienia był widoczny aktualny stan (albo błąd).
  app.post('/kalendarz-google/synchronizuj', async (_req, reply) => {
    await s.calendarSync.syncNow();
    return reply.redirect(BACK_TO_SETTINGS, HTTP_SEE_OTHER);
  });
}
