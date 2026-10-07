import { describe, expect, it } from 'vitest';
import secantTangent, {
  expectedDisplay,
  secantTangentEntry as entry,
} from '@/lib/subjects/math/clips/secant-tangent';
import { clipContract } from './clip-contract';

type In = { c: number[]; x0: number };

const vals = [-3, -2, -1, 0, 1, 2, 3];
const sweep: In[] = [];
for (const a of vals)
  for (const b of vals)
    for (const c of vals)
      if (c !== 0) for (let x0 = -2; x0 <= 2; x0++) sweep.push({ c: [a, b, c], x0 });
for (const a of vals)
  for (const b of vals)
    for (const c of vals)
      for (const d of vals)
        if (d !== 0) for (const x0 of [-2, 0, 2]) sweep.push({ c: [a, b, c, d], x0 });

/** independent: expand every power by repeated multiplication; derivative from the product rule on each term */
const power = (x: number, k: number): number =>
  Array.from({ length: k }, () => x).reduce((p, q) => p * q, 1);
const direct = (c: number[], x: number): number => c.reduce((s, k, i) => s + k * power(x, i), 0);
const derivative = (c: number[], x: number): number =>
  c.reduce((s, k, i) => (i === 0 ? s : s + i * k * power(x, i - 1)), 0);

clipContract<In>({
  module: secantTangent,
  presets: ['square-at-1', 'cubic-at-0', 'stationary', 'quad-at-minus-1'],
  chapters: [
    { id: 'curve', range: [8, 12] },
    { id: 'secant', range: [10, 15] },
    { id: 'limit', range: [12, 20] },
    { id: 'tangent', range: [8, 12] },
  ],
  bad: [
    { c: [1, 2], x0: 0 },
    { c: [1, 2, 3, 1, 1], x0: 0 },
    { c: [1, 2, 0], x0: 0 },
    { c: [0, 0, 0, 0], x0: 0 },
    { c: [1, 2, 4], x0: 0 },
    { c: [1, 2, 1], x0: 3 },
    { c: [1, 2, 1], x0: -3 },
    { c: [1, 2, 1], x0: 0.5 },
    { c: [1, 2, 1] },
    { x0: 0 },
    { c: 'abc', x0: 0 },
    null,
  ],
  edges: [
    { c: [-3, -3, 3], x0: 2 },
    { c: [3, 3, -3], x0: -2 },
    { c: [-3, 3, -3, 3], x0: 2 },
    { c: [3, -3, 3, -3], x0: 2 }, // the case where the card's 0.1 bound fails
    { c: [3, 3, 3, 3], x0: -2 },
    { c: [0, 0, 1], x0: 0 },
  ],
  display: ({ c, x0 }) => {
    const r4 = (x: number) => Math.round(x * 10000) / 10000;
    const s = (h: number) => (direct(c, x0 + h) - direct(c, x0)) / h;
    return { f0: direct(c, x0), fprime: derivative(c, x0), slope1: r4(s(1)), slope01: r4(s(0.01)) };
  },
  sweep,
});

describe('secant-tangent: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    const shown = (name: string) =>
      expectedDisplay(entry.presets.find((p) => p.id === name)!.input);
    // x² at 1: f = 1, f' = 2, slope(1) = (4 - 1)/1 = 3, slope(0.01) = 2.01
    expect(shown('square-at-1')).toEqual({ f0: 1, fprime: 2, slope1: 3, slope01: 2.01 });
    // x³ - 3x at 0: f = 0, f' = -3, slope(1) = (1 - 3 - 0)/1 = -2, slope(0.01) = -2.9999
    expect(shown('cubic-at-0')).toEqual({ f0: 0, fprime: -3, slope1: -2, slope01: -2.9999 });
    // x³ - 3x at 1: f = -2, f' = 0 (flat tangent), slope(1) = (f(2) + 2) = 2 + 2 = 4
    expect(shown('stationary')).toMatchObject({ f0: -2, fprime: 0, slope1: 4 });
    expect(shown('stationary').slope01).toBeCloseTo(0.0301, 4);
    // 2x² - x + 1 at -1: f = 4, f' = 4x - 1 = -5
    expect(shown('quad-at-minus-1')).toMatchObject({ f0: 4, fprime: -5 });
  });

  it('the exact identity slope(h) = f′ + f″h/2 + c3·h² holds for every polynomial and every h', () => {
    for (const { c, x0 } of sweep.filter((_, i) => i % 11 === 0)) {
      const f2 = c.length === 4 ? 6 * c[3] * x0 + 2 * c[2] : 2 * c[2];
      const c3 = c.length === 4 ? c[3] : 0;
      for (const h of [1, 0.5, 0.1, 0.01]) {
        const slopeH = (direct(c, x0 + h) - direct(c, x0)) / h;
        expect(slopeH).toBeCloseTo(derivative(c, x0) + (f2 * h) / 2 + c3 * h * h, 9);
      }
    }
  });

  it("the card's bound |slope(0.01) − f′| < 0.1 would fail inside the input range, the looser 0.25 holds everywhere", () => {
    let worst = 0;
    for (const { c, x0 } of sweep) {
      worst = Math.max(
        worst,
        Math.abs((direct(c, x0 + 0.01) - direct(c, x0)) / 0.01 - derivative(c, x0)),
      );
    }
    expect(worst).toBeGreaterThan(0.1);
    expect(worst).toBeLessThan(0.25);
  });

  it('the stationary preset has a flat tangent: f′ = 0 and the secants shrink from 4 toward 0', () => {
    const p = entry.presets.find((x) => x.id === 'stationary')!.input;
    const slopes = [1, 0.5, 0.1, 0.01].map((h) => (direct(p.c, p.x0 + h) - direct(p.c, p.x0)) / h);
    expect(derivative(p.c, p.x0)).toBe(0);
    for (let i = 1; i < slopes.length; i++)
      expect(Math.abs(slopes[i])).toBeLessThan(Math.abs(slopes[i - 1]));
  });
});
