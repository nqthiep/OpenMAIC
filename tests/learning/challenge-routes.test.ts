import { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

import { clearProviders, useProviders } from '../fixtures/provider-snapshot';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;
const DAY = 86_400_000;
const START = new Date('2026-10-05T10:00:00.000Z');

const ai = vi.hoisted(() => ({ calls: 0, usedTokens: 0 }));
vi.mock('@/lib/ai/llm', () => ({
  callLLM: async () => {
    ai.calls += 1;
    return { text: '{"score": 7, "feedback": "Good start; check the last step."}' };
  },
}));
vi.mock('@/lib/server/resolve-model', () => ({
  resolveModel: async () => ({ model: {}, thinkingConfig: undefined }),
}));
vi.mock('@/lib/server/usage-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/usage-storage')>()),
  llmTokensBetween: async () => ai.usedTokens,
}));

class PGlitePool {
  constructor(private readonly database: PGlite) {}
  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

let db: PGlite | undefined;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await ensureAccountSchema(new PGlitePool(db));
  await ensureLearningSchema(new PGlitePool(db));
}, ROUTE_TIMEOUT_MS);

beforeEach(async () => {
  // The routes' AI calls pass requireSpender, which answers 503 until the settings are loaded.
  useProviders();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(START);
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://challenge-route-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  ai.calls = 0;
  ai.usedTokens = 0;
  await db!.exec(
    'TRUNCATE entry_votes, challenge_entries, challenges, app_settings, badges, quota_bonus, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterEach(() => {
  vi.useRealTimers();
  clearProviders();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.close();
  db = undefined;
});

async function loadRoutes() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, list, challenge, entry, settings] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/community/challenges/route'),
    import('@/app/api/community/challenges/[id]/route'),
    import('@/app/api/community/challenges/entries/[id]/route'),
    import('@/app/api/admin/settings/route'),
  ]);
  return {
    register: register.POST,
    list: list.GET,
    create: list.POST,
    read: challenge.GET,
    update: challenge.PATCH,
    submit: challenge.POST,
    vote: entry.POST,
    hide: entry.PATCH,
    settings: settings.GET,
    setSetting: settings.PATCH,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/x`, { method, headers, body: JSON.stringify(body) });
}

function getRequest(cookie?: string): Request {
  return new Request(`${ORIGIN}/api/x`, cookie ? { headers: { cookie } } : undefined);
}

async function signUp(routes: Routes, username: string, member = false): Promise<string> {
  const response = await routes.register(
    jsonRequest('POST', { username, password: PASSWORD, acceptedTerms: true }),
  );
  if (member) {
    await db!.query(
      `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by)
       SELECT id, 'active', now() + interval '90 days', 1000000, 'root' FROM accounts WHERE username = $1`,
      [username],
    );
  }
  return response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='))!
    .split(';')[0]!;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies vary by route
async function json(response: Response): Promise<{ status: number; body: any }> {
  return { status: response.status, body: await response.clone().json() };
}

const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

const CHALLENGE = {
  title: 'Minimum of x² + 4/x',
  statement: 'Find the minimum of $x^2 + 4/x$ for $x > 0$.',
  referenceSolution: 'AM-GM gives 3·(2)^{2/3}... at x = 2^{1/3}.',
  opensAt: new Date(START.getTime() - 3_600_000).toISOString(),
  submissionDays: 7,
  votingDays: 3,
  rewards: [3000, 2000, 1000],
};

async function bonusOf(username: string): Promise<number> {
  const result = await db!.query<{ tokens: string }>(
    `SELECT b.tokens FROM quota_bonus b JOIN accounts a ON b.owner_id = 'acct:' || a.id WHERE a.username = $1`,
    [username],
  );
  return Number(result.rows[0]?.tokens ?? 0);
}

describe('weekly challenge routes', () => {
  it(
    'runs open → voting → finished and pays the top three once',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice', true);
      const bob = await signUp(routes, 'bob', true);
      const carol = await signUp(routes, 'carol', true);
      const dave = await signUp(routes, 'dave');

      expect((await routes.create(jsonRequest('POST', CHALLENGE, alice))).status).toBe(403);
      const bad = await routes.create(jsonRequest('POST', { ...CHALLENGE, rewards: [1, 2] }, root));
      expect(bad.status).toBe(400);
      const created = await json(await routes.create(jsonRequest('POST', CHALLENGE, root)));
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      // Open: members submit and get a private AI grade; entries and the reference stay hidden.
      for (const [cookie, text] of [
        [alice, 'x = 2^{1/3}'],
        [bob, 'By AM-GM the minimum is 3·2^{2/3}'],
        [carol, 'Derivative is zero at x = 2^{1/3}'],
      ] as const) {
        const sent = await json(
          await routes.submit(jsonRequest('POST', { body: text }, cookie), params(id)),
        );
        expect(sent.body).toMatchObject({ graded: true });
      }
      expect(ai.calls).toBe(3);
      const daveSubmit = await json(
        await routes.submit(jsonRequest('POST', { body: 'guess' }, dave), params(id)),
      );
      expect(daveSubmit).toMatchObject({ status: 403, body: { errorCode: 'MEMBERSHIP_REQUIRED' } });

      const aliceView = await json(await routes.read(getRequest(alice), params(id)));
      expect(aliceView.body.challenge).toMatchObject({
        phase: 'open',
        entryCount: 3,
        referenceSolution: '',
      });
      expect(aliceView.body.entries).toMatchObject([
        { username: 'alice', aiScore: 7, aiFeedback: 'Good start; check the last step.' },
      ]);
      const daveView = await json(await routes.read(getRequest(dave), params(id)));
      expect(daveView.body).toMatchObject({ entries: [], viewer: { canPost: false } });

      const bobEntryId = (await json(await routes.read(getRequest(bob), params(id)))).body
        .entries[0].id;
      const aliceEntryId = aliceView.body.entries[0].id;
      expect((await routes.vote(jsonRequest('POST', {}, alice), params(bobEntryId))).status).toBe(
        403,
      );

      // Voting: every entry and the reference are public; AI feedback stays with its author.
      vi.setSystemTime(new Date(START.getTime() + 8 * DAY));
      const voting = await json(await routes.read(getRequest(carol), params(id)));
      expect(voting.body.challenge).toMatchObject({
        phase: 'voting',
        referenceSolution: CHALLENGE.referenceSolution,
      });
      expect(voting.body.entries).toHaveLength(3);
      const aliceSeenByCarol = voting.body.entries.find(
        (e: { username: string }) => e.username === 'alice',
      );
      expect(aliceSeenByCarol).toMatchObject({ aiScore: 7, aiFeedback: null });
      expect(
        (await routes.submit(jsonRequest('POST', { body: 'late' }, alice), params(id))).status,
      ).toBe(403);
      expect((await routes.vote(jsonRequest('POST', {}, bob), params(bobEntryId))).status).toBe(
        403,
      );
      await routes.vote(jsonRequest('POST', {}, alice), params(bobEntryId));
      await routes.vote(jsonRequest('POST', {}, carol), params(bobEntryId));
      await routes.vote(jsonRequest('POST', {}, bob), params(aliceEntryId));

      // Finished: the first read settles, the second pays nothing more.
      vi.setSystemTime(new Date(START.getTime() + 11 * DAY));
      const done = await json(await routes.list(getRequest(dave)));
      expect(done.body.challenges[0]).toMatchObject({ phase: 'finished', settled: true });
      const results = await json(await routes.read(getRequest(dave), params(id)));
      expect(
        results.body.entries.map((e: { username: string; rank: number; reward: number }) => [
          e.username,
          e.rank,
          e.reward,
        ]),
      ).toEqual([
        ['bob', 1, 3000],
        ['alice', 2, 2000],
        ['carol', 3, 1000],
      ]);
      await routes.list(getRequest(dave));
      expect([await bonusOf('bob'), await bonusOf('alice'), await bonusOf('carol')]).toEqual([
        3000, 2000, 1000,
      ]);
      const badges = await db!.query(
        `SELECT count(*)::int AS n FROM badges WHERE badge_code = 'challenge-top3'`,
      );
      expect((badges.rows[0] as { n: number }).n).toBe(3);
      // Settling happens before the leaderboard is read, so the first read already counts places.
      expect(
        done.body.leaderboard.map((r: { username: string; points: number }) => [
          r.username,
          r.points,
        ]),
      ).toEqual([
        ['bob', 4],
        ['alice', 3],
        ['carol', 2],
      ]);
      // A placed entry can no longer be hidden, and a settled challenge no longer changes.
      expect(
        (await routes.hide(jsonRequest('PATCH', { hidden: true }, root), params(bobEntryId)))
          .status,
      ).toBe(404);
      expect((await routes.update(jsonRequest('PATCH', CHALLENGE, root), params(id))).status).toBe(
        404,
      );
    },
    ROUTE_TIMEOUT_MS,
  );

  it(
    'the pay-mode setting decides whether a learner out of allowance still gets a grade',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const alice = await signUp(routes, 'alice', true);
      const { body } = await json(await routes.create(jsonRequest('POST', CHALLENGE, root)));
      ai.usedTokens = 10_000_000;

      const unpaid = await json(
        await routes.submit(jsonRequest('POST', { body: 'v1' }, alice), params(body.id)),
      );
      expect(unpaid.body).toMatchObject({ graded: false, reason: 'QUOTA_EXCEEDED' });
      expect(ai.calls).toBe(0);

      expect(
        (
          await routes.setSetting(
            jsonRequest('PATCH', { key: 'challenge.aiGradingPaidBy', value: 'system' }, alice),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await routes.setSetting(
            jsonRequest('PATCH', { key: 'challenge.aiGradingPaidBy', value: 'nobody' }, root),
          )
        ).status,
      ).toBe(400);
      await routes.setSetting(
        jsonRequest('PATCH', { key: 'challenge.aiGradingPaidBy', value: 'system' }, root),
      );
      const read = await json(await routes.settings(getRequest(root)));
      expect(read.body).toMatchObject({
        settings: { 'challenge.aiGradingPaidBy': 'system' },
        canChange: true,
      });

      const paid = await json(
        await routes.submit(jsonRequest('POST', { body: 'v2' }, alice), params(body.id)),
      );
      expect(paid.body).toMatchObject({ graded: true });
      expect(ai.calls).toBe(1);
      const audit = await db!.query<{ action: string }>(`SELECT action FROM account_admin_audit`);
      expect(audit.rows.map((r) => r.action)).toEqual(['challenge:create', 'settings:update']);
    },
    ROUTE_TIMEOUT_MS,
  );
});
