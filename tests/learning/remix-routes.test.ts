import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost';
const THROTTLE_KEY = Symbol.for('openmaic.accounts.loginThrottle');
const ROUTE_TIMEOUT_MS = 60_000;
const SOURCE = 'course-bob-limits';

// Course documents (the browser's imported copies) are owned through stage_meta; a map stands in.
const documents = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/server/stage-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/stage-access')>()),
  resolveStageAccess: async (id: string) =>
    documents.has(id) ? { stageId: id, ownerId: documents.get(id)!, deletedAt: null } : null,
}));

class PGlitePool {
  constructor(private readonly database: PGlite) {}
  query(text: string, params?: unknown[]) {
    return this.database.query(text, params);
  }
}

let db: PGlite | undefined;
let workDir = '';

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await ensureAccountSchema(new PGlitePool(db));
  await ensureLearningSchema(new PGlitePool(db));
}, ROUTE_TIMEOUT_MS);

beforeEach(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'remix-test-'));
  vi.spyOn(process, 'cwd').mockReturnValue(workDir);
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_URL', 'postgres://remix-route-test');
  vi.stubEnv('ACCOUNT_REGISTRATION', 'open');
  vi.stubEnv('ADMIN_USERNAMES', 'root');
  delete (globalThis as unknown as Record<symbol, unknown>)[THROTTLE_KEY];
  documents.clear();
  await db!.exec(
    'TRUNCATE course_remixes, course_reads, quota_bonus, badges, app_settings, course_shares, memberships, account_admin_audit, account_sessions, accounts RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(workDir, { recursive: true, force: true });
  await db?.close();
  db = undefined;
});

async function loadRoutes() {
  const pool = new PGlitePool(db!);
  vi.doMock('@/lib/persistence/server-provider', () => ({
    getServerPersistenceProvider: async () => ({ pool }),
  }));
  const [register, remix, settings, storage, viewer] = await Promise.all([
    import('@/app/api/auth/register/route'),
    import('@/app/api/courses/[id]/remix/route'),
    import('@/app/api/admin/settings/route'),
    import('@/lib/server/classroom-storage'),
    import('@/lib/server/authz/viewer'),
  ]);
  return {
    register: register.POST,
    info: remix.GET,
    record: remix.POST,
    setSetting: settings.PATCH,
    storage,
    viewer,
  };
}

type Routes = Awaited<ReturnType<typeof loadRoutes>>;

function jsonRequest(method: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request(`${ORIGIN}/api/x`, { method, headers, body: JSON.stringify(body) });
}

const get = (cookie?: string) =>
  new Request(`${ORIGIN}/api/x`, cookie ? { headers: { cookie } } : undefined);

async function signUp(routes: Routes, username: string, member = false) {
  const response = await routes.register(jsonRequest('POST', { username, password: PASSWORD }));
  const id = (
    await db!.query<{ id: string }>('SELECT id FROM accounts WHERE username = $1', [username])
  ).rows[0]!.id;
  if (member) {
    await db!.query(
      `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by)
       VALUES ($1, 'active', now() + interval '30 days', 1000000, 'root')`,
      [id],
    );
  }
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='))!
    .split(';')[0]!;
  return { cookie, ownerId: `acct:${id}` };
}

async function course(routes: Routes, id: string, ownerId: string, title: string) {
  await routes.storage.persistClassroom(
    { id, stage: { id, name: title, createdAt: 1, updatedAt: 1 }, scenes: [] },
    '',
    { ownerId },
  );
  await db!.query(
    `INSERT INTO course_shares (course_id, owner_id, title, state) VALUES ($1, $2, $3, 'shared')`,
    [id, ownerId, title],
  );
}

