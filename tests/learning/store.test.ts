import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';
import {
  ACCESS_REQUEST_RETRY_HOURS,
  attachCourseToClass,
  countDistinctReaders,
  createAccessRequest,
  createClass,
  decideAccessRequest,
  decideCourseShare,
  findClassByJoinCodeHash,
  grantMembership,
  isCourseInClassOf,
  isCoursePreview,
  joinClass,
  listAudit,
  listCatalog,
  listPendingAccessRequests,
  listClassMembers,
  listSharesByOwner,
  removeClassMember,
  readShareRejection,
  listClassesForAccount,
  listCourseShares,
  listMemberships,
  MONTHLY_REWARD_CAP_TOKENS,
  nextBadge,
  READER_REWARD_TOKENS,
  readAccessRequest,
  readBadges,
  readBonusTokens,
  readDashboardCounts,
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
    `TRUNCATE access_requests, badges, quota_bonus, course_reads, class_courses, class_members, classes,
       course_previews, course_shares, course_share_rejections, memberships, account_admin_audit, account_sessions,
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

  it('a refused request is kept for its owner with the reason until they ask again', async () => {
    await requestCourseShare(db, { courseId: 'c2', ownerId: 'acct:bob', title: 'Chess', now: NOW });
    await decideCourseShare(db, {
      actorId: 'op',
      courseId: 'c2',
      decision: 'reject',
      reason: 'Too short',
      now: NOW,
    });
    expect(await readShareRejection(db, { courseId: 'c2', ownerId: 'acct:bob' })).toEqual({
      reason: 'Too short',
      rejectedAt: NOW.toISOString(),
    });
    expect(await readShareRejection(db, { courseId: 'c2', ownerId: 'acct:eve' })).toBeUndefined();
    expect(await listSharesByOwner(db, 'acct:bob')).toEqual([
      { courseId: 'c2', title: 'Chess', state: 'rejected', readers: 0, reason: 'Too short' },
    ]);

    await requestCourseShare(db, { courseId: 'c2', ownerId: 'acct:bob', title: 'Chess', now: NOW });
    expect(await readShareRejection(db, { courseId: 'c2', ownerId: 'acct:bob' })).toBeUndefined();
    expect((await listSharesByOwner(db, 'acct:bob')).map((s) => s.state)).toEqual(['pending']);
  });

  it('an owner can withdraw a pending request', async () => {
    await requestCourseShare(db, { courseId: 'c3', ownerId: 'acct:bob', title: 'Go', now: NOW });
    expect(await withdrawCourseShare(db, { courseId: 'c3', ownerId: 'acct:bob' })).toBe(true);
    expect(await listCourseShares(db, 'pending')).toEqual([]);
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

  it('lists the members of a class and removes one, with an audit row', async () => {
    await createClass(db, {
      id: 'k1',
      name: 'Grade 6',
      createdBy: 'op',
      joinCodeHash: 'h',
      now: NOW,
    });
    await joinClass(db, { classId: 'k1', accountId: 'alice', now: NOW });
    await joinClass(db, { classId: 'k1', accountId: 'bob', now: NOW });
    expect((await listClassMembers(db, 'k1')).map((m) => m.accountId).sort()).toEqual([
      'alice',
      'bob',
    ]);

    expect(
      await removeClassMember(db, { classId: 'k1', accountId: 'bob', actorId: 'op', now: NOW }),
    ).toBe(true);
    expect((await listClassMembers(db, 'k1')).map((m) => m.accountId)).toEqual(['alice']);
    expect(
      await removeClassMember(db, { classId: 'k1', accountId: 'bob', actorId: 'op', now: NOW }),
    ).toBe(false);
    expect((await listAudit(db, undefined, 10))[0]).toMatchObject({
      actorId: 'op',
      targetId: 'bob',
      action: 'class:remove:k1',
    });
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

describe('catalog titles', () => {
  const titles = async (viewer: Parameters<typeof listCatalog>[1]) =>
    Object.fromEntries((await listCatalog(db, viewer)).map((e) => [e.courseId, e.title]));

  async function arrange(): Promise<void> {
    await createClass(db, {
      id: 'k1',
      name: 'Grade 6',
      createdBy: 'op',
      joinCodeHash: 'h',
      now: NOW,
    });
    await joinClass(db, { classId: 'k1', accountId: 'alice', now: NOW });
    for (const courseId of ['c-class', 'c-both', 'c-empty', 'c-none']) {
      await attachCourseToClass(db, { classId: 'k1', courseId, attachedBy: 'op', now: NOW });
    }
    await setCoursePreview(db, { actorId: 'op', courseId: 'c-prev', on: true, now: NOW });
    await requestCourseShare(db, {
      courseId: 'c-both',
      ownerId: 'acct:bob',
      title: 'Share title',
      now: NOW,
    });
  }

  it('names a preview or class course after the course itself, and the share title wins', async () => {
    await pg.exec(`CREATE TABLE document_stages (id TEXT PRIMARY KEY, name TEXT)`);
    try {
      await pg.exec(
        `INSERT INTO document_stages VALUES
           ('c-class', 'Binary search'), ('c-prev', 'Fractions'), ('c-both', 'Stage name'), ('c-empty', '')`,
      );
      await arrange();
      expect(await titles({ accountId: 'alice', memberActive: true })).toEqual({
        'c-class': 'Binary search',
        'c-prev': 'Fractions',
        'c-both': 'Share title',
        'c-empty': 'c-empty',
        'c-none': 'c-none',
      });
      // A guest browses previews only, and they carry the name too.
      expect(await titles({ memberActive: false })).toEqual({ 'c-prev': 'Fractions' });
      // A rename shows at once: nothing is copied.
      await pg.exec(`UPDATE document_stages SET name = 'Renamed' WHERE id = 'c-class'`);
      expect((await titles({ accountId: 'alice', memberActive: true }))['c-class']).toBe('Renamed');
    } finally {
      await pg.exec(`DROP TABLE document_stages`);
    }
  });

  it('counts the scenes of a course when its scenes are stored, and omits the count otherwise', async () => {
    await pg.exec(
      `CREATE TABLE document_stages (id TEXT PRIMARY KEY, name TEXT, updated_at DOUBLE PRECISION)`,
    );
    try {
      await pg.exec(`INSERT INTO document_stages (id, name) VALUES ('c-class', 'Binary search')`);
      await arrange();
      const counts = async () =>
        Object.fromEntries(
          (await listCatalog(db, { accountId: 'alice', memberActive: true })).map((e) => [
            e.courseId,
            e.sceneCount,
          ]),
        );
      // Documents without a scenes table: no counts, and nothing fails.
      expect((await counts())['c-class']).toBeUndefined();
      await pg.exec(
        `CREATE TABLE document_scenes (stage_id TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}')`,
      );
      await pg.exec(
        `INSERT INTO document_scenes (stage_id, id) VALUES ('c-class', 's1'), ('c-class', 's2')`,
      );
      expect(await counts()).toMatchObject({ 'c-class': 2 });
      expect((await counts())['c-empty']).toBeUndefined();
    } finally {
      await pg.exec(`DROP TABLE IF EXISTS document_scenes`);
      await pg.exec(`DROP TABLE document_stages`);
    }
  });

  it('says whether a course has a quiz or an interactive scene, and when it was last updated', async () => {
    await pg.exec(
      `CREATE TABLE document_stages (id TEXT PRIMARY KEY, name TEXT, updated_at DOUBLE PRECISION)`,
    );
    await pg.exec(
      `CREATE TABLE document_scenes (stage_id TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL)`,
    );
    try {
      const edited = Date.parse('2026-10-15T08:00:00.000Z');
      await pg.exec(
        `INSERT INTO document_stages VALUES
           ('c-class', 'Binary search', ${edited}), ('c-prev', 'Fractions', ${edited}),
           ('s-shared', 'Shared stage', ${edited})`,
      );
      const scene = (stage: string, id: string, type: string) =>
        `('${stage}', '${id}', '{"type":"${type}"}'::jsonb)`;
      await pg.exec(
        `INSERT INTO document_scenes VALUES
           ${scene('c-class', 'a', 'slide')}, ${scene('c-class', 'b', 'quiz')},
           ${scene('c-prev', 'a', 'slide')}, ${scene('c-prev', 'b', 'pbl')},
           ${scene('s-shared', 'a', 'interactive')}`,
      );
      await arrange();
      await setCoursePreview(db, { actorId: 'op', courseId: 'c-prev', on: true, now: NOW });
      await requestCourseShare(db, {
        courseId: 's-shared',
        ownerId: 'acct:bob',
        title: 'Shared',
        now: NOW,
      });
      await decideCourseShare(db, {
        actorId: 'op',
        courseId: 's-shared',
        decision: 'approve',
        now: NOW,
      });
      const byId = Object.fromEntries(
        (await listCatalog(db, { accountId: 'alice', memberActive: true })).map((e) => [
          e.courseId,
          e,
        ]),
      );
      expect(byId['c-class']).toMatchObject({
        sceneCount: 2,
        hasQuiz: true,
        hasInteractive: false,
        updatedAt: '2026-10-15T08:00:00.000Z',
      });
      // A project scene counts as interactive.
      expect(byId['c-prev']).toMatchObject({ hasQuiz: false, hasInteractive: true });
      // A shared course keeps its approval time, not the author's later edit.
      expect(byId['s-shared']).toMatchObject({
        hasInteractive: true,
        updatedAt: NOW.toISOString(),
      });
      // No scenes stored: nothing is claimed about content.
      expect(byId['c-empty'].hasQuiz).toBeUndefined();
      expect(byId['c-empty'].updatedAt).toBeUndefined();
    } finally {
      await pg.exec(`DROP TABLE IF EXISTS document_scenes`);
      await pg.exec(`DROP TABLE document_stages`);
    }
  });

  it('falls back to the id when the course documents are not in this database', async () => {
    await arrange();
    expect(await titles({ accountId: 'alice', memberActive: true })).toEqual({
      'c-class': 'c-class',
      'c-prev': 'c-prev',
      'c-both': 'Share title',
      'c-empty': 'c-empty',
      'c-none': 'c-none',
    });
  });
});

