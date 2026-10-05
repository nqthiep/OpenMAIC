import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { contentHash, framesHash } from '@/lib/tutor/catalog/hash';
import { steps } from '@/lib/tutor/engine/generate';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';
import {
  compareCatalogLock,
  type CatalogLock,
  type LockEntry,
  type LockProblem,
} from './catalog-lock-compare';

const LOCK_PATH = fileURLToPath(new URL('./catalog-lock.json', import.meta.url));
const LOCALES = ['vi-VN', 'en-US'] as const;
const UPDATE = process.env.UPDATE_CATALOG_LOCK === '1';

const entries = SUBJECT_PACKS.flatMap((p) => p.walkthroughs);
const ids = entries.map((e) => e.id);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);

/**
 * `contentHash` rejects functions, so `beatDefs[].ask.predict.answer` is replaced by the answers it
 * yields on every beat frame of every (preset, locale): a change to its behaviour still moves the hash.
 */
function snapshotEntry(e: AnyWalkthroughEntry): LockEntry {
  const beats = new Map(e.beatDefs.map((b) => [b.id, b]));
  const framesByPreset: Record<string, Record<string, string>> = {};
  const answers: Record<string, Record<string, number[]>> = {}; // beat → "preset/locale" → per occurrence
  for (const p of e.presets) {
    framesByPreset[p.id] = {};
    for (const locale of LOCALES) {
      const fs = steps(e, p.input, { locale });
      framesByPreset[p.id][locale] = framesHash(fs);
      fs.forEach((f, i) => {
        for (const tag of f.meta.tags ?? []) {
          const predict = tag.startsWith('beat:')
            ? beats.get(tag.slice(5))?.ask?.predict
            : undefined;
          if (predict) {
            const bucket = ((answers[tag.slice(5)] ??= {})[`${p.id}/${locale}`] ??= []);
            bucket.push(predict.answer(f, fs[i + 1]));
          }
        }
      });
    }
  }
  const beatDefs = e.beatDefs.map((b) =>
    b.ask?.predict
      ? {
          ...b,
          ask: {
            ...b.ask,
            predict: {
              ...Object.fromEntries(Object.entries(b.ask.predict).filter(([k]) => k !== 'answer')),
              answers: answers[b.id] ?? {},
            },
          },
        }
      : b,
  );
  return {
    entryRev: e.entryRev,
    contentHash: contentHash({ code: e.code, beatDefs, presets: e.presets, problem: e.problem }),
    framesHash: framesByPreset,
  };
}

function snapshot(): CatalogLock {
  const lock: Record<string, LockEntry> = {};
  for (const e of [...entries].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    lock[e.id] = snapshotEntry(e);
  }
  return lock;
}

const readLock = (): CatalogLock =>
  existsSync(LOCK_PATH) ? (JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as CatalogLock) : {};

describe('catalog ids', () => {
  it('are unique across all subject packs', () => {
    expect(duplicates).toEqual([]);
  });
});

describe('catalog-lock.json', () => {
  it('matches the current catalog (UPDATE_CATALOG_LOCK=1 refreshes it)', () => {
    const current = snapshot();
    const problems = compareCatalogLock(readLock(), current);
    // A hash change without an entryRev bump stays red even when updating; the lock is not written then.
    const failing = UPDATE ? problems.filter((p) => !p.updatable) : problems;
    if (UPDATE && !failing.length && !duplicates.length && problems.length) {
      writeFileSync(LOCK_PATH, `${JSON.stringify(current, null, 2)}\n`);
    }
    expect(failing.map((p) => p.message)).toEqual([]);
  });
});

describe('compareCatalogLock (fake data)', () => {
  const entry = (over: Partial<LockEntry> = {}): LockEntry => ({
    entryRev: 1,
    contentHash: 'c0',
    framesHash: { p1: { 'vi-VN': 'v1', 'en-US': 'e1' } },
    ...over,
  });
  const kinds = (ps: LockProblem[]) => ps.map((p) => `${p.kind}:${p.id}`);

  it('is clean when lock and catalog agree', () => {
    expect(compareCatalogLock({ a: entry() }, { a: entry() })).toEqual([]);
    expect(compareCatalogLock({}, {})).toEqual([]);
  });

  it('flags an id in the lock that left the catalog', () => {
    const ps = compareCatalogLock({ a: entry(), b: entry() }, { a: entry() });
    expect(kinds(ps)).toEqual(['removed:b']);
    expect(ps[0].updatable).toBe(true);
  });

  it('flags a renamed id as removed + new', () => {
    expect(kinds(compareCatalogLock({ a: entry() }, { a2: entry() }))).toEqual([
      'removed:a',
      'new:a2',
    ]);
  });

  it('flags an id missing from the lock', () => {
    const ps = compareCatalogLock({ a: entry() }, { a: entry(), b: entry() });
    expect(kinds(ps)).toEqual(['new:b']);
    expect(ps[0].updatable).toBe(true);
  });

  it('flags a hash change with the same entryRev as non-updatable', () => {
    const lock = { a: entry() };
    const cases: [string, LockEntry][] = [
      ['contentHash', entry({ contentHash: 'c1' })],
      ['framesHash/p1/en-US', entry({ framesHash: { p1: { 'vi-VN': 'v1', 'en-US': 'eX' } } })],
      [
        'framesHash/p2/vi-VN',
        entry({ framesHash: { p1: { 'vi-VN': 'v1', 'en-US': 'e1' }, p2: { 'vi-VN': 'v2' } } }),
      ],
      ['framesHash/p1/en-US', entry({ framesHash: { p1: { 'vi-VN': 'v1' } } })],
    ];
    for (const [key, changed] of cases) {
      const ps = compareCatalogLock(lock, { a: changed });
      expect(kinds(ps)).toEqual(['hash-changed:a']);
      expect(ps[0].updatable).toBe(false);
      expect(ps[0].message).toContain(key);
    }
  });

  it('flags an entryRev bump when the lock is stale, with or without hash change', () => {
    for (const bumped of [entry({ entryRev: 2 }), entry({ entryRev: 2, contentHash: 'c1' })]) {
      const ps = compareCatalogLock({ a: entry() }, { a: bumped });
      expect(kinds(ps)).toEqual(['rev-bumped:a']);
      expect(ps[0].updatable).toBe(true);
    }
  });

  it('flags an entryRev that went backwards as non-updatable', () => {
    const ps = compareCatalogLock({ a: entry({ entryRev: 2 }) }, { a: entry() });
    expect(kinds(ps)).toEqual(['rev-decreased:a']);
    expect(ps[0].updatable).toBe(false);
  });

  it('reports every problem and keeps non-updatable ones separable', () => {
    const lock = { a: entry(), b: entry(), c: entry() };
    const current = { a: entry({ contentHash: 'c1' }), b: entry({ entryRev: 2 }), d: entry() };
    const ps = compareCatalogLock(lock, current);
    expect(kinds(ps)).toEqual(['hash-changed:a', 'rev-bumped:b', 'removed:c', 'new:d']);
    expect(ps.filter((p) => !p.updatable).map((p) => p.id)).toEqual(['a']);
  });
});
