import { randomUUID } from 'node:crypto';

import type { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { GET as auditRoute } from '@/app/api/admin/audit/route';
import { PATCH as updateUser } from '@/app/api/admin/users/[id]/route';
import { POST as resetPassword } from '@/app/api/admin/users/[id]/reset-password/route';
import { GET as listUsers, POST as createUser } from '@/app/api/admin/users/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { GET as meRoute } from '@/app/api/auth/me/route';
import { configureAccountsAuthentication } from '@/lib/accounts/boot';
import { insertAccount, insertAudit } from '@/lib/accounts/repository';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount } from '@/lib/accounts/service';
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
const uniq = () => randomUUID().slice(0, 8);
const noRoute = async () => {
  throw new Error('the route must not run');
};

/** Every secret a response could leak. The audit log must hold none of them. */
const secrets = new Set<string>([PASSWORD]);

interface AdminCall {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: unknown;
  run: (req: NextRequest) => Promise<Response>;
}

describe.skipIf(!accountsTestUrl)('admin routes', () => {
  let schema: TestSchema;
  let pool: Pool;
  let adminId: string;
  let adminName: string;
  let adminCookie: string;
  let userId: string;
  let userName: string;
  let userCookie: string;

  beforeAll(async () => {
    schema = await openTestSchema('admin');
    vi.stubEnv('DATABASE_URL', schema.url);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    vi.stubEnv('OWNER_SINGLE_USER', '');
    vi.stubEnv('PERSISTENCE_SHARED_OWNER_ID', '');
    const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
    pool = (await getServerPersistenceProvider(schema.url)).pool;
    await ensureAccountsSchema(pool);
    resetOwnerAuthenticationForTests();
    configureAccountsAuthentication();

    const admin = await account('admin');
    adminId = admin.id;
    adminName = admin.username;
    adminCookie = await signIn(adminName);
    const user = await account('user');
    userId = user.id;
    userName = user.username;
    userCookie = await signIn(userName);
  });

  afterAll(async () => {
    resetOwnerAuthenticationForTests();
    vi.unstubAllEnvs();
    await pool.end();
    await schema.close();
  });

  async function account(role: 'user' | 'admin', options: { mustChangePassword?: boolean } = {}) {
    const username = `ad${uniq()}`;
    const created = await createAccount(pool, {
      actorId: null,
      username,
      displayName: username,
      role,
      password: PASSWORD,
      mustChangePassword: options.mustChangePassword ?? false,
      now: Date.now(),
    });
    return { id: created.user.id, username };
  }

  function signInResponse(username: string, password = PASSWORD) {
    return send(
      makeRequest('/api/auth/login', { method: 'POST', body: { username, password } }),
      loginRoute,
    );
  }

  async function signIn(username: string, password = PASSWORD): Promise<string> {
    const cookie = sessionCookieOf(await signInResponse(username, password));
    if (cookie === undefined) throw new Error('sign-in did not set a session');
    secrets.add(cookie.slice('openmaic_session='.length));
    return cookie;
  }

  async function meStatus(cookie: string): Promise<number> {
    return (await send(makeRequest('/api/auth/me', { cookie }), meRoute)).status;
  }

  function usersQuery(cookie: string, query = '') {
    return send(makeRequest(`/api/admin/users${query}`, { cookie }), listUsers);
  }

  function patchUser(id: string, body: unknown, cookie: string) {
    return send(makeRequest(`/api/admin/users/${id}`, { method: 'PATCH', body, cookie }), (req) =>
      updateUser(req, params(id)),
    );
  }

  function createRequest(body: unknown, cookie: string) {
    return send(makeRequest('/api/admin/users', { method: 'POST', body, cookie }), createUser);
  }

  function callsFor(id: string): AdminCall[] {
    return [
      { method: 'GET', path: '/api/admin/users', run: (req) => listUsers(req) },
      {
        method: 'POST',
        path: '/api/admin/users',
        body: { username: 'nobody', displayName: 'Nobody', role: 'user' },
        run: (req) => createUser(req),
      },
      {
        method: 'PATCH',
        path: `/api/admin/users/${id}`,
        body: { displayName: 'Changed' },
        run: (req) => updateUser(req, params(id)),
      },
      {
        method: 'POST',
        path: `/api/admin/users/${id}/reset-password`,
        run: (req) => resetPassword(req, params(id)),
      },
      { method: 'GET', path: '/api/admin/audit', run: (req) => auditRoute(req) },
    ];
  }

  function requestFor(call: AdminCall, cookie?: string) {
    return makeRequest(call.path, {
      method: call.method,
      ...(call.body === undefined ? {} : { body: call.body }),
      ...(cookie === undefined ? {} : { cookie }),
    });
  }

  async function allAudit(cookie: string) {
    const entries: Array<{
      id: string;
      action: string;
      actor: { id: string; username: string | null } | null;
      target: { id: string; username: string | null } | null;
      detail: Record<string, unknown>;
    }> = [];
    let cursor: string | null = null;
    do {
      const query = cursor === null ? '' : `?cursor=${cursor}`;
      const response = await send(makeRequest(`/api/admin/audit${query}`, { cookie }), auditRoute);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        entries: typeof entries;
        nextCursor: string | null;
      };
      entries.push(...body.entries);
      cursor = body.nextCursor;
    } while (cursor !== null);
    return entries;
  }

  it('answers 401 on every admin route without a session, through the proxy and in the route itself', async () => {
    for (const call of callsFor(adminId)) {
      const proxied = await send(requestFor(call), call.run);
      expect(proxied.status, call.path).toBe(401);
      const direct = await call.run(requestFor(call));
      expect(direct.status, call.path).toBe(401);
      expect((await direct.json()).errorCode).toBe('UNAUTHENTICATED');
    }
  });

  it('answers 403 with an error that names the role, to an ordinary user, and changes nothing', async () => {
    const before = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM accounts_users');
    for (const call of callsFor(userId)) {
      const response = await send(requestFor(call, userCookie), call.run);
      expect(response.status, call.path).toBe(403);
      expect((await response.json()).errorCode).toBe('FORBIDDEN');
    }
    const after = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM accounts_users');
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
    const row = await pool.query<{ display_name: string }>(
      'SELECT display_name FROM accounts_users WHERE id = $1',
      [userId],
    );
    expect(row.rows[0]?.display_name).toBe(userName);
  });

  it('lists accounts in pages of 50 without any password hash, and filters them', async () => {
    const tag = `pg${uniq()}`;
    for (let index = 0; index < 55; index += 1) {
      await insertAccount(pool, {
        id: randomUUID(),
        username: `${tag}${String(index).padStart(3, '0')}`,
        displayName: `Học viên ${index}`,
        passwordHash: 'scrypt$not-a-real-hash',
        role: 'user',
        mustChangePassword: false,
        now: new Date(),
      });
    }
    const first = (await (await usersQuery(adminCookie, `?q=${tag}`)).json()) as {
      users: Array<{ id: string; username: string }>;
      nextCursor: string | null;
    };
    expect(first.users).toHaveLength(50);
    expect(first.nextCursor).toBe(first.users[49]?.username);
    const text = JSON.stringify(first);
    expect(text).not.toContain('scrypt');
    expect(text).not.toContain('passwordHash');

    const second = (await (
      await usersQuery(adminCookie, `?q=${tag}&cursor=${first.nextCursor}`)
    ).json()) as { users: Array<{ username: string }>; nextCursor: string | null };
    expect(second.users).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const seen = [...first.users, ...second.users].map((user) => user.username);
    expect(new Set(seen).size).toBe(55);

    const target = first.users[0];
    if (!target) throw new Error('no account listed');
    expect((await patchUser(target.id, { status: 'disabled' }, adminCookie)).status).toBe(200);
    const disabled = (await (
      await usersQuery(adminCookie, `?q=${tag}&status=disabled`)
    ).json()) as {
      users: Array<{ username: string }>;
    };
    expect(disabled.users.map((user) => user.username)).toEqual([target.username]);
    const admins = (await (await usersQuery(adminCookie, `?q=${tag}&role=admin`)).json()) as {
      users: unknown[];
    };
    expect(admins.users).toEqual([]);
    expect((await usersQuery(adminCookie, '?status=frozen')).status).toBe(400);
    expect((await usersQuery(adminCookie, '?role=owner')).status).toBe(400);
  });

  it('creates an account with a temporary password shown once, and the account must change it at its first sign-in', async () => {
    const username = `New.${uniq()}`;
    const created = await createRequest(
      { username, displayName: 'Nguyễn Văn An', role: 'user' },
      adminCookie,
    );
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const body = (await created.json()) as {
      user: { username: string; role: string; status: string; mustChangePassword: boolean };
      temporaryPassword: string;
    };
    expect(body.user).toMatchObject({
      username: username.toLowerCase(),
      role: 'user',
      status: 'active',
      mustChangePassword: true,
    });
    const temporary = body.temporaryPassword;
    expect(temporary).toMatch(/^[a-z0-9]{4}(-[a-z0-9]{4}){3}$/);
    secrets.add(temporary);

    const listed = await (await usersQuery(adminCookie, `?q=${username.toLowerCase()}`)).json();
    expect(JSON.stringify(listed)).not.toContain(temporary);

    const signed = await signIn(username.toLowerCase(), temporary);
    const me = (await (
      await send(makeRequest('/api/auth/me', { cookie: signed }), meRoute)
    ).json()) as {
      mustChangePassword: boolean;
    };
    expect(me.mustChangePassword).toBe(true);
    const blocked = await send(makeRequest('/api/stages', { cookie: signed }), noRoute);
    expect(blocked.status).toBe(401);
    expect((await blocked.json()).errorCode).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('creates an account with the password the administrator chooses, and still requires its change', async () => {
    const username = `own${uniq()}`;
    const created = await createRequest(
      { username, displayName: username, role: 'user', password: 'a password of my own' },
      adminCookie,
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      user: { mustChangePassword: boolean };
      temporaryPassword?: string;
    };
    expect(body.temporaryPassword).toBeUndefined();
    expect(body.user.mustChangePassword).toBe(true);
    expect((await signInResponse(username, 'a password of my own')).status).toBe(200);
  });

  it('refuses a weak password, a taken username in any letter case, and a reserved name', async () => {
    const weak = await createRequest(
      { username: `weak${uniq()}`, displayName: 'Weak', role: 'user', password: 'short' },
      adminCookie,
    );
    expect(weak.status).toBe(400);
    expect(await weak.json()).toMatchObject({ errorCode: 'WEAK_PASSWORD', reason: 'length' });

    const name = `Dup.${uniq()}`;
    expect(
      (await createRequest({ username: name, displayName: 'Dup', role: 'user' }, adminCookie))
        .status,
    ).toBe(201);
    const taken = await createRequest(
      { username: name.toUpperCase(), displayName: 'Dup', role: 'user' },
      adminCookie,
    );
    expect(taken.status).toBe(409);
    expect((await taken.json()).errorCode).toBe('USERNAME_TAKEN');

    const reserved = await createRequest(
      { username: 'admin', displayName: 'Admin', role: 'user' },
      adminCookie,
    );
    expect(reserved.status).toBe(400);
    expect(await reserved.json()).toMatchObject({
      errorCode: 'INVALID_USERNAME',
      reason: 'reserved',
    });

    const badRole = await createRequest(
      { username: `role${uniq()}`, displayName: 'Role', role: 'owner' },
      adminCookie,
    );
    expect(badRole.status).toBe(400);
  });

  it('changes the display name and the role, and a role change applies to the open session at once', async () => {
    const target = await account('user');
    const cookie = await signIn(target.username);
    expect((await usersQuery(cookie)).status).toBe(403);

    const promoted = await patchUser(
      target.id,
      { displayName: 'Tên mới', role: 'admin' },
      adminCookie,
    );
    expect(promoted.status).toBe(200);
    expect(await promoted.json()).toMatchObject({
      user: { displayName: 'Tên mới', role: 'admin' },
    });
    expect((await usersQuery(cookie)).status).toBe(200);

    expect((await patchUser(target.id, { role: 'user' }, adminCookie)).status).toBe(200);
    expect((await usersQuery(cookie)).status).toBe(403);
  });

  it('deactivating an account ends its sessions at once, and reactivating it restores sign-in', async () => {
    const target = await account('user');
    const one = await signIn(target.username);
    const two = await signIn(target.username);
    expect(await meStatus(one)).toBe(200);

    expect((await patchUser(target.id, { status: 'disabled' }, adminCookie)).status).toBe(200);
    expect(await meStatus(one)).toBe(401);
    expect(await meStatus(two)).toBe(401);
    const refused = await signInResponse(target.username);
    expect(refused.status).toBe(401);
    expect((await refused.json()).errorCode).toBe('INVALID_CREDENTIALS');

    expect((await patchUser(target.id, { status: 'active' }, adminCookie)).status).toBe(200);
    await signIn(target.username);
  });

  it('deleting an account keeps its username taken, ends its sessions, and cannot be undone', async () => {
    const target = await account('user');
    const cookie = await signIn(target.username);
    const removed = await patchUser(target.id, { status: 'deleted' }, adminCookie);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ user: { status: 'deleted' } });
    expect(await meStatus(cookie)).toBe(401);
    expect((await signInResponse(target.username)).status).toBe(401);

    const again = await createRequest(
      { username: target.username, displayName: 'Again', role: 'user' },
      adminCookie,
    );
    expect(again.status).toBe(409);
    expect((await again.json()).errorCode).toBe('USERNAME_TAKEN');

    const revive = await patchUser(target.id, { status: 'active' }, adminCookie);
    expect(revive.status).toBe(409);
    expect((await revive.json()).errorCode).toBe('DELETED');
    const rename = await patchUser(target.id, { displayName: 'Renamed' }, adminCookie);
    expect(rename.status).toBe(409);
  });

  it('refuses a malformed change, an unknown field, and an id that is not an account', async () => {
    const target = await account('user');
    expect((await patchUser(target.id, { username: 'other' }, adminCookie)).status).toBe(400);
    expect((await patchUser(target.id, { role: 'boss' }, adminCookie)).status).toBe(400);
    expect((await patchUser(target.id, { status: 'frozen' }, adminCookie)).status).toBe(400);
    expect((await patchUser(target.id, {}, adminCookie)).status).toBe(400);
    expect((await patchUser('not-an-id', { displayName: 'x' }, adminCookie)).status).toBe(404);
    expect((await patchUser(randomUUID(), { displayName: 'x' }, adminCookie)).status).toBe(404);
  });

  it('resets a password: a temporary one shown once, must change at the next sign-in, and every session ends', async () => {
    const target = await account('user');
    const one = await signIn(target.username);
    const two = await signIn(target.username);

    const reset = await send(
      makeRequest(`/api/admin/users/${target.id}/reset-password`, {
        method: 'POST',
        cookie: adminCookie,
      }),
      (req) => resetPassword(req, params(target.id)),
    );
    expect(reset.status).toBe(200);
    expect(reset.headers.get('cache-control')).toBe('no-store');
    const { temporaryPassword } = (await reset.json()) as { temporaryPassword: string };
    secrets.add(temporaryPassword);

    expect(await meStatus(one)).toBe(401);
    expect(await meStatus(two)).toBe(401);
    expect((await signInResponse(target.username, PASSWORD)).status).toBe(401);

    const signed = await signIn(target.username, temporaryPassword);
    const me = (await (
      await send(makeRequest('/api/auth/me', { cookie: signed }), meRoute)
    ).json()) as {
      mustChangePassword: boolean;
    };
    expect(me.mustChangePassword).toBe(true);

    const again = await send(
      makeRequest(`/api/admin/users/${target.id}/reset-password`, {
        method: 'POST',
        cookie: adminCookie,
      }),
      (req) => resetPassword(req, params(target.id)),
    );
    const next = ((await again.json()) as { temporaryPassword: string }).temporaryPassword;
    secrets.add(next);
    expect(next).not.toBe(temporaryPassword);
    expect((await signInResponse(target.username, temporaryPassword)).status).toBe(401);
  });

  it('writes an audit entry for each admin action, with the administrator as actor, and no hash, token or password in any entry', async () => {
    const entries = await allAudit(adminCookie);
    const actions = entries.map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining(['user.create', 'user.update', 'user.password_reset']),
    );

    const created = entries.find(
      (entry) => entry.action === 'user.create' && entry.target?.username?.startsWith('new.'),
    );
    expect(created?.actor).toEqual({ id: adminId, username: adminName });
    expect(created?.detail).toMatchObject({ role: 'user', generatedPassword: true });

    const reset = entries.find((entry) => entry.action === 'user.password_reset');
    expect(reset?.actor?.id).toBe(adminId);

    const text = JSON.stringify(entries);
    expect(text).not.toContain('scrypt$');
    for (const secret of secrets) expect(text).not.toContain(secret);
  });

  it('pages the audit log newest first, 50 at a time, without repeats, and refuses a malformed cursor', async () => {
    for (let index = 0; index < 60; index += 1) {
      await insertAudit(pool, {
        at: new Date(),
        actorId: adminId,
        action: 'user.update',
        targetId: userId,
        detail: { changed: ['displayName'] },
      });
    }
    const first = (await (
      await send(makeRequest('/api/admin/audit', { cookie: adminCookie }), auditRoute)
    ).json()) as {
      entries: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(first.entries).toHaveLength(50);
    expect(first.nextCursor).toBe(first.entries[49]?.id);
    const second = (await (
      await send(
        makeRequest(`/api/admin/audit?cursor=${first.nextCursor}`, { cookie: adminCookie }),
        auditRoute,
      )
    ).json()) as { entries: Array<{ id: string }>; nextCursor: string | null };
    const ids = [...first.entries, ...second.entries].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Number(first.entries[0]?.id)).toBeGreaterThan(Number(second.entries[0]?.id));
    expect(second.nextCursor).toBeNull();
    expect(
      (await send(makeRequest('/api/admin/audit?cursor=abc', { cookie: adminCookie }), auditRoute))
        .status,
    ).toBe(400);
  });
});
