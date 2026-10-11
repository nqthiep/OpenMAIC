import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { POST as passwordRoute } from '@/app/api/auth/password/route';
import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount, updateAccount } from '@/lib/accounts/service';
import { PAIR_FAILURE_LIMIT, USERNAME_FAILURE_LIMIT } from '@/lib/accounts/throttle';
import { proxy } from '@/proxy';
import { resetOwnerAuthenticationForTests } from '@/lib/server/identity/registry';

import {
  accountsTestUrl,
  APP_ORIGIN,
  makeRequest,
  openTestSchema,
  send,
  sessionCookieOf,
  setCookies,
  type TestSchema,
} from './_pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';
const GENERIC = 'Tên đăng nhập hoặc mật khẩu không đúng';
const noRoute = async () => {
  throw new Error('the route must not run');
};

describe.skipIf(!accountsTestUrl)('auth routes behind the accounts gate', () => {
  let schema: TestSchema;
  let pool: Pool;

  beforeAll(async () => {
    schema = await openTestSchema('routes');
    vi.stubEnv('DATABASE_URL', schema.url);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    pool = (await getServerPersistenceProvider(schema.url)).pool;
    await ensureAccountsSchema(pool);
    resetOwnerAuthenticationForTests();
    configureAccountsAuthentication();
  });

  afterAll(async () => {
    resetOwnerAuthenticationForTests();
    vi.unstubAllEnvs();
    await pool.end();
    await schema.close();
  });

  async function account(options: { mustChangePassword?: boolean } = {}) {
    const username = `r${randomUUID().slice(0, 8)}`;
    const created = await createAccount(pool, {
      actorId: null,
      username,
      displayName: username,
      role: 'user',
      password: PASSWORD,
      mustChangePassword: options.mustChangePassword ?? false,
      now: Date.now(),
    });
    return { ...created.user, password: PASSWORD };
  }

  function signIn(
    username: string,
    password: string,
    extra: { cookie?: string; headers?: Record<string, string> } = {},
  ) {
    return send(
      makeRequest('/api/auth/login', {
        method: 'POST',
        body: { username, password },
        ...(extra.cookie === undefined ? {} : { cookie: extra.cookie }),
        ...(extra.headers === undefined ? {} : { headers: extra.headers }),
      }),
      loginRoute,
    );
  }

  async function signedInCookie(username: string, password: string): Promise<string> {
    const cookie = sessionCookieOf(await signIn(username, password));
    if (cookie === undefined) throw new Error('sign-in did not set a session');
    return cookie;
  }

  it('signs in with a session cookie of the expected attributes, drops the anonymous cookie, and never shows a hash', async () => {
    const a = await account();
    const response = await signIn(a.username, a.password);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({
      username: a.username,
      role: 'user',
      mustChangePassword: false,
    });
    expect(JSON.stringify(body)).not.toContain('scrypt');
    expect(setCookies(response).find((value) => value.startsWith('openmaic_session='))).toMatch(
      /; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/,
    );
    expect(
      setCookies(response).some(
        (value) => value.startsWith('anonymous_id=') && value.includes('Max-Age=0'),
      ),
    ).toBe(true);
  });

  it('answers a wrong password, an unknown name and a disabled account with the same response', async () => {
    const a = await account();
    const wrong = await signIn(a.username, 'wrong password 1');
    const unknown = await signIn(`x${randomUUID().slice(0, 8)}`, 'wrong password 1');
    const b = await account();
    await updateAccount(pool, {
      actorId: null,
      targetId: b.id,
      status: 'disabled',
      now: Date.now(),
    });
    const disabled = await signIn(b.username, b.password);
    for (const response of [wrong, unknown, disabled]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        success: false,
        errorCode: 'INVALID_CREDENTIALS',
        error: GENERIC,
      });
    }
  });

  it('locks a name from one address after five failures, and refuses even the right password there with 429 and Retry-After', async () => {
    const a = await account();
    const headers = { 'x-forwarded-for': '198.51.100.31' };
    for (let index = 0; index < PAIR_FAILURE_LIMIT; index += 1) {
      expect((await signIn(a.username, 'wrong password 1', { headers })).status).toBe(401);
    }
    const locked = await signIn(a.username, a.password, { headers });
    expect(locked.status).toBe(429);
    const retryAfter = Number(locked.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(900);
    expect((await locked.json()).errorCode).toBe('LOCKED');
    const elsewhere = { 'x-forwarded-for': '198.51.100.32' };
    expect((await signIn(a.username, a.password, { headers: elsewhere })).status).toBe(200);
  });

  it('locks a name after twenty failures from twenty addresses', async () => {
    const a = await account();
    for (let index = 0; index < USERNAME_FAILURE_LIMIT; index += 1) {
      const headers = { 'x-forwarded-for': `198.51.100.${index + 50}` };
      expect((await signIn(a.username, 'wrong password 1', { headers })).status).toBe(401);
    }
    const locked = await signIn(a.username, a.password, {
      headers: { 'x-forwarded-for': '198.51.100.200' },
    });
    expect(locked.status).toBe(429);
    expect((await locked.json()).errorCode).toBe('LOCKED');
  });

  it('locks an address after thirty failures across names', async () => {
    const address = `203.0.113.${randomUUID().split('-')[0]?.slice(0, 2).charCodeAt(0) ?? 7}`;
    for (let index = 0; index < 30; index += 1) {
      const response = await signIn(`n${randomUUID().slice(0, 8)}`, 'wrong password 1', {
        headers: { 'x-forwarded-for': address },
      });
      expect(response.status).toBe(401);
    }
    const next = await signIn(`n${randomUUID().slice(0, 8)}`, 'wrong password 1', {
      headers: { 'x-forwarded-for': address },
    });
    expect(next.status).toBe(429);
  });

  it('replaces the presented session at sign-in, so the old token stops working', async () => {
    const a = await account();
    const oldCookie = await signedInCookie(a.username, a.password);
    const newCookie = sessionCookieOf(await signIn(a.username, a.password, { cookie: oldCookie }));
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(oldCookie);
    expect((await send(makeRequest('/api/auth/me', { cookie: oldCookie }), meRoute)).status).toBe(
      401,
    );
    expect((await send(makeRequest('/api/auth/me', { cookie: newCookie }), meRoute)).status).toBe(
      200,
    );
  });

  it('reads the signed-in account without its hash, and refuses a request without a session', async () => {
    const a = await account({ mustChangePassword: true });
    const cookie = await signedInCookie(a.username, a.password);
    const me = await send(makeRequest('/api/auth/me', { cookie }), meRoute);
    expect(me.status).toBe(200);
    const body = (await me.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ mustChangePassword: true });
    expect(JSON.stringify(body)).not.toContain('scrypt');
    expect((await send(makeRequest('/api/auth/me'), meRoute)).status).toBe(401);
  });

  it('signs out: the session ends and the cookie is cleared', async () => {
    const a = await account();
    const cookie = await signedInCookie(a.username, a.password);
    const out = await send(
      makeRequest('/api/auth/logout', { method: 'POST', cookie }),
      logoutRoute,
    );
    expect(out.status).toBe(200);
    expect(
      setCookies(out).some(
        (value) => value.startsWith('openmaic_session=') && value.includes('Max-Age=0'),
      ),
    ).toBe(true);
    expect((await send(makeRequest('/api/auth/me', { cookie }), meRoute)).status).toBe(401);
  });

  it('changes the password: a wrong current one is 403, a weak one 400, and a good one ends the other sessions', async () => {
    const a = await account();
    const one = await signedInCookie(a.username, a.password);
    const two = await signedInCookie(a.username, a.password);
    const wrong = await send(
      makeRequest('/api/auth/password', {
        method: 'POST',
        cookie: one,
        body: { currentPassword: 'not the one here', newPassword: 'a brand new password' },
      }),
      passwordRoute,
    );
    expect(wrong.status).toBe(403);
    expect((await wrong.json()).errorCode).toBe('INVALID_CREDENTIALS');
    const weak = await send(
      makeRequest('/api/auth/password', {
        method: 'POST',
        cookie: one,
        body: { currentPassword: a.password, newPassword: 'short' },
      }),
      passwordRoute,
    );
    expect(weak.status).toBe(400);
    expect((await weak.json()).reason).toBe('length');
    const ok = await send(
      makeRequest('/api/auth/password', {
        method: 'POST',
        cookie: one,
        body: { currentPassword: a.password, newPassword: 'a brand new password' },
      }),
      passwordRoute,
    );
    expect(ok.status).toBe(200);
    expect((await send(makeRequest('/api/auth/me', { cookie: one }), meRoute)).status).toBe(200);
    expect((await send(makeRequest('/api/auth/me', { cookie: two }), meRoute)).status).toBe(401);
    expect((await signIn(a.username, a.password)).status).toBe(401);
    expect((await signIn(a.username, 'a brand new password')).status).toBe(200);
  });

  it('holds an account that must change its password to its own routes until it does', async () => {
    const a = await account({ mustChangePassword: true });
    const cookie = await signedInCookie(a.username, a.password);
    const refused = await send(makeRequest('/api/stages', { cookie }), noRoute);
    expect(refused.status).toBe(401);
    expect((await refused.json()).errorCode).toBe('PASSWORD_CHANGE_REQUIRED');
    const changed = await send(
      makeRequest('/api/auth/password', {
        method: 'POST',
        cookie,
        body: { currentPassword: a.password, newPassword: 'a changed password here' },
      }),
      passwordRoute,
    );
    expect(changed.status).toBe(200);
    const allowed = await send(
      makeRequest('/api/stages', { cookie }),
      async () => new Response('ran'),
    );
    expect(allowed.status).toBe(200);
  });

  it('refuses an unsafe request from another origin, before the route or the database', async () => {
    const before = await pool.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM accounts_login_attempts',
    );
    const response = await send(
      makeRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'someone', password: 'x' },
        headers: { origin: 'https://evil.example' },
      }),
      noRoute,
    );
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('FORBIDDEN');
    const after = await pool.query<{ n: string }>(
      'SELECT COUNT(*)::text AS n FROM accounts_login_attempts',
    );
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it('refuses an unsafe request with neither a matching Origin nor same-origin fetch metadata', async () => {
    const response = await send(
      makeRequest('/api/auth/login', {
        method: 'POST',
        body: { username: 'someone', password: 'x' },
        headers: { origin: '' },
      }),
      noRoute,
    );
    expect(response.status).toBe(403);
  });

  it('accepts a same-origin fetch that sends Sec-Fetch-Site without an Origin', async () => {
    const response = await signIn('nobody.at.all', 'wrong password 1', {
      headers: { 'sec-fetch-site': 'same-origin', origin: '' },
    });
    expect(response.status).toBe(401);
  });

  it('answers an API route without a session with 401, and the route does not run', async () => {
    const response = await send(makeRequest('/api/chat', { method: 'POST', body: {} }), noRoute);
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('UNAUTHENTICATED');
  });

  it('sends a page navigation without a session to sign-in, with the path it asked for', async () => {
    const response = await send(
      makeRequest('/classroom/abc', { headers: { 'sec-fetch-dest': 'document' } }),
      async () => new Response('ran'),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(`${APP_ORIGIN}/login?next=%2Fclassroom%2Fabc`);
  });

  it('keeps the teacher pages closed for every session', async () => {
    const a = await account();
    const cookie = await signedInCookie(a.username, a.password);
    const response = await send(
      makeRequest('/teacher', { cookie }),
      async () => new Response('ran'),
    );
    expect(response.status).toBe(404);
  });

  it('names the session cookie __Host- and marks it Secure in production', async () => {
    const a = await account();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', '');
    try {
      const response = await signIn(a.username, a.password);
      const cookie = setCookies(response).find((value) =>
        value.startsWith('__Host-openmaic_session='),
      );
      expect(cookie).toMatch(/; Secure$/);
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
    }
  });

  it('refuses a body that is not an object with a username and a password', async () => {
    const response = await send(
      makeRequest('/api/auth/login', { method: 'POST', body: ['x'] }),
      loginRoute,
    );
    expect(response.status).toBe(400);
  });

  it('with accounts on, no anonymous owner cookie is minted on any page', async () => {
    const publicPage = await send(
      makeRequest('/login', { headers: { 'sec-fetch-dest': 'document' } }),
      async () => new Response('ran'),
    );
    expect(publicPage.status).toBe(200);
    expect(setCookies(publicPage).some((value) => value.startsWith('anonymous_id='))).toBe(false);
    const redirected = await proxy(
      makeRequest('/classroom/abc', { headers: { 'sec-fetch-dest': 'document' } }),
    );
    expect(redirected.status).toBe(307);
    expect(setCookies(redirected).some((value) => value.startsWith('anonymous_id='))).toBe(false);
  });

  it('with accounts off, a page navigation still gets the anonymous owner cookie', async () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
    try {
      const response = await proxy(
        makeRequest('/classroom/abc', { headers: { 'sec-fetch-dest': 'document' } }),
      );
      expect(setCookies(response).some((value) => value.startsWith('anonymous_id='))).toBe(true);
    } finally {
      vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    }
  });
});
