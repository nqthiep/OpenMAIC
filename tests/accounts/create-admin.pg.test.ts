import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ensureAccountsSchema } from '@/lib/accounts/schema';
import { createAccount } from '@/lib/accounts/service';

import { accountsTestUrl, openTestSchema, type TestSchema } from './_pg';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const ROOT = join(__dirname, '..', '..');
const TSX = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

describe.skipIf(!accountsTestUrl)('scripts/accounts/create-admin.ts', () => {
  let schema: TestSchema;
  let pool: Pool;

  beforeAll(async () => {
    schema = await openTestSchema('admin');
    pool = new Pool({ connectionString: schema.url, max: 2 });
    await ensureAccountsSchema(pool);
    await createAccount(pool, {
      actorId: null,
      username: 'existing.user',
      displayName: 'Existing',
      role: 'user',
      password: 'correct horse battery',
      mustChangePassword: false,
      now: Date.now(),
    });
  });

  afterAll(async () => {
    await pool.end();
    await schema.close();
  });

  function run(args: string[], input = '') {
    return spawnSync(process.execPath, [TSX, 'scripts/accounts/create-admin.ts', ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: schema.url },
      input,
      encoding: 'utf8',
      timeout: 120_000,
    });
  }

  it('refuses to create an administrator without a terminal, and creates nothing', async () => {
    const result = run(['--username', 'new.admin']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('interactive terminal');
    const rows = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM accounts_users WHERE username = 'new.admin'`,
    );
    expect(rows.rows[0]?.n).toBe('0');
  });

  it('refuses an existing name unless --promote is given', async () => {
    const result = run(['--username', 'existing.user']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('already exists');
  });

  it('promotes an existing name with --promote, without a password prompt', async () => {
    const result = run(['--username', 'existing.user', '--promote']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('now an active administrator');
    const rows = await pool.query<{ role: string; status: string }>(
      `SELECT role, status FROM accounts_users WHERE username = 'existing.user'`,
    );
    expect(rows.rows[0]).toEqual({ role: 'admin', status: 'active' });
  });

  it('answers an unknown argument with a usage error', () => {
    const result = run(['--frobnicate']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
  });

  it('answers a name with no value with a usage error', () => {
    const result = run(['--username']);
    expect(result.status).toBe(2);
  });
});
