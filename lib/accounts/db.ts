import type { Pool } from 'pg';

import { ensureAccountsSchema } from './schema';

const ready = new WeakMap<Pool, Promise<void>>();

/**
 * The pool the accounts tables live in: the process's persistence pool, with the
 * accounts schema ensured once per pool. A failed ensure is retried on the next call.
 */
export async function accountsPool(): Promise<Pool> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url)
    throw new Error('OPENMAIC_ACCOUNTS needs DATABASE_URL: accounts are stored in PostgreSQL.');
  const { getServerPersistenceProvider } = await import('@/lib/persistence/server-provider');
  const { pool } = await getServerPersistenceProvider(url);
  let schema = ready.get(pool);
  if (!schema) {
    schema = ensureAccountsSchema(pool).then(() => undefined);
    ready.set(pool, schema);
    schema.catch(() => ready.delete(pool));
  }
  await schema;
  return pool;
}
