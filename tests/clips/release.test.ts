import { describe, expect, it, vi } from 'vitest';
import { clipEntryHash } from '@/lib/clips/hash';
import { clipRegistry } from '@/lib/clips';
import { createClipRegistry } from '@/lib/clips/registry';
import { buildCourseAllowlist } from '@/lib/server/agent-runtime/course-tools';
import { mathPack } from '@/lib/subjects/math/pack';
import { releasedPacks, type ReviewLoader } from '@/lib/subjects/release';
import { amgmSemicircleEntry as amgm } from '@/lib/subjects/math/clips/amgm-semicircle';
import type { Review } from '@/lib/tutor/review-schema';
import { fakeAny } from './_fake-clip';

const review = (over: Partial<Review> = {}): Review => ({
  reviewer: 'tutor-review-math',
  model: 'p:m',
  entryId: amgm.id,
  entryRev: amgm.engine.templateRev,
  scores: { dung: 5, roRang: 4, chiTiet: 4, deHieu: 4, trucQuan: 5, sinhDong: 4 },
  factErrors: [],
  issues: [],
  unsourcedClaims: [],
  sources: [],
  ...over,
});
const file = (over: { contentHash?: string; reviews?: unknown[] } = {}) =>
  JSON.stringify({
    contentHash: clipEntryHash(amgm),
    reviews: [review(), review({ reviewer: 'tutor-review-math-2', model: 'q:n' })],
    ...over,
  });
const only =
  (id: string, raw: string | null): ReviewLoader =>
  (_s, entryId) =>
    entryId === id ? raw : null;
const clipIds = (packs: ReturnType<typeof releasedPacks>) =>
  packs.flatMap((p) => (p.clips ?? []).map((c) => c.id));

describe('clips and the review gate', () => {
  it('without a review no clip is released, and the walkthroughs of the pack follow their own rule', () => {
    expect(clipIds(releasedPacks([mathPack], () => null))).toEqual([]);
  });

  it('a clip with two passing reviews at its templateRev and content hash is released, the others are not', () => {
    expect(clipIds(releasedPacks([mathPack], only(amgm.id, file())))).toEqual([amgm.id]);
  });

  it('asks the loader for <subject>, <clipId>, <templateRev>', () => {
    const load = vi.fn<ReviewLoader>(() => null);
    releasedPacks([mathPack], load);
    expect(load).toHaveBeenCalledWith('math', amgm.id, amgm.engine.templateRev);
  });

  it('editing the clip after the review invalidates it (the stored hash no longer matches)', () => {
    const edited = { ...amgm, title: { ...amgm.title, 'vi-VN': 'Tiêu đề khác' } };
    expect(clipEntryHash(edited)).not.toBe(clipEntryHash(amgm));
    const stale = file({ contentHash: clipEntryHash(edited) });
    expect(clipIds(releasedPacks([mathPack], only(amgm.id, stale)))).toEqual([]);
  });

  it('one reviewer with a fact error blocks the clip, and so do reviews on one provider', () => {
    const bad = review({
      reviewer: 'tutor-review-math-2',
      model: 'q:n',
      factErrors: ['h is not sqrt(ab)'],
    });
    expect(
      clipIds(releasedPacks([mathPack], only(amgm.id, file({ reviews: [review(), bad] })))),
    ).toEqual([]);
    const sameProvider = review({ reviewer: 'tutor-review-math-2', model: 'p:other' });
    expect(
      clipIds(
        releasedPacks([mathPack], only(amgm.id, file({ reviews: [review(), sameProvider] }))),
      ),
    ).toEqual([]);
  });

  it('the hash covers the sheet and the chapters, not just the title', () => {
    const sheetEdited = {
      ...amgm,
      sheet: {
        chapters: [
          { ...amgm.sheet.chapters[0], formulas: ['\\(x\\)'] },
          ...amgm.sheet.chapters.slice(1),
        ],
      },
    };
    const chapterEdited = {
      ...amgm,
      chapters: [{ ...amgm.chapters[0], endSec: 11 }, ...amgm.chapters.slice(1)],
    };
    expect(clipEntryHash(sheetEdited)).not.toBe(clipEntryHash(amgm));
    expect(clipEntryHash(chapterEdited)).not.toBe(clipEntryHash(amgm));
  });
});

describe('prebuilt clips and the toolset', () => {
  it('prebuiltIds lists only the clips that have been rendered', () => {
    const registry = createClipRegistry([
      {
        id: 'a',
        clips: [fakeAny({ id: 'built', built: true }), fakeAny({ id: 'unbuilt', built: false })],
      },
    ]);
    expect(registry.clipIds()).toEqual(['built', 'unbuilt']);
    expect(registry.prebuiltIds()).toEqual(['built']);
  });

  it('generate_clip_scenes is offered to the agent only once a clip has been rendered', () => {
    expect(buildCourseAllowlist().has('generate_clip_scenes')).toBe(
      clipRegistry.prebuiltIds().length > 0,
    );
    expect(buildCourseAllowlist().has('generate_walkthrough')).toBe(true);
  });
});
