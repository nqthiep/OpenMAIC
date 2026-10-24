/**
 * KHAITAM's owner auth method: a signed-in account.
 *
 * A request with a live session cookie is the account's owner (`acct:<id>`); the roles are the
 * ones a principal can hold in core: `course:publish` for every account (an anonymous owner may
 * not publish, an account may) and `admin` for an effective administrator. A request without a
 * session cookie is not this method's to answer, so the anonymous cookie takes it. A request whose
 * well-formed session cookie no longer resolves to a live account (expired, revoked, or the account
 * disabled) while accounts are on has ended its session: it is refused with `401 SESSION_ENDED` and
 * the cookie is cleared, never answered as a fresh anonymous owner, because its work would land
 * in a different partition. Registered from `instrumentation.ts`.
 */
import { accountOwnerId, ACCOUNT_OWNER_PREFIX } from '@/lib/server/accounts/service';
import { accountsEnabled, resolveRequestAccount } from '@/lib/server/accounts/runtime';
import { clearSessionCookieHeader, readSessionCookie } from '@/lib/server/accounts/session';
import { effectiveRole } from '@/lib/server/authz/roles';
import { apiError } from '@/lib/server/api-response';
import { OWNER_ROLES, type OwnerAuthMethod, type OwnerAuthRequest } from '@/lib/server/identity';

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

export const accountSessionAuthMethod: OwnerAuthMethod = {
  name: 'account-session',

  async authenticate(req: OwnerAuthRequest) {
    // No session cookie, or a malformed one: no configuration read and no database call, so the
    // anonymous path is exactly what it was. Accounts off: there is no session store to check.
    if (readSessionCookie(req.headers) === undefined || !accountsEnabled()) {
      return { status: 'not-applicable' } as const;
    }
    // A session store that cannot be checked throws: the request is a 500, and no anonymous
    // cookie is minted for it.
    const account = await resolveRequestAccount(req.headers);
    if (!account) {
      return {
        status: 'invalid',
        reason: 'session ended',
        respond: sessionEndedResponse,
      } as const;
    }
    const roles = new Set<string>([OWNER_ROLES.coursePublish]);
    if (effectiveRole(account.username, account.role) === 'admin') roles.add(OWNER_ROLES.admin);
    return {
      status: 'authenticated',
      principal: {
        ownerId: accountOwnerId(account.accountId),
        kind: 'user',
        roles,
        assurance: 'verified',
        channel: 'web',
      },
    } as const;
  },

  describeStoredOwner(ownerId: string) {
    return ownerId.startsWith(ACCOUNT_OWNER_PREFIX) ? { kind: 'user' } : undefined;
  },
};
