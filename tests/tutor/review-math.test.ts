import { describe, expect, it } from 'vitest';
import { entryContentHash } from '@/lib/tutor/catalog/hash';
import {
  buildReviewMaterial,
  buildReviewPrompt,
  buildReviewSystem,
  reviewPanel,
} from '@/lib/tutor/review-schema';
import { mathPack } from '@/lib/subjects/math/pack';
import { releasedPacks } from '@/lib/subjects/release';

describe('math review material', () => {
  it('every math walkthrough becomes review material with its frames, beats and both locales, within the prompt budget', () => {
    for (const entry of mathPack.walkthroughs) {
      const m = buildReviewMaterial(entry);
      expect(m.subject, entry.id).toBe('math');
      expect(m.entryRev).toBe(entry.entryRev);
      expect(m.frames.length, entry.id).toBeGreaterThan(0);
      expect(
        m.beats.map((b) => b.id),
        entry.id,
      ).toEqual(entry.beatDefs.map((b) => b.id));
      expect(m.alt?.locale).toBe('en-US');
      expect(buildReviewPrompt(m).length, entry.id).toBeLessThan(160_000);
    }
  }, 60_000);

  it('math material is reviewed with the math prompt, informatics with the programming one', () => {
    const wk = buildReviewMaterial(mathPack.walkthroughs[0]);
    expect(buildReviewSystem('r', 'm', wk)).toContain('olympiad mathematics');
    expect(buildReviewSystem('r', 'm', wk)).toContain('interactive walkthrough');
    expect(buildReviewSystem('r', 'm', wk)).not.toContain('C++');
  });
});

describe('a math walkthrough through the panel with fake reviewers', () => {
  it('two passing reviews make a stored review that releases exactly this revision', async () => {
    const entry = mathPack.walkthroughs[0];
    const material = buildReviewMaterial(entry);
    const fake = async (req: { stage: string; route: { model: string } }): Promise<string> =>
      JSON.stringify({
        reviewer: req.stage,
        model: req.route.model,
        entryId: material.id,
        entryRev: material.entryRev,
        scores: { dung: 5, roRang: 4, chiTiet: 4, deHieu: 4, trucQuan: 4, sinhDong: 4 },
        factErrors: [],
        issues: [],
        unsourcedClaims: [],
        sources: [],
      });
    const routes = [{ model: 'openai:a' }, { model: 'anthropic:b' }] as never;
    const result = await reviewPanel(
      material,
      ['tutor-review-math', 'tutor-review-math-2'],
      routes,
      fake as never,
    );
    expect(result.verdict).toBe('pass');
    const stored = JSON.stringify({
      entryId: entry.id,
      entryRev: entry.entryRev,
      contentHash: entryContentHash(entry),
      reviews: result.outcomes.map((o) => o.review),
    });
    const loader = (_s: string, id: string, rev: number) =>
      id === entry.id && rev === entry.entryRev ? stored : null;
    const released = releasedPacks([mathPack], loader)[0];
    expect(released.walkthroughs.map((w) => w.id)).toEqual([entry.id]);
  });
});
