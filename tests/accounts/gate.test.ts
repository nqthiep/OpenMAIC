import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  accountsEnabled,
  clearSessionCookieHeader,
  gateDecision,
  isSameOriginRequest,
  routeKind,
  safeNextPath,
  type SessionState,
  sessionCookieHeader,
  sessionCookieValue,
} from '@/lib/accounts/gate';

afterEach(() => {
  vi.unstubAllEnvs();
});

const APP_ORIGIN = { origin: 'https://app.example' };

function decide(
  pathname: string,
  session: SessionState,
  init: { method?: string; headers?: Record<string, string>; search?: string } = {},
) {
  return gateDecision({
    method: init.method ?? 'GET',
    pathname,
    search: init.search ?? '',
    host: 'app.example',
    headers: new Headers(init.headers),
    kind: routeKind(pathname),
    session,
  });
}

describe('route kinds', () => {
  it.each([
    ['/login', 'public'],
    ['/api/health', 'public'],
    ['/api/auth/login', 'public'],
    ['/api/auth/logout', 'public'],
    ['/api/access-code/verify', 'public'],
    ['/_next/static/chunk.js', 'public'],
    ['/logos/mark.png', 'public'],
    ['/favicon.ico', 'public'],
    ['/api/auth/me', 'api'],
    ['/api/auth/password', 'api'],
    ['/api/chat', 'api'],
    ['/api/stages/abc', 'api'],
    ['/classroom/abc', 'page'],
    ['/teachers', 'page'],
    ['/teacher', 'closed'],
    ['/teacher/progress', 'closed'],
    ['/api/teacher', 'closed'],
    ['/api/teacher/progress', 'closed'],
  ])('%s is %s', (pathname, kind) => {
    expect(routeKind(pathname)).toBe(kind);
  });
});

describe('the session cookie', () => {
  it('is absent, empty or a value, by what the request carries', () => {
    expect(sessionCookieValue(new Headers())).toBeUndefined();
    expect(sessionCookieValue(new Headers({ cookie: 'openmaic_session=' }))).toBe('');
    expect(sessionCookieValue(new Headers({ cookie: 'a=1; openmaic_session=tok' }))).toBe('tok');
  });

  it('matches the exact name, never a prefix or a suffix', () => {
    expect(sessionCookieValue(new Headers({ cookie: 'openmaic_session_x=tok' }))).toBeUndefined();
    expect(sessionCookieValue(new Headers({ cookie: 'x_openmaic_session=tok' }))).toBeUndefined();
  });

  it('is HttpOnly, SameSite=Lax, at / for 30 days, without Secure outside production', () => {
    expect(sessionCookieHeader('tok')).toBe(
      'openmaic_session=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
    );
  });

  it('takes the __Host- name and Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('COOKIE_SECURE', '');
    expect(sessionCookieHeader('tok')).toMatch(/^__Host-openmaic_session=tok; .*; Secure$/);
    expect(clearSessionCookieHeader()).toMatch(/^__Host-openmaic_session=; .*Max-Age=0; Secure$/);
  });

  it('clears with Max-Age=0', () => {
    expect(clearSessionCookieHeader()).toBe(
      'openmaic_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
  });
});

describe('the accounts switch', () => {
  it('is off when unset or blank, on for true or 1 in any case, off for 0', () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
    expect(accountsEnabled()).toBe(false);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'TRUE');
    expect(accountsEnabled()).toBe(true);
    vi.stubEnv('OPENMAIC_ACCOUNTS', '1');
    expect(accountsEnabled()).toBe(true);
    vi.stubEnv('OPENMAIC_ACCOUNTS', '0');
    expect(accountsEnabled()).toBe(false);
  });
});

describe('the next path after sign-in', () => {
  it('keeps a same-site path, with its query', () => {
    expect(safeNextPath('/classroom/abc?tab=2')).toBe('/classroom/abc?tab=2');
  });

  it.each([
    '//evil.example',
    '/\\evil.example',
    'https://evil.example/',
    'javascript:alert(1)',
    'relative/path',
    '/a\tb',
    '/a\nb',
    '/a b',
    '',
  ])('refuses %j', (value) => {
    expect(safeNextPath(value)).toBeUndefined();
  });

  it('refuses a missing value and one over 2048 characters', () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(`/${'a'.repeat(2048)}`)).toBeUndefined();
  });
});

