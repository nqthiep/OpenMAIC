import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '@/lib/accounts/gate';
import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { insertAttempt, recentFailures } from '@/lib/accounts/repository';
import {
  AccountError,
  changeOwnPassword,
  createAccount,
  login,
  resetAccountPassword,
  updateAccount,
} from '@/lib/accounts/service';
import { USERNAME_FAILURE_LIMIT } from '@/lib/accounts/throttle';
import {
  createSession,
  resolveSession,
  revokeSessionToken,
  sessionIdOf,
} from '@/lib/accounts/session';

import { accountsTestUrl, openTestSchema, type TestSchema } from './_pg';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const PASSWORD = 'correct horse battery';

describe.skipIf(!accountsTestUrl)(
  'accounts on PostgreSQL: schema, sessions, throttle, audit',
  () => {
    let schema: TestSchema;
    let pool: Pool;

    beforeAll(async () => {
      schema = await openTestSchema('store');
      pool = new Pool({ connectionString: schema.url, max: 8 });
      await ensureAccountsSchema(pool);
    });

    afterAll(async () => {
      await pool.end();
      await schema.close();
    });

    async function seed(role: 'user' | 'admin' = 'user', mustChangePassword = false) {
      const username = `u${randomUUID().slice(0, 8)}`;
      const created = await createAccount(pool, {
        actorId: null,
        username,
        displayName: username,
        role,
        password: PASSWORD,
        mustChangePassword,
        now: Date.now(),
      });
      return created.user;
    }

    it('applies the schema once and keeps it on a second run', async () => {
      expect(await ensureAccountsSchema(pool)).toEqual([]);
    });

    it('refuses a username that is not lowercase ASCII, at the database too', async () => {
      await expect(
        pool.query(
          `INSERT INTO accounts_users (id, username, display_name, password_hash, role, status, created_at, updated_at)
         VALUES ($1, 'Alice', 'x', 'x', 'user', 'active', now(), now())`,
          [randomUUID()],
        ),
      ).rejects.toThrow();
    });

    it('stores a session under the SHA-256 of its token, never the token', async () => {
      const user = await seed();
      const result = await login(pool, {
        username: user.username,
        password: PASSWORD,
        now: Date.now(),
      });
      expect(result.outcome).toBe('ok');
      if (result.outcome !== 'ok') return;
      const ids = await pool.query<{ id: string }>(
        'SELECT id FROM accounts_sessions WHERE user_id = $1',
        [user.id],
      );
      expect(ids.rows.map((row) => row.id)).toContain(sessionIdOf(result.token));
      const dump = JSON.stringify((await pool.query('SELECT * FROM accounts_sessions')).rows);
      expect(dump).not.toContain(result.token);
    });

    it('ends a session after 7 idle days and after 30 absolute days', async () => {
      const user = await seed();
      const now = Date.now();
      const { token } = await createSession(pool, { userId: user.id, now });
      expect((await resolveSession(pool, token, now)).state).toBe('valid');
      expect((await resolveSession(pool, token, now + SESSION_IDLE_MS)).state).toBe('invalid');
      expect((await resolveSession(pool, token, now + SESSION_ABSOLUTE_MS)).state).toBe('invalid');
    });

    it('writes the last-seen time at most once a minute', async () => {
      const user = await seed();
      const now = Date.now();
      const { token } = await createSession(pool, { userId: user.id, now });
      const id = sessionIdOf(token);
      await resolveSession(pool, token, now + 30_000);
      const first = await pool.query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM accounts_sessions WHERE id = $1',
        [id],
      );
      expect(first.rows[0]?.last_seen_at.getTime()).toBe(now);
      await resolveSession(pool, token, now + 61_000);
      const second = await pool.query<{ last_seen_at: Date }>(
        'SELECT last_seen_at FROM accounts_sessions WHERE id = $1',
        [id],
      );
      expect(second.rows[0]?.last_seen_at.getTime()).toBe(now + 61_000);
    });

    it('ends a session on revocation and when its account is deactivated', async () => {
      const user = await seed();
      const now = Date.now();
      const revoked = await createSession(pool, { userId: user.id, now });
      await revokeSessionToken(pool, revoked.token, now);
      expect((await resolveSession(pool, revoked.token, now)).state).toBe('invalid');

      const admin = await seed('admin');
      const kept = await createSession(pool, { userId: user.id, now });
      expect((await resolveSession(pool, kept.token, now)).state).toBe('valid');
      await updateAccount(pool, { actorId: admin.id, targetId: user.id, status: 'disabled', now });
      expect((await resolveSession(pool, kept.token, now)).state).toBe('invalid');
    });

    it('counts failures per scope inside the window and ignores successes', async () => {
      const now = Date.now();
      const scope = `user:${randomUUID().slice(0, 8)}`;
      for (let index = 0; index < 10; index += 1) {
        await insertAttempt(pool, scope, new Date(now - 1000 * index), true);
      }
      expect(await recentFailures(pool, scope, new Date(now - 60_000), 5)).toEqual([]);
      await insertAttempt(pool, scope, new Date(now - 2000), false);
      await insertAttempt(pool, scope, new Date(now - 1000 * 60 * 60), false);
      expect(await recentFailures(pool, scope, new Date(now - 60_000), 5)).toEqual([now - 2000]);
    });

    it('locks an account after twenty failures and answers the lock before checking the password', async () => {
      const user = await seed();
      for (let index = 0; index < USERNAME_FAILURE_LIMIT; index += 1) {
        const result = await login(pool, {
          username: user.username,
          password: 'wrong password 1',
          now: Date.now(),
        });
        expect(result.outcome).toBe('invalid');
      }
      const locked = await login(pool, {
        username: user.username,
        password: PASSWORD,
        now: Date.now(),
      });
      expect(locked.outcome).toBe('locked');
      if (locked.outcome === 'locked') {
        expect(locked.retryAfterMs).toBeGreaterThan(0);
        expect(locked.retryAfterMs).toBeLessThanOrEqual(15 * 60 * 1000);
      }
    });

    it('audits every change in the same transaction, without a password or hash in the detail', async () => {
      const user = await seed();
      const rows = await pool.query<{ action: string; detail: unknown }>(
        'SELECT action, detail FROM accounts_audit_log WHERE target_id = $1 ORDER BY id',
        [user.id],
      );
      expect(rows.rows.map((row) => row.action)).toContain('user.create');
      const dump = JSON.stringify(rows.rows);
      expect(dump).not.toContain(PASSWORD);
      expect(dump).not.toContain('scrypt');
    });

    it('refuses a duplicate username and a weak password with a typed error', async () => {
      const user = await seed();
      await expect(
        createAccount(pool, {
          actorId: null,
          username: user.username.toUpperCase(),
          displayName: 'again',
          role: 'user',
          password: PASSWORD,
          mustChangePassword: false,
          now: Date.now(),
        }),
      ).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
      await expect(
        createAccount(pool, {
          actorId: null,
          username: `w${randomUUID().slice(0, 8)}`,
          displayName: 'weak',
          role: 'user',
          password: 'short',
          mustChangePassword: false,
          now: Date.now(),
        }),
      ).rejects.toBeInstanceOf(AccountError);
    });

    it('changes the own password with a compare-and-set: of two concurrent changes, one wins', async () => {
      const user = await seed();
      const now = Date.now();
      const [first, second] = await Promise.all([
        changeOwnPassword(pool, {
          userId: user.id,
          sessionId: 'keep',
          currentPassword: PASSWORD,
          newPassword: 'first new password',
          now,
        }),
        changeOwnPassword(pool, {
          userId: user.id,
          sessionId: 'keep',
          currentPassword: PASSWORD,
          newPassword: 'second new password',
          now,
        }),
      ]);
      expect([first.outcome, second.outcome].sort()).toEqual(['invalid', 'ok']);
    });

    it('a password reset issues a temporary password that must be changed, and ends every session', async () => {
      const user = await seed();
      const now = Date.now();
      const before = await createSession(pool, { userId: user.id, now });
      const { temporaryPassword } = await resetAccountPassword(pool, {
        actorId: null,
        targetId: user.id,
        now,
      });
      expect((await resolveSession(pool, before.token, now)).state).toBe('invalid');
      const result = await login(pool, {
        username: user.username,
        password: temporaryPassword,
        now: Date.now(),
      });
      expect(result.outcome).toBe('ok');
      if (result.outcome !== 'ok') return;
      expect((await resolveSession(pool, result.token, Date.now())).state).toBe('password-change');
    });
  },
);

