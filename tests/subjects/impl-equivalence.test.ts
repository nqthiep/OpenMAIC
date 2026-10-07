/**
 * C++/Python implementation check (card 2-I1, TEST-STRATEGY §2).
 * For every pack entry: harness must exist (always checked); with TUTOR_IMPL_CHECK=1 compile/run
 * `code.impl.cpp` (g++) and `code.impl.py` (python3) on each preset and compare with the oracle.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';

interface Harness {
  entryId: string;
  cppPrelude: string[];
  cppMain: string[];
  pyMain: string[];
  stdin: (input: never) => string;
  expected: (input: never) => string;
}

// import.meta.glob is statically replaced by Vite, so it must be called by its full name.
const modules = import.meta.glob('./cp/impl/*.ts', { eager: true }) as Record<
  string,
  { default: Harness }
>;
const harnesses = Object.fromEntries(
  Object.values(modules).map((mod) => [mod.default.entryId, mod.default]),
);
const entries = SUBJECT_PACKS.flatMap((p) => p.walkthroughs);
const ENABLED = process.env.TUTOR_IMPL_CHECK === '1';
const TIMEOUT_MS = 10_000;

// an entry without code (a math proof or construction) has `impl` empty and nothing to compile
const hasImpl = (e: (typeof entries)[number]) => e.code.impl.cpp.length + e.code.impl.py.length > 0;

describe('impl harness coverage', () => {
  it.each(entries.filter(hasImpl).map((e) => e.id))('entry %s has a harness', (id) => {
    expect(harnesses[id], `missing tests/subjects/cp/impl/${id}.ts`).toBeDefined();
  });
});

function run(cmd: string, args: string[], input = '') {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8', timeout: TIMEOUT_MS });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed (${r.status ?? r.signal}): ${r.stderr || r.error?.message}`);
  }
  return r.stdout.trim();
}

describe.skipIf(!ENABLED).each(entries.filter((e) => hasImpl(e) && harnesses[e.id]))(
  'impl $id',
  (entry) => {
    const h = harnesses[entry.id];
    const { cpp, py } = entry.code.impl;
    let dir = '';
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), `impl-${entry.id}-`));
      writeFileSync(join(dir, 'main.cpp'), [...h.cppPrelude, ...cpp, ...h.cppMain].join('\n'));
      writeFileSync(join(dir, 'main.py'), [...py, ...h.pyMain].join('\n'));
      run('g++', ['-std=c++17', '-O2', '-o', join(dir, 'main'), join(dir, 'main.cpp')]);
    }, 60_000);
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it.each(entry.presets.map((p) => [p.id, p.input] as const))('preset %s', (_id, input) => {
      const want = h.expected(input as never);
      const stdin = h.stdin(input as never);
      expect(run(join(dir, 'main'), [], stdin), 'C++').toBe(want);
      expect(run('python3', [join(dir, 'main.py')], stdin), 'Python').toBe(want);
    });
  },
);
