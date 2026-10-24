import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountServiceDeps, IssuedSession } from '@/lib/server/accounts/service';

/**
 * Owner isolation with real account sessions: the persistence route, the
 * agent-runtime document route and the Pi whiteboard callback. Every test has its
 * own in-process database, accounts are created through the real account service,
 * and every request goes through the real route handlers.
 */

/** A pg-shaped pool over one in-process database. It records every statement it runs. */
class PGlitePool {
  /** Statements that reached the database, in order. */
  readonly statements: string[] = [];
  /** When set, a session lookup fails the way an unreachable database would. */
  failSessionLookups = false;

  constructor(readonly db: PGlite) {}

  private async run(text: string, params?: unknown[]) {
    this.statements.push(text);
    if (this.failSessionLookups && text.includes('account_sessions s')) {
      throw new Error('simulated database outage');
    }
    return this.db.query(text, params);
  }

  query(text: string, params?: unknown[]) {
    return this.run(text, params);
  }

  async connect() {
    return {
      query: (text: string, params?: unknown[]) => this.run(text, params),
      release() {},
    };
  }

  async end() {
    await this.db.close();
  }

  /** How many statements looked up a session row. */
  sessionLookups(): number {
    return this.statements.filter((text) => text.includes('account_sessions s')).length;
  }
}

const TIMEOUT = 30_000;
const DEV_TOKEN = 'owner-isolation-dev-token';
const PASSWORD = 'correct-horse-battery';
/** Anonymous visitors, named the way the anonymous_id cookie names them. */
const VISITOR_A = '11111111-1111-4111-8111-111111111111';
const VISITOR_B = '22222222-2222-4222-8222-222222222222';
const RUNTIME_STAGE = 'stage-owner-isolation-runtime';
/** A well-formed session token that no account holds. */
const FORGED_TOKEN = 'A'.repeat(43);

let pool: PGlitePool;

/** A signed-in account as the requests of its browser see it. */
interface Visitor {
  /** The Cookie header a browser sends for this session. */
  cookie: string;
  /** The owner and learner partition this account's requests resolve to. */
  ownerId: string;
  token: string;
  accountId: string;
}