describe('access requests', () => {
  const HOUR = 3_600_000;
  const approve = (accountId: string, now = NOW) =>
    decideAccessRequest(db, {
      actorId: 'op',
      accountId,
      decision: 'approve',
      days: 30,
      monthlyQuota: 1000,
      reason: undefined,
      now,
    });
  const reject = (accountId: string, reason: string | undefined, now = NOW) =>
    decideAccessRequest(db, {
      actorId: 'op',
      accountId,
      decision: 'reject',
      days: 30,
      monthlyQuota: 1000,
      reason,
      now,
    });

  it('opens a pending request and reads it back', async () => {
    const result = await createAccessRequest(db, { accountId: 'alice', note: 'hi', now: NOW });
    expect(result).toMatchObject({ ok: true, request: { state: 'pending', note: 'hi' } });
    expect(await readAccessRequest(db, 'alice')).toMatchObject({
      state: 'pending',
      decidedAt: null,
    });
    expect(await readAccessRequest(db, 'bob')).toBeUndefined();
  });

  it('refuses a second request while one is pending', async () => {
    await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW });
    const again = await createAccessRequest(db, { accountId: 'alice', note: 'x', now: NOW });
    expect(again).toEqual({ ok: false, reason: 'REQUEST_PENDING' });
    expect((await readAccessRequest(db, 'alice'))?.note).toBeNull();
  });

  it('lets a member whose membership ends within 7 days ask to renew it', async () => {
    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 5,
      monthlyQuota: 10,
      reason: undefined,
      now: NOW,
    });
    expect(
      await createAccessRequest(db, { accountId: 'alice', note: 'renew', now: NOW }),
    ).toMatchObject({ ok: true, request: { state: 'pending' } });
  });

  it('refuses an active member and a suspended one', async () => {
    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 30,
      monthlyQuota: 10,
      reason: undefined,
      now: NOW,
    });
    expect(
      await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW }),
    ).toEqual({ ok: false, reason: 'ALREADY_MEMBER' });
    await setMembershipStatus(db, {
      actorId: 'op',
      targetId: 'alice',
      status: 'suspended',
      reason: undefined,
      now: NOW,
    });
    expect(
      await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW }),
    ).toEqual({ ok: false, reason: 'MEMBERSHIP_SUSPENDED' });
  });

  it('lets an expired member ask again', async () => {
    await grantMembership(db, {
      actorId: 'op',
      targetId: 'alice',
      days: 1,
      monthlyQuota: 10,
      reason: undefined,
      now: NOW,
    });
    const later = new Date(NOW.getTime() + 2 * DAY);
    expect(
      await createAccessRequest(db, { accountId: 'alice', note: undefined, now: later }),
    ).toMatchObject({ ok: true });
    expect((await listPendingAccessRequests(db, later))[0]).toMatchObject({
      username: 'alice',
      membership: 'expired',
    });
  });

  it('makes a rejected learner wait the retry period, then lets them ask again', async () => {
    await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW });
    expect(await reject('alice', 'not now')).toBe(true);
    const tooSoon = new Date(NOW.getTime() + (ACCESS_REQUEST_RETRY_HOURS - 1) * HOUR);
    expect(
      await createAccessRequest(db, { accountId: 'alice', note: undefined, now: tooSoon }),
    ).toEqual({ ok: false, reason: 'REQUEST_TOO_SOON' });
    const ready = new Date(NOW.getTime() + ACCESS_REQUEST_RETRY_HOURS * HOUR);
    const result = await createAccessRequest(db, { accountId: 'alice', note: 'again', now: ready });
    expect(result).toMatchObject({
      ok: true,
      request: { state: 'pending', note: 'again', decidedAt: null, reason: null },
    });
  });

  it('approves in one step: membership, request state and audit row together', async () => {
    await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW });
    expect(await approve('alice')).toBe(true);
    const membership = await readMembership(db, 'alice', NOW);
    expect(membership).toMatchObject({ active: true, monthlyQuota: 1000 });
    expect(membership?.expiresAt).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
    expect(await readAccessRequest(db, 'alice')).toMatchObject({ state: 'approved' });
    expect((await listAudit(db, undefined, 10))[0]).toMatchObject({
      actorId: 'op',
      targetId: 'alice',
      action: 'access:approve',
    });
    // Nothing is pending any more, so a second decision changes nothing.
    expect(await approve('alice')).toBe(false);
    expect(await listAudit(db, undefined, 10)).toHaveLength(1);
  });

  it('rejects with the reason in the audit log and grants nothing', async () => {
    await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW });
    expect(await reject('alice', 'unknown person')).toBe(true);
    expect(await readMembership(db, 'alice', NOW)).toBeUndefined();
    // The learner sees the reason too.
    expect(await readAccessRequest(db, 'alice')).toMatchObject({
      state: 'rejected',
      reason: 'unknown person',
    });
    expect((await listAudit(db, undefined, 10))[0]).toMatchObject({
      action: 'access:reject',
      reason: 'unknown person',
    });
  });

  it('does nothing when there is no pending request', async () => {
    expect(await approve('bob')).toBe(false);
    expect(await reject('bob', undefined)).toBe(false);
    expect(await readMembership(db, 'bob', NOW)).toBeUndefined();
    expect(await listAudit(db, undefined, 10)).toHaveLength(0);
  });

  it('does not resume a membership that was suspended after the request', async () => {
    await createAccessRequest(db, { accountId: 'alice', note: undefined, now: NOW });
    await pg.query(
      `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by)
       VALUES ('alice', 'suspended', $1, 5, 'op')`,
      [new Date(NOW.getTime() + DAY).toISOString()],
    );
    expect(await approve('alice')).toBe(false);
    expect((await readMembership(db, 'alice', NOW))?.status).toBe('suspended');
    expect(await readAccessRequest(db, 'alice')).toMatchObject({ state: 'pending' });
  });

  it('lists pending requests oldest first and counts them for the dashboard', async () => {
    await createAccessRequest(db, { accountId: 'bob', note: 'b', now: NOW });
    await createAccessRequest(db, {
      accountId: 'alice',
      note: 'a',
      now: new Date(NOW.getTime() + HOUR),
    });
    const list = await listPendingAccessRequests(db, NOW);
    expect(list.map((row) => [row.username, row.membership])).toEqual([
      ['bob', 'none'],
      ['alice', 'none'],
    ]);
    expect((await readDashboardCounts(db, NOW)).pendingAccessRequests).toBe(2);
    await reject('bob', undefined);
    expect((await readDashboardCounts(db, NOW)).pendingAccessRequests).toBe(1);
  });
});

