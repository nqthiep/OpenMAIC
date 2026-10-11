import { describe, expect, it, vi } from 'vitest';
import {
  assertContractEnvIsTestOnly,
  assertTestDatabaseUrl,
} from '../persistence/_contract-database';

const PASSWORD = 'pw-must-not-leak-42';
const VARIABLE = 'PG_CONTRACT_URL';
const TEST_URL = 'postgresql://postgres:postgres@localhost:5432/openmaic_contract';
const LIVE_URL = `postgres://openmaic:${PASSWORD}@127.0.0.1:5432/openmaic`;

/** The message the guard throws, or '' when it accepts. */
function refusal(check: () => void): string {
  try {
    check();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('assertTestDatabaseUrl', () => {
  it.each(['openmaic_test', 'openmaic_contract', 'app_test'])(
    'accepts the test database %s',
    (name) => {
      const url = `postgresql://postgres:postgres@localhost:5432/${name}`;
      expect(refusal(() => assertTestDatabaseUrl(url, VARIABLE))).toBe('');
    },
  );

  it.each([
    'openmaic',
    'openmaic_prod',
    'openmaic_production',
    'openmaic_latest',
    'openmaic-test',
    'OPENMAIC_TEST',
    'openmaic_contract_backup',
  ])('refuses the database %s', (name) => {
    const url = `postgres://u:${PASSWORD}@127.0.0.1:1/${name}`;
    expect(refusal(() => assertTestDatabaseUrl(url, VARIABLE))).toContain(
      `PG_CONTRACT_URL names database "${name}", which is not a test database`,
    );
  });

  it.each([
    'postgres://u:p@127.0.0.1:1',
    'postgres://u:p@127.0.0.1:1/',
    'postgres://u:p@127.0.0.1:1/?dbname=openmaic_test',
  ])('refuses a URL whose path names no database: %s', (url) => {
    expect(refusal(() => assertTestDatabaseUrl(url, VARIABLE))).toContain('names no database');
  });

  it('refuses a dbname query value that names another database than the path', () => {
    const url = 'postgres://u:p@127.0.0.1:1/openmaic_test?dbname=openmaic';
    expect(refusal(() => assertTestDatabaseUrl(url, VARIABLE))).toContain(
      'names database "openmaic"',
    );
  });

  it('refuses a scheme that can name its database in the query', () => {
    // socket: URLs take their database from the query, so the path name proves nothing.
    const url = 'socket:/openmaic_test?db=openmaic';
    expect(refusal(() => assertTestDatabaseUrl(url, VARIABLE))).toContain(
      'is not a readable postgres:// or postgresql:// URL',
    );
  });

  it('keeps the password out of every message', () => {
    const urls = [
      `postgres://u:${PASSWORD}@127.0.0.1:1/openmaic`,
      `postgres://u:${PASSWORD}@127.0.0.1:1`,
      `postgres://u:${PASSWORD}@[bad/openmaic_test`,
    ];
    for (const url of urls) {
      const message = refusal(() => assertTestDatabaseUrl(url, VARIABLE));
      expect(message).not.toBe('');
      expect(message).not.toContain(PASSWORD);
    }
  });
});

describe('assertContractEnvIsTestOnly', () => {
  it('does nothing without PG_CONTRACT_URL, even when DATABASE_URL names a live database', () => {
    expect(refusal(() => assertContractEnvIsTestOnly({ DATABASE_URL: LIVE_URL }))).toBe('');
    expect(
      refusal(() => assertContractEnvIsTestOnly({ PG_CONTRACT_URL: '', DATABASE_URL: LIVE_URL })),
    ).toBe('');
  });

  it('accepts a test database in PG_CONTRACT_URL, with DATABASE_URL unset or blank', () => {
    expect(refusal(() => assertContractEnvIsTestOnly({ PG_CONTRACT_URL: TEST_URL }))).toBe('');
    expect(
      refusal(() => assertContractEnvIsTestOnly({ PG_CONTRACT_URL: TEST_URL, DATABASE_URL: '' })),
    ).toBe('');
  });

  it('refuses a live PG_CONTRACT_URL without echoing it', () => {
    const message = refusal(() => assertContractEnvIsTestOnly({ PG_CONTRACT_URL: LIVE_URL }));
    expect(message).toContain('PG_CONTRACT_URL names database "openmaic"');
    expect(message).not.toContain(PASSWORD);
  });

  it('refuses a live DATABASE_URL while PG_CONTRACT_URL is set', () => {
    const message = refusal(() =>
      assertContractEnvIsTestOnly({ PG_CONTRACT_URL: TEST_URL, DATABASE_URL: LIVE_URL }),
    );
    expect(message).toContain('DATABASE_URL names database "openmaic"');
    expect(message).not.toContain(PASSWORD);
  });

  it('is run by tests/setup-env.ts, so it applies before every suite', async () => {
    vi.stubEnv('PG_CONTRACT_URL', LIVE_URL);
    vi.resetModules();
    try {
      await expect(import('../setup-env')).rejects.toThrow(
        'PG_CONTRACT_URL names database "openmaic"',
      );
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
