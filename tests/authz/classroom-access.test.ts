import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

const OWNER_COOKIE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_COOKIE_ID = '22222222-2222-4222-8222-222222222222';
const SIGNED_IN_ACCOUNT_ID = 'a-learner';

const OWNER_ID = `anon:${OWNER_COOKIE_ID}`;
const OTHER_OWNER_ID = `anon:${OTHER_COOKIE_ID}`;

// The sidecar read is replaced so these tests need no classrooms directory. The real files are
// covered by the storage tests below, which pass an explicit directory.
const records = new Map<string, { ownerId: string } | undefined>();

vi.mock('@/lib/server/classroom-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/classroom-storage')>();
  return {
    ...actual,
    readClassroomAccess: vi.fn(async (id: string) => records.get(id)),
  };
});

// A signed-in request is recognised here; no database is involved.
let signedInRole: 'learner' | 'operator' | 'admin' | undefined;
vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => process.env.DATABASE_URL !== '',
  accountServiceDeps: async () => ({ db: { query: async () => ({ rows: [] }) } }),
  resolveRequestAccount: async (headers: Headers) => {
    if (!headers.get('cookie')?.includes('session=')) return undefined;
    return { accountId: SIGNED_IN_ACCOUNT_ID, username: 'learner', role: signedInRole! };
  },
  registrationOpen: () => false,
}));

// Membership, sharing, previews and classes have their own tests (tests/learning). Here they are
// set per test: an active membership with a 1000-token allowance, nothing shared or previewed.
const learning = {
  membership: undefined as undefined | { active: boolean; monthlyQuota: number },
  usedTokens: 0,
  bonusTokens: 0,
  shared: false,
};
vi.mock('@/lib/server/learning/store', () => ({
  readMembership: async () =>
    learning.membership && {
      status: learning.membership.active ? 'active' : 'suspended',
      ...learning.membership,
      expiresAt: '2100-01-01T00:00:00.000Z',
    },
  readCourseShare: async () =>
    learning.shared ? { ownerId: OTHER_OWNER_ID, title: 'Shared', state: 'shared' } : undefined,
  isCoursePreview: async () => false,
  isCourseInClassOf: async () => false,
  readBonusTokens: async () => learning.bonusTokens,
  recordCourseRead: async () => 0,
}));
vi.mock('@/lib/server/usage-storage', () => ({
  monthlyLlmTokens: async () => learning.usedTokens,
}));

function headers(cookie?: string): Headers {
  return new Headers(cookie ? { cookie } : {});
}

const ANON_OWNER = headers(`anonymous_id=${OWNER_COOKIE_ID}`);
const ANON_OTHER = headers(`anonymous_id=${OTHER_COOKIE_ID}`);
const SIGNED_IN = headers('session=token');

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://classroom-access-test');
  // requireSpender answers 503 until the provider settings are loaded; here they are, and empty.
  useProviders();
  records.clear();
  signedInRole = 'learner';
  learning.membership = { active: true, monthlyQuota: 1000 };
  learning.usedTokens = 0;
  learning.bonusTokens = 0;
  learning.shared = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
  clearProviders();
});

describe('canReadClassroom', () => {
  it('reads everything when accounts are off, because there is no identity to check', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { canReadClassroom } = await import('@/lib/server/authz/viewer');
    records.set('lesson-without-owner', undefined);
    expect(await canReadClassroom(headers(), 'lesson-without-owner')).toBe(true);
  });

  it('lets the owner partition read its own classroom and refuses everyone else', async () => {
    const { canReadClassroom } = await import('@/lib/server/authz/viewer');
    records.set('lesson-a', { ownerId: OWNER_ID });
    expect(await canReadClassroom(ANON_OWNER, 'lesson-a')).toBe(true);
    expect(await canReadClassroom(ANON_OTHER, 'lesson-a')).toBe(false);
    expect(await canReadClassroom(headers(), 'lesson-a')).toBe(false);
  });

  it('refuses a classroom with no recorded owner to a learner, but not to staff', async () => {
    const { canReadClassroom } = await import('@/lib/server/authz/viewer');
    records.set('legacy-lesson', undefined);
    expect(await canReadClassroom(ANON_OWNER, 'legacy-lesson')).toBe(false);

    signedInRole = 'learner';
    expect(await canReadClassroom(SIGNED_IN, 'legacy-lesson')).toBe(false);
    signedInRole = 'operator';
    expect(await canReadClassroom(SIGNED_IN, 'legacy-lesson')).toBe(true);
    signedInRole = 'admin';
    expect(await canReadClassroom(SIGNED_IN, 'legacy-lesson')).toBe(true);
  });

  it('lets staff read another owner’s classroom', async () => {
    const { canReadClassroom } = await import('@/lib/server/authz/viewer');
    records.set('lesson-b', { ownerId: OTHER_OWNER_ID });
    signedInRole = 'operator';
    expect(await canReadClassroom(SIGNED_IN, 'lesson-b')).toBe(true);
    signedInRole = 'learner';
    expect(await canReadClassroom(SIGNED_IN, 'lesson-b')).toBe(false);
  });
});

