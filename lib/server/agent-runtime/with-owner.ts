import type { PersistencePoolFactory } from '@/lib/persistence/server-provider';
import { accountsEnabled, resolveAuthenticatedOwnerId } from '@/lib/server/accounts/runtime';
import { clearSessionCookieHeader, readSessionCookie } from '@/lib/server/accounts/session';
import { apiError } from '@/lib/server/api-response';

import { resolveRequestOwnerId } from './owner';

/**
 * The signed-in owner for these request headers, or undefined when the request
 * has no live session. Pass the result as the third argument of
 * resolveRequestOwnerId.
 *
 * A request without a session cookie, or with a malformed one, never reaches the
 * account layer: no configuration read and no database call, so the anonymous
 * identity path is exactly what it was. A well-formed cookie is checked in the
 * database, and a failure of that check rejects. When accounts are off (no
 * DATABASE_URL) there is no session store to check, so the cookie is ignored.
 */
export async function resolveSignedInOwnerId(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<string | undefined> {
  if (readSessionCookie(headers) === undefined) return undefined;
  return resolveAuthenticatedOwnerId(headers, poolFactory);
}

/**
 * A request that carries a well-formed session cookie which no longer resolves to a
 * live account (expired, revoked, or the account disabled) has ended its session.
 * While accounts are enabled, such a request must not fall back to the anonymous
 * owner: its work would silently land in a different partition. Malformed, duplicated
 * and absent cookies, and deployments without accounts, keep the anonymous identity.
 */
export async function resolveSignedInSession(
  headers: Headers,
  poolFactory?: PersistencePoolFactory,
): Promise<{ ownerId: string | undefined; ended: boolean }> {
  if (readSessionCookie(headers) === undefined) return { ownerId: undefined, ended: false };
  const ownerId = await resolveAuthenticatedOwnerId(headers, poolFactory);
  if (ownerId !== undefined) return { ownerId, ended: false };
  return { ownerId: undefined, ended: accountsEnabled() };
}

/** 401 for a request whose session has ended. Also clears the cookie, so the browser stops sending it. */
export function sessionEndedResponse(): Response {
  const response = apiError(
    'SESSION_ENDED',
    401,
    'Your sign-in has ended. Sign in again to continue.',
  );
  response.headers.set('Cache-Control', 'no-store');
  response.headers.append('Set-Cookie', clearSessionCookieHeader());
  return response;
}

export interface RequestOwnerOptions {
  /** Test seam: the pool the session lookup runs on. Production uses the configured database. */
  poolFactory?: PersistencePoolFactory;
}

/**
 * Resolve the request identity and run a handler with its response headers.
 *
 * A live account session partitions the request under `acct:<id>` and mints no
 * anonymous cookie. Any other request keeps the anonymous cookie identity. The
 * handler's third argument reports whether the request is signed in, so a route
 * can apply a session-specific rule without a second session lookup.
 *
 * The Set-Cookie minted by resolveRequestOwnerId must ride every response,
 * including 4xx and 5xx: a client that retries after an error keeps the same
 * owner partition, while a 500 that dropped the cookie would silently make
 * the retry a different anonymous owner.
 *
 * A session check that fails is an error like any other. It reaches the catch
 * below, so the response is a 500, and no anonymous cookie is minted for it.
 */
export async function withRequestOwnerId(
  req: Pick<Request, 'headers'>,
  handler: (ownerId: string, responseHeaders: Headers, signedIn: boolean) => Promise<Response>,
  options: RequestOwnerOptions = {},
): Promise<Response> {
  const responseHeaders = new Headers();
  try {
    const session = await resolveSignedInSession(req.headers, options.poolFactory);
    if (session.ended) return sessionEndedResponse();
    const ownerId = resolveRequestOwnerId(req, responseHeaders, session.ownerId);
    return await handler(ownerId, responseHeaders, session.ownerId !== undefined);
  } catch (error) {
    console.error('[agent-runtime] request failed under its resolved owner', error);
    return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
  }
}
