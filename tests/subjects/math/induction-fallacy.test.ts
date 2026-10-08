import { describe, expect, it } from 'vitest';
import { inductionFallacyEntry as entry } from '@/lib/subjects/math/catalog/induction-fallacy';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { n: number; kind: 'all-same-color' | 'missing-base' };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ALL: In[] = (['all-same-color', 'missing-base'] as const).flatMap((kind) =>
  Array.from({ length: 6 }, (_, i) => ({ n: i + 3, kind })),
);
const kindOf = (f: Frame<FigState>, id: string) => f.meta.highlights?.[id];
const labels = (f: Frame<FigState>) => f.state.points.map((p) => p.label);

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-induction'],
  maxFrames: 8,
  presets: ['colors-4', 'colors-8', 'base-3', 'base-6'],
  beats: ['start', 'step', 'crack', 'fix', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['horse', 'n', 'k', 'ov', 'v1'],
  pointers: [],
  allow: [],
  extra: ALL,
  bad: [
    { n: 2, kind: 'all-same-color' },
    { n: 9, kind: 'all-same-color' },
    { n: 4, kind: 'no-base' },
    { n: 4.5, kind: 'missing-base' },
    { n: 4 },
    { n: 4, kind: 'missing-base', z: 1 },
    null,
  ],
  predict: {
    step: { options: 2, expected: () => 0 },
    crack: { options: 3, expected: (i: In) => (i.kind === 'all-same-color' ? 1 : 0) },
  },
});

describe('induction-fallacy: the figure is the mathematics', () => {
  it('horses: the two groups are the first k and the last k of n = k + 1 horses and share n − 2 of them', () => {
    for (const i of ALL.filter((x) => x.kind === 'all-same-color')) {
      const f = gen(i)[2];
      const k = i.n - 1;
      const kinds = f.state.points.map((p) => kindOf(f, p.id));
      expect(kinds.filter((x) => x === 'group-0')).toHaveLength(1); // only horse 1 is in the first group alone
      expect(kinds.filter((x) => x === 'group-1')).toHaveLength(1); // only horse n is in the second group alone
      expect(kinds.filter((x) => x === 'group-2')).toHaveLength(i.n - 2);
      // together they cover all n horses and each group has k horses
      expect(kinds.filter((x) => x === 'group-0' || x === 'group-2')).toHaveLength(k);
      expect(kinds.filter((x) => x === 'group-1' || x === 'group-2')).toHaveLength(k);
      expect((f.meta.vars as { ov: number }).ov).toBe(i.n - 2);
    }
  });

  it('horses: at the smallest step (1 to 2) the groups share no horse, and the text says so', () => {
    for (const i of ALL.filter((x) => x.kind === 'all-same-color')) {
      const f = gen(i).find((fr) => beatOf(fr).includes('crack'))!;
      expect(f.state.points).toHaveLength(2);
      expect(f.state.points.map((p) => kindOf(f, p.id))).toEqual(['group-0', 'group-1']);
      expect((f.meta.vars as { ov: number }).ov).toBe(0);
      expect(f.meta.explanation).toMatch(/chung 0 con/);
    }
  });

  it('parity: the labels are n² + n, every one is even (independent), and the "odd" step is valid for every k', () => {
    for (const i of ALL.filter((x) => x.kind === 'missing-base')) {
      const f = gen(i).find((fr) => beatOf(fr).includes('crack'))!;
      expect(labels(f)).toEqual(Array.from({ length: i.n }, (_, j) => String((j + 1) * (j + 2))));
      for (const p of f.state.points) {
        expect(Number(p.label) % 2).toBe(0);
        expect(kindOf(f, p.id)).toBe('compare'); // even
      }
      // the step: ((k+1)² + (k+1)) − (k² + k) = 2(k + 1), which is even, for every k
      for (let k = 1; k < 50; k++) expect(((k + 1) ** 2 + (k + 1) - (k * k + k)) % 2).toBe(0);
      expect((f.meta.vars as { v1: number }).v1).toBe(2);
    }
  });

  it('the active pair of the parity step is k and k + 1 = n', () => {
    for (const i of ALL.filter((x) => x.kind === 'missing-base')) {
      const f = gen(i).find((fr) => beatOf(fr).includes('step'))!;
      const active = f.state.points.filter((p) => kindOf(f, p.id) === 'active').map((p) => p.x);
      expect(active).toEqual([i.n - 1, i.n]);
    }
  });

  it('every named object exists in its frame; bounds hold the dots; frame counts: 6 for horses and 5 for parity', () => {
    for (const i of ALL) {
      const frames = gen(i);
      expect(frames).toHaveLength(i.kind === 'all-same-color' ? 6 : 5);
      for (const f of frames) {
        const ids = new Set(f.state.points.map((p) => p.id));
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
        }
      }
    }
  });
});
