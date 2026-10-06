import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { cpPack } from '@/lib/subjects/cp/pack';
import {
  diskReviewLoader,
  makeDiskReviewLoader,
  releasedPacks,
  type ReviewLoader,
} from '@/lib/subjects/release';
import { entryContentHash } from '@/lib/tutor/catalog/hash';
import type { Review } from '@/lib/tutor/review-schema';

const entry = cpPack.walkthroughs[0]!;
const ids = (packs: ReturnType<typeof releasedPacks>) =>
  packs.flatMap((p) => p.walkthroughs.map((e) => e.id));

const review = (over: Partial<Review> = {}): Review => ({
  reviewer: 'tutor-review-cp',
  model: 'p:m',
  entryId: entry.id,
  entryRev: entry.entryRev,
  scores: { dung: 5, roRang: 4, chiTiet: 4, deHieu: 4, trucQuan: 5, sinhDong: 4 },
  factErrors: [],
  issues: [],
  unsourcedClaims: [],
  sources: [],
  ...over,
});
const file = (over: { contentHash?: string; reviews?: unknown[]; verdict?: string } = {}) =>
  JSON.stringify({
    contentHash: entryContentHash(entry),
    reviews: [review(), review({ reviewer: 'tutor-review-cp-2' })],
    ...over,
  });
const loaderOf =
  (raw: string | null): ReviewLoader =>
  () =>
    raw;

describe('releasedPacks (fake loader)', () => {
  it('keeps an entry with two passing reviews at its exact entryRev and hash', () => {
    expect(ids(releasedPacks([cpPack], loaderOf(file())))).toEqual([entry.id]);
  });

  it('asks the loader for <subject>, <entryId>, <entryRev>', () => {
    const load = vi.fn<ReviewLoader>(() => null);
    releasedPacks([cpPack], load);
    expect(load).toHaveBeenCalledWith(cpPack.id, entry.id, entry.entryRev);
  });

  it('drops an entry without a review file', () => {
    expect(ids(releasedPacks([cpPack], loaderOf(null)))).toEqual([]);
  });

  it('drops an entry when one reviewer scores below 4', () => {
    const low = review({
      reviewer: 'tutor-review-cp-2',
      scores: { dung: 5, roRang: 3, chiTiet: 4, deHieu: 4, trucQuan: 5, sinhDong: 4 },
    });
    expect(ids(releasedPacks([cpPack], loaderOf(file({ reviews: [review(), low] }))))).toEqual([]);
  });

  it('drops an entry when a reviewer reports factErrors', () => {
    const bad = review({ reviewer: 'tutor-review-cp-2', factErrors: ['x'] });
    expect(ids(releasedPacks([cpPack], loaderOf(file({ reviews: [review(), bad] }))))).toEqual([]);
  });

  it('treats disagreement as a fail and ignores a stored verdict of pass', () => {
    const low = review({
      reviewer: 'tutor-review-cp-2',
      scores: { dung: 2, roRang: 4, chiTiet: 4, deHieu: 4, trucQuan: 5, sinhDong: 4 },
    });
    const raw = file({ reviews: [review(), low], verdict: 'pass' });
    expect(ids(releasedPacks([cpPack], loaderOf(raw)))).toEqual([]);
  });

  it('drops an entry when the same reviewer appears twice or a review is missing', () => {
    expect(ids(releasedPacks([cpPack], loaderOf(file({ reviews: [review(), review()] }))))).toEqual(
      [],
    );
    expect(ids(releasedPacks([cpPack], loaderOf(file({ reviews: [review()] }))))).toEqual([]);
  });

  it('drops an entry whose reviews are for another entryRev', () => {
    const old = (r: string) => review({ reviewer: r, entryRev: entry.entryRev - 1 });
    const raw = file({ reviews: [old('tutor-review-cp'), old('tutor-review-cp-2')] });
    expect(ids(releasedPacks([cpPack], loaderOf(raw)))).toEqual([]);
  });

  it('drops an entry edited after review (contentHash mismatch)', () => {
    expect(ids(releasedPacks([cpPack], loaderOf(file({ contentHash: '0'.repeat(16) }))))).toEqual(
      [],
    );
  });

  it('drops an entry on malformed JSON or a malformed review', () => {
    expect(ids(releasedPacks([cpPack], loaderOf('{not json')))).toEqual([]);
    expect(ids(releasedPacks([cpPack], loaderOf('null')))).toEqual([]);
    expect(ids(releasedPacks([cpPack], loaderOf(file({ reviews: [{}, {}] }))))).toEqual([]);
  });
});

describe('real loader and the env gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('the disk loader returns null when no review file exists', () => {
    expect(diskReviewLoader(cpPack.id, entry.id, entry.entryRev)).toBeNull();
  });

  it('the disk loader falls back to the next root when the cwd has no review file', () => {
    const [a, b] = [
      mkdtempSync(path.join(tmpdir(), 'rev-a-')),
      mkdtempSync(path.join(tmpdir(), 'rev-b-')),
    ];
    try {
      const rel = `lib/subjects/${cpPack.id}/reviews/${entry.id}@${entry.entryRev}.json`;
      mkdirSync(path.dirname(path.join(b, rel)), { recursive: true });
      writeFileSync(path.join(b, rel), '{"x":1}');
      const load = makeDiskReviewLoader(() => [a, b]);
      expect(load(cpPack.id, entry.id, entry.entryRev)).toBe('{"x":1}');
      expect(makeDiskReviewLoader(() => [a])(cpPack.id, entry.id, entry.entryRev)).toBeNull();
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('with OPENMAIC_REQUIRE_REVIEW unset the registry exposes every entry', async () => {
    vi.stubEnv('OPENMAIC_REQUIRE_REVIEW', '');
    vi.resetModules();
    const { widgetRegistry } = await import('@/lib/widgets');
    expect(widgetRegistry.walkthroughIds().sort()).toEqual(
      SUBJECT_PACKS.flatMap((p) => p.walkthroughs.map((e) => e.id)).sort(),
    );
  });

  it('with it set and no review files the registry has zero walkthroughs', async () => {
    vi.stubEnv('OPENMAIC_REQUIRE_REVIEW', 'true');
    vi.resetModules();
    const { widgetRegistry } = await import('@/lib/widgets');
    expect(widgetRegistry.walkthroughIds()).toEqual([]);
  });
});
