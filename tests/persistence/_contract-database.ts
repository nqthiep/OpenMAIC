import { Pool } from 'pg';

/** The suffix every database a contract suite may truncate carries. */
const TEST_DATABASE_NAME = /_(test|contract)$/;

/**
 * Query keys that can name a database besides the path. pg takes the name from the path, but these
 * are checked too, so a later reader of one of them cannot slip past the guard.
 */
const QUERY_DATABASE_KEYS = ['dbname', 'db', 'database'];

/**
 * Pool for one PostgreSQL contract suite, confined to a schema of its own. The suite truncates its
 * tables, so this refuses any database whose name does not end in `_test` or `_contract`, before it
 * creates or truncates anything there.
 */
export async function openContractPool(url: string, schema: string): Promise<Pool> {
  const probe = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await probe.query<{ name: string }>('SELECT current_database() AS name');
    assertTestDatabaseName(rows[0]!.name, 'PG_CONTRACT_URL');
    await probe.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await probe.query(`CREATE SCHEMA ${schema}`);
  } finally {
    await probe.end();
  }
  return new Pool({ connectionString: url, options: `-c search_path=${schema}` });
}

/** Drops the suite's schema and closes its pool. A suite whose guard refused never opened one. */
export async function endContractPool(pool: Pool | undefined, schema: string): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  } finally {
    await pool.end();
  }
}

/** Throws unless `database` ends in `_test` or `_contract`. `variable` names where it came from. */
export function assertTestDatabaseName(database: string, variable: string): void {
  if (!TEST_DATABASE_NAME.test(database)) {
    throw new Error(
      'refusing to run the PostgreSQL contract tests: ' +
        `${variable} names database "${database}", which is not a test database ` +
        '(its name must end in _test or _contract)',
    );
  }
}

/**
 * Throws unless `url` names a test database: its path must name one, and every database name it
 * carries must end in `_test` or `_contract`. Nothing connects, and no message echoes the URL, so a
 * password in it never reaches the output.
 */
export function assertTestDatabaseUrl(url: string, variable: string): void {
  const names = namedDatabases(url);
  if (!names) {
    throw new Error(
      `refusing to run the PostgreSQL contract tests: ${variable} is not a readable ` +
        'postgres:// or postgresql:// URL',
    );
  }
  if (!names[0]) {
    throw new Error(
      `refusing to run the PostgreSQL contract tests: ${variable} names no database ` +
        '(its path must name one ending in _test or _contract)',
    );
  }
  for (const name of names) assertTestDatabaseName(name, variable);
}

/**
 * Process-wide check, run by tests/setup-env.ts before any suite. While PG_CONTRACT_URL is set, the
 * contract suites connect to it and truncate; they also read DATABASE_URL, so that must name a test
 * database too.
 */
export function assertContractEnvIsTestOnly(env: Record<string, string | undefined>): void {
  if (!env.PG_CONTRACT_URL) return;
  assertTestDatabaseUrl(env.PG_CONTRACT_URL, 'PG_CONTRACT_URL');
  if (env.DATABASE_URL) assertTestDatabaseUrl(env.DATABASE_URL, 'DATABASE_URL');
}

/** The names a PostgreSQL URL selects, path first; undefined when it cannot be read as one. */
function namedDatabases(url: string): string[] | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') return undefined;
    return [
      decodeURI(parsed.pathname.slice(1)),
      ...QUERY_DATABASE_KEYS.flatMap((key) => parsed.searchParams.getAll(key)),
    ];
  } catch {
    return undefined;
  }
}
