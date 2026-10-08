import { describe, expect, it } from 'vitest';
import { secantTangentEntry as entry } from '@/lib/subjects/math/catalog/secant-tangent';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { c: number[]; x0: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const f = (c: number[], x: number) => c.reduceRight((acc, k) => acc * x + k, 0);
const fprime = (c: number[], x: number) =>
  c.slice(1).reduceRight((acc, k, i) => acc * x + (i + 1) * k, 0);

function family(): In[] {
  const out: In[] = [];
  let x = 777;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) {
    const len = 3 + next(2);
    const c = Array.from({ length: len }, () => next(7) - 3);
    if (c[len - 1] !== 0) out.push({ c, x0: next(5) - 2 });
  }
  return out;
}
const FAMILY = family();

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m3-derivative-graphs'],
  maxFrames: 8,
  presets: ['square-at-1', 'cubic-at-0', 'stationary', 'quad-at-minus-1'],
  beats: ['start', 'secant', 'limit', 'tangent', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['x0', 'f0', 'num', 'den', 'same', 'h', 'fp'],
  pointers: [],
  extra: [
    { c: [3, 3, 3, 3], x0: 2 },
    { c: [-3, -3, -3], x0: -2 },
    { c: [0, 0, 0, 1], x0: 0 },
  ],
  bad: [
    { c: [1, 2, 0], x0: 0 },
    { c: [1, 2], x0: 0 },
    { c: [1, 2, 3, 1, 1], x0: 0 },
    { c: [1, 2, 4], x0: 0 },
    { c: [1, 2, 3], x0: 3 },
    { c: [1, 2, 3] },
    null,
  ],
  predict: {
    secant: {
      options: 2,
      expected: (i: In) => {
        const slope1 = f(i.c, i.x0 + 1) - f(i.c, i.x0);
        return slope1 === fprime(i.c, i.x0) ? 0 : 1;
      },
    },
    limit: { options: 3, expected: () => 0 },
  },
  allow: [2, 4, 8],
});

describe('secant-tangent: the figure is the mathematics', () => {
  it('the secant slopes are exact fractions of the real difference quotients, and approach f-prime', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const fp = fprime(i.c, i.x0);
      const slopes = frames
        .filter((fr) => fr.meta.vars && 'num' in fr.meta.vars)
        .map((fr) => fr.meta.vars as { num: number; den: number; h?: number });
      expect(slopes).toHaveLength(4);
      slopes.forEach((s, j) => {
        const h = 1 / 2 ** j;
        expect(s.num / s.den, `${JSON.stringify(i)} j=${j}`).toBeCloseTo(
          (f(i.c, i.x0 + h) - f(i.c, i.x0)) / h,
          9,
        );
        expect(Number.isInteger(s.num) && Number.isInteger(s.den)).toBe(true);
      });
      // the exact error of a difference quotient of a cubic: f''(x0)·h/2 + c3·h^2 (c3 = 0 for a quadratic)
      const f2 = 2 * (i.c[2] ?? 0) + 6 * (i.c[3] ?? 0) * i.x0;
      slopes.forEach((s, j) => {
        const h = 1 / 2 ** j;
        expect(s.num / s.den - fp, `${JSON.stringify(i)} j=${j}`).toBeCloseTo(
          (f2 * h) / 2 + (i.c[3] ?? 0) * h * h,
          9,
        );
      });
    }
  });

  it('P and Q are on the graph, the tangent has the slope f-prime', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const pt = (fr: Frame<FigState>, id: string) => fr.state.points.find((p) => p.id === id)!;
      const start = frames[0];
      expect(pt(start, 'P').y).toBeCloseTo(f(i.c, i.x0), 3);
      const sec = frames.find((fr) => beatOf(fr).includes('secant'))!;
      expect(pt(sec, 'Q').x).toBe(i.x0 + 1);
      expect(pt(sec, 'Q').y).toBeCloseTo(f(i.c, i.x0 + 1), 3);
      const tan = frames.find((fr) => beatOf(fr).includes('tangent'))!;
      expect(pt(tan, 'T').y - pt(tan, 'P').y).toBeCloseTo(fprime(i.c, i.x0), 9);
      expect(tan.meta.vars).toEqual({ x0: i.x0, fp: fprime(i.c, i.x0) });
    }
  });

  it('every point of the drawn curve is on the polynomial and inside the picture', () => {
    for (const i of FAMILY.slice(0, 60)) {
      const fr = gen(i)[0];
      const b = fr.state.bounds;
      for (const pl of fr.state.polylines.filter((p) => p.id.startsWith('f'))) {
        for (const [x, y] of pl.xy) {
          expect(Math.abs(y - f(i.c, x)), JSON.stringify(i)).toBeLessThan(2e-3 * (1 + Math.abs(y)));
          expect(y).toBeGreaterThanOrEqual(b.ymin - 1e-9);
          expect(y).toBeLessThanOrEqual(b.ymax + 1e-9);
        }
      }
    }
  });
});