describe.skipIf(!accountsTestUrl)('administrator invariants', () => {
  let schema: TestSchema;
  let pool: Pool;

  beforeAll(async () => {
    schema = await openTestSchema('invariants');
    pool = new Pool({ connectionString: schema.url, max: 8 });
    await ensureAccountsSchema(pool);
  });

  afterAll(async () => {
    await pool.end();
    await schema.close();
  });

  // Each case starts with no accounts, so the count of administrators is what the case says.
  beforeEach(async () => {
    await pool.query(
      'TRUNCATE accounts_audit_log, accounts_login_attempts, accounts_sessions, accounts_users',
    );
  });

  async function admin(name: string) {
    const created = await createAccount(pool, {
      actorId: null,
      username: name,
      displayName: name,
      role: 'admin',
      password: PASSWORD,
      mustChangePassword: false,
      now: Date.now(),
    });
    return created.user;
  }

  it('keeps one active administrator: the last one cannot be demoted, disabled or deleted', async () => {
    const only = await admin('only.admin');
    const now = Date.now();
    await expect(
      updateAccount(pool, { actorId: only.id, targetId: only.id, role: 'user', now }),
    ).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    });
    await expect(
      updateAccount(pool, { actorId: only.id, targetId: only.id, status: 'disabled', now }),
    ).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    });
    await expect(
      updateAccount(pool, { actorId: only.id, targetId: only.id, status: 'deleted', now }),
    ).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    });
  });

  it('allows a demotion while another active administrator remains', async () => {
    const first = await admin('first.admin');
    const second = await admin('second.admin');
    const now = Date.now();
    const demoted = await updateAccount(pool, {
      actorId: first.id,
      targetId: second.id,
      role: 'user',
      now,
    });
    expect(demoted.role).toBe('user');
    await expect(
      updateAccount(pool, { actorId: first.id, targetId: first.id, status: 'disabled', now }),
    ).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    });
  });

  it('keeps one administrator when two demotions run at the same moment', async () => {
    const left = await admin('race.left');
    const right = await admin('race.right');
    const now = Date.now();
    const outcomes = await Promise.allSettled([
      updateAccount(pool, { actorId: null, targetId: left.id, role: 'user', now }),
      updateAccount(pool, { actorId: null, targetId: right.id, role: 'user', now }),
    ]);
    const refused = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'LAST_ADMIN' });
    const left1 = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM accounts_users WHERE role = 'admin' AND status = 'active'`,
    );
    expect(left1.rows[0]?.n).toBe('1');
  });

  it('a deleted account cannot be changed, and deletion ends its sessions', async () => {
    const actor = await admin('deleter.admin');
    const user = await createAccount(pool, {
      actorId: null,
      username: `d${randomUUID().slice(0, 8)}`,
      displayName: 'gone',
      role: 'user',
      password: PASSWORD,
      mustChangePassword: false,
      now: Date.now(),
    });
    const now = Date.now();
    const { token } = await createSession(pool, { userId: user.user.id, now });
    await updateAccount(pool, {
      actorId: actor.id,
      targetId: user.user.id,
      status: 'deleted',
      now,
    });
    expect((await resolveSession(pool, token, now)).state).toBe('invalid');
    await expect(
      updateAccount(pool, { actorId: actor.id, targetId: user.user.id, displayName: 'back', now }),
    ).rejects.toMatchObject({ code: 'DELETED' });
  });
});