describe('contribution: own shares, readers and the next badge', () => {
  const author = 'acct:alice';

  async function addReader(id: string): Promise<void> {
    await pg.query(`INSERT INTO accounts (id, username, password_hash) VALUES ($1, $1, 'x')`, [id]);
  }

  it('lists an owner’s shares, shared first, each with its own distinct readers', async () => {
    await requestCourseShare(db, {
      courseId: 'c-pending',
      ownerId: author,
      title: 'Pending',
      now: NOW,
    });
    await requestCourseShare(db, {
      courseId: 'c-shared',
      ownerId: author,
      title: 'Shared',
      now: NOW,
    });
    await requestCourseShare(db, {
      courseId: 'c-other',
      ownerId: 'acct:bob',
      title: 'Bob',
      now: NOW,
    });
    await decideCourseShare(db, {
      actorId: 'op',
      courseId: 'c-shared',
      decision: 'approve',
      now: NOW,
    });
    await addReader('r1');
    await addReader('r2');
    for (const [course, reader] of [
      ['c-shared', 'r1'],
      ['c-shared', 'r2'],
      ['c-shared', 'r1'],
    ] as const) {
      await recordCourseRead(db, {
        courseId: course,
        readerId: reader,
        authorId: author,
        month: '2026-10',
        now: NOW,
      });
    }
    expect(await listSharesByOwner(db, author)).toEqual([
      { courseId: 'c-shared', title: 'Shared', state: 'shared', readers: 2 },
      { courseId: 'c-pending', title: 'Pending', state: 'pending', readers: 0 },
    ]);
    expect(await listSharesByOwner(db, 'acct:nobody')).toEqual([]);
  });

  it('counts a reader once across all of an author’s courses', async () => {
    await addReader('r1');
    await addReader('r2');
    for (const [course, reader] of [
      ['a', 'r1'],
      ['b', 'r1'],
      ['b', 'r2'],
    ] as const) {
      await recordCourseRead(db, {
        courseId: course,
        readerId: reader,
        authorId: author,
        month: '2026-10',
        now: NOW,
      });
    }
    expect(await countDistinctReaders(db, author)).toBe(2);
    expect(await countDistinctReaders(db, 'acct:nobody')).toBe(0);
  });
});

describe('nextBadge', () => {
  it.each([
    [0, { code: 'readers-10', readersNeeded: 10 }],
    [9, { code: 'readers-10', readersNeeded: 1 }],
    [10, { code: 'readers-100', readersNeeded: 90 }],
    [99, { code: 'readers-100', readersNeeded: 1 }],
    [100, null],
    [250, null],
  ])('with %i readers the next badge is %j', (readers, expected) => {
    expect(nextBadge(readers)).toEqual(expected);
  });
});
