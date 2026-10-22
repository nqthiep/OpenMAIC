/**
 * The two signed values of the OmniRoute gate. A ticket (60 seconds, single use) carries an
 * administrator from the Settings popup to the dashboard's own origin, which never receives the
 * `openmaic_session` cookie. The gate cookie (8 hours) is what that origin sends back on every
 * request. Both are `kind.accountId.sessionKey.expiresAtMs.nonce.signature`. The kind is signed, so
 * a ticket cannot be replayed as a cookie. The session key names the OpenMAIC session the gate was
 * opened from, so signing out of OpenMAIC closes the gate too.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const GATE_COOKIE = 'omniroute_gate';
export const TICKET_TTL_MS = 60_000;
export const GATE_TTL_MS = 8 * 60 * 60 * 1000;

export type TokenKind = 'ticket' | 'gate';

export interface TokenClaim {
  accountId: string;
  /** The first 32 hex digits of the SHA-256 digest of the OpenMAIC session token. */
  sessionKey: string;
  nonce: string;
  expiresAt: number;
}

const ACCOUNT_ID = /^[A-Za-z0-9_-]+$/;
const SESSION_KEY = /^[0-9a-f]{32}$/;

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

export function mintToken(
  kind: TokenKind,
  accountId: string,
  sessionKey: string,
  ttlMs: number,
  secret: string,
  now = Date.now(),
): string {
  if (!ACCOUNT_ID.test(accountId)) throw new Error('Account id cannot be put in a gate token');
  if (!SESSION_KEY.test(sessionKey)) throw new Error('Session key cannot be put in a gate token');
  const body = `${kind}.${accountId}.${sessionKey}.${now + ttlMs}.${randomBytes(9).toString('base64url')}`;
  return `${body}.${sign(body, secret)}`;
}

/** The claim of a token that is genuine, of this kind and not expired; otherwise undefined. */
export function verifyToken(
  kind: TokenKind,
  token: string,
  secret: string,
  now = Date.now(),
): TokenClaim | undefined {
  const parts = token.split('.');
  if (parts.length !== 6) return undefined;
  const [tokenKind, accountId, sessionKey, expires, nonce, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const expected = Buffer.from(sign(parts.slice(0, 5).join('.'), secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  const expiresAt = Number(expires);
  if (tokenKind !== kind || !Number.isFinite(expiresAt) || expiresAt <= now) return undefined;
  return { accountId, sessionKey, nonce, expiresAt };
}

const USED_TICKETS = Symbol.for('openmaic.omniroute.usedTickets');
const globalState = globalThis as typeof globalThis & { [USED_TICKETS]?: Map<string, number> };

/**
 * True the first time a ticket's nonce is presented, false on every later attempt.
 * ponytail: kept in this process's memory (one app container). A second replica would let a
 * ticket be used once per replica; move the nonce into a table if the app is ever scaled out.
 */
export function redeemOnce(nonce: string, expiresAt: number, now = Date.now()): boolean {
  const used = (globalState[USED_TICKETS] ??= new Map<string, number>());
  for (const [seen, until] of used) if (until <= now) used.delete(seen);
  if (used.has(nonce)) return false;
  used.set(nonce, expiresAt);
  return true;
}

/** The gate cookie of a request, or undefined when it is absent or sent more than once. */
export function readGateCookie(headers: Headers): string | undefined {
  const header = headers.get('cookie');
  if (!header) return undefined;
  let value: string | undefined;
  let occurrences = 0;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== GATE_COOKIE) continue;
    occurrences += 1;
    value = item.slice(separator + 1).trim();
  }
  return occurrences === 1 ? value : undefined;
}

export function gateCookieHeader(token: string, secure: boolean): string {
  const attributes = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${GATE_TTL_MS / 1000}`;
  return `${GATE_COOKIE}=${token}; ${attributes}${secure ? '; Secure' : ''}`;
}
