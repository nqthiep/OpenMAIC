import { afterEach, describe, expect, it, vi } from 'vitest';

type FetchCall = [string, RequestInit | undefined];

async function api(answer: Record<string, unknown>) {
  vi.resetModules();
  const fetchMock = vi.fn(
    async (_path: string, _init?: RequestInit) =>
      new Response(JSON.stringify(answer), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const accountApi = await import('@/components/account/account-api');
  const bodyOfCall = (index: number) =>
    JSON.parse(String((fetchMock.mock.calls as FetchCall[])[index]?.[1]?.body));
  return { accountApi, fetchMock, bodyOfCall };
}

const credentials = { username: 'minh.an', password: 'a long enough password' };
const signedIn = { success: true, account: { username: 'minh.an' } };

afterEach(() => vi.unstubAllGlobals());

describe('creating an account from the browser', () => {
  it('sends what the person ticked, so the server can refuse a missing agreement', async () => {
    const { accountApi, bodyOfCall } = await api(signedIn);
    await accountApi.createAccount(credentials, true);
    expect(bodyOfCall(0)).toEqual({ ...credentials, acceptedTerms: true });
  });

  it('sends false as false rather than leaving the field out', async () => {
    const { accountApi, bodyOfCall } = await api(signedIn);
    await accountApi.createAccount(credentials, false);
    expect(bodyOfCall(0).acceptedTerms).toBe(false);
  });

  it('does not send an agreement when signing in', async () => {
    const { accountApi, bodyOfCall } = await api(signedIn);
    await accountApi.signIn(credentials);
    expect(bodyOfCall(0)).toEqual(credentials);
  });
});

describe('the length of the free first month in the session', () => {
  const session = { success: true, enabled: true, registrationOpen: true, authenticated: false };

  it('is read from the server answer', async () => {
    const { accountApi } = await api({ ...session, trialDays: 30 });
    expect((await accountApi.fetchAccountSession()).trialDays).toBe(30);
  });

  it('is 0 when the server names none, so no promise of a trial is shown', async () => {
    const { accountApi } = await api(session);
    expect((await accountApi.fetchAccountSession()).trialDays).toBe(0);
  });

  it('is 0 for anything that is not a positive number', async () => {
    for (const trialDays of [-3, '30', null]) {
      const { accountApi } = await api({ ...session, trialDays });
      expect((await accountApi.fetchAccountSession()).trialDays, String(trialDays)).toBe(0);
    }
  });
});
