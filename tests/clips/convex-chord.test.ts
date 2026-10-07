import { describe, expect, it } from 'vitest';
import convexChord, {
  convexChordEntry as entry,
  expectedDisplay,
} from '@/lib/subjects/math/clips/convex-chord';
import { clipContract } from './clip-contract';

type Fn = 'x2' | 'abs' | 'x4';
type In = { f: Fn; x1: number; x2: number; t: number };

const sweep: In[] = [];
for (const f of ['x2', 'abs', 'x4'] as const)
  for (let x1 = -3; x1 <= 3; x1++)
    for (let x2 = -3; x2 <= 3; x2++) {
      if (x1 === x2) continue;
      for (let k = 0; k <= 10; k++) sweep.push({ f, x1, x2, t: k / 10 });
    }

/** independent: exact integer arithmetic with t = k/10; the mixture and the heights are scaled by powers of 10 */
function exact({ f, x1, x2, t }: In): { lhs: number; rhs: number } {
  const k = Math.round(t * 10);
  const mixNum = k * x1 + (10 - k) * x2; // the mixture is mixNum / 10
  const base = (n: number) => (f === 'x2' ? n * n : f === 'abs' ? Math.abs(n) : n * n * n * n);
  const heightNum =
    f === 'x2' ? base(mixNum) / 100 : f === 'abs' ? base(mixNum) / 10 : base(mixNum) / 10000;
  const chordNum = (k * base(x1) + (10 - k) * base(x2)) / 10;
  return { lhs: heightNum, rhs: chordNum };
}
const r4 = (x: number) => Math.round(x * 10000) / 10000;

clipContract<In>({
  module: convexChord,
  presets: ['x2-mid', 'abs-skew', 'x4', 't-zero'],
  chapters: [
    { id: 'graph', range: [8, 12] },
    { id: 'chord', range: [10, 15] },
    { id: 'point', range: [12, 16] },
    { id: 'inequality', range: [10, 15] },
  ],
  bad: [
    { f: 'x2', x1: 1, x2: 1, t: 0.5 },
    { f: 'x2', x1: 4, x2: 1, t: 0.5 },
    { f: 'x2', x1: -4, x2: 1, t: 0.5 },
    { f: 'x2', x1: 0, x2: 1, t: 1.1 },
    { f: 'x2', x1: 0, x2: 1, t: -0.1 },
    { f: 'x2', x1: 0, x2: 1, t: 0.55 },
    { f: 'exp', x1: 0, x2: 1, t: 0.5 },
    { f: 'x2', x1: 0.5, x2: 1, t: 0.5 },
    { f: 'x2', x1: 0, x2: 1 },
    { x1: 0, x2: 1, t: 0.5 },
    { f: 'x2', x1: 0, x2: 1, t: 0.5, extra: 1 },
    null,
  ],
  edges: [
    { f: 'x4', x1: -3, x2: 3, t: 0 },
    { f: 'x4', x1: -3, x2: 3, t: 1 },
    { f: 'x4', x1: -3, x2: 3, t: 0.5 },
    { f: 'abs', x1: 1, x2: 3, t: 0.5 }, // same side of 0: |x| is linear there, equality
    { f: 'x2', x1: 3, x2: -3, t: 0.9 },
  ],
  display: (i) => {
    const e = exact(i);
    return { lhs: r4(e.lhs), rhs: r4(e.rhs) };
  },
  sweep,
});

describe('convex-chord: specifics', () => {
  it('the presets show the heights worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { lhs: 0, rhs: 4 }, // x² at the midpoint 0 of -2 and 2: 0 against (4 + 4)/2
      { lhs: 0.2, rhs: 1.6 }, // |x| at -0.2: 0.2 against 0.3·3 + 0.7·1
      { lhs: 0.0625, rhs: 8.5 }, // x⁴ at 0.5: 0.0625 against (1 + 16)/2
      { lhs: 9, rhs: 9 }, // t = 0: both heights are f(3)
    ]);
  });

  it('the exact gap of x² is t(1 − t)(x1 − x2)²', () => {
    for (const i of sweep.filter((x) => x.f === 'x2')) {
      const gap = expectedDisplay(i).rhs - expectedDisplay(i).lhs;
      expect(gap).toBeCloseTo(i.t * (1 - i.t) * (i.x1 - i.x2) ** 2, 3);
    }
  });

  it('never below the graph: rhs ≥ lhs for every convex function, with equality exactly at t = 0, 1 (x², x⁴) or on one side of 0 (|x|)', () => {
    for (const i of sweep) {
      const e = exact(i);
      expect(e.rhs).toBeGreaterThanOrEqual(e.lhs - 1e-12);
      if (i.f !== 'abs' && i.t > 0 && i.t < 1) expect(e.rhs - e.lhs).toBeGreaterThan(0);
      if (i.f === 'abs' && i.x1 * i.x2 >= 0) expect(Math.abs(e.rhs - e.lhs)).toBeLessThan(1e-12);
    }
  });

  it('Jensen is false for a concave function: the same oracle with −x² reverses the inequality', () => {
    for (const i of sweep.filter((x) => x.f === 'x2' && x.t > 0 && x.t < 1)) {
      const e = exact(i);
      expect(-e.rhs).toBeLessThan(-e.lhs);
    }
  });

  it('check names the equal-points case', () => {
    expect(entry.check!({ f: 'x2', x1: 2, x2: 2, t: 0.5 })).toEqual(['x1-equals-x2']);
  });
});
