import { describe, expect, it } from 'vitest';
import { decide, GATES, prBody } from '@/scripts/manim-author-pr.mjs';

const pass = { allowlist: true, render: true, manifest: true, mathReview: true, codeReview: true };

describe('author pull requests (card 3D-02)', () => {
  it('auto-merge needs every gate to be exactly true', () => {
    expect(decide(pass)).toEqual({ autoMerge: true, draft: false, missing: [] });
    for (const g of GATES as string[]) {
      for (const v of [false, null, undefined, 'true', 1]) {
        const d = decide({ ...pass, [g]: v });
        expect(d.autoMerge, `${g}=${String(v)}`).toBe(false);
        expect(d.draft).toBe(true);
        expect(d.missing).toEqual([g]);
      }
    }
    expect(decide(undefined).autoMerge).toBe(false);
  });

  it('a loop result before the reviews have run is a draft', () => {
    const d = decide({ ...pass, mathReview: null, codeReview: null });
    expect(d.missing).toEqual(['mathReview', 'codeReview']);
    expect(
      prBody(
        { clipId: 'x', briefId: 'b-x', rounds: 2, ...pass, mathReview: null, codeReview: null },
        d,
      ),
    ).toContain('not run');
  });
});
