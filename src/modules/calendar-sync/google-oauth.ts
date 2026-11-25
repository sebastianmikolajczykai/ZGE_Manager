import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CalendarApiError } from './calendar-api.js';

/**
 * Uprawnienie tylko do kalendarzy założonych przez aplikację (i wydarzeń w nich).
 * Aplikacja nie widzi prywatnych kalendarzy ani wydarzeń właściciela konta.
 * Źródło: https://developers.google.com/workspace/calendar/api/auth
 */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

/** Adresy OAuth Google dla aplikacji Desktop: https://developers.google.com/identity/protocols/oauth2/native-app */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Odświeżamy token chwilę przed wygaśnięciem, żeby nie wygasł w trakcie zapytania. */
const EXPIRY_MARGIN_MS = 60_000;
const MS_PER_SECOND = 1000;
const RANDOM_BYTES = 32; // 32 bajty → 43 znaki base64url (PKCE wymaga 43–128)

/** To, co zapisujemy na dysku po połączeniu z kontem Google. */
export interface StoredToken {
  refreshToken: string;
  accessToken: string;
  /** Kiedy wygasa token dostępu (ISO). */
  expiresAt: string;
}

export interface TokenStore {
  read(): StoredToken | null;
  write(token: StoredToken): void;
  clear(): void;
}

export interface GoogleOAuthOptions {
  clientId: string;
  clientSecret: string;
  /** Adres powrotu z Google do aplikacji na tym komputerze (http://127.0.0.1:PORT/...). */
  redirectUri: string;
  fetchFn: typeof fetch;
  store: TokenStore;
  now?: () => Date;
}

/**
 * Połączenie z kontem Google (OAuth 2.0 dla aplikacji Desktop z PKCE).
 * Łukasz klika „Połącz”, loguje się w Google i wraca do aplikacji; token zapisujemy w pliku na tym komputerze.
 */
export class GoogleOAuth {
  /** Oczekujące logowanie: state → code_verifier (aplikacja ma jednego użytkownika, wystarczy pamięć). */
  private readonly pending = new Map<string, string>();

  constructor(private readonly o: GoogleOAuthOptions) {}

  isConnected(): boolean {
    return this.o.store.read() !== null;
  }

  /** Adres strony zgody Google, na który przekierowujemy przeglądarkę. */
  startAuthorization(): string {
    const state = randomBytes(RANDOM_BYTES).toString('base64url');
    const verifier = randomBytes(RANDOM_BYTES).toString('base64url');
    this.pending.clear(); // ważne tylko ostatnie kliknięcie „Połącz”
    this.pending.set(state, verifier);
    const params = new URLSearchParams({
      client_id: this.o.clientId,
      redirect_uri: this.o.redirectUri,
      response_type: 'code',
      scope: CALENDAR_SCOPE,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  /** Powrót z Google: wymienia jednorazowy kod na token i zapisuje go. */
  async finishAuthorization(code: string, state: string): Promise<void> {
    const verifier = this.pending.get(state);
    if (verifier === undefined) {
      throw new Error('Link logowania jest nieaktualny. Spróbuj połączyć jeszcze raz.');
    }
    this.pending.delete(state);
    const json = await this.postToken({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: this.o.redirectUri,
    }).catch((err: unknown) => {
      throw err instanceof CalendarApiError && err.kind !== 'offline'
        ? new Error('Google odrzucił logowanie. Spróbuj połączyć jeszcze raz.')
        : err;
    });
    if (typeof json.refresh_token !== 'string') {
      throw new Error(
        'Google nie przekazał tokenu odświeżania. Odłącz aplikację w koncie Google i połącz ponownie.',
      );
    }
    this.o.store.write(this.toStored(json, json.refresh_token));
  }

  /** Ważny token dostępu (odświeżany automatycznie). Bez połączenia: błąd „unauthorized”. */
  async accessToken(): Promise<string> {
    const saved = this.o.store.read();
    if (!saved) throw new CalendarApiError('unauthorized');
    if (Date.parse(saved.expiresAt) - this.now().getTime() > EXPIRY_MARGIN_MS) return saved.accessToken;
    const json = await this.postToken({ grant_type: 'refresh_token', refresh_token: saved.refreshToken });
    const fresh = this.toStored(json, saved.refreshToken);
    this.o.store.write(fresh);
    return fresh.accessToken;
  }

  /** Odłącza konto: prosi Google o unieważnienie tokenu (jeśli jest internet) i usuwa plik z tokenem. */
  async disconnect(): Promise<void> {
    const saved = this.o.store.read();
    this.o.store.clear();
    if (!saved) return;
    try {
      await this.o.fetchFn(REVOKE_URL, formRequest({ token: saved.refreshToken }));
    } catch {
      // Bez internetu nie unieważnimy tokenu w Google; plik i tak usunięty, a dostęp można cofnąć w koncie Google.
    }
  }

  private async postToken(fields: Record<string, string>): Promise<TokenResponse> {
    let response: Response;
    try {
      response = await this.o.fetchFn(
        TOKEN_URL,
        formRequest({ client_id: this.o.clientId, client_secret: this.o.clientSecret, ...fields }),
      );
    } catch {
      throw new CalendarApiError('offline');
    }
    const json = (await response.json().catch(() => ({}))) as TokenResponse;
    if (!response.ok || typeof json.access_token !== 'string') throw new CalendarApiError('unauthorized');
    return json;
  }

  private toStored(json: TokenResponse, refreshToken: string): StoredToken {
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 0;
    return {
      refreshToken,
      accessToken: json.access_token as string,
      expiresAt: new Date(this.now().getTime() + expiresIn * MS_PER_SECOND).toISOString(),
    };
  }

  private now(): Date {
    return (this.o.now ?? (() => new Date()))();
  }
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

function formRequest(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

/** Uprawnienia pliku: tylko właściciel konta Windows/Linux może go czytać. */
const OWNER_ONLY = 0o600;

/** Token w pliku JSON na tym komputerze (domyślnie dane/google-token.json, folder „dane” nie trafia do repo). */
export class FileTokenStore implements TokenStore {
  constructor(private readonly file: string) {}

  read(): StoredToken | null {
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch {
      return null; // brak pliku = nie połączono
    }
    try {
      const t = JSON.parse(text) as Partial<StoredToken>;
      return typeof t.refreshToken === 'string' && typeof t.accessToken === 'string'
        ? { refreshToken: t.refreshToken, accessToken: t.accessToken, expiresAt: String(t.expiresAt) }
        : null;
    } catch {
      console.error(`Uszkodzony plik tokenu Google (${this.file}) – trzeba połączyć konto ponownie.`);
      return null;
    }
  }

  write(token: StoredToken): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(token, null, 2), { mode: OWNER_ONLY });
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}
