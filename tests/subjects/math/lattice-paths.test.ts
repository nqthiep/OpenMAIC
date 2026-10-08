import { describe, expect, it } from 'vitest';
import { latticePathsEntry as entry } from '@/lib/subjects/math/catalog/lattice-paths';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { m: number; n: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ALL: In[] = Array.from({ length: 36 }, (_, i) => ({
  m: (i % 6) + 1,
  n: Math.floor(i / 6) + 1,
}));
/** independent: count the paths to (x, y) by walking them all (depth-first), not by the sum rule */
function walk(x: number, y: number): number {
  let count = 0;
  const go = (a: number, b: number) => {
    if (a === x && b === y) count++;
    if (a < x) go(a + 1, b);
    if (b < y) go(a, b + 1);
  };
  go(0, 0);
  return count;
}
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number>;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m3-counting-advanced'],
  maxFrames: 14,
  presets: ['2-2', '3-2', '1-6', '4-4'],
  beats: ['start', 'paths', 'pascal', 'binomial', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['m', 'n', 'mn', 'j', 'r', 'last', 'ways'],
  pointers: [],
  allow: [],
  extra: ALL,
  bad: [
    { m: 0, n: 3 },
    { m: 7, n: 3 },
    { m: 3, n: 0 },
    { m: 2.5, n: 3 },
    { m: 3 },
    { m: 3, n: 3, z: 1 },
    null,
  ],
  predict: {
    paths: { options: 3, expected: () => 0 },
    pascal: { options: 3, expected: () => 0 },
  },
});

describe('lattice-paths: the figure is the mathematics', () => {
  it('the number at every point is the count of paths found by walking them all (independent of the sum rule)', () => {
    for (const i of ALL.filter((x) => x.m + x.n <= 9)) {
      const f = gen(i).find((fr) => beatOf(fr).includes('binomial'))!;
      for (let y = 0; y <= i.n; y++)
        for (let x = 0; x <= i.m; x++) {
          const p = f.state.points.find((q) => q.id === `g${x}_${y}`)!;
          expect(Number(p.label), `${JSON.stringify(i)} (${x}, ${y})`).toBe(walk(x, y));
        }
    }
  });

  it('the corner count is C(m + n, n) (independent: multiplicative formula) and equals the text', () => {
    for (const i of ALL) {
      let c = 1;
      for (let t = 1; t <= i.n; t++) c = (c * (i.m + t)) / t;
      const last = gen(i).at(-1)!;
      expect(vars(last).ways).toBe(c);
      expect(vars(last).mn).toBe(i.m + i.n);
      expect(walk(i.m, i.n)).toBe(c);
    }
  });

  it('every drawn path goes from A to B in unit steps right or up, in m + n steps, and the paths differ', () => {
    for (const i of ALL) {
      const frames = gen(i);
      const shown = frames.filter(
        (f) => beatOf(f).includes('paths') || /^Đường/.test(f.meta.explanation),
      );
      const last = shown.at(-1)!;
      expect(last.state.polylines.length).toBe(shown.length);
      expect(shown.length).toBeGreaterThanOrEqual(2);
      expect(shown.length).toBeLessThanOrEqual(3);
      const keys = new Set<string>();
      for (const pl of last.state.polylines) {
        expect(pl.xy).toHaveLength(i.m + i.n + 1);
        expect(pl.xy[0]).toEqual([0, 0]);
        expect(pl.xy.at(-1)).toEqual([i.m, i.n]);
        for (let t = 1; t < pl.xy.length; t++) {
          const [dx, dy] = [pl.xy[t][0] - pl.xy[t - 1][0], pl.xy[t][1] - pl.xy[t - 1][1]];
          expect(dx === 1 && dy === 0 ? 'R' : dx === 0 && dy === 1 ? 'U' : 'bad').not.toBe('bad');
        }
        keys.add(JSON.stringify(pl.xy));
      }
      expect(keys.size).toBe(shown.length);
    }
  });

  it('the numbers appear row by row: the bottom row is all 1, row r is filled in frame r, and the numbers shown never change', () => {
    for (const i of ALL.filter((x) => x.m + x.n <= 9)) {
      const frames = gen(i).filter((f) => /^(Hàng|Ghi)/.test(f.meta.explanation));
      expect(frames).toHaveLength(i.n + 1);
      frames.forEach((f, r) => {
        const numbered = f.state.points.filter(
          (p) => p.label !== '' && !['A', 'B'].includes(p.label!),
        );
        expect(numbered).toHaveLength((i.m + 1) * (r + 1));
        for (const p of numbered) expect(Number(p.label)).toBe(walk(p.x, p.y));
      });
    }
  });

  it('grid: m(n + 1) + (m + 1)n unit segments and (m + 1)(n + 1) points; bounds and highlight ids are right', () => {
    for (const i of ALL) {
      for (const f of gen(i)) {
        expect(f.state.points).toHaveLength((i.m + 1) * (i.n + 1));
        expect(f.state.segments).toHaveLength(i.m * (i.n + 1) + (i.m + 1) * i.n);
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.polylines.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
  });
});
