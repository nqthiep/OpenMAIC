import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as getScenes } from '@/app/api/stages/[id]/scenes/route';
import { GET as getManifest } from '@/app/api/stages/[id]/manifest/route';
import { GET as getPersistence } from '@/app/api/persistence/[...path]/route';
import {
  DELETE as deleteStage,
  GET as getStage,
  PATCH as patchStage,
} from '@/app/api/stages/[id]/route';
import { GET as listStages, POST as createStage } from '@/app/api/stages/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount, updateAccount } from '@/lib/accounts/service';
import { setStagePublished } from '@/lib/persistence/stage-meta';
import { resetOwnerAuthenticationForTests } from '@/lib/server/identity/registry';

import {
  accountsTestUrl,
  makeRequest,
  openTestSchema,
  send,
  sessionCookieOf,
  type TestSchema,
} from './_pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe.skipIf(!accountsTestUrl)('owner isolation between accounts', () => {
  let schema: TestSchema;
  let pool: Pool;
  let accountA: { id: string; username: string };
  let accountB: { id: string; username: string };
  let cookieA: string;
  let cookieB: string;
  let draftId: string;
  let publicId: string;

  async function newAccount(mustChangePassword = false) {
    const username = `o${Math.random().toString(36).slice(2, 10)}`;
    const created = await createAccount(pool, {
      actorId: null,
      username,
      displayName: username,
      role: 'user',
      password: PASSWORD,
      mustChangePassword,
      now: Date.now(),
    });
    return { id: created.user.id, username };
  }

  async function signIn(username: string): Promise<string> {
    const response = await send(
      makeRequest('/api/auth/login', { method: 'POST', body: { username, password: PASSWORD } }),
      loginRoute,
    );
    const cookie = sessionCookieOf(response);
    if (cookie === undefined) throw new Error('sign-in did not set a session');
    return cookie;
  }

  beforeAll(async () => {
    schema = await openTestSchema('isolation');
    vi.stubEnv('DATABASE_URL', schema.url);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    pool = (await getServerPersistenceProvider(schema.url)).pool;
    await ensureAccountsSchema(pool);
    resetOwnerAuthenticationForTests();
    configureAccountsAuthentication();

    accountA = await newAccount();
    accountB = await newAccount();
    cookieA = await signIn(accountA.username);
    cookieB = await signIn(accountB.username);

    const draft = await send(
      makeRequest('/api/stages', { method: 'POST', cookie: cookieA, body: { name: 'A draft' } }),
      createStage,
    );
    expect(draft.status).toBe(201);
    draftId = ((await draft.json()) as { stage: { id: string } }).stage.id;

    const published = await send(
      makeRequest('/api/stages', {
        method: 'POST',
        cookie: cookieA,
        body: { name: 'A public course' },
      }),
      createStage,
    );
    publicId = ((await published.json()) as { stage: { id: string } }).stage.id;
    await setStagePublished(
      pool as unknown as Parameters<typeof setStagePublished>[0],
      publicId,
      true,
      Date.now(),
    );
  });

  afterAll(async () => {
    resetOwnerAuthenticationForTests();
    vi.unstubAllEnvs();
    await pool.end();
    await schema.close();
  });

  it('records the course under the account owner id, acct_<uuid>', async () => {
    const row = await pool.query<{ owner_id: string }>(
      'SELECT owner_id FROM stage_meta WHERE stage_id = $1',
      [draftId],
    );
    expect(row.rows[0]?.owner_id).toBe(`acct_${accountA.id}`);
  });

  it("hides another account's draft from the course list", async () => {
    const response = await send(makeRequest('/api/stages', { cookie: cookieB }), listStages);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { stages: Array<{ id: string }> };
    expect(body.stages.map((stage) => stage.id)).not.toContain(draftId);
  });

  it("answers another account's draft with 404 on read, rename and delete, and keeps it", async () => {
    const read = await send(makeRequest(`/api/stages/${draftId}`, { cookie: cookieB }), (req) =>
      getStage(req, params(draftId)),
    );
    expect(read.status).toBe(404);
    const rename = await send(
      makeRequest(`/api/stages/${draftId}`, {
        method: 'PATCH',
        cookie: cookieB,
        body: { name: 'taken' },
      }),
      (req) => patchStage(req, params(draftId)),
    );
    expect(rename.status).toBe(404);
    const remove = await send(
      makeRequest(`/api/stages/${draftId}`, { method: 'DELETE', cookie: cookieB }),
      (req) => deleteStage(req, params(draftId)),
    );
    expect(remove.status).not.toBe(200);
    const stillThere = await send(
      makeRequest(`/api/stages/${draftId}`, { cookie: cookieA }),
      (req) => getStage(req, params(draftId)),
    );
    expect(stillThere.status).toBe(200);
  });

  it('lets an account read its own draft and its scenes', async () => {
    const response = await send(
      makeRequest(`/api/stages/${draftId}/scenes?ids=scene-1`, { cookie: cookieA }),
      (req) => getScenes(req, params(draftId)),
    );
    expect(response.status).toBe(200);
  });

  // Depends on the read path that WP-H2 changes (owner checks on GET stage, scenes and
  // document download). Until that lands, these two fail on purpose.
  it('lets another account read a published course', async () => {
    const response = await send(
      makeRequest(`/api/stages/${publicId}`, { cookie: cookieB }),
      (req) => getStage(req, params(publicId)),
    );
    expect(response.status).toBe(200);
  });

  it('lets another account read the scenes of a published course', async () => {
    const response = await send(
      makeRequest(`/api/stages/${publicId}/scenes?ids=scene-1`, { cookie: cookieB }),
      (req) => getScenes(req, params(publicId)),
    );
    expect(response.status).toBe(200);
  });

  it("answers another account's draft with 404 on scenes, manifest and the document read", async () => {
    const scenes = await send(
      makeRequest(`/api/stages/${draftId}/scenes?ids=scene-1`, { cookie: cookieB }),
      (req) => getScenes(req, params(draftId)),
    );
    expect(scenes.status).toBe(404);
    const manifest = await send(
      makeRequest(`/api/stages/${draftId}/manifest`, { cookie: cookieB }),
      (req) => getManifest(req, params(draftId)),
    );
    expect(manifest.status).toBe(404);
    const document = await send(
      makeRequest(`/api/persistence/documents/${draftId}`, { cookie: cookieB }),
      getPersistence,
    );
    expect(document.status).toBe(404);
  });

  it("lets another account read a published course's manifest", async () => {
    const manifest = await send(
      makeRequest(`/api/stages/${publicId}/manifest`, { cookie: cookieB }),
      (req) => getManifest(req, params(publicId)),
    );
    expect(manifest.status).toBe(200);
  });

  it("lets another account read a published course's document", async () => {
    const document = await send(
      makeRequest(`/api/persistence/documents/${publicId}`, { cookie: cookieB }),
      getPersistence,
    );
    expect(document.status).toBe(200);
  });

  it('answers an anonymous request on the course list with 401', async () => {
    const response = await send(makeRequest('/api/stages'), listStages);
    expect(response.status).toBe(401);
  });

  it('ends an account that signed out: its old cookie no longer reads the library', async () => {
    const cookie = await signIn(accountA.username);
    await send(makeRequest('/api/auth/logout', { method: 'POST', cookie }), logoutRoute);
    expect((await send(makeRequest('/api/stages', { cookie }), listStages)).status).toBe(401);
  });

  it('ends a deactivated account at once, on its existing session', async () => {
    const victim = await newAccount();
    const cookie = await signIn(victim.username);
    expect((await send(makeRequest('/api/stages', { cookie }), listStages)).status).toBe(200);
    await updateAccount(pool, {
      actorId: null,
      targetId: victim.id,
      status: 'disabled',
      now: Date.now(),
    });
    expect((await send(makeRequest('/api/stages', { cookie }), listStages)).status).toBe(401);
  });

  it('holds an account that must change its password out of the course list', async () => {
    const pending = await newAccount(true);
    const cookie = await signIn(pending.username);
    const response = await send(makeRequest('/api/stages', { cookie }), listStages);
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('PASSWORD_CHANGE_REQUIRED');
  });
});
