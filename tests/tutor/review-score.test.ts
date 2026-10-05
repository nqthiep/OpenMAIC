import { describe, expect, it } from 'vitest';
import {
  exitCode,
  formatReport,
  score,
  type Outcome,
  type Sample,
} from '@/eval/tutor-review/score';
import { seedErrors } from '@/eval/tutor-review/seed-errors';
import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import {
  buildReviewMaterial,
  buildReviewPrompt,
  reviewPanel,
  reviewPasses,
  type Review,
  type ReviewLlm,
} from '@/lib/tutor/review-schema';

// Pure scoring of the review-panel calibration. No model, no network.

const mutant = (n: number, group = 'map'): Sample => ({
  id: `m-${group}-${n}`,
  kind: 'mutant',
  group,
});
const clean = (n: number): Sample => ({ id: `c-${n}`, kind: 'clean', group: 'clean' });
type Pass = boolean | null;
const out = (
  sample: Sample,
  verdict: 'pass' | 'fail',
  p1: Pass = verdict === 'pass',
  p2: Pass = p1,
): Outcome => ({
  sample,
  verdict,
  passes: [p1, p2],
});

/** `m` mutants (first `missed` pass) + `c` clean (first `blocked` fail). */
function build(m: number, missed: number, c: number, blocked: number): Outcome[] {
  return [
    ...Array.from({ length: m }, (_, i) => out(mutant(i), i < missed ? 'pass' : 'fail')),
    ...Array.from({ length: c }, (_, i) => out(clean(i), i < blocked ? 'fail' : 'pass')),
  ];
}

describe('score', () => {
  it('meets the targets at exactly 90% catch and 10% false-block', () => {
    const r = score(build(30, 3, 10, 1));
    expect(r.panel).toMatchObject({ mutants: 30, caught: 27, clean: 10, falseBlocked: 1 });
    expect(r.ok).toBe(true);
  });

  it('misses the catch target just below 90%', () => {
    const r = score(build(30, 4, 10, 0));
    expect(r.panel.catchOk).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.missed).toHaveLength(4);
  });

  it('misses the false-block target just above 10%', () => {
    const r = score(build(30, 0, 10, 2));
    expect(r.panel.falseBlockOk).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.falseBlocks).toHaveLength(2);
  });

  it('cannot show a target on an empty side', () => {
    expect(score(build(0, 0, 10, 0), { partial: true }).ok).toBe(false);
    expect(score(build(30, 0, 0, 0), { partial: true }).ok).toBe(false);
  });

  it('needs 30 seeded and 10 clean samples unless the run is partial', () => {
    const small = build(20, 0, 10, 0);
    expect(score(small).undersized).toBe(true);
    expect(score(small).ok).toBe(false);
    expect(score(small, { partial: true }).ok).toBe(true);
    expect(score(build(30, 0, 9, 0)).undersized).toBe(true);
  });

  it('gates reviewer 1 alone (ADR 0014 d8), a null review counting as a fail', () => {
    const o = build(30, 0, 10, 0).map((x) =>
      x.sample.kind === 'clean' ? { ...x, passes: [false, true] as const } : x,
    );
    const r = score(o);
    expect(r.panel.falseBlockOk).toBe(true); // the panel verdict is what the outcome says
    expect(r.reviewers[0].falseBlocked).toBe(10);
    expect(r.ok).toBe(false);

    const none = build(30, 0, 10, 0).map((x) => ({ ...x, passes: [null, true] as const }));
    const r2 = score(none);
    expect(r2.noReview).toBe(40);
    expect(r2.reviewers[0].caught).toBe(30);
    expect(r2.reviewers[0].falseBlocked).toBe(10);
  });

  it('reports reviewer 2 without gating on it', () => {
    const o = build(30, 0, 10, 0).map((x) =>
      x.sample.kind === 'clean' ? { ...x, passes: [true, false] as const } : x,
    );
    const r = score(o);
    expect(r.reviewers[1].falseBlockOk).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('rows count wrong calls per group', () => {
    const o = [out(mutant(1, 'map'), 'pass'), out(mutant(2, 'map'), 'fail'), out(clean(1), 'fail')];
    const r = score(o, { partial: true });
    expect(r.rows).toEqual([
      { group: 'clean', total: 1, wrong: 1 },
      { group: 'map', total: 2, wrong: 1 },
    ]);
  });
});

describe('exitCode / formatReport', () => {
  it('2 without a route, 0 for a plan, 1 on a missed target, 0 on a pass', () => {
    expect(exitCode(false)).toBe(2);
    expect(exitCode(true)).toBe(0);
    expect(exitCode(true, score(build(30, 9, 10, 0)))).toBe(1);
    expect(exitCode(true, score(build(30, 0, 10, 0)))).toBe(0);
  });

  it('prints rates, the missed ids and the result', () => {
    const text = formatReport(score(build(30, 4, 10, 0)));
    expect(text).toContain('26/30');
    expect(text).toContain('m-map-0');
    expect(text).toContain('RESULT: FAIL');
    expect(formatReport(score(build(30, 0, 10, 0)))).toContain('RESULT: PASS');
  });
});

describe('calibration end to end with a fake panel', () => {
  // A fake reviewer that has "read" the clean entry: it fails any prompt that differs from it.
  const base = buildReviewMaterial(binarySearchEntry);
  const cleanPrompt = buildReviewPrompt(base);
  const llm: ReviewLlm = async ({ stage, route, prompt }) => {
    const bad = prompt !== cleanPrompt;
    const r: Review = {
      reviewer: stage,
      model: route.model,
      entryId: base.id,
      entryRev: base.entryRev,
      scores: { dung: bad ? 2 : 5, roRang: 4, chiTiet: 4, deHieu: 4, trucQuan: 4, sinhDong: 4 },
      factErrors: bad ? ['seeded'] : [],
      issues: [],
      unsourcedClaims: [],
      sources: [],
    };
    return JSON.stringify(r);
  };

  it('catches every seeded error and blocks no unmodified entry', async () => {
    const stages = ['tutor-review-cp', 'tutor-review-cp-2'] as const;
    const routes = [{ model: 'a:1' }, { model: 'b:2' }] as const;
    const samples = [
      ...seedErrors(binarySearchEntry).map((m) => ({
        sample: { id: m.id, kind: 'mutant' as const, group: m.kind },
        material: m.material,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        sample: { id: `clean-${i}`, kind: 'clean' as const, group: 'clean' },
        material: base,
      })),
    ];
    const outcomes: Outcome[] = [];
    for (const s of samples) {
      const r = await reviewPanel(s.material, stages, routes, llm);
      const p = (i: 0 | 1) => (r.outcomes[i].review ? reviewPasses(r.outcomes[i].review!) : null);
      outcomes.push({ sample: s.sample, verdict: r.verdict, passes: [p(0), p(1)] });
    }
    const report = score(outcomes);
    expect(report.panel.mutants).toBeGreaterThanOrEqual(30);
    expect(report.missed).toEqual([]);
    expect(report.falseBlocks).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
