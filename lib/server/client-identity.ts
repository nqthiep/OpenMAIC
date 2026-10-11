/**
 * Derive a client identity for per-identity guards shared by API routes.
 *
 * `x-forwarded-for` / `x-real-ip` are only trustworthy when a trusted reverse
 * proxy sets them; if the app is exposed directly (as the default Compose does),
 * a client can rotate them to defeat the guard. So we only honor them when
 * `TRUST_PROXY_HEADERS=true` is set by the operator (who then must ensure a real
 * proxy overwrites the headers). Otherwise every caller collapses to a single
 * `direct` bucket — a conservative shared limit rather than a spoofable one.
 */

/**
 * Whether forwarding headers may be trusted to identify a client. Single source
 * of truth for the `TRUST_PROXY_HEADERS` rule so per-identity guards and
 * {@link clientIdentity} cannot drift into disagreeing about what "trusted"
 * means. Only the exact string `'true'` opts in.
 */
export function isTrustedProxyIdentity(): boolean {
  return process.env.TRUST_PROXY_HEADERS === 'true';
}

/**
 * The client's identity. From `X-Forwarded-For` the last entry, which the nearest proxy
 * appends: the entries before it came from the client and can be forged. The accounts
 * throttle reads the same entry (`lib/accounts/http.ts`).
 */
export function clientIdentity(req: Pick<Request, 'headers'>): string {
  if (!isTrustedProxyIdentity()) return 'direct';
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',').pop()?.trim() || 'anonymous';
  return req.headers.get('x-real-ip')?.trim() || 'anonymous';
}
