import { headers } from 'next/headers';

import { accountsPool } from './db';
import { sessionCookieValue } from './gate';
import { resolveSession, type ResolvedSession } from './session';

/** The session of a page request, checked the same way as the proxy and the routes. */
export async function pageSession(): Promise<ResolvedSession> {
  const token = sessionCookieValue(new Headers(await headers()));
  return resolveSession(await accountsPool(), token, Date.now());
}
