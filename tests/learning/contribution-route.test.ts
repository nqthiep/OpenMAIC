import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account. The store is stubbed.
const RUNNING: MembershipView = {
  status: 'active',
  active: true,
  expiresAt: '2100-01-01T00:00:00.000Z',
  monthlyQuota: 1_000_000,
  cycle: {
    start: '2026-10-20T14:15:00.000Z',
    end: '2026-11-20T14:15:00.000Z',
    key: '2026-10-20T14:15:00.000Z',
  },
};
const accounts = new Map<string, { membership?: MembershipView }>();

vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => process.env.DATABASE_URL !== '',
  accountServiceDeps: async () => ({ db: {} }),
  resolveRequestAccount: async (headers: Headers) => {
    const id = /session=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1];
    return id && accounts.has(id) ? { accountId: id, username: id, role: 'learner' } : undefined;
  },
  registrationOpen: () => true,
}));

const SHARES = [
  { courseId: 'c1', title: 'Binary search', state: 'shared', readers: 11 },
  { courseId: 'c2', title: 'Fractions', state: 'pending', readers: 0 },
];

vi.mock('@/lib/server/learning/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/learning/store')>()),
  readMembership: async (_db: unknown, accountId: string) => accounts.get(accountId)?.membership,
  readCourseShare: async () => undefined,
  isCoursePreview: async () => false,
  isCourseInClassOf: async () => false,
  recordCourseRead: async () => 0,
  readRenderJobOwner: async () => undefined,
  listSharesByOwner: async (_db: unknown, ownerId: string) =>
    ownerId === 'acct:author' ? SHARES : [],
  listCourseTags: async (_db: unknown, ids: readonly string[]) =>
    new Map(ids.includes('c1') ? [['c1', ['subject:math', 'grade:12']]] : []),
  countDistinctReaders: async (_db: unknown, ownerId: string) =>
    ownerId === 'acct:author' ? 11 : 0,
  readBonusTokens: async (_db: unknown, ownerId: string) =>
    ownerId === 'acct:author' ? 220_000 : 0,
  readBadges: async (_db: unknown, ownerId: string) =>
    ownerId === 'acct:author' ? ['readers-10'] : [],
}));

const call = (cookie?: string) =>
  new Request('http://localhost/api/membership/contribution', {
    headers: cookie ? { cookie } : {},
  });

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://contribution-test');
  accounts.clear();
  accounts.set('author', { membership: RUNNING });
  accounts.set('newcomer', {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/membership/contribution', () => {
  it('gives an author their shares, readers, reward against the cap, badges and next badge', async () => {
    const { GET } = await import('@/app/api/membership/contribution/route');
    const response = await GET(call('session=author'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      // The tags staff gave a course come with it; a course without tags carries none.
      shares: [{ ...SHARES[0], tags: ['subject:math', 'grade:12'] }, SHARES[1]],
      readers: 11,
      bonus: { tokens: 220_000, cap: 200_000 },
      badges: ['readers-10'],
      next: { code: 'readers-100', readersNeeded: 89 },
    });
    expect(body.bonus.cycleStart).toBe(RUNNING.cycle!.start);
  });

  it('gives an account that never shared nothing, with the first badge as the next one', async () => {
    const { GET } = await import('@/app/api/membership/contribution/route');
    const body = await (await GET(call('session=newcomer'))).json();
    expect(body).toMatchObject({
      shares: [],
      readers: 0,
      bonus: { tokens: 0 },
      badges: [],
      next: { code: 'readers-10', readersNeeded: 10 },
    });
  });

  it('refuses a visitor with no session', async () => {
    const { GET } = await import('@/app/api/membership/contribution/route');
    expect((await GET(call())).status).toBe(401);
  });

  it('answers not configured when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { GET } = await import('@/app/api/membership/contribution/route');
    expect((await GET(call('session=author'))).status).toBe(404);
  });
});
