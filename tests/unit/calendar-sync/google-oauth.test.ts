import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  GoogleOAuth,
  CALENDAR_SCOPE,
  type StoredToken,
  type TokenStore,
} from '../../../src/modules/calendar-sync/google-oauth.js';
import { CalendarApiError } from '../../../src/modules/calendar-sync/calendar-api.js';

class MemoryStore implements TokenStore {
  token: StoredToken | null = null;
  read() {
    return this.token;
  }
  write(t: StoredToken) {
    this.token = t;
  }
  clear() {
    this.token = null;
  }
}

interface Sent {
  url: string;
  form: URLSearchParams;
}

function fakeFetch(responses: { status: number; json?: unknown }[] | 'offline') {
  const sent: Sent[] = [];
  const fn = (async (url: string, init: RequestInit = {}) => {
    sent.push({ url, form: new URLSearchParams(String(init.body ?? '')) });
    if (responses === 'offline') throw new TypeError('fetch failed');
    const next = responses.shift() ?? { status: 200, json: {} };
    return new Response(JSON.stringify(next.json ?? {}), { status: next.status });
  }) as typeof fetch;
  return { fn, sent };
}

const NOW = new Date('2026-11-24T10:00:00Z');

describe('GoogleOAuth: logowanie do konta Google (aplikacja Desktop, PKCE)', () => {
  let store: MemoryStore;
  let now: Date;

  const make = (fetchFn: typeof fetch) =>
    new GoogleOAuth({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      redirectUri: 'http://127.0.0.1:3000/kalendarz-google/oauth',
      fetchFn,
      store,
      now: () => now,
    });

  beforeEach(() => {
    store = new MemoryStore();
    now = NOW;
  });

  it('the scope is only calendars created by the app', () => {
    expect(CALENDAR_SCOPE).toBe('https://www.googleapis.com/auth/calendar.app.created');
  });

  it('builds the Google consent URL with PKCE S256, state and offline access', () => {
    const url = new URL(make(fakeFetch([]).fn).startAuthorization());
    expect(`${url.origin}${url.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe('client-1');
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:3000/kalendarz-google/oauth');
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe(CALENDAR_SCOPE);
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('state')?.length).toBeGreaterThanOrEqual(32);
    expect(p.get('code_challenge')?.length).toBe(43);
  });

  it('exchanges the code with the matching verifier and saves the token', async () => {
    const f = fakeFetch([
      { status: 200, json: { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 } },
    ]);
    const oauth = make(f.fn);
    const url = new URL(oauth.startAuthorization());
    await oauth.finishAuthorization('code-1', url.searchParams.get('state') ?? '');

    const form = f.sent[0]?.form;
    expect(f.sent[0]?.url).toBe('https://oauth2.googleapis.com/token');
    expect(form?.get('grant_type')).toBe('authorization_code');
    expect(form?.get('code')).toBe('code-1');
    expect(form?.get('client_secret')).toBe('secret-1');
    const verifier = form?.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBe(url.searchParams.get('code_challenge'));
    expect(store.token).toEqual({
      refreshToken: 'r1',
      accessToken: 'a1',
      expiresAt: '2026-11-24T11:00:00.000Z',
    });
    expect(oauth.isConnected()).toBe(true);
  });

  it('rejects a wrong state (protection against forged links)', async () => {
    const oauth = make(fakeFetch([]).fn);
    oauth.startAuthorization();
    await expect(oauth.finishAuthorization('code', 'zły')).rejects.toThrow(/Spróbuj połączyć jeszcze raz/);
  });

  it('a state can be used only once', async () => {
    const f = fakeFetch([{ status: 200, json: { access_token: 'a', refresh_token: 'r', expires_in: 3600 } }]);
    const oauth = make(f.fn);
    const state = new URL(oauth.startAuthorization()).searchParams.get('state') ?? '';
    await oauth.finishAuthorization('c', state);
    await expect(oauth.finishAuthorization('c', state)).rejects.toThrow();
  });

  it('token exchange refused by Google: clear error, nothing saved', async () => {
    const f = fakeFetch([{ status: 400, json: { error: 'invalid_grant' } }]);
    const oauth = make(f.fn);
    const state = new URL(oauth.startAuthorization()).searchParams.get('state') ?? '';
    await expect(oauth.finishAuthorization('c', state)).rejects.toThrow(/Google odrzucił/);
    expect(store.token).toBeNull();
  });

  it('a response without a refresh token is an error (connection would not last)', async () => {
    const f = fakeFetch([{ status: 200, json: { access_token: 'a', expires_in: 3600 } }]);
    const oauth = make(f.fn);
    const state = new URL(oauth.startAuthorization()).searchParams.get('state') ?? '';
    await expect(oauth.finishAuthorization('c', state)).rejects.toThrow(/odświeżania/);
  });

  it('uses the saved access token while it is valid', async () => {
    store.token = { refreshToken: 'r1', accessToken: 'a1', expiresAt: '2026-11-24T11:00:00.000Z' };
    const f = fakeFetch([]);
    expect(await make(f.fn).accessToken()).toBe('a1');
    expect(f.sent).toHaveLength(0);
  });

  it('refreshes an expired access token and keeps the refresh token', async () => {
    store.token = { refreshToken: 'r1', accessToken: 'a1', expiresAt: '2026-11-24T10:00:30.000Z' };
    const f = fakeFetch([{ status: 200, json: { access_token: 'a2', expires_in: 3600 } }]);
    expect(await make(f.fn).accessToken()).toBe('a2');
    expect(f.sent[0]?.form.get('grant_type')).toBe('refresh_token');
    expect(f.sent[0]?.form.get('refresh_token')).toBe('r1');
    expect(store.token).toMatchObject({ refreshToken: 'r1', accessToken: 'a2' });
  });

  it('refresh token revoked or expired → unauthorized (asks to connect again)', async () => {
    store.token = { refreshToken: 'r1', accessToken: 'a1', expiresAt: '2026-11-24T09:00:00.000Z' };
    const f = fakeFetch([{ status: 400, json: { error: 'invalid_grant' } }]);
    const err = await make(f.fn)
      .accessToken()
      .catch((e: unknown) => e);
    expect((err as CalendarApiError).kind).toBe('unauthorized');
  });

  it('no internet while refreshing → offline', async () => {
    store.token = { refreshToken: 'r1', accessToken: 'a1', expiresAt: '2026-11-24T09:00:00.000Z' };
    const err = await make(fakeFetch('offline').fn)
      .accessToken()
      .catch((e: unknown) => e);
    expect((err as CalendarApiError).kind).toBe('offline');
  });

  it('not connected → unauthorized', async () => {
    const err = await make(fakeFetch([]).fn)
      .accessToken()
      .catch((e: unknown) => e);
    expect((err as CalendarApiError).kind).toBe('unauthorized');
    expect(make(fakeFetch([]).fn).isConnected()).toBe(false);
  });

  it('disconnect revokes at Google and forgets the token, even when offline', async () => {
    store.token = { refreshToken: 'r1', accessToken: 'a1', expiresAt: '2026-11-24T11:00:00.000Z' };
    const f = fakeFetch([{ status: 200 }]);
    await make(f.fn).disconnect();
    expect(f.sent[0]?.url).toBe('https://oauth2.googleapis.com/revoke');
    expect(f.sent[0]?.form.get('token')).toBe('r1');
    expect(store.token).toBeNull();

    store.token = { refreshToken: 'r1', accessToken: 'a1', expiresAt: '2026-11-24T11:00:00.000Z' };
    await make(fakeFetch('offline').fn).disconnect();
    expect(store.token).toBeNull();
  });
});
