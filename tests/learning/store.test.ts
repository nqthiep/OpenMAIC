import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';
import {
  attachCourseToClass,
  createClass,
  decideCourseShare,
  findClassByJoinCodeHash,
  grantMembership,
  isCourseInClassOf,
  isCoursePreview,
  joinClass,
  listAudit,
  listCatalog,
  listClassesForAccount,
  listCourseShares,
  listMemberships,
  MONTHLY_REWARD_CAP_TOKENS,
  READER_REWARD_TOKENS,
  readBadges,
  readBonusTokens,
  readCourseShare,
  readMembership,
  recordCourseRead,
  requestCourseShare,
  setCoursePreview,
  setMembershipStatus,
  withdrawCourseShare,
} from '@/lib/server/learning/store';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const DAY = 86_400_000;

let pg: PGlite;

class PGlitePool {
  constructor(private readonly database: PGlite) {}

  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

let db: PGlitePool;

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  db = new PGlitePool(pg);
  await ensureAccountSchema(db);
  await ensureLearningSchema(db);
}, 60_000);

beforeEach(async () => {
  await pg.exec(
    `TRUNCATE badges, quota_bonus, course_reads, class_courses, class_members, classes,
       course_previews, course_shares, memberships, account_admin_audit, account_sessions,
       accounts RESTART IDENTITY CASCADE`,
  );
  for (const [id, username] of [
    ['op', 'operator'],
    ['alice', 'alice'],
    ['bob', 'bob'],
  ] as const) {
    await pg.query(`INSERT INTO accounts (id, username, password_hash) VALUES ($1, $2, 'x')`, [
      id,
      username,
    ]);
  }
});

afterAll(async () => {
  await pg?.close();
});

describe('memberships', () => {
  it('grants, reports as active, and extends a running membership from its expiry', async () => {
    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 30,
      monthlyQuota: 500,
      reason: 'first month',
      now: NOW,
    });
    const first = await readMembership(db, 'alice', NOW);
    expect(first?.active).toBe(true);
    expect(first?.monthlyQuota).toBe(500);
    expect(first?.expiresAt).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());

    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 10,
      monthlyQuota: 800,
      reason: undefined,
      now: NOW,
    });
    const extended = await readMembership(db, 'alice', NOW);
    expect(extended?.expiresAt).toBe(new Date(NOW.getTime() + 40 * DAY).toISOString());
    expect(extended?.monthlyQuota).toBe(800);
  });

  it('is inactive after expiry, and inactive while suspended', async () => {
    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 1,
      monthlyQuota: 1,
      reason: undefined,
      now: NOW,
    });
    expect((await readMembership(db, 'alice', new Date(NOW.getTime() + 2 * DAY)))?.active).toBe(
      false,
    );

    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 30,
      monthlyQuota: 1,
      reason: undefined,
      now: NOW,
    });
    await setMembershipStatus(db, {
      actorId: 'op',
      targetId: 'alice',
      status: 'suspended',
      reason: 'chargeback',
      now: NOW,
    });
    expect((await readMembership(db, 'alice', NOW))?.active).toBe(false);
    await setMembershipStatus(db, {
      actorId: 'op',
      targetId: 'alice',
      status: 'active',
      reason: undefined,
      now: NOW,
    });
    expect((await readMembership(db, 'alice', NOW))?.active).toBe(true);
  });

  it('lists every account with its membership, and records each change in the audit log', async () => {
    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 5,
      monthlyQuota: 10,
      reason: 'trial',
      now: NOW,
    });
    const rows = await listMemberships(db, undefined, 10, NOW);
    // Accounts come back in id order: alice, bob, op.
    expect(rows.map((row) => [row.username, row.membership?.active ?? null])).toEqual([
      ['alice', true],
      ['bob', null],
      ['operator', null],
    ]);
    const audit = await listAudit(db, undefined, 10);
    expect(audit[0]).toMatchObject({
      actorId: 'op',
      targetId: 'alice',
      action: 'membership:grant',
      reason: 'trial',
    });
  });
});

describe('course sharing and previews', () => {
  it('moves a course from pending to shared on approval, and removes a rejected request', async () => {
    expect(
      await requestCourseShare(db, {
        courseId: 'c1',
        ownerId: 'acct:alice',
        title: 'Fractions',
        now: NOW,
      }),
    ).toBe('pending');
    expect(await listCourseShares(db, 'pending')).toHaveLength(1);

    expect(
      await decideCourseShare(db, { actorId: 'op', courseId: 'c1', decision: 'approve', now: NOW }),
    ).toBe(true);
    expect((await readCourseShare(db, 'c1'))?.state).toBe('shared');

    await requestCourseShare(db, { courseId: 'c2', ownerId: 'acct:bob', title: 'Chess', now: NOW });
    expect(
      await decideCourseShare(db, { actorId: 'op', courseId: 'c2', decision: 'reject', now: NOW }),
    ).toBe(true);
    expect(await readCourseShare(db, 'c2')).toBeUndefined();
  });

  it('a withdrawn course is no longer shared, and only its owner can withdraw it', async () => {
    await requestCourseShare(db, {
      courseId: 'c1',
      ownerId: 'acct:alice',
      title: 'Fractions',
      now: NOW,
    });
    await decideCourseShare(db, { actorId: 'op', courseId: 'c1', decision: 'approve', now: NOW });
    expect(await withdrawCourseShare(db, { courseId: 'c1', ownerId: 'acct:bob' })).toBe(false);
    expect(await withdrawCourseShare(db, { courseId: 'c1', ownerId: 'acct:alice' })).toBe(true);
    expect(await readCourseShare(db, 'c1')).toBeUndefined();
  });

  it('marks and unmarks a preview', async () => {
    await setCoursePreview(db, { actorId: 'op', courseId: 'p1', on: true, now: NOW });
    expect(await isCoursePreview(db, 'p1')).toBe(true);
    await setCoursePreview(db, { actorId: 'op', courseId: 'p1', on: false, now: NOW });
    expect(await isCoursePreview(db, 'p1')).toBe(false);
  });
});

