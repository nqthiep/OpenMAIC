/**
 * The origin that generated links (share links, media URLs, poll URLs) are built on.
 *
 * PUBLIC_APP_ORIGIN, an origin such as `https://classroom.example.edu` with no path,
 * is authoritative when set: forwarded headers are then ignored. A set but invalid
 * value also ignores forwarded headers, and falls back to this server's own origin
 * until it is fixed. When unset, the forwarded host is trusted as it was before.
 */
import type { NextRequest } from 'next/server';

/** The configured origin, or undefined when the value is not a bare http(s) origin. */
export function parsePublicAppOrigin(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (url.username || url.password || url.search || url.hash) return undefined;
  if (url.pathname !== '/') return undefined;
  return url.origin;
}

export function requestPublicOrigin(req: NextRequest): string {
  const configured = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (configured) return parsePublicAppOrigin(configured) ?? req.nextUrl.origin;

  const forwardedHost = req.headers.get('x-forwarded-host');
  if (forwardedHost) {
    return `${req.headers.get('x-forwarded-proto') || 'http'}://${forwardedHost}`;
  }
  return req.nextUrl.origin;
}
