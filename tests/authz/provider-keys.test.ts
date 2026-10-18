import { NextRequest } from 'next/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account; its role and membership
// come from this table. No database is involved.
type Role = 'learner' | 'operator' | 'admin';
const ACTIVE: MembershipView = {
  status: 'active',
  active: true,
  expiresAt: '2100-01-01T00:00:00.000Z',
  monthlyQuota: 1000,
};
const accounts = new Map<string, { role: Role; membership?: MembershipView }>();
const generateVideo = vi.fn();

vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => process.env.DATABASE_URL !== '',
  accountServiceDeps: async () => ({ db: {} }),
  resolveRequestAccount: async (headers: Headers) => {
    const id = /session=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1];
    const account = id ? accounts.get(id) : undefined;
    return id && account ? { accountId: id, username: id, role: account.role } : undefined;
  },
  registrationOpen: () => false,
}));

vi.mock('@/lib/server/learning/store', () => ({
  readMembership: async (_db: unknown, accountId: string) => accounts.get(accountId)?.membership,
  readBonusTokens: async () => 0,
}));

vi.mock('@/lib/server/usage-storage', () => ({
  monthlyLlmTokens: async () => 0,
  recordGenerationUsage: async () => undefined,
}));

vi.mock('@/lib/media/video-providers', () => ({
  generateVideo,
  normalizeVideoOptions: (options: unknown) => options,
}));

function request(
  url: string,
  init: { cookie?: string; headers?: Record<string, string>; body?: unknown },
) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...init.headers,
    },
    body: JSON.stringify(init.body ?? {}),
  });
}

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://provider-keys-test');
  accounts.clear();
  accounts.set('learner-member', { role: 'learner', membership: ACTIVE });
  accounts.set('operator-1', { role: 'operator' });
  accounts.set('admin-1', { role: 'admin' });
  generateVideo.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('clientKeysAllowed', () => {
  it('allows a client key when accounts are off, because there is no identity to check', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { clientKeysAllowed } = await import('@/lib/server/authz/provider-keys');
    expect(await clientKeysAllowed(new Headers())).toBe(true);
  });

  it('allows only an administrator, never a visitor, a learner or an operator', async () => {
    const { clientKeysAllowed } = await import('@/lib/server/authz/provider-keys');
    expect(await clientKeysAllowed(new Headers())).toBe(false);
    expect(await clientKeysAllowed(new Headers({ cookie: 'session=learner-member' }))).toBe(false);
    expect(await clientKeysAllowed(new Headers({ cookie: 'session=operator-1' }))).toBe(false);
    expect(await clientKeysAllowed(new Headers({ cookie: 'session=admin-1' }))).toBe(true);
  });
});

describe('client keys on routes', () => {
  it('a learner’s key for an unmanaged video provider is ignored, so the server answers MISSING_API_KEY', async () => {
    const { POST } = await import('@/app/api/generate/video/route');
    const response = await POST(
      request('http://localhost/api/generate/video', {
        cookie: 'session=learner-member',
        headers: { 'x-video-provider': 'unmanaged-video-test', 'x-api-key': 'learner-own-key' },
        body: { prompt: 'a lesson' },
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('MISSING_API_KEY');
    expect(generateVideo).not.toHaveBeenCalled();
  });

  it('a visitor with no session cannot probe a custom provider endpoint', async () => {
    const { POST } = await import('@/app/api/provider/probe-models/route');
    const response = await POST(
      request('http://localhost/api/provider/probe-models', {
        body: { baseUrl: 'https://example.invalid/v1', apiKey: 'visitor-key' },
      }),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('FORBIDDEN');
  });

  it('a learner cannot probe a custom provider endpoint either', async () => {
    const { POST } = await import('@/app/api/provider/probe-models/route');
    const response = await POST(
      request('http://localhost/api/provider/probe-models', {
        cookie: 'session=learner-member',
        body: { baseUrl: 'https://example.invalid/v1', apiKey: 'learner-key' },
      }),
    );
    expect(response.status).toBe(403);
  });

  it('an administrator passes the gate and reaches the endpoint check', async () => {
    const { POST } = await import('@/app/api/provider/probe-models/route');
    const response = await POST(
      request('http://localhost/api/provider/probe-models', {
        cookie: 'session=admin-1',
        body: {},
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).errorCode).toBe('MISSING_REQUIRED_FIELD');
  });
});
