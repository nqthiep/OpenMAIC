import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account. Its role and membership come
// from this table. The counts and the month's usage are fixed. No database is involved.
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
  readBonusTokens: async () => 20_000,
  readCourseShare: async () => undefined,
  isCoursePreview: async () => false,
  isCourseInClassOf: async () => false,
  recordCourseRead: async () => 0,
  readRenderJobOwner: async () => undefined,
  readDashboardCounts: async () => ({
    activeMembers: 2,
    pendingShares: 1,
    pendingAccessRequests: 4,
    classes: 3,
  }),
  listAllClasses: async () => [],
  readOpsHealthFacts: async () => ({
    memberships: { active: 2, expiringSoon: 0, expired: 0, suspended: 0, none: 1 },
    accounts: { learner: 3, operator: 1, admin: 0, disabled: 0 },
    accessRequests: { pending: 4, approved: 0, rejected: 0 },
    shares: { pending: 1, shared: 0 },
    previews: 0,
    oldestPendingAccessRequest: null,
    oldestPendingShare: null,
    expiring: [],
    metered: [],
    bonusByOwner: new Map(),
  }),
}));

vi.mock('@/lib/server/learning/support', () => ({
  countWaitingSupportThreads: async () => 2,
}));

vi.mock('@/lib/server/learning/course-snapshot', () => ({
  countPendingShareUpdates: async () => 0,
}));

vi.mock('@/lib/server/learning/community', () => ({
  countOpenReports: async () => 1,
  isBanned: async () => false,
}));

vi.mock('@/lib/server/usage-storage', () => ({
  llmTokensBetween: async () => 1234,
  readUsageRecords: async () => [],
}));

function request(cookie?: string): Request {
  return new Request('http://localhost/api/x', { headers: cookie ? { cookie } : {} });
}

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://role-endpoints-test');
  accounts.clear();
  accounts.set('learner-plain', { role: 'learner' });
  accounts.set('learner-member', { role: 'learner', membership: ACTIVE });
  accounts.set('operator-1', { role: 'operator' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/admin/health', () => {
  it('gives the counts to staff', async () => {
    const { GET } = await import('@/app/api/admin/health/route');
    const response = await GET(request('session=operator-1'));
    expect(response.status).toBe(200);
    expect((await response.json()).health.counts).toEqual({
      activeMembers: 2,
      pendingShares: 1,
      pendingAccessRequests: 4,
      classes: 3,
      supportWaiting: 2,
      openReports: 1,
    });
  });

  it('refuses a learner, even one with a membership', async () => {
    const { GET } = await import('@/app/api/admin/health/route');
    const response = await GET(request('session=learner-member'));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('FORBIDDEN');
  });

  it('refuses a visitor with no session', async () => {
    const { GET } = await import('@/app/api/admin/health/route');
    expect((await GET(request())).status).toBe(401);
  });

  it('answers not configured when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { GET } = await import('@/app/api/admin/health/route');
    expect((await GET(request())).status).toBe(404);
  });
});

describe('GET /api/membership/usage', () => {
  it('gives an active member the quota, the reader bonus, the use and the end of the cycle', async () => {
    const { GET } = await import('@/app/api/membership/usage/route');
    const body = await (await GET(request('session=learner-member'))).json();
    expect(body).toMatchObject({
      active: true,
      quota: 1_000_000,
      bonus: 20_000,
      used: 1234,
      cycleStart: ACTIVE.cycle!.start,
      cycleEnd: ACTIVE.cycle!.end,
    });
  });

  it('tells a learner without a membership that there is no allowance', async () => {
    const { GET } = await import('@/app/api/membership/usage/route');
    const body = await (await GET(request('session=learner-plain'))).json();
    expect(body.active).toBe(false);
    expect(body).not.toHaveProperty('quota');
  });

  it('tells a visitor with no session that there is no allowance', async () => {
    const { GET } = await import('@/app/api/membership/usage/route');
    const body = await (await GET(request())).json();
    expect(body.active).toBe(false);
  });
});
