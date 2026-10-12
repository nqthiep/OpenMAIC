/**
 * Account sessions: an opaque random token in an HttpOnly cookie. The server
 * keeps only a SHA-256 digest of the token, so a leaked database row cannot be
 * replayed as a cookie.
 */
import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'openmaic_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** 32 random bytes encode to 43 base64url characters. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Reads the session cookie from a Cookie header. Returns undefined when it is
 * absent, malformed, or present more than once. Two values with this name (for
 * example one set on a parent domain by a sibling site) are ambiguous, so
 * neither is trusted.
 */
export function readSessionCookie(headers: Headers): string | undefined {
  const header = headers.get('cookie');
  if (!header) return undefined;
  let value: string | undefined;
  let occurrences = 0;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    occurrences += 1;
    value = item.slice(separator + 1).trim();
  }
  if (occurrences !== 1 || value === undefined) return undefined;
  return TOKEN_PATTERN.test(value) ? value : undefined;
}

function cookieAttributes(maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; ${cookieAttributes(SESSION_TTL_SECONDS)}`;
}

/** A Set-Cookie value that removes the session cookie from the browser. */
export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0)}`;
}
