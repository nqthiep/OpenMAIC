import { cookiesAreSecure } from '@/lib/server/cookie-secure';
import { isDocumentNavigation } from '@/lib/server/identity/navigation';

/**
 * The accounts gate policy (OPENMAIC_ACCOUNTS=true): which requests need a
 * session, and what answers the ones that do not have one. Pure. The proxy
 * resolves the session (`./session.ts`) and passes its state in.
 */

export const SESSION_COOKIE = 'openmaic_session';
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/** `OPENMAIC_ACCOUNTS`: unset or blank is off; `true`/`1` and `false`/`0` (any case) are accepted. */
export function accountsEnabled(): boolean {
  const raw = process.env.OPENMAIC_ACCOUNTS?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(
    `OPENMAIC_ACCOUNTS must be "true", "1", "false" or "0", got ${JSON.stringify(process.env.OPENMAIC_ACCOUNTS)}.`,
  );
}

/** The session cookie's name: `__Host-` prefixed exactly when it carries `Secure`. */
export function sessionCookieName(): string {
  return cookiesAreSecure() ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}

/** The cookie's value: `undefined` when the request has no such cookie, `''` when it is empty. */
export function sessionCookieValue(headers: Headers): string | undefined {
  const header = headers.get('cookie');
  if (!header) return undefined;
  const name = sessionCookieName();
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    return item.slice(separator + 1).trim();
  }
  return undefined;
}

export function sessionCookieHeader(token: string): string {
  const secure = cookiesAreSecure() ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_ABSOLUTE_MS / 1000);
  return `${sessionCookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookieHeader(): string {
  const secure = cookiesAreSecure() ? '; Secure' : '';
  return `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** `invalid` covers a cookie that is present but unusable (malformed, expired, revoked, inactive account). */
export type SessionState = 'none' | 'invalid' | 'password-change' | 'valid';

/**
 * `closed`: never reachable while accounts are on (teacher routes, which read
 * across owners and need an admin check that does not exist yet).
 * `public`: no session needed. `api`: any other /api route. `page`: everything else.
 */
export type RouteKind = 'closed' | 'public' | 'api' | 'page';

const PUBLIC_PAGES = new Set(['/login', '/login/']);
const PUBLIC_API = new Set(['/api/health', '/api/auth/login', '/api/auth/logout']);
const PUBLIC_PREFIXES = ['/api/access-code/', '/_next/', '/logos/', '/avatars/', '/vendor/'];
const ROOT_ASSET = /^\/[A-Za-z0-9._-]+\.[A-Za-z0-9]{1,8}$/;
const TEACHER = /^\/(api\/)?teacher(\/|$)/;
/** API routes that answer a session in the password-change state: the account's own routes. */
const ACCOUNT_API = new Set(['/api/auth/me', '/api/auth/password']);
/** The one page a password-change session may open; every other page redirects to it. */
const PASSWORD_PAGES = new Set(['/account/password', '/account/password/']);
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Characters a next-path must not contain: controls, space, and backslash (browsers read it as a slash). */
const UNSAFE_NEXT_CHARS = /[\u0000- \u007f\\]/;

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function routeKind(pathname: string): RouteKind {
  if (TEACHER.test(pathname)) return 'closed';
  if (
    PUBLIC_PAGES.has(pathname) ||
    PUBLIC_API.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    ROOT_ASSET.test(pathname)
  ) {
    return 'public';
  }
  return isApiPath(pathname) ? 'api' : 'page';
}

/**
 * The same-origin rule for unsafe requests: `Sec-Fetch-Site: same-origin`, or an
 * `Origin` whose host is the request's host. Safe methods always pass.
 */
export function isSameOriginRequest(
  method: string,
  headers: Headers,
  host: string | null,
): boolean {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) return true;
  if (headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = headers.get('origin');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/** A same-site path to return to after sign-in, or `undefined`. Rejects scheme, host, `//`, backslash and controls. */
export function safeNextPath(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || UNSAFE_NEXT_CHARS.test(value)) {
    return undefined;
  }
  let resolved: URL;
  try {
    resolved = new URL(value, 'http://localhost');
  } catch {
    return undefined;
  }
  return resolved.origin === 'http://localhost' ? value : undefined;
}

export type GateDecision =
  | { action: 'next' }
  | { action: 'redirect'; location: string }
  | { action: 'reject'; status: 401 | 403 | 404; errorCode?: string; message: string };

export interface GateInput {
  method: string;
  pathname: string;
  search: string;
  host: string | null;
  headers: Headers;
  kind: RouteKind;
  session: SessionState;
}

export function gateDecision(input: GateInput): GateDecision {
  const { method, pathname, search, host, headers, kind, session } = input;
  if (kind === 'closed') return { action: 'reject', status: 404, message: 'Not found' };
  if (isApiPath(pathname) && !isSameOriginRequest(method, headers, host)) {
    return {
      action: 'reject',
      status: 403,
      errorCode: 'FORBIDDEN',
      message: 'cross-origin request refused',
    };
  }
  if (kind === 'public') return { action: 'next' };
  if (kind === 'api') {
    if (session === 'valid' || (session === 'password-change' && ACCOUNT_API.has(pathname))) {
      return { action: 'next' };
    }
    if (session === 'password-change') {
      return {
        action: 'reject',
        status: 401,
        errorCode: 'PASSWORD_CHANGE_REQUIRED',
        message: 'the password must be changed first',
      };
    }
    return {
      action: 'reject',
      status: 401,
      errorCode: 'UNAUTHENTICATED',
      message: 'sign in required',
    };
  }
  if (session === 'valid') return { action: 'next' };
  if (session === 'password-change' && PASSWORD_PAGES.has(pathname)) return { action: 'next' };
  if (!isDocumentNavigation({ method, headers, pathname })) {
    return {
      action: 'reject',
      status: 401,
      errorCode: session === 'password-change' ? 'PASSWORD_CHANGE_REQUIRED' : 'UNAUTHENTICATED',
      message:
        session === 'password-change' ? 'the password must be changed first' : 'sign in required',
    };
  }
  if (session === 'password-change') return { action: 'redirect', location: '/account/password' };
  const next = safeNextPath(`${pathname}${search}`);
  return {
    action: 'redirect',
    location: next ? `/login?next=${encodeURIComponent(next)}` : '/login',
  };
}