describe('the same-origin rule for unsafe requests', () => {
  it('lets safe methods through', () => {
    expect(
      isSameOriginRequest('GET', new Headers({ origin: 'https://evil.example' }), 'app.example'),
    ).toBe(true);
  });

  it('accepts an Origin whose host is the request host, ignoring case', () => {
    expect(
      isSameOriginRequest('POST', new Headers({ origin: 'https://APP.example' }), 'app.example'),
    ).toBe(true);
  });

  it('refuses another origin, a null origin and a missing origin', () => {
    expect(
      isSameOriginRequest('POST', new Headers({ origin: 'https://evil.example' }), 'app.example'),
    ).toBe(false);
    expect(isSameOriginRequest('POST', new Headers({ origin: 'null' }), 'app.example')).toBe(false);
    expect(isSameOriginRequest('DELETE', new Headers(), 'app.example')).toBe(false);
  });

  it('accepts Sec-Fetch-Site: same-origin without an Origin', () => {
    expect(
      isSameOriginRequest('PATCH', new Headers({ 'sec-fetch-site': 'same-origin' }), 'app.example'),
    ).toBe(true);
  });
});

describe('gate decisions', () => {
  it('answers 404 on teacher paths whatever the session', () => {
    expect(decide('/teacher', 'valid')).toMatchObject({ action: 'reject', status: 404 });
  });

  it('refuses a cross-origin unsafe request before any session rule', () => {
    expect(
      decide('/api/auth/login', 'none', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    ).toMatchObject({ action: 'reject', status: 403, errorCode: 'FORBIDDEN' });
  });

  it('lets public routes through without a session', () => {
    expect(decide('/api/health', 'none')).toEqual({ action: 'next' });
    expect(decide('/login', 'none')).toEqual({ action: 'next' });
  });

  it('answers an API route without a valid session with 401', () => {
    expect(decide('/api/chat', 'none')).toMatchObject({
      action: 'reject',
      status: 401,
      errorCode: 'UNAUTHENTICATED',
    });
    expect(decide('/api/chat', 'invalid')).toMatchObject({ action: 'reject', status: 401 });
  });

  it('lets a valid session through to an API route', () => {
    expect(decide('/api/chat', 'valid', { method: 'POST', headers: APP_ORIGIN })).toEqual({
      action: 'next',
    });
  });

  it('keeps an account in the password-change state to its own routes', () => {
    expect(
      decide('/api/auth/password', 'password-change', { method: 'POST', headers: APP_ORIGIN }),
    ).toEqual({
      action: 'next',
    });
    expect(decide('/api/auth/me', 'password-change')).toEqual({ action: 'next' });
    expect(decide('/api/stages', 'password-change')).toMatchObject({
      action: 'reject',
      status: 401,
      errorCode: 'PASSWORD_CHANGE_REQUIRED',
    });
  });

  it('redirects a navigation without a session to sign-in, keeping the path and query', () => {
    expect(
      decide('/classroom/abc', 'none', {
        search: '?tab=2',
        headers: { 'sec-fetch-dest': 'document' },
      }),
    ).toEqual({ action: 'redirect', location: '/login?next=%2Fclassroom%2Fabc%3Ftab%3D2' });
  });

  it('answers a page request that is not a navigation with 401', () => {
    expect(
      decide('/classroom/abc', 'none', { headers: { 'sec-fetch-dest': 'empty' } }),
    ).toMatchObject({
      action: 'reject',
      status: 401,
      errorCode: 'UNAUTHENTICATED',
    });
  });

  it('sends a password-change account to the password page on navigation', () => {
    expect(
      decide('/classroom/abc', 'password-change', { headers: { 'sec-fetch-dest': 'document' } }),
    ).toEqual({
      action: 'redirect',
      location: '/account/password',
    });
  });

  it('lets a password-change account open the password page itself, as a navigation or a client fetch', () => {
    expect(
      decide('/account/password', 'password-change', { headers: { 'sec-fetch-dest': 'document' } }),
    ).toEqual({ action: 'next' });
    expect(decide('/account/password', 'password-change', { headers: { rsc: '1' } })).toEqual({
      action: 'next',
    });
    expect(decide('/account', 'password-change', { headers: { rsc: '1' } })).toMatchObject({
      action: 'reject',
      status: 401,
      errorCode: 'PASSWORD_CHANGE_REQUIRED',
    });
  });
});
