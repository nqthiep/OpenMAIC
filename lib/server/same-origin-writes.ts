/**
 * A browser request that changes something under `/api` must come from this origin.
 *
 * A sibling hostname such as the OmniRoute dashboard is the same site, not the same origin, so the
 * browser still attaches the session cookie (SameSite=Lax) to whatever a page there sends to the app,
 * and a simple request needs no CORS preflight. `Sec-Fetch-Site` tells the two apart. A request
 * without the header (curl, a server, the render service, a very old browser) is not refused: it
 * carries no cookie of a signed-in victim.
 */
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isCrossOriginWrite(
  method: string,
  pathname: string,
  secFetchSite: string | null,
): boolean {
  return (
    pathname.startsWith('/api/') &&
    !READ_ONLY_METHODS.has(method.toUpperCase()) &&
    secFetchSite !== null &&
    secFetchSite !== 'same-origin'
  );
}
