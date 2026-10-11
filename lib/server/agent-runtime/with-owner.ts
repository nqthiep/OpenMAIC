import type { PersistencePoolFactory } from '@/lib/persistence/server-provider';
import { resolveAuthenticatedOwnerId } from '@/lib/server/accounts/runtime';
import { readSessionCookie } from '@/lib/server/accounts/session';

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
    const authenticatedOwnerId = await resolveSignedInOwnerId(req.headers, options.poolFactory);
    const ownerId = resolveRequestOwnerId(req, responseHeaders, authenticatedOwnerId);
    return await handler(ownerId, responseHeaders, authenticatedOwnerId !== undefined);
  } catch (error) {
    console.error('[agent-runtime] request failed under its resolved owner', error);
    return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
  }
}
