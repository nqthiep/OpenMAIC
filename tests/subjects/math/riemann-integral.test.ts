import { describe, expect, it } from 'vitest';
import { riemannIntegralEntry as entry } from '@/lib/subjects/math/catalog/riemann-integral';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { c: number[]; a: number; b: number; n: 4 | 8 | 16 };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const poly = (c: number[], x: number) => c.reduceRight((acc, k) => acc * x + k, 0);
/** independent: the left sum in floating point */
const leftSum = (i: In, m: number) => {
  let s = 0;
  for (let j = 0; j < m; j++) s += poly(i.c, i.a + ((i.b - i.a) * j) / m);
  return (s * (i.b - i.a)) / m;
};
/** independent: the integral by a very fine midpoint rule (error ~ 1e-9 for these polynomials) */
const midpoint = (i: In) => {
  const m = 20000;
  let s = 0;
  for (let j = 0; j < m; j++) s += poly(i.c, i.a + ((i.b - i.a) * (j + 0.5)) / m);
  return (s * (i.b - i.a)) / m;
};
const num = (t: string) => {
  const [p, q] = t.replace('−', '-').split('/');
  return Number(p) / Number(q ?? 1);
};

function family(): In[] {
  const out: In[] = [];
  let x = 2718;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) {
    const a = next(6) - 3;
    const b = next(6) - 2;
    if (a >= b) continue;
    out.push({
      c: Array.from({ length: 1 + next(4) }, () => next(7) - 3),
      a,
      b,
      n: ([4, 8, 16] as const)[next(3)],
    });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number | string>;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m4-integral'],
  maxFrames: 8,
  presets: ['x2-4', 'x2-16', 'const', 'cubic'],
  beats: ['start', 'rectangles', 'refine', 'limit', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['a', 'b', 'n', 'L', 'exact', 'trend', 'V', 'n1', 'n2', 'n3', 'E1', 'E2', 'E3'],
  pointers: [],
  extra: FAMILY.slice(0, 30),
  bad: [
    { c: [1], a: 1, b: 1, n: 4 },
    { c: [1], a: 2, b: 0, n: 4 },
    { c: [1], a: 0, b: 1, n: 5 },
    { c: [], a: 0, b: 1, n: 4 },
    { c: [1, 1, 1, 1, 1], a: 0, b: 1, n: 4 },
    { c: [4], a: 0, b: 1, n: 4 },
    { c: [1], a: -4, b: 1, n: 4 },
    { c: [1], a: 0, b: 1 },
    { c: [1], a: 0, b: 1, n: 4, z: 1 },
    null,
  ],
  predict: {
    rectangles: {
      options: 2,
      expected: (i: In) => (Math.abs(leftSum(i, i.n) - midpoint(i)) < 1e-6 ? 0 : 1),
    },
    refine: {
      options: 3,
      expected: (i: In) => {
        const e = (m: number) => Math.abs(leftSum(i, m) - midpoint(i));
        const [e1, e3] = [e(i.n), e(4 * i.n)];
        return Math.abs(e3 - e1) < 1e-9 ? 2 : e3 < e1 ? 1 : 0;
      },
    },
  },
});

describe('riemann-integral: the figure is the mathematics', () => {
  it('L is the exact left sum for n, 2n and 4n parts, and I is the integral (checked in floating point)', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      const rect = frames.find((f) => beatOf(f).includes('rectangles'))!;
      const ref = frames.filter(
        (f) => beatOf(f).includes('refine') || /^Tăng lên/.test(f.meta.explanation),
      );
      expect(ref).toHaveLength(2);
      expect(num(vars(rect).L as string)).toBeCloseTo(leftSum(i, i.n), 9);
      expect(num(vars(ref[0]).L as string)).toBeCloseTo(leftSum(i, 2 * i.n), 9);
      expect(num(vars(ref[1]).L as string)).toBeCloseTo(leftSum(i, 4 * i.n), 9);
      const lim = frames.find((f) => beatOf(f).includes('limit'))!;
      const I = midpoint(i);
      expect(num(vars(lim).V as string), JSON.stringify(i)).toBeCloseTo(I, 6);
      [vars(lim).E1, vars(lim).E2, vars(lim).E3].forEach((e, j) => {
        expect(num(e as string)).toBeCloseTo(Math.abs(leftSum(i, i.n * 2 ** j) - I), 6);
      });
    }
  });

  it('the rectangles are drawn: m of them, as wide as (b − a)/m and as tall as f at the left end, below the axis when f < 0', () => {
    for (const i of FAMILY.slice(0, 60)) {
      const frames = gen(i);
      const counts = frames.map((f) => f.state.polygons.length);
      expect(counts).toEqual([0, i.n, 2 * i.n, 4 * i.n, 4 * i.n, 0]);
      for (const f of frames.slice(1, 5)) {
        const m = f.state.polygons.length;
        f.state.polygons.forEach((p, j) => {
          const xy = p.xy!;
          const xs = xy.map((q) => q[0]);
          const ys = xy.map((q) => q[1]);
          expect(Math.min(...xs)).toBeCloseTo(i.a + ((i.b - i.a) * j) / m, 2);
          expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo((i.b - i.a) / m, 2);
          const h = poly(i.c, i.a + ((i.b - i.a) * j) / m);
          expect(
            h >= 0 ? Math.max(...ys) : Math.min(...ys),
            `${JSON.stringify(i)} #${j}`,
          ).toBeCloseTo(h, 2);
          expect(h >= 0 ? Math.min(...ys) : Math.max(...ys)).toBeCloseTo(0, 9);
        });
      }
    }
  });

  it('a constant function: the sum is exact at once and the text says the rectangles fit', () => {
    const frames = gen(PRESETS[2]);
    expect(vars(frames[1]).exact).toBe(1);
    expect(vars(frames[1]).L).toBe('6');
    expect(vars(frames.at(-1)!).V).toBe('6');
    expect(vars(gen(PRESETS[0])[1]).exact).toBe(0);
    expect(vars(gen(PRESETS[0])[1]).L).toBe('7/4');
    expect(vars(gen(PRESETS[0]).at(-1)!).V).toBe('8/3');
  });

  it('every object a highlight names exists in its frame, the bounds hold every point and polygon vertex, and the counts stay in budget', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.polylines.map((p) => p.id),
          ...f.state.polygons.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
        const b = f.state.bounds;
        for (const p of f.state.polygons)
          for (const [x, y] of p.xy!) {
            expect(x).toBeGreaterThanOrEqual(b.xmin);
            expect(x).toBeLessThanOrEqual(b.xmax);
            expect(y).toBeGreaterThanOrEqual(b.ymin);
            expect(y).toBeLessThanOrEqual(b.ymax);
          }
        expect(f.state.polygons.length).toBeLessThanOrEqual(140);
      }
    }
  }, 60_000);
});
