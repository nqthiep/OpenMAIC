import { describe, expect, it } from 'vitest';
import {
  cleanClipVariants,
  MATH_SEED_KINDS,
  seedClipErrors,
} from '@/eval/tutor-review/seed-errors-math';
import { buildClipReviewMaterial } from '@/lib/clips/review-material';
import { buildReviewPrompt, buildReviewSystem } from '@/lib/tutor/review-schema';
import { mathClipModules } from '@/lib/subjects/math/clips';
import { mathPack } from '@/lib/subjects/math/pack';
import { buildReviewMaterial } from '@/lib/tutor/review-schema';

describe('math review material', () => {
  it('a clip becomes frames (chapter x preset) with the numbers the scene must draw', () => {
    for (const mod of mathClipModules) {
      const m = buildClipReviewMaterial(mod);
      expect(m.kind).toBe('clip');
      expect(m.subject).toBe('math');
      expect(m.entryRev).toBe(mod.entry.engine.templateRev);
      expect(m.frames).toHaveLength(mod.entry.presets.length * mod.entry.chapters.length);
      for (const f of m.frames) {
        expect(f.explanation, mod.entry.id).toContain('BEFORE:');
        expect(f.explanationAlt, mod.entry.id).toContain('AFTER:');
        expect(Object.keys(f.vars ?? {}).length).toBeGreaterThan(0);
      }
      expect(m.beats.map((b) => b.id)).toEqual(mod.entry.chapters.map((c) => c.id));
      expect(m.alt?.locale).toBe('en-US');
      expect(buildReviewPrompt(m).length).toBeLessThan(160_000);
    }
  });

  it('math material is reviewed with the math prompt, informatics with the programming one', () => {
    const clip = buildClipReviewMaterial(mathClipModules[0]);
    expect(buildReviewSystem('r', 'm', clip)).toContain('olympiad mathematics');
    expect(buildReviewSystem('r', 'm', clip)).toContain('silent animated clip');
    expect(buildReviewSystem('r', 'm', clip)).not.toContain('C++');
    const wk = buildReviewMaterial(mathPack.walkthroughs[0]);
    expect(buildReviewSystem('r', 'm', wk)).toContain('interactive walkthrough');
    expect(buildReviewSystem('r', 'm', wk)).toContain('olympiad mathematics');
  });
});

describe('seeded errors and clean variants for the math panel (card 3A-17)', () => {
  const mutants = mathClipModules.flatMap(seedClipErrors);
  const clean = cleanClipVariants(mathClipModules);

  it('has at least 30 labelled mutants and 10 distinct clean variants, covering every kind', () => {
    expect(mutants.length).toBeGreaterThanOrEqual(30);
    expect(clean.length).toBeGreaterThanOrEqual(10);
    for (const kind of MATH_SEED_KINDS)
      expect(
        mutants.some((m) => m.kind === kind),
        kind,
      ).toBe(true);
    expect(new Set(mutants.map((m) => m.id)).size).toBe(mutants.length);
  });

  it('every mutant differs from its clip, and no mutant equals a clean variant', () => {
    const cleanSet = new Set(clean.map((c) => JSON.stringify(c.material)));
    for (const m of mutants) {
      expect(cleanSet.has(JSON.stringify(m.material)), m.id).toBe(false);
      expect(m.where.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(mathClipModules.flatMap(seedClipErrors).map((m) => m.id)).toEqual(
      mutants.map((m) => m.id),
    );
  });
});

describe('a clip through the panel with fake reviewers', () => {
  it('two passing reviews make a stored review that releases exactly this clip revision', async () => {
    const { reviewPanel } = await import('@/lib/tutor/review-schema');
    const { releasedPacks } = await import('@/lib/subjects/release');
    const { clipEntryHash } = await import('@/lib/clips/hash');
    const mod = mathClipModules[0];
    const material = buildClipReviewMaterial(mod);
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
      entryId: mod.entry.id,
      entryRev: mod.entry.engine.templateRev,
      contentHash: clipEntryHash(mod.entry),
      reviews: result.outcomes.map((o) => o.review),
    });
    const loader = (_s: string, id: string, rev: number) =>
      id === mod.entry.id && rev === mod.entry.engine.templateRev ? stored : null;
    const released = releasedPacks([mathPack], loader)[0];
    expect(released.clips?.map((c) => c.id)).toEqual([mod.entry.id]);
  });
});