async function bonusOf(ownerId: string): Promise<number> {
  const result = await db!.query<{ tokens: string }>(
    'SELECT tokens FROM quota_bonus WHERE owner_id = $1',
    [ownerId],
  );
  return Number(result.rows[0]?.tokens ?? 0);
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- route bodies vary
async function json(response: Response): Promise<{ status: number; body: any }> {
  return { status: response.status, body: await response.clone().json() };
}

describe('course remixes', () => {
  it(
    'members remix open courses of others, within the daily limit, with credit and a royalty',
    async () => {
      const routes = await loadRoutes();
      const root = await signUp(routes, 'root');
      const bob = await signUp(routes, 'bob', true);
      const alice = await signUp(routes, 'alice', true);
      const carol = await signUp(routes, 'carol');
      const dave = await signUp(routes, 'dave', true);
      await course(routes, SOURCE, bob.ownerId, 'Limits');

      expect((await json(await routes.info(get(alice.cookie), params(SOURCE)))).body).toMatchObject(
        {
          canRemix: true,
          remixOf: null,
          remixes: [],
        },
      );
      expect((await json(await routes.info(get(bob.cookie), params(SOURCE)))).body).toMatchObject({
        canRemix: false,
        reason: 'OWN_COURSE',
      });
      expect((await json(await routes.info(get(carol.cookie), params(SOURCE)))).body).toMatchObject(
        {
          canRemix: false,
          reason: 'MEMBERSHIP_REQUIRED',
        },
      );

      // The browser imported the copy as alice's document first; then it records the remix.
      documents.set('remix-1', alice.ownerId);
      documents.set('someone-else', dave.ownerId);
      const notHers = await routes.record(
        jsonRequest('POST', { sourceId: SOURCE }, alice.cookie),
        params('someone-else'),
      );
      expect(notHers.status).toBe(404);
      const recorded = await routes.record(
        jsonRequest('POST', { sourceId: SOURCE }, alice.cookie),
        params('remix-1'),
      );
      expect(recorded.status).toBe(201);
      const again = await routes.record(
        jsonRequest('POST', { sourceId: SOURCE }, alice.cookie),
        params('remix-1'),
      );
      expect(again.status).toBe(409);

      // Staff set the daily limit; the second remix today is refused.
      expect(
        (
          await routes.setSetting(
            jsonRequest('PATCH', { key: 'remix.dailyLimit', value: 1 }, alice.cookie),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await routes.setSetting(
            jsonRequest('PATCH', { key: 'remix.dailyLimit', value: 1 }, root.cookie),
          )
        ).status,
      ).toBe(200);
      documents.set('remix-2', alice.ownerId);
      const limited = await routes.record(
        jsonRequest('POST', { sourceId: SOURCE }, alice.cookie),
        params('remix-2'),
      );
      expect(limited.status).toBe(429);
      expect((await json(await routes.info(get(alice.cookie), params(SOURCE)))).body).toMatchObject(
        {
          canRemix: false,
          reason: 'RATE_LIMITED',
        },
      );

      // Alice shares her remix; it credits bob and lists on his course.
      await course(routes, 'remix-1', alice.ownerId, 'Limits, with pictures');
      expect(
        (await json(await routes.info(get(dave.cookie), params('remix-1')))).body,
      ).toMatchObject({
        remixOf: { courseId: SOURCE, title: 'Limits', author: 'bob' },
      });
      expect(
        (await json(await routes.info(get(dave.cookie), params(SOURCE)))).body.remixes,
      ).toEqual([{ courseId: 'remix-1', title: 'Limits, with pictures', author: 'alice' }]);

      // A member's first read pays alice the reader reward and bob the default 25 % of it, once.
      await routes.viewer.rewardReaderIfEligible(new Headers({ cookie: dave.cookie }), 'remix-1');
      await routes.viewer.rewardReaderIfEligible(new Headers({ cookie: dave.cookie }), 'remix-1');
      expect(await bonusOf(alice.ownerId)).toBe(20_000);
      expect(await bonusOf(bob.ownerId)).toBe(5_000);
    },
    ROUTE_TIMEOUT_MS,
  );
});
