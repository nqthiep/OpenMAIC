/**
 * What the gate asks of the rest of the app: whether an account still administers it, and a
 * server-side sign-in to OmniRoute so the administrator is not asked for a second password.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { can } from '@/lib/server/authz/policy';
import { effectiveRole, type AccountRole } from '@/lib/server/authz/roles';

import type { OmniRouteConfig } from './config';

/** Whether the account exists, is not disabled and acts as an administrator right now. */
export async function isActiveAdmin(db: AccountQueryable, accountId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT username, role, disabled_at IS NOT NULL AS disabled FROM accounts WHERE id = $1::text`,
    [accountId],
  );
  const row = result.rows[0] as
    | { username: string; role: AccountRole; disabled: boolean }
    | undefined;
  if (!row || row.disabled) return false;
  return can({ accountId, role: effectiveRole(row.username, row.role) }, 'provider.manage');
}

const CHECK_TTL_MS = 15_000;
const checked = new Map<string, { ok: boolean; at: number }>();

/**
 * `isActiveAdmin` remembered for 15 seconds: the dashboard loads many files per page and each one
 * asks. A demoted or disabled administrator loses access within that time.
 */
export async function isActiveAdminCached(
  db: AccountQueryable,
  accountId: string,
  now = Date.now(),
): Promise<boolean> {
  const hit = checked.get(accountId);
  if (hit && now - hit.at < CHECK_TTL_MS) return hit.ok;
  const ok = await isActiveAdmin(db, accountId);
  checked.set(accountId, { ok, at: now });
  return ok;
}

/**
 * Signs in to OmniRoute's dashboard with the configured password and returns the `auth_token`
 * Set-Cookie value to hand to the browser, or undefined when OmniRoute refuses or is unreachable.
 * Only that one cookie is relayed. The response body and the password are never read or logged.
 */
export async function signInToOmniRoute(
  config: OmniRouteConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(`${config.internalUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: config.adminPassword }),
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return undefined;
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith('auth_token='));
    if (!cookie) return undefined;
    // The browser reaches the dashboard over https even though OmniRoute answered over http.
    return config.publicUrl.startsWith('https:') && !/;\s*secure/i.test(cookie)
      ? `${cookie}; Secure`
      : cookie;
  } catch {
    return undefined;
  }
}

/** A short plain-text refusal that a browser can show as it is. */
export function refusal(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
