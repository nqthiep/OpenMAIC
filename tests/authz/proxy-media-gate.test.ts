import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Accounts are on. Any `session=<id>` cookie is a signed-in account; no database is involved.
vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => process.env.DATABASE_URL !== '',
  accountServiceDeps: async () => ({ db: {} }),
  resolveRequestAccount: async (headers: Headers) =>
    headers.get('cookie')?.includes('session=')
      ? { accountId: 'a-learner', username: 'learner', role: 'learner' }
      : undefined,
  registrationOpen: () => false,
}));

vi.mock('@/lib/server/ssrf-guard', () => ({ validateUrlForSSRF: async () => null }));

async function postProxy(cookie?: string): Promise<Response> {
  const { POST } = await import('@/app/api/proxy-media/route');
  const req = new Request('http://localhost/api/proxy-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ url: 'https://example.com/image.png' }),
  });
  return POST(req as unknown as NextRequest);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', 'postgres://proxy-media-gate-test');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2]), { headers: { 'Content-Type': 'image/png' } }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/proxy-media with accounts on', () => {
  it('refuses a visitor with no session before fetching anything', async () => {
    const response = await postProxy();
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('LOGIN_REQUIRED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serves a signed-in account', async () => {
    const response = await postProxy('session=token');
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('needs no session when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const response = await postProxy();
    expect(response.status).toBe(200);
  });
});