describe('classes and the catalog', () => {
  it('joins a class by its code, and a course attached to it is open to the members only', async () => {
    await createClass(db, {
      id: 'k1',
      name: 'Grade 6',
      createdBy: 'op',
      joinCodeHash: 'hash-1',
      now: NOW,
    });
    expect(await findClassByJoinCodeHash(db, 'hash-1')).toEqual({ id: 'k1', name: 'Grade 6' });
    expect(await findClassByJoinCodeHash(db, 'other')).toBeUndefined();

    await joinClass(db, { classId: 'k1', accountId: 'alice', now: NOW });
    expect(
      await attachCourseToClass(db, { classId: 'k1', courseId: 'c9', attachedBy: 'op', now: NOW }),
    ).toBe(true);

    expect(await isCourseInClassOf(db, 'alice', 'c9')).toBe(true);
    expect(await isCourseInClassOf(db, 'bob', 'c9')).toBe(false);
    const mine = await listClassesForAccount(db, 'alice');
    expect(mine).toEqual([{ id: 'k1', name: 'Grade 6', memberCount: 1, courseIds: ['c9'] }]);
  });

  it('a guest browses previews; a member also browses shared courses and class courses', async () => {
    await setCoursePreview(db, { actorId: 'op', courseId: 'p1', on: true, now: NOW });
    await requestCourseShare(db, {
      courseId: 's1',
      ownerId: 'acct:alice',
      title: 'Shared one',
      now: NOW,
    });
    await decideCourseShare(db, { actorId: 'op', courseId: 's1', decision: 'approve', now: NOW });

    const guest = await listCatalog(db, { memberActive: false });
    expect(guest.map((entry) => entry.courseId)).toEqual(['p1']);

    const member = await listCatalog(db, { accountId: 'bob', memberActive: true });
    expect(member.map((entry) => `${entry.courseId}:${entry.kind}`)).toEqual([
      'p1:preview',
      's1:shared',
    ]);
  });
});

describe('reader rewards and badges', () => {
  it('credits the author once per reader, capped per month, and earns the first badge at ten readers', async () => {
    const month = '2026-10';
    const author = 'acct:alice';
    const credited = await recordCourseRead(db, {
      courseId: 's1',
      readerId: 'bob',
      authorId: author,
      month,
      now: NOW,
    });
    expect(credited).toBe(READER_REWARD_TOKENS);
    // The same reader again is not new, so nothing is credited.
    expect(
      await recordCourseRead(db, {
        courseId: 's1',
        readerId: 'bob',
        authorId: author,
        month,
        now: NOW,
      }),
    ).toBe(0);
    expect(await readBonusTokens(db, author, month)).toBe(READER_REWARD_TOKENS);

    for (let i = 0; i < 9; i += 1) {
      await pg.query(`INSERT INTO accounts (id, username, password_hash) VALUES ($1, $2, 'x')`, [
        `r${i}`,
        `r${i}`,
      ]);
      await recordCourseRead(db, {
        courseId: 's1',
        readerId: `r${i}`,
        authorId: author,
        month,
        now: NOW,
      });
    }
    expect(await readBadges(db, author)).toEqual(['readers-10']);
  });

  it('never credits more than the monthly cap', async () => {
    const author = 'acct:alice';
    const perReader = READER_REWARD_TOKENS;
    const needed = Math.ceil(MONTHLY_REWARD_CAP_TOKENS / perReader) + 2;
    let total = 0;
    for (let i = 0; i < needed; i += 1) {
      await pg.query(`INSERT INTO accounts (id, username, password_hash) VALUES ($1, $2, 'x')`, [
        `m${i}`,
        `m${i}`,
      ]);
      total += await recordCourseRead(db, {
        courseId: 's2',
        readerId: `m${i}`,
        authorId: author,
        month: '2026-10',
        now: NOW,
      });
    }
    expect(total).toBe(MONTHLY_REWARD_CAP_TOKENS);
    expect(await readBonusTokens(db, author, '2026-10')).toBe(MONTHLY_REWARD_CAP_TOKENS);
  });
});
