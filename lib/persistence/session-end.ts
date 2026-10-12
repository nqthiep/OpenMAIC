/**
 * Tells the page when the server reports that a signed-in session has ended.
 *
 * The server answers 401 with errorCode SESSION_ENDED and clears the cookie. A
 * window event lets the learner key and the account control respond at once,
 * instead of every save failing one request at a time. Only 401s from this
 * origin's API are read. Every other response passes through untouched.
 */
export const SESSION_ENDED_EVENT = 'openmaic:session-ended';

export interface WatchableWindow {
  readonly location: { readonly href: string };
  fetch: typeof fetch;
  dispatchEvent(event: Event): boolean;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isSameOriginApi(input: RequestInfo | URL, pageHref: string): boolean {
  const page = new URL(pageHref);
  const target = new URL(requestUrl(input), page);
  return target.origin === page.origin && target.pathname.startsWith('/api/');
}

async function isSessionEndedBody(response: Response): Promise<boolean> {
  const body: unknown = await response
    .clone()
    .json()
    .catch(() => undefined);
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { errorCode?: unknown }).errorCode === 'SESSION_ENDED'
  );
}

/** Wraps fetch so a SESSION_ENDED answer dispatches SESSION_ENDED_EVENT. Returns the uninstall. */
export function watchForEndedSessions(target: WatchableWindow): () => void {
  const original = target.fetch;
  const watched: typeof fetch = async (input, init) => {
    const response = await original.call(target, input, init);
    if (response.status !== 401 || !isSameOriginApi(input, target.location.href)) {
      return response;
    }
    if (await isSessionEndedBody(response)) {
      target.dispatchEvent(new Event(SESSION_ENDED_EVENT));
    }
    return response;
  };
  target.fetch = watched;
  return () => {
    if (target.fetch === watched) target.fetch = original;
  };
}
