import { afterEach, describe, expect, it, vi } from 'vitest';

const answer = {
  success: true,
  enabled: true,
  registrationOpen: true,
  authenticated: false,
};

async function freshApi() {
  vi.resetModules();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 })),
  );
  return import('@/components/account/account-api');
}

afterEach(() => vi.unstubAllGlobals());

describe('the remembered session', () => {
  it('is empty before the first answer, so a first load renders what the server rendered', async () => {
    const api = await freshApi();
    expect(api.peekSharedSession()).toBeUndefined();
  });

  it('is the last answer once the server has given one, so the next page paints with it', async () => {
    const api = await freshApi();
    const session = await api.loadSharedSession();
    expect(api.peekSharedSession()).toEqual(session);
    expect(api.peekSharedSession()?.authenticated).toBe(false);
  });

  it('is forgotten when the session changes, so a stale sign-in is not painted', async () => {
    const api = await freshApi();
    await api.loadSharedSession();
    api.sessionChanged();
    expect(api.peekSharedSession()).toBeUndefined();
  });
});