function course(stageId: string, name: string) {
  const now = 1_800_000_000_000;
  return {
    stage: { id: stageId, name, createdAt: now, updatedAt: now },
    scenes: [],
    outline: {
      outlines: [],
      requirement: name,
      generationComplete: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function runtimeSession(id: string, learnerKey: string) {
  const at = '2026-10-11T09:00:00.000Z';
  return {
    id,
    kind: 'chat',
    stageId: RUNTIME_STAGE,
    learnerKey,
    status: 'active',
    createdAt: at,
    updatedAt: at,
  };
}

function learnersPath(learnerKey: string): string {
  return `/runtime/stages/${RUNTIME_STAGE}/learners/${learnerKey}/sessions`;
}

async function accountDeps(): Promise<AccountServiceDeps> {
  const { DEFAULT_LOGIN_THROTTLE, LoginThrottle } =
    await import('@/lib/server/accounts/login-throttle');
  return {
    db: pool as unknown as AccountServiceDeps['db'],
    throttle: new LoginThrottle(DEFAULT_LOGIN_THROTTLE),
    registrationOpen: true,
  };
}

/** The name=value pair of the session Set-Cookie, which is what a browser sends back. */
async function sessionCookie(token: string): Promise<string> {
  const { sessionCookieHeader } = await import('@/lib/server/accounts/session');
  return sessionCookieHeader(token).split(';')[0]!;
}

async function visitorFrom(session: IssuedSession): Promise<Visitor> {
  const { accountOwnerId } = await import('@/lib/server/accounts/service');
  return {
    cookie: await sessionCookie(session.token),
    ownerId: accountOwnerId(session.accountId),
    token: session.token,
    accountId: session.accountId,
  };
}

async function signUp(username: string): Promise<Visitor> {
  const { registerAccount } = await import('@/lib/server/accounts/service');
  return visitorFrom(await registerAccount(await accountDeps(), { username, password: PASSWORD }));
}

/** Calls the persistence route, with the test pool injected for the account lookup. */
async function persistence(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<Response> {
  const { handlePersistenceRequest } = await import('@/app/api/persistence/[...path]/route');
  const headers: Record<string, string> = { ...options.headers };
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  return handlePersistenceRequest(
    new Request(`http://localhost/api/persistence${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
    }),
    { poolFactory: () => pool as never },
  );
}

/** The owner's course library from the agent-runtime document route. */
async function stagesResponse(cookie?: string): Promise<Response> {
  const { GET } = await import('@/app/api/stages/route');
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = cookie;
  return GET(new NextRequest('http://localhost/api/stages', { headers }));
}

async function listedStageIds(cookie: string): Promise<string[]> {
  const response = await stagesResponse(cookie);
  const body = (await response.json()) as { stages: Array<{ id: string }> };
  return body.stages.map((stage) => stage.id);
}

describe('owner isolation between accounts, anonymous visitors and the persistence route', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const connectionString = `postgres://owner-isolation-${randomUUID()}`;
    vi.stubEnv('DATABASE_URL', connectionString);
    vi.stubEnv('PERSISTENCE_DEV_TOKEN', DEV_TOKEN);
    vi.stubEnv('ASSET_S3_BUCKET', '');
    vi.stubEnv('OPENMAIC_AGENT_RUNTIME_ENABLED', 'true');
    await (await import('../helpers/account-owner-auth')).useAccountOwnerAuthentication();
    const db = new PGlite();
    await db.waitReady;
    pool = new PGlitePool(db);
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    // Creates every schema on this database, the account tables included.
    await getServerPersistenceProvider(connectionString, () => pool as never);
    pool.statements.length = 0;
  });

  afterEach(async () => {
    await pool.end();
    vi.unstubAllEnvs();
  });

  it(
    'lets only the owning account write its course, and refuses another account and an anonymous visitor',
    async () => {
      const stageId = 'stage-owner-writes';
      const owner = await signUp('owner-writes');
      const other = await signUp('other-writes');

      // Creation goes through the document path: the /stage path updates a course
      // that already exists, and answers 404 for one that does not.
      const created = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: owner.cookie,
        body: course(stageId, 'Owner course'),
      });
      expect(created.status).toBe(204);

      const ownerWrite = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: owner.cookie,
        body: course(stageId, 'Owner renamed').stage,
      });
      expect(ownerWrite.status).toBe(204);

      const foreign = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: other.cookie,
        body: course(stageId, 'Foreign edit').stage,
      });
      expect(foreign.status).toBe(403);
      await expect(foreign.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN_DOCUMENTS' },
      });

      const anonymous = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: `anonymous_id=${VISITOR_A}`,
        body: course(stageId, 'Anonymous edit').stage,
      });
      expect(anonymous.status).toBe(403);

      const read = await persistence(`/documents/${stageId}`, { cookie: owner.cookie });
      await expect(read.json()).resolves.toMatchObject({ stage: { name: 'Owner renamed' } });
    },
    TIMEOUT,
  );

  it(
    'partitions a signed-in runtime request by its session and ignores a spoofed x-learner-key',
    async () => {
      const alice = await signUp('alice-runtime');
      const bob = await signUp('bob-runtime');
      const sessionId = 'runtime-alice-1';

      // Alice's client also sends Bob's partition in the header. A signed-in request
      // never reads that header, so the session is created under Alice.
      const posted = await persistence('/runtime/sessions', {
        method: 'POST',
        cookie: alice.cookie,
        headers: { 'x-learner-key': bob.ownerId },
        body: runtimeSession(sessionId, alice.ownerId),
      });
      expect(posted.status).toBe(201);

      // Bob, presenting Alice's partition in the header, cannot read her session.
      const hidden = await persistence(`/runtime/sessions/${sessionId}`, {
        cookie: bob.cookie,
        headers: { 'x-learner-key': alice.ownerId },
      });
      expect(hidden.status).toBe(404);
      await expect(hidden.json()).resolves.toMatchObject({
        error: { code: 'SESSION_NOT_FOUND' },
      });

      // Bob's own partition is empty, whatever the header says.
      const bobOwn = await persistence(learnersPath(bob.ownerId), {
        cookie: bob.cookie,
        headers: { 'x-learner-key': alice.ownerId },
      });
      expect(bobOwn.status).toBe(200);
      await expect(bobOwn.json()).resolves.toEqual([]);

      // Naming Alice's partition in the path is refused to Bob.
      const bobNamesAlice = await persistence(learnersPath(alice.ownerId), {
        cookie: bob.cookie,
        headers: { 'x-learner-key': alice.ownerId },
      });
      expect(bobNamesAlice.status).toBe(403);
      await expect(bobNamesAlice.json()).resolves.toMatchObject({
        error: { code: 'FORBIDDEN_LEARNER' },
      });

      // Alice still lists her session, and the header Bob's client sent does not move her.
      const aliceOwn = await persistence(learnersPath(alice.ownerId), {
        cookie: alice.cookie,
        headers: { 'x-learner-key': bob.ownerId },
      });
      expect(aliceOwn.status).toBe(200);
      await expect(aliceOwn.json()).resolves.toEqual([
        expect.objectContaining({ id: sessionId, learnerKey: alice.ownerId }),
      ]);
    },
    TIMEOUT,
  );

  it(
    'treats a malformed session cookie as the anonymous visitor it accompanies, and refuses a forged well-formed one',
    async () => {
      const account = await signUp('forged-cookie-owner');
      const accountStage = 'stage-forged-cookie-account';
      const accountWrite = await persistence(`/documents/${accountStage}`, {
        method: 'PUT',
        cookie: account.cookie,
        body: course(accountStage, 'Account course'),
      });
      expect(accountWrite.status).toBe(204);

      const stageId = 'stage-forged-cookie';
      const visitor = `anonymous_id=${VISITOR_A}`;
      const visitorWrite = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: visitor,
        body: course(stageId, 'Visitor course'),
      });
      expect(visitorWrite.status).toBe(204);

      const malformed = `${visitor}; openmaic_session=not-a-session-token`;
      const wellFormed = `${visitor}; openmaic_session=${FORGED_TOKEN}`;

      // A malformed cookie falls back to the visitor's own partition and never sees the account's course.
      await expect(listedStageIds(malformed)).resolves.toEqual([stageId]);
      // A well-formed cookie that no live session backs is refused, not demoted silently (D-12).
      const refused = await stagesResponse(wellFormed);
      expect(refused.status).toBe(401);
      await expect(refused.json()).resolves.toMatchObject({ errorCode: 'SESSION_ENDED' });
      const edit = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: malformed,
        body: course(stageId, 'Edited by the visitor').stage,
      });
      expect(edit.status).toBe(204);

      // With no anonymous cookie, the forged session is refused too, and nothing is minted for it.
      const fresh = await stagesResponse(`openmaic_session=${FORGED_TOKEN}`);
      expect(fresh.status).toBe(401);
      expect(fresh.headers.get('set-cookie')).toContain('openmaic_session=;');
      expect(fresh.headers.get('set-cookie')).not.toContain('anonymous_id=');
    },
    TIMEOUT,
  );

  it(
    'mints no anonymous cookie for a signed-in request, and mints one for a request with no session',
    async () => {
      const account = await signUp('no-cookie-minting');

      const signedIn = await stagesResponse(account.cookie);
      expect(signedIn.status).toBe(200);
      expect(signedIn.headers.get('set-cookie')).toBeNull();

      const anonymous = await stagesResponse(`anonymous_id=${VISITOR_A}`);
      expect(anonymous.headers.get('set-cookie')).toBeNull();

      const bare = await stagesResponse();
      expect(bare.headers.get('set-cookie')).toContain('anonymous_id=');
      await expect(bare.json()).resolves.toEqual({ stages: [] });
    },
    TIMEOUT,
  );

  it(
    'revokes a session on sign-out: the old cookie is refused and cleared, and the account courses stay with the account',
    async () => {
      const stageId = 'stage-after-logout';
      const first = await signUp('logout-owner');
      const created = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: first.cookie,
        body: course(stageId, 'Account course'),
      });
      expect(created.status).toBe(204);
      await expect(listedStageIds(first.cookie)).resolves.toEqual([stageId]);

      const { loginAccount, logoutAccount } = await import('@/lib/server/accounts/service');
      const deps = await accountDeps();
      // A second session of the same account is unaffected by signing out of the first.
      const second = await visitorFrom(
        await loginAccount(deps, { username: 'logout-owner', password: PASSWORD }),
      );
      await logoutAccount(deps, first.token);

      // The revoked cookie is refused and the response clears it (D-12).
      const afterLogout = await stagesResponse(first.cookie);
      expect(afterLogout.status).toBe(401);
      expect(afterLogout.headers.get('set-cookie')).toContain('openmaic_session=;');
      await expect(afterLogout.json()).resolves.toMatchObject({ errorCode: 'SESSION_ENDED' });

      const write = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: first.cookie,
        body: course(stageId, 'After sign-out').stage,
      });
      expect(write.status).toBe(401);

      await expect(listedStageIds(second.cookie)).resolves.toEqual([stageId]);
    },
    TIMEOUT,
  );

  it(
    'does not carry courses created under an anonymous cookie into the account after sign-in',
    async () => {
      const stageId = 'stage-before-sign-in';
      const visitor = `anonymous_id=${VISITOR_A}`;
      const created = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: visitor,
        body: course(stageId, 'Before sign-in'),
      });
      expect(created.status).toBe(204);

      const account = await signUp('after-sign-in');
      // Documented limitation: there is no claim-on-sign-in. The course stays with the
      // anonymous partition, so the account neither lists it nor can write it. A claim
      // feature must change these expectations deliberately.
      await expect(listedStageIds(account.cookie)).resolves.toEqual([]);
      const claim = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: account.cookie,
        body: course(stageId, 'Claimed').stage,
      });
      expect(claim.status).toBe(403);
      await expect(listedStageIds(visitor)).resolves.toEqual([stageId]);
    },
    TIMEOUT,
  );

  it(
    'answers a signed-in request in production too, with no persistence credential of any kind',
    async () => {
      const account = await signUp('no-dev-token');

      const runtime = await persistence(learnersPath(account.ownerId), { cookie: account.cookie });
      expect(runtime.status).toBe(200);
      await expect(runtime.json()).resolves.toEqual([]);

      const written = await persistence('/documents/stage-no-token', {
        method: 'PUT',
        cookie: account.cookie,
        body: course('stage-no-token', 'Written without a token'),
      });
      expect(written.status).toBe(204);

      vi.stubEnv('NODE_ENV', 'production');
      const inProduction = await persistence(learnersPath(account.ownerId), {
        cookie: account.cookie,
      });
      expect(inProduction.status).toBe(200);
    },
    TIMEOUT,
  );

  it(
    'keeps a private course to its owner, opens a published one to everyone, and keeps writes and deletes with the owner',
    async () => {
      const stageId = 'stage-capability-read';
      const owner = await signUp('read-owner');
      const other = await signUp('read-other');
      const created = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: owner.cookie,
        body: course(stageId, 'Private course'),
      });
      expect(created.status).toBe(204);

      const ownRead = await persistence(`/documents/${stageId}`, { cookie: owner.cookie });
      expect(ownRead.status).toBe(200);
      // A private course answers as missing to anyone else, so the id is not an oracle.
      for (const cookie of [other.cookie, `anonymous_id=${VISITOR_B}`]) {
        const read = await persistence(`/documents/${stageId}`, { cookie });
        expect(read.status).toBe(404);
      }

      await pool.query('UPDATE stage_meta SET is_public = true WHERE stage_id = $1', [stageId]);
      for (const cookie of [other.cookie, `anonymous_id=${VISITOR_B}`]) {
        const read = await persistence(`/documents/${stageId}`, { cookie });
        expect(read.status).toBe(200);
        await expect(read.json()).resolves.toMatchObject({ stage: { id: stageId } });
      }

      const foreignWrite = await persistence(`/documents/${stageId}/stage`, {
        method: 'PUT',
        cookie: other.cookie,
        body: course(stageId, 'Foreign edit').stage,
      });
      expect(foreignWrite.status).toBe(403);

      const foreignDelete = await persistence(`/documents/${stageId}`, {
        method: 'DELETE',
        cookie: other.cookie,
      });
      expect(foreignDelete.status).toBe(403);
    },
    TIMEOUT,
  );

  it(
    'looks a session up at most once per persistence request, and never for an anonymous one',
    async () => {
      const stageId = 'stage-single-lookup';
      const account = await signUp('single-lookup');
      pool.statements.length = 0;

      const write = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: account.cookie,
        body: course(stageId, 'One lookup'),
      });
      expect(write.status).toBe(204);
      expect(pool.sessionLookups()).toBe(1);

      pool.statements.length = 0;
      const runtime = await persistence(learnersPath(account.ownerId), {
        cookie: account.cookie,
        headers: { 'x-learner-key': 'anon:spoofed' },
      });
      expect(runtime.status).toBe(200);
      expect(pool.sessionLookups()).toBe(1);

      pool.statements.length = 0;
      await persistence(learnersPath(`anon:${VISITOR_A}`), {
        cookie: `anonymous_id=${VISITOR_A}`,
        headers: { authorization: `Bearer ${DEV_TOKEN}` },
      });
      expect(pool.sessionLookups()).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'fails closed when a well-formed session cookie cannot be checked, rather than acting as the anonymous owner',
    async () => {
      const stageId = 'stage-fail-closed';
      const visitor = `anonymous_id=${VISITOR_A}`;
      const created = await persistence(`/documents/${stageId}`, {
        method: 'PUT',
        cookie: visitor,
        body: course(stageId, 'Visitor course'),
      });
      expect(created.status).toBe(204);
      const account = await signUp('fail-closed-owner');
      const mixed = `${visitor}; ${account.cookie}`;

      pool.failSessionLookups = true;
      try {
        // The owner seam lets a method that cannot decide throw: the request is a server error
        // (Next answers 500), and neither the anonymous owner nor a later method is asked.
        await expect(
          persistence(`/documents/${stageId}/stage`, {
            method: 'PUT',
            cookie: mixed,
            body: course(stageId, 'Must not land').stage,
          }),
        ).rejects.toThrow('simulated database outage');

        await expect(stagesResponse(mixed)).rejects.toThrow('simulated database outage');
      } finally {
        pool.failSessionLookups = false;
      }

      const read = await persistence(`/documents/${stageId}`, { cookie: visitor });
      await expect(read.json()).resolves.toMatchObject({ stage: { name: 'Visitor course' } });
    },
    TIMEOUT,
  );

  it(
    'settles a whiteboard visibility query only for the account partition that asked it',
    async () => {
      const alice = await signUp('alice-whiteboard');
      const bob = await signUp('bob-whiteboard');
      const { queryWhiteboardVisibility } = await import('@/lib/chat/pi/whiteboard-visibility');
      const { POST } = await import('@/app/api/chat/pi/whiteboard-visibility/route');

      let queryId = '';
      const pending = queryWhiteboardVisibility({
        stageId: 'stage-whiteboard',
        learnerKey: alice.ownerId,
        timeoutMs: 10_000,
        dispatch: async (id) => {
          queryId = id;
        },
      });
      await vi.waitFor(() => expect(queryId).not.toBe(''));

      const settle = (visibility: 'open' | 'closed', headers: Record<string, string>) =>
        POST(
          new Request('http://localhost/api/chat/pi/whiteboard-visibility', {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body: JSON.stringify({ queryId, stageId: 'stage-whiteboard', visibility }),
          }) as unknown as NextRequest,
        );

      // Bob, presenting Alice's partition in the header, cannot settle her query.
      const bobAttempt = await settle('closed', {
        cookie: bob.cookie,
        'x-learner-key': alice.ownerId,
      });
      expect(bobAttempt.status).toBe(404);

      // Alice settles her own query, and the visibility she reports reaches the caller.
      const aliceSettle = await settle('closed', { cookie: alice.cookie });
      expect(aliceSettle.status).toBe(204);
      await expect(pending).resolves.toBe('closed');
    },
    TIMEOUT,
  );
});
