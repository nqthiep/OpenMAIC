import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account; its role and membership
// come from this table. The request store is a stub that records what the route asks of it.
type Role = 'learner' | 'operator' | 'admin';
const ACTIVE: MembershipView = {
  status: 'active',
  active: true,
  expiresAt: '2100-01-01T00:00:00.000Z',
  monthlyQuota: 1_000_000,
  cycle: {
    start: '2026-10-01T00:00:00.000Z',
    end: '2100-01-01T00:00:00.000Z',
    key: '2026-10-01T00:00:00.000Z',
  },
};
const accounts = new Map<string, { role: Role; membership?: MembershipView }>();

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  read: vi.fn(),
}));

vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => process.env.DATABASE_URL !== '',
  accountServiceDeps: async () => ({ db: {} }),
  resolveRequestAccount: async (headers: Headers) => {
    const id = /session=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1];
    const account = id ? accounts.get(id) : undefined;
    return id && account ? { accountId: id, username: id, role: account.role } : undefined;
  },
  registrationOpen: () => true,
}));

vi.mock('@/lib/server/learning/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/learning/store')>()),
  readMembership: async (_db: unknown, accountId: string) => accounts.get(accountId)?.membership,
  readBonusTokens: async () => 0,
  readCourseShare: async () => undefined,
  isCoursePreview: async () => false,
  isCourseInClassOf: async () => false,
  recordCourseRead: async () => 0,
  readRenderJobOwner: async () => undefined,
  createAccessRequest: mocks.create,
  readAccessRequest: mocks.read,
}));

function call(method: 'GET' | 'POST', cookie?: string, body?: unknown): Request {
  return new Request('http://localhost/api/membership/request', {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const PENDING = {
  state: 'pending',
  note: 'hello',
  requestedAt: '2026-10-17T00:00:00.000Z',
  decidedAt: null,
};

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://access-request-test');
  accounts.clear();
  accounts.set('plain', { role: 'learner' });
  accounts.set('member', { role: 'learner', membership: ACTIVE });
  // Ends in three days: inside the 7-day renewal window.
  accounts.set('ending', {
    role: 'learner',
    membership: { ...ACTIVE, expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString() },
  });
  accounts.set('operator-1', { role: 'operator' });
  mocks.create.mockReset();
  mocks.read.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/membership/request', () => {
  it('opens a request for a learner without a membership and trims the note', async () => {
    mocks.create.mockResolvedValue({ ok: true, request: PENDING });
    const { POST } = await import('@/app/api/membership/request/route');
    const response = await POST(call('POST', 'session=plain', { note: '  hello  ' }));
    expect(response.status).toBe(201);
    expect((await response.json()).request).toEqual(PENDING);
    expect(mocks.create).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ accountId: 'plain', note: 'hello' }),
    );
  });

  it('sends no note when it is empty or only spaces', async () => {
    mocks.create.mockResolvedValue({ ok: true, request: PENDING });
    const { POST } = await import('@/app/api/membership/request/route');
    await POST(call('POST', 'session=plain', { note: '   ' }));
    await POST(call('POST', 'session=plain', {}));
    expect(mocks.create.mock.calls.map((args) => args[1].note)).toEqual([undefined, undefined]);
  });

  it('refuses a visitor with no session', async () => {
    const { POST } = await import('@/app/api/membership/request/route');
    const response = await POST(call('POST', undefined, {}));
    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses staff, who need no membership', async () => {
    const { POST } = await import('@/app/api/membership/request/route');
    const response = await POST(call('POST', 'session=operator-1', {}));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('FORBIDDEN');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('tells an active member that they already have one', async () => {
    const { POST } = await import('@/app/api/membership/request/route');
    const response = await POST(call('POST', 'session=member', {}));
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe('ALREADY_MEMBER');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('lets a member whose membership ends within 7 days ask to renew it', async () => {
    mocks.create.mockResolvedValue({ ok: true, request: PENDING });
    const { POST } = await import('@/app/api/membership/request/route');
    const response = await POST(call('POST', 'session=ending', {}));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it.each([
    ['MEMBERSHIP_SUSPENDED', 403],
    ['REQUEST_PENDING', 409],
    ['REQUEST_TOO_SOON', 429],
  ] as const)('maps the store refusal %s to status %s', async (reason, status) => {
    mocks.create.mockResolvedValue({ ok: false, reason });
    const { POST } = await import('@/app/api/membership/request/route');
    const response = await POST(call('POST', 'session=plain', {}));
    expect(response.status).toBe(status);
    expect((await response.json()).errorCode).toBe(reason);
  });

  it('refuses a note over 280 characters and one that is not text', async () => {
    const { POST } = await import('@/app/api/membership/request/route');
    expect((await POST(call('POST', 'session=plain', { note: 'x'.repeat(281) }))).status).toBe(400);
    expect((await POST(call('POST', 'session=plain', { note: 5 }))).status).toBe(400);
    expect((await POST(call('POST', 'session=plain', { note: 'x'.repeat(280) }))).status).not.toBe(
      400,
    );
  });

  it('refuses a cross-site request', async () => {
    const { POST } = await import('@/app/api/membership/request/route');
    const cross = new Request('http://localhost/api/membership/request', {
      method: 'POST',
      headers: {
        cookie: 'session=plain',
        'content-type': 'application/json',
        'sec-fetch-site': 'cross-site',
      },
      body: '{}',
    });
    expect((await POST(cross)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('answers not configured when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { POST } = await import('@/app/api/membership/request/route');
    expect((await POST(call('POST', 'session=plain', {}))).status).toBe(404);
  });
});

describe('GET /api/membership/request', () => {
  it('returns null when the learner never asked', async () => {
    mocks.read.mockResolvedValue(undefined);
    const { GET } = await import('@/app/api/membership/request/route');
    const body = await (await GET(call('GET', 'session=plain'))).json();
    expect(body).toMatchObject({ request: null, retryAt: null });
  });

  it('returns the pending request without a retry time', async () => {
    mocks.read.mockResolvedValue(PENDING);
    const { GET } = await import('@/app/api/membership/request/route');
    const body = await (await GET(call('GET', 'session=plain'))).json();
    expect(body).toMatchObject({ request: PENDING, retryAt: null });
  });

  it('gives the moment a rejected learner may ask again, 24 hours after the decision', async () => {
    mocks.read.mockResolvedValue({
      state: 'rejected',
      note: null,
      requestedAt: '2026-10-17T00:00:00.000Z',
      decidedAt: '2026-10-17T10:00:00.000Z',
    });
    const { GET } = await import('@/app/api/membership/request/route');
    const body = await (await GET(call('GET', 'session=plain'))).json();
    expect(body.retryAt).toBe('2026-10-18T10:00:00.000Z');
  });

  it('refuses a visitor with no session', async () => {
    const { GET } = await import('@/app/api/membership/request/route');
    expect((await GET(call('GET'))).status).toBe(401);
  });
});
