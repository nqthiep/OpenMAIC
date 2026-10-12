import { beforeEach, describe, expect, it, vi } from 'vitest';

// The account runtime is replaced so each case states whether accounts are on and
// whether the presented session resolves. The cookie parsing and the owner rules are real.
const account = vi.hoisted(() => ({
  enabled: true,
  resolveOwner: vi.fn<(headers: Headers) => Promise<string | undefined>>(),
}));

vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => account.enabled,
  resolveAuthenticatedOwnerId: (headers: Headers) => account.resolveOwner(headers),
}));

import {
  resolveSignedInSession,
  sessionEndedResponse,
  withRequestOwnerId,
} from '@/lib/server/agent-runtime/with-owner';

const TOKEN = 'a'.repeat(43);
const ANONYMOUS_UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

function headersWith(cookie: string | undefined): Headers {
  const headers = new Headers();
  if (cookie !== undefined) headers.set('cookie', cookie);
  return headers;
}

beforeEach(() => {
  account.enabled = true;
  account.resolveOwner.mockReset();
  account.resolveOwner.mockResolvedValue(undefined);
});

describe('resolveSignedInSession', () => {
  it('reports the session as ended when a well-formed cookie no longer resolves while accounts are on', async () => {
    const session = await resolveSignedInSession(headersWith(`openmaic_session=${TOKEN}`));

    expect(session).toEqual({ ownerId: undefined, ended: true });
  });

  it('reports a live session with its owner', async () => {
    account.resolveOwner.mockResolvedValue('acct:42');

    const session = await resolveSignedInSession(headersWith(`openmaic_session=${TOKEN}`));

    expect(session).toEqual({ ownerId: 'acct:42', ended: false });
  });

  it('keeps malformed, duplicated and absent cookies anonymous, without a lookup', async () => {
    for (const cookie of [
      'openmaic_session=too-short',
      `openmaic_session=${TOKEN}; openmaic_session=${TOKEN}`,
      undefined,
    ]) {
      await expect(resolveSignedInSession(headersWith(cookie))).resolves.toEqual({
        ownerId: undefined,
        ended: false,
      });
    }
    expect(account.resolveOwner).not.toHaveBeenCalled();
  });

  it('keeps the anonymous identity when accounts are off, even with a cookie present', async () => {
    account.enabled = false;

    const session = await resolveSignedInSession(headersWith(`openmaic_session=${TOKEN}`));

    expect(session).toEqual({ ownerId: undefined, ended: false });
  });
});

describe('sessionEndedResponse', () => {
  it('is a 401 with a stable code, no-store, and a Set-Cookie that clears the session', async () => {
    const response = sessionEndedResponse();

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const cookie = response.headers.get('Set-Cookie') ?? '';
    expect(cookie).toContain('openmaic_session=;');
    expect(cookie).toContain('Max-Age=0');
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'SESSION_ENDED',
    });
  });
});

describe('withRequestOwnerId for an ended session', () => {
  it('answers 401 without running the handler or minting an anonymous cookie', async () => {
    const handler = vi.fn(async () => new Response('ran'));

    const response = await withRequestOwnerId(
      { headers: headersWith(`openmaic_session=${TOKEN}`) },
      handler,
    );

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(response.headers.get('Set-Cookie')).not.toContain('anonymous_id');
  });

  it('runs the handler as the anonymous owner for a request with no session cookie', async () => {
    const handler = vi.fn(async () => new Response('ran'));

    const response = await withRequestOwnerId({ headers: headersWith(undefined) }, handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.stringMatching(/^anon:/),
      expect.any(Headers),
      false,
    );
  });

  it('runs the handler as the signed-in owner for a live session', async () => {
    account.resolveOwner.mockResolvedValue('acct:7');
    const handler = vi.fn(async () => new Response('ran'));

    await withRequestOwnerId({ headers: headersWith(`openmaic_session=${TOKEN}`) }, handler);

    expect(handler).toHaveBeenCalledWith('acct:7', expect.any(Headers), true);
  });

  it('keeps an anonymous cookie as the owner, so a stale anonymous identity is not replaced', async () => {
    const handler = vi.fn(async () => new Response('ran'));

    await withRequestOwnerId({ headers: headersWith(`anonymous_id=${ANONYMOUS_UUID}`) }, handler);

    expect(handler).toHaveBeenCalledWith(`anon:${ANONYMOUS_UUID}`, expect.any(Headers), false);
  });
});
