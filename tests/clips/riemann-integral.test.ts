import { describe, expect, it } from 'vitest';
import riemannIntegral, {
  exactIntegral,
  expectedDisplay,
  leftSum,
  maxAbsDerivative,
  riemannIntegralEntry as entry,
} from '@/lib/subjects/math/clips/riemann-integral';
import { clipContract } from './clip-contract';

type In = { c: number[]; a: number; b: number; n: 4 | 8 | 16 };

const vals = [-3, -1, 0, 2, 3];
const polys: number[][] = [
  [2],
  [-3],
  [0, 1],
  [1, -2],
  [0, 0, 1],
  [1, -3, 2],
  [0, 0, -3],
  [0, -1, 0, 1],
  [1, 2, -3, 3],
  [-3, 3, -3, -3],
  [0, 0, 0, 3],
];
for (const a of vals) for (const b of vals) polys.push([a, b]);
const sweep: In[] = [];
for (const c of polys)
  for (const a of [-3, -1, 0, 2])
    for (const b of [-2, 0, 1, 3])
      if (a < b) for (const n of [4, 8, 16] as const) sweep.push({ c, a, b, n });

const rat = (c: number[], x: number): number =>
  c.reduce((s, k, i) => s + k * Array.from({ length: i }, () => x).reduce((p, q) => p * q, 1), 0);
const r4 = (x: number) => (Math.round(x * 10000) / 10000 === 0 ? 0 : Math.round(x * 10000) / 10000);

/** independent: the integral by exact Simpson-free route, term by term c_k (b^(k+1) − a^(k+1)) / (k + 1) */
function independentExact({ c, a, b }: In): number {
  const power = (x: number, k: number) =>
    Array.from({ length: k }, () => x).reduce((p, q) => p * q, 1);
  return c.reduce((s, k, i) => s + (k * (power(b, i + 1) - power(a, i + 1))) / (i + 1), 0);
}
/** independent: the left sum by an explicit list of rectangles */
function independentSum({ c, a, b, n }: In): number {
  const rects = Array.from({ length: n }, (_, k) => ({ x: a + (k * (b - a)) / n, w: (b - a) / n }));
  return rects.map((r) => rat(c, r.x) * r.w).reduce((s, v) => s + v, 0);
}

clipContract<In>({
  module: riemannIntegral,
  presets: ['x2-4', 'x2-16', 'const', 'cubic'],
  chapters: [
    { id: 'area', range: [8, 12] },
    { id: 'rectangles', range: [10, 15] },
    { id: 'refine', range: [12, 16] },
    { id: 'limit', range: [10, 14] },
  ],
  bad: [
    { c: [0, 0, 1], a: 2, b: 2, n: 4 },
    { c: [0, 0, 1], a: 3, b: 1, n: 4 },
    { c: [0, 0, 1], a: -4, b: 1, n: 4 },
    { c: [0, 0, 1], a: 0, b: 4, n: 4 },
    { c: [0, 0, 1], a: 0, b: 2, n: 5 },
    { c: [0, 0, 1], a: 0, b: 2, n: 32 },
    { c: [], a: 0, b: 2, n: 4 },
    { c: [1, 2, 3, 1, 1], a: 0, b: 2, n: 4 },
    { c: [4], a: 0, b: 2, n: 4 },
    { c: [0, 0, 1], a: 0, b: 2 },
    { c: [0, 0, 1], a: 0, b: 2, n: 4, extra: 1 },
    { c: 'x2', a: 0, b: 2, n: 4 },
    null,
  ],
  edges: [
    { c: [3, 3, 3, 3], a: -3, b: 3, n: 4 },
    { c: [-3, -3, -3, -3], a: -3, b: 3, n: 16 },
    { c: [0, 0, 0, 3], a: -3, b: 3, n: 4 },
    { c: [-3], a: 2, b: 3, n: 4 },
    { c: [0, -3, 3], a: -3, b: -2, n: 16 },
  ],
  display: (i) => ({ sum: r4(independentSum(i)), exact: r4(independentExact(i)) }),
  sweep,
});

describe('riemann-integral: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    // x² on [0,2], 4 rectangles at x = 0, .5, 1, 1.5: (0 + .25 + 1 + 2.25) · .5 = 1.75; exact 8/3
    expect(expectedDisplay(entry.presets[0].input)).toEqual({ sum: 1.75, exact: 2.6667 });
    // 16 rectangles: Σ_{k<16} (k/8)² · (1/8) = (1/512) · (15·16·31/6) = 7440/3072 = 2.421875
    expect(expectedDisplay(entry.presets[1].input)).toEqual({ sum: 2.4219, exact: 2.6667 });
    expect(expectedDisplay(entry.presets[2].input)).toEqual({ sum: 6, exact: 6 }); // a constant is exact
    // x³ − x on [−1, 2]: the integral is 2.25 − 0 = F(2) − F(−1) = (4 − 2) − (1/4 − 1/2) = 2.25
    expect(expectedDisplay(entry.presets[3].input).exact).toBe(2.25);
  });

  it('the error bound (b − a)²·max|f′| / (2n) holds for every sweep input, and doubling n roughly halves the error', () => {
    for (const i of sweep) {
      const err = Math.abs(independentSum(i) - independentExact(i));
      const bound = ((i.b - i.a) ** 2 * maxAbsDerivative(i.c, i.a, i.b)) / (2 * i.n);
      expect(err).toBeLessThanOrEqual(bound + 1e-9);
    }
    const x2 = (n: 4 | 8 | 16) =>
      Math.abs(
        leftSum({ c: [0, 0, 1], a: 0, b: 2, n }) - exactIntegral({ c: [0, 0, 1], a: 0, b: 2, n }),
      );
    expect(x2(8) / x2(4)).toBeGreaterThan(0.4);
    expect(x2(8) / x2(4)).toBeLessThan(0.6);
    expect(x2(16)).toBeLessThan(x2(8));
  });

  it('a constant function is integrated exactly with any n; an increasing function is underestimated, a decreasing one overestimated', () => {
    for (const n of [4, 8, 16] as const)
      expect(leftSum({ c: [2], a: -1, b: 2, n })).toBeCloseTo(6, 12);
    expect(leftSum({ c: [0, 1], a: 0, b: 2, n: 4 })).toBeLessThan(2); // x on [0,2], exact 2
    expect(leftSum({ c: [0, -1], a: 0, b: 2, n: 4 })).toBeGreaterThan(-2); // −x, exact −2
  });

  it('signed area: the part below the axis counts negatively, so x on [-1, 1] integrates to 0', () => {
    expect(expectedDisplay({ c: [0, 1], a: -1, b: 1, n: 4 }).exact).toBe(0);
    expect(expectedDisplay({ c: [-3], a: 0, b: 2, n: 4 }).exact).toBe(-6);
  });

  it('the exact integral agrees with the independent term-by-term formula everywhere', () => {
    for (const i of sweep) expect(exactIntegral(i)).toBeCloseTo(independentExact(i), 9);
  });

  it('maxAbsDerivative finds the vertex of a parabola-shaped derivative', () => {
    // f = x³ − 3x² → f′ = 3x² − 6x with its extreme |f′| = 3 at x = 1 inside [0, 2]; the ends give 0 and 0
    expect(maxAbsDerivative([0, 0, -3, 1], 0, 2)).toBe(3);
  });
});
