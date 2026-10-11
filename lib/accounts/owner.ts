import type {
  OwnerAuthMethod,
  OwnerAuthMethodResult,
  OwnerPrincipal,
} from '@/lib/server/identity/types';
import { OWNER_ROLES } from '@/lib/server/identity/types';

import { accountsPool } from './db';
import { sessionCookieValue } from './gate';
import type { PublicUser } from './repository';
import { resolveSession } from './session';

const OWNER_PREFIX = 'acct_';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The owner id of an account: `acct_<uuid>`. */
export function accountOwnerId(userId: string): string {
  return `${OWNER_PREFIX}${userId}`;
}

/** The account a stored owner id names, or `undefined` for any other owner. */
export function accountUserIdOf(ownerId: string): string | undefined {
  if (!ownerId.startsWith(OWNER_PREFIX)) return undefined;
  const id = ownerId.slice(OWNER_PREFIX.length);
  return UUID.test(id) ? id : undefined;
}

const USER_ROLES: ReadonlySet<string> = new Set([OWNER_ROLES.coursePublish]);
const ADMIN_ROLES: ReadonlySet<string> = new Set([OWNER_ROLES.coursePublish, OWNER_ROLES.admin]);

function principalOf(user: PublicUser): OwnerPrincipal {
  return {
    ownerId: accountOwnerId(user.id),
    kind: 'user',
    roles: user.role === 'admin' ? ADMIN_ROLES : USER_ROLES,
    assurance: 'verified',
    channel: 'web',
  };
}

async function authenticate(headers: Headers): Promise<OwnerAuthMethodResult> {
  const token = sessionCookieValue(headers);
  if (token === undefined) return { status: 'not-applicable' };
  const session = await resolveSession(await accountsPool(), token, Date.now());
  if (session.state === 'valid' && session.user) {
    return { status: 'authenticated', principal: principalOf(session.user) };
  }
  return {
    status: 'invalid',
    reason: session.state === 'password-change' ? 'password change required' : 'session not valid',
  };
}

/**
 * The accounts owner method. The session cookie names the owner. A request
 * without one is not applicable, and with the anonymous fallback off it is refused.
 */
export const accountsAuthMethod: OwnerAuthMethod = {
  name: 'accounts',
  authenticate: (req) => authenticate(req.headers),
  authenticateFromContext: async () => {
    const { headers } = await import('next/headers');
    return authenticate(new Headers(await headers()));
  },
  describeStoredOwner: (ownerId) =>
    accountUserIdOf(ownerId) === undefined ? undefined : { kind: 'user', roles: USER_ROLES },
};
