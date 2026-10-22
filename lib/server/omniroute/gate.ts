/**
 * What the gate asks of the rest of the app: whether an account still administers it, and a
 * server-side sign-in to OmniRoute so the administrator is not asked for a second password.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { can } from '@/lib/server/authz/policy';
import { effectiveRole, type AccountRole } from '@/lib/server/authz/roles';

import type { OmniRouteConfig } from './config';

/**
 * Whether the OpenMAIC session the gate was opened from is still live (not signed out, not
 * expired) and its account is an enabled administrator right now.
 */
export async function isActiveAdminSession(
  db: AccountQueryable,
  accountId: string,
  sessionKey: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db.query(
    `SELECT a.username, a.role
       FROM account_sessions s
       JOIN accounts a ON a.id = s.account_id
      WHERE s.account_id = $1::text
        AND left(s.token_hash, 32) = $2::text
        AND s.revoked_at IS NULL
        AND s.expires_at > $3::timestamptz
        AND a.disabled_at IS NULL`,
    [accountId, sessionKey, now.toISOString()],
  );
  const row = result.rows[0] as { username: string; role: AccountRole } | undefined;
  if (!row) return false;
  return can({ accountId, role: effectiveRole(row.username, row.role) }, 'provider.manage');
}

const CHECK_TTL_MS = 15_000;
const checked = new Map<string, { ok: boolean; at: number }>();

/**
 * `isActiveAdminSession` remembered for 15 seconds: the dashboard loads many files per page and
 * each one asks. After signing out of OpenMAIC, or being demoted or disabled, access ends within
 * that time.
 */
export async function isActiveAdminSessionCached(
  db: AccountQueryable,
  accountId: string,
  sessionKey: string,
  now = Date.now(),
): Promise<boolean> {
  const key = `${accountId}:${sessionKey}`;
  const hit = checked.get(key);
  if (hit && now - hit.at < CHECK_TTL_MS) return hit.ok;
  for (const [seen, entry] of checked) if (now - entry.at >= CHECK_TTL_MS) checked.delete(seen);
  const ok = await isActiveAdminSession(db, accountId, sessionKey, new Date(now));
  checked.set(key, { ok, at: now });
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
