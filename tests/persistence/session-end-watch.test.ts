import { describe, expect, it, vi } from 'vitest';

import { SESSION_ENDED_EVENT, watchForEndedSessions } from '@/lib/persistence/session-end';

/** A window stand-in with a fetch that answers with the given response, and a recorder for dispatched events. */
function fakeWindow(answer: () => Response) {
  const dispatched: string[] = [];
  const target = {
    location: { href: 'https://classroom.example.edu/classroom/abc' },
    fetch: vi.fn(async () => answer()) as unknown as typeof fetch,
    dispatchEvent(event: Event) {
      dispatched.push(event.type);
      return true;
    },
  };
  return { target, dispatched };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('watchForEndedSessions', () => {
  it('dispatches once for a 401 SESSION_ENDED from this origin, and returns the response unchanged', async () => {
    const { target, dispatched } = fakeWindow(() =>
      json(401, { success: false, errorCode: 'SESSION_ENDED', error: 'Sign in again.' }),
    );
    const restore = watchForEndedSessions(target);

    const response = await target.fetch('/api/stages/abc/freshness');

    expect(dispatched).toEqual([SESSION_ENDED_EVENT]);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'SESSION_ENDED' });
    restore();
  });

  it('does not dispatch for other 401s, other statuses, other origins, non-API paths or non-JSON bodies', async () => {
    const cases: Array<[string, () => Response, string]> = [
      ['another 401 code', () => json(401, { errorCode: 'UNAUTHENTICATED' }), '/api/stages'],
      ['a 403 with the same code', () => json(403, { errorCode: 'SESSION_ENDED' }), '/api/stages'],
      ['a 200', () => json(200, { errorCode: 'SESSION_ENDED' }), '/api/stages'],
      [
        'a 401 from another origin',
        () => json(401, { errorCode: 'SESSION_ENDED' }),
        'https://other.example/api/x',
      ],
      ['a 401 outside /api', () => json(401, { errorCode: 'SESSION_ENDED' }), '/classroom/abc'],
      [
        'a 401 with an HTML body',
        () => new Response('<html>denied</html>', { status: 401 }),
        '/api/stages',
      ],
    ];
    for (const [, answer, path] of cases) {
      const { target, dispatched } = fakeWindow(answer);
      const restore = watchForEndedSessions(target);

      const response = await target.fetch(path);

      expect(dispatched).toEqual([]);
      expect(response.status).toBeGreaterThan(0);
      restore();
    }
  });

  it('removes the wrapper when the uninstall function runs', async () => {
    const { target, dispatched } = fakeWindow(() => json(401, { errorCode: 'SESSION_ENDED' }));
    const original = target.fetch;
    const restore = watchForEndedSessions(target);
    expect(target.fetch).not.toBe(original);

    restore();
    expect(target.fetch).toBe(original);
    await target.fetch('/api/stages');
    expect(dispatched).toEqual([]);
  });
});
