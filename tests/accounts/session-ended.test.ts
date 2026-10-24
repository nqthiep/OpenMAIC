import { beforeEach, describe, expect, it, vi } from 'vitest';

// The account runtime is replaced so each case states whether accounts are on and
// whether the presented session resolves. The cookie parsing and the owner rules are real.
const account = vi.hoisted(() => ({
  enabled: true,
  resolve:
    vi.fn<
      (
        headers: Headers,
      ) => Promise<{ accountId: string; username: string; role: string } | undefined>
    >(),
}));

vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => account.enabled,
  resolveRequestAccount: (headers: Headers) => account.resolve(headers),
}));

import {
  accountSessionAuthMethod,
  sessionEndedResponse,
} from '@/lib/server/identity/host/account-session';
import { OWNER_ROLES } from '@/lib/server/identity';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { useAccountOwnerAuthentication } from '../helpers/account-owner-auth';

const TOKEN = 'a'.repeat(43);
const ANONYMOUS_UUID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

function headersWith(cookie: string | undefined): Headers {
  const headers = new Headers();
  if (cookie !== undefined) headers.set('cookie', cookie);
  return headers;
}

beforeEach(async () => {
  account.enabled = true;
  account.resolve.mockReset();
  account.resolve.mockResolvedValue(undefined);
  await useAccountOwnerAuthentication();
});

describe('the account session owner auth method', () => {
  it('refuses a well-formed cookie that no longer resolves while accounts are on', async () => {
    const result = await accountSessionAuthMethod.authenticate({
      headers: headersWith(`openmaic_session=${TOKEN}`),
    });

    expect(result.status).toBe('invalid');
  });

  it('authenticates a live session as the account owner, with the publish role', async () => {
    account.resolve.mockResolvedValue({ accountId: '42', username: 'learner', role: 'learner' });

    const result = await accountSessionAuthMethod.authenticate({
      headers: headersWith(`openmaic_session=${TOKEN}`),
    });

    expect(result).toMatchObject({
      status: 'authenticated',
      principal: { ownerId: 'acct:42', kind: 'user', assurance: 'verified' },
    });
    if (result.status !== 'authenticated') throw new Error('unreachable');
    expect(result.principal.roles.has(OWNER_ROLES.coursePublish)).toBe(true);
    expect(result.principal.roles.has(OWNER_ROLES.admin)).toBe(false);
  });

  it('adds the admin role for an administrator', async () => {
    account.resolve.mockResolvedValue({ accountId: '1', username: 'root', role: 'admin' });

    const result = await accountSessionAuthMethod.authenticate({
      headers: headersWith(`openmaic_session=${TOKEN}`),
    });

    if (result.status !== 'authenticated') throw new Error('expected authenticated');
    expect(result.principal.roles.has(OWNER_ROLES.admin)).toBe(true);
  });

  it('leaves malformed, duplicated and absent cookies to the anonymous owner, without a lookup', async () => {
    for (const cookie of [
      'openmaic_session=too-short',
      `openmaic_session=${TOKEN}; openmaic_session=${TOKEN}`,
      undefined,
    ]) {
      await expect(
        accountSessionAuthMethod.authenticate({ headers: headersWith(cookie) }),
      ).resolves.toEqual({ status: 'not-applicable' });
    }
    expect(account.resolve).not.toHaveBeenCalled();
  });

  it('is not applicable when accounts are off, even with a cookie present', async () => {
    account.enabled = false;

    await expect(
      accountSessionAuthMethod.authenticate({ headers: headersWith(`openmaic_session=${TOKEN}`) }),
    ).resolves.toEqual({ status: 'not-applicable' });
  });

  it('describes an account owner id as a user', () => {
    expect(accountSessionAuthMethod.describeStoredOwner?.('acct:7')).toEqual({ kind: 'user' });
    expect(
      accountSessionAuthMethod.describeStoredOwner?.(`anon:${ANONYMOUS_UUID}`),
    ).toBeUndefined();
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

describe('withRequestOwner for an ended session', () => {
  it('answers SESSION_ENDED without running the handler or minting an anonymous cookie', async () => {
    const handler = vi.fn(async () => new Response('ran'));

    const response = await withRequestOwner(
      { headers: headersWith(`openmaic_session=${TOKEN}`) },
      handler,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'SESSION_ENDED' });
    expect(handler).not.toHaveBeenCalled();
    expect(response.headers.get('Set-Cookie')).not.toContain('anonymous_id');
  });

  it('runs the handler as the anonymous owner for a request with no session cookie', async () => {
    const handler = vi.fn(async () => new Response('ran'));

    const response = await withRequestOwner({ headers: headersWith(undefined) }, handler);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: expect.stringMatching(/^anon:/), kind: 'anonymous' }),
      expect.any(Headers),
    );
  });

  it('runs the handler as the signed-in owner for a live session', async () => {
    account.resolve.mockResolvedValue({ accountId: '7', username: 'a', role: 'learner' });
    const handler = vi.fn(async () => new Response('ran'));

    await withRequestOwner({ headers: headersWith(`openmaic_session=${TOKEN}`) }, handler);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'acct:7', kind: 'user' }),
      expect.any(Headers),
    );
  });

  it('keeps an anonymous cookie as the owner, so a stale anonymous identity is not replaced', async () => {
    const handler = vi.fn(async () => new Response('ran'));

    await withRequestOwner({ headers: headersWith(`anonymous_id=${ANONYMOUS_UUID}`) }, handler);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: `anon:${ANONYMOUS_UUID}` }),
      expect.any(Headers),
    );
  });
});
