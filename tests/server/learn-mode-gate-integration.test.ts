import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { SESSION_ABSOLUTE_MS, sessionCookieName } from '@/lib/accounts/gate';
import { sessionIdOf } from '@/lib/accounts/session';
import { createAccessToken } from '@/lib/server/access-token';
import { proxy } from '@/proxy';

/**
 * The student gate together with the access code and the accounts gate, through the real proxy. The
 * only fake is the database pool a session is read from (the pool fake of
 * tests/accounts/owner-method.test.ts): the real resolveSession, sessionVerdict and gateDecision decide
 * every answer.
 */
const db = vi.hoisted(() => ({ session: undefined as Record<string, unknown> | undefined }));
vi.mock('@/lib/accounts/db', () => ({
  accountsPool: async () => ({
    query: async (_sql: string, params: unknown[]) => {
      const row = db.session;
      return { rows: row && params[0] === row.id ? [row] : [] };
    },
  }),
}));

const ORIGIN = 'http://localhost:3001';
// A student deployment always has both: validateStudentModeConfiguration refuses it without them.
const ACCESS_CODE = 'a-long-access-code';
const SECRET = 'k'.repeat(32);
// A session token in the shape resolveSession accepts (43 base64url characters).
const TOKEN = 'a'.repeat(43);

interface Holder {
  access?: boolean;
  session?: boolean;
}

function cookieHeader({ access, session }: Holder): Record<string, string> {
  const cookies = [
    access ? `openmaic_access=${createAccessToken(ACCESS_CODE)}` : '',
    session ? `${sessionCookieName()}=${TOKEN}` : '',
  ].filter(Boolean);
  return cookies.length > 0 ? { cookie: cookies.join('; ') } : {};
}

/** A call a loaded page makes: same origin, so an unsafe method passes the same-origin rule. */
function api(method: string, path: string, who: Holder = {}): Promise<Response> {
  return proxy(
    new NextRequest(`${ORIGIN}${path}`, {
      method,
      headers: { origin: ORIGIN, ...cookieHeader(who) },
    }),
  );
}

/** A page the student opens: a document navigation, as a browser sends it. */
function page(path: string, who: Holder = {}): Promise<Response> {
  return proxy(
    new NextRequest(`${ORIGIN}${path}`, {
      headers: { 'sec-fetch-dest': 'document', accept: 'text/html', ...cookieHeader(who) },
    }),
  );
}

/** Whether the proxy let the request through to its route (`NextResponse.next()`). */
const passedThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

function liveSession(): Record<string, unknown> {
  const now = Date.now();
  return {
    id: sessionIdOf(TOKEN),
    user_id: 'user-1',
    last_seen_at: new Date(now),
    expires_at: new Date(now + SESSION_ABSOLUTE_MS),
    revoked_at: null,
    username: 'student',
    display_name: 'Student',
    role: 'user',
    status: 'active',
    must_change_password: false,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  db.session = undefined;
});

describe('student deployment with an access code, without accounts', () => {
  beforeEach(() => {
    vi.stubEnv('OPENMAIC_HOME', 'learn');
    vi.stubEnv('ACCESS_CODE', ACCESS_CODE);
    vi.stubEnv('OPENMAIC_ACCESS_SECRET', SECRET);
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
  });

  it('answers the lesson start with 401 when the access cookie is missing', async () => {
    const res = await api('POST', '/api/learn/start');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      errorCode: 'INVALID_REQUEST',
      error: 'Access code required',
    });
  });

  it('lets the lesson start through with the access cookie', async () => {
    const res = await api('POST', '/api/learn/start', { access: true });
    expect(passedThrough(res)).toBe(true);
  });

  it('answers a route the lesson flow does not use with 404, before the access code is asked', async () => {
    const res = await api('POST', '/api/generate-classroom');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Không tìm thấy.');
  });

  it('sends /?classic=1 to the lesson picker for a visitor without the access cookie', async () => {
    const res = await page('/?classic=1');
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/learn');
  });
});

describe('student deployment with accounts on', () => {
  beforeEach(() => {
    vi.stubEnv('OPENMAIC_HOME', 'learn');
    vi.stubEnv('ACCESS_CODE', ACCESS_CODE);
    vi.stubEnv('OPENMAIC_ACCESS_SECRET', SECRET);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    db.session = liveSession();
  });

  it('answers a route the lesson flow does not use with 404 for a signed-in student', async () => {
    const res = await api('POST', '/api/generate-classroom', { access: true, session: true });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Không tìm thấy.');
  });

  it('lets the lesson start through for a signed-in student with the access cookie', async () => {
    const res = await api('POST', '/api/learn/start', { access: true, session: true });
    expect(passedThrough(res)).toBe(true);
  });

  it('answers the lesson start with 401 UNAUTHENTICATED without a session', async () => {
    const res = await api('POST', '/api/learn/start', { access: true });
    expect(res.status).toBe(401);
    expect((await res.json()).errorCode).toBe('UNAUTHENTICATED');
  });

  it('still asks a signed-in student for the access code', async () => {
    const res = await api('POST', '/api/learn/start', { session: true });
    expect(res.status).toBe(401);
    expect((await res.json()).errorCode).toBe('INVALID_REQUEST');
  });

  it('sends a signed-in student from /?classic=1 to /learn', async () => {
    const res = await page('/?classic=1', { session: true });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/learn');
  });

  it('sends a visitor without a session from /?classic=1 to sign-in, not to the generator', async () => {
    const res = await page('/?classic=1');
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/?classic=1');
  });
});