describe('requireSpender', () => {
  it('passes when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    expect(await requireSpender(headers())).toBeUndefined();
  });

  it('refuses an anonymous visitor with 401 LOGIN_REQUIRED when accounts are on', async () => {
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    const refusal = await requireSpender(ANON_OWNER);
    expect(refusal?.status).toBe(401);
    expect(await refusal?.json()).toMatchObject({ errorCode: 'LOGIN_REQUIRED' });
  });

  it('lets a signed-in learner with an active membership through', async () => {
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    expect(await requireSpender(SIGNED_IN)).toBeUndefined();
  });

  it('refuses a learner without an active membership with 403 MEMBERSHIP_REQUIRED', async () => {
    learning.membership = { active: false, monthlyQuota: 1000 };
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    const refusal = await requireSpender(SIGNED_IN);
    expect(refusal?.status).toBe(403);
    expect(await refusal?.json()).toMatchObject({ errorCode: 'MEMBERSHIP_REQUIRED' });
  });

  it('refuses a learner whose monthly allowance, with reader rewards, is used up', async () => {
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    learning.usedTokens = 1000;
    learning.bonusTokens = 0;
    const exhausted = await requireSpender(SIGNED_IN);
    expect(exhausted?.status).toBe(403);
    expect(await exhausted?.json()).toMatchObject({ errorCode: 'QUOTA_EXCEEDED' });

    learning.bonusTokens = 500;
    expect(await requireSpender(SIGNED_IN)).toBeUndefined();
  });

  it('does not meter an operator', async () => {
    signedInRole = 'operator';
    learning.membership = undefined;
    learning.usedTokens = 10_000_000;
    const { requireSpender } = await import('@/lib/server/authz/viewer');
    expect(await requireSpender(SIGNED_IN)).toBeUndefined();
  });
});

describe('classroom sidecar storage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'classroom-access-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips the owner and reports none for a classroom without a record', async () => {
    const { readClassroomAccess, writeClassroomAccess } = await vi.importActual<
      typeof import('@/lib/server/classroom-storage')
    >('@/lib/server/classroom-storage');
    await expect(readClassroomAccess('lesson-c', dir)).resolves.toBeUndefined();
    await writeClassroomAccess('lesson-c', { ownerId: OWNER_ID }, dir);
    await expect(readClassroomAccess('lesson-c', dir)).resolves.toEqual({ ownerId: OWNER_ID });
  });

  it('refuses ids that could name a file outside the directory', async () => {
    const { readClassroomAccess, resolveClassroomAccessPath } = await vi.importActual<
      typeof import('@/lib/server/classroom-storage')
    >('@/lib/server/classroom-storage');
    await expect(readClassroomAccess('../escape', dir)).resolves.toBeUndefined();
    expect(() => resolveClassroomAccessPath('../escape', dir)).toThrow();
  });
});

describe('canReadStageDocument', () => {
  const stage = (ownerId: string, isPublic = false) => ({ stageId: 'stage-x', ownerId, isPublic });

  it('keeps a private course to its owner', async () => {
    const { canReadStageDocument } = await import('@/lib/server/authz/viewer');
    expect(await canReadStageDocument(ANON_OWNER, stage(OWNER_ID))).toBe(true);
    expect(await canReadStageDocument(ANON_OTHER, stage(OWNER_ID))).toBe(false);
    expect(await canReadStageDocument(SIGNED_IN, stage(OWNER_ID))).toBe(false);
    expect(await canReadStageDocument(headers(), stage(OWNER_ID))).toBe(false);
  });

  it('opens a published course to everyone, signed in or not', async () => {
    const { canReadStageDocument } = await import('@/lib/server/authz/viewer');
    expect(await canReadStageDocument(ANON_OTHER, stage(OWNER_ID, true))).toBe(true);
    expect(await canReadStageDocument(headers(), stage(OWNER_ID, true))).toBe(true);
  });

  it('lets an active member read a shared course, and staff read any course', async () => {
    const { canReadStageDocument } = await import('@/lib/server/authz/viewer');
    learning.shared = true;
    expect(await canReadStageDocument(SIGNED_IN, stage(OWNER_ID))).toBe(true);
    learning.membership = { active: false, monthlyQuota: 0 };
    expect(await canReadStageDocument(SIGNED_IN, stage(OWNER_ID))).toBe(false);
    learning.shared = false;
    signedInRole = 'operator';
    expect(await canReadStageDocument(SIGNED_IN, stage(OWNER_ID))).toBe(true);
  });
});
