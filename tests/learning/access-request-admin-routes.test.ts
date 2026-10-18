import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account; its role and membership
// come from this table. The store functions the routes call are stubs that record their input.
type Role = 'learner' | 'operator' | 'admin';
const ACTIVE: MembershipView = {
  status: 'active',
  active: true,
  expiresAt: '2100-01-01T00:00:00.000Z',
  monthlyQuota: 1_000_000,
};
const SUSPENDED: MembershipView = { ...ACTIVE, status: 'suspended', active: false };
const accounts = new Map<string, { role: Role; membership?: MembershipView }>();
const TARGET = '0f0f0f0f-1111-4222-8333-444444444444';

const mocks = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }));

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
  listPendingAccessRequests: mocks.list,
  decideAccessRequest: mocks.decide,
}));

function call(method: 'GET' | 'POST', cookie?: string, body?: unknown): Request {
  return new Request('http://localhost/api/admin/access-requests', {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (accountId: string) => ({ params: Promise.resolve({ accountId }) });

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://access-request-admin-test');
  accounts.clear();
  accounts.set('plain', { role: 'learner' });
  accounts.set('member', { role: 'learner', membership: ACTIVE });
  accounts.set('operator-1', { role: 'operator' });
  accounts.set(TARGET, { role: 'learner' });
  mocks.list.mockReset();
  mocks.decide.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/admin/access-requests', () => {
  const ROW = {
    accountId: TARGET,
    username: 'alice',
    note: null,
    requestedAt: '2026-10-17T00:00:00.000Z',
    membership: 'none',
  };

  it('lists the pending requests for staff', async () => {
    mocks.list.mockResolvedValue([ROW]);
    const { GET } = await import('@/app/api/admin/access-requests/route');
    const response = await GET(call('GET', 'session=operator-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).requests).toEqual([ROW]);
  });

  it('refuses a learner, even a member, and a visitor', async () => {
    const { GET } = await import('@/app/api/admin/access-requests/route');
    expect((await GET(call('GET', 'session=member'))).status).toBe(403);
    expect((await GET(call('GET', 'session=plain'))).status).toBe(403);
    expect((await GET(call('GET'))).status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/access-requests/[accountId]', () => {
  it('approves with the default membership and records the actor', async () => {
    mocks.decide.mockResolvedValue(true);
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const response = await POST(
      call('POST', 'session=operator-1', { decision: 'approve' }),
      params(TARGET),
    );
    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        actorId: 'operator-1',
        accountId: TARGET,
        decision: 'approve',
        days: 30,
        monthlyQuota: 1_000_000,
        reason: undefined,
      }),
    );
  });

  it('rejects with a reason', async () => {
    mocks.decide.mockResolvedValue(true);
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const response = await POST(
      call('POST', 'session=operator-1', { decision: 'reject', reason: 'unknown person' }),
      params(TARGET),
    );
    expect(response.status).toBe(200);
    expect(mocks.decide).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ decision: 'reject', reason: 'unknown person' }),
    );
  });

  it('answers 404 when no request is pending for the account', async () => {
    mocks.decide.mockResolvedValue(false);
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const response = await POST(
      call('POST', 'session=operator-1', { decision: 'approve' }),
      params(TARGET),
    );
    expect(response.status).toBe(404);
    expect((await response.json()).errorCode).toBe('NOT_FOUND');
  });

  it('does not approve a suspended membership', async () => {
    accounts.set(TARGET, { role: 'learner', membership: SUSPENDED });
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const response = await POST(
      call('POST', 'session=operator-1', { decision: 'approve' }),
      params(TARGET),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe('MEMBERSHIP_SUSPENDED');
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('may still reject the request of a suspended account', async () => {
    accounts.set(TARGET, { role: 'learner', membership: SUSPENDED });
    mocks.decide.mockResolvedValue(true);
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const response = await POST(
      call('POST', 'session=operator-1', { decision: 'reject' }),
      params(TARGET),
    );
    expect(response.status).toBe(200);
  });

  it('refuses a bad id, a bad decision, a long reason and a reason that is not text', async () => {
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const as = (body: unknown, id = TARGET) =>
      POST(call('POST', 'session=operator-1', body), params(id));
    expect((await as({ decision: 'approve' }, 'not-an-id')).status).toBe(400);
    expect((await as({ decision: 'maybe' })).status).toBe(400);
    expect((await as({})).status).toBe(400);
    expect((await as({ decision: 'reject', reason: 'x'.repeat(201) })).status).toBe(400);
    expect((await as({ decision: 'reject', reason: 7 })).status).toBe(400);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it('refuses a learner and a visitor', async () => {
    const { POST } = await import('@/app/api/admin/access-requests/[accountId]/route');
    const body = { decision: 'approve' };
    expect((await POST(call('POST', 'session=member', body), params(TARGET))).status).toBe(403);
    expect((await POST(call('POST', 'session=plain', body), params(TARGET))).status).toBe(403);
    expect((await POST(call('POST', undefined, body), params(TARGET))).status).toBe(401);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
