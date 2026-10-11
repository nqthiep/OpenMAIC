import { randomBytes } from 'node:crypto';

import { NextRequest } from 'next/server';
import { Pool } from 'pg';

import { proxy } from '@/proxy';

export const APP_ORIGIN = 'http://localhost:3001';

/** Undefined when ACCOUNTS_TEST_DATABASE_URL is unset: the PG suites are then skipped. */
export const accountsTestUrl = process.env.ACCOUNTS_TEST_DATABASE_URL?.trim() || undefined;

/** One test file's schema in the accounts test database. */
export interface TestSchema {
  /** DATABASE_URL for the test: the same database, with search_path set to this file's schema. */
  url: string;
  /** A pool on the database itself, for setup and checks. */
  admin: Pool;
  /** Drop the schema and close the admin pool. */
  close(): Promise<void>;
}

/**
 * A schema of its own in the accounts test database (ACCOUNTS_TEST_DATABASE_URL).
 * Refuses any database whose name does not end in `_accounts_test`, so the
 * development database is never touched.
 */
export async function openTestSchema(tag: string): Promise<TestSchema> {
  const base = accountsTestUrl;
  if (!base) {
    throw new Error(
      'set ACCOUNTS_TEST_DATABASE_URL to a database whose name ends in _accounts_test',
    );
  }
  const admin = new Pool({ connectionString: base, max: 4 });
  const { rows } = await admin.query<{ name: string }>('SELECT current_database() AS name');
  const name = rows[0]?.name ?? '';
  if (!name.endsWith('_accounts_test')) {
    await admin.end();
    throw new Error(`refusing to run: ${name} is not an accounts test database`);
  }
  const schema = `acct_${tag.replace(/[^a-z0-9]/g, '')}_${randomBytes(4).toString('hex')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const target = new URL(base);
  target.searchParams.set('options', `-c search_path=${schema}`);
  return {
    url: target.toString(),
    admin,
    close: async () => {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    },
  };
}

/** A request as a browser sends it: same host, and Origin for an unsafe method unless the test sets its own. */
export function makeRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { host: 'localhost:3001', ...(options.headers ?? {}) };
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (unsafe && headers.origin === undefined && headers['sec-fetch-site'] === undefined) {
    headers.origin = APP_ORIGIN;
  }
  return new NextRequest(`${APP_ORIGIN}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

/** The proxy first, then the route handler when the proxy lets the request through. */
export async function send(
  request: NextRequest,
  route: (req: NextRequest) => Promise<Response>,
): Promise<Response> {
  const gate = await proxy(request);
  if (gate.headers.get('x-middleware-next') !== '1') return gate;
  return route(request);
}

/** The session cookie value (`openmaic_session=<token>`) a response sets, or `undefined`. */
export function sessionCookieOf(response: Response): string | undefined {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('openmaic_session='));
  return cookie?.split(';')[0];
}

/** The `Set-Cookie` values a response sets, one string each. */
export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}
