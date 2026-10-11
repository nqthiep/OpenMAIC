import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Test files that read the PostgreSQL contract URL. */
function contractSuites(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return contractSuites(p);
    const reads =
      name.endsWith('.test.ts') && /process\.env\.PG_CONTRACT_URL/.test(readFileSync(p, 'utf8'));
    return reads ? [p.replaceAll('\\', '/')] : [];
  });
}

/**
 * Suites that the storage-pg-contract workflow does not run, so they skip in CI (CI-01). Adding them to
 * the app-domain step of the workflow is a decision for the leader; then remove them from this list.
 */
const KNOWN_UNLISTED: string[] = [
  // Times out at 5 s inside the combined app-domain run on PostgreSQL 16 (2 of 3 runs); passes alone.
  'tests/server/generation-run-hooks.pg.test.ts',
];

describe('storage-pg-contract.yml runs the app PostgreSQL suites', () => {
  // The app-domain step lists one test file per line.
  const listed = [
    ...readFileSync('.github/workflows/storage-pg-contract.yml', 'utf8').matchAll(
      /^\s+(tests\/\S+\.test\.ts)\s*\\?$/gm,
    ),
  ].map((m) => m[1]!);
  const suites = contractSuites('tests');

  it('names only suites that exist and read the contract URL', () => {
    expect(listed.filter((f) => !suites.includes(f))).toEqual([]);
  });

  it('names every contract suite, except the known gaps', () => {
    const unlisted = suites.filter((f) => !listed.includes(f)).sort();
    expect(unlisted, 'add the new suite to the workflow, or record it in KNOWN_UNLISTED').toEqual(
      [...KNOWN_UNLISTED].sort(),
    );
  });
});
