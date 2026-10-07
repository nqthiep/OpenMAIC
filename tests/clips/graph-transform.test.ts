import { describe, expect, it } from 'vitest';
import graphTransform, {
  SAMPLE_X,
  expectedDisplay,
  graphTransformEntry as entry,
} from '@/lib/subjects/math/clips/graph-transform';
import { clipContract } from './clip-contract';

type Fn = 'x2' | 'abs' | 'x3';
type In = { f: Fn; a: number; h: number; k: number };

const sweep: In[] = [];
for (const f of ['x2', 'abs', 'x3'] as const)
  for (let a = -3; a <= 3; a++) {
    if (a === 0) continue;
    for (let h = -4; h <= 4; h++) for (let k = -4; k <= 4; k++) sweep.push({ f, a, h, k });
  }

const base = (f: Fn, x: number): number =>
  f === 'x2' ? x * x : f === 'abs' ? (x < 0 ? -x : x) : x * x * x;

clipContract<In>({
  module: graphTransform,
  presets: ['shift', 'stretch', 'reflect', 'identity'],
  chapters: [
    { id: 'base', range: [8, 12] },
    { id: 'shift-h', range: [10, 15] },
    { id: 'scale', range: [10, 15] },
    { id: 'shift-k', range: [8, 12] },
  ],
  bad: [
    { f: 'x2', a: 0, h: 1, k: 1 },
    { f: 'x2', a: 4, h: 1, k: 1 },
    { f: 'x2', a: -4, h: 1, k: 1 },
    { f: 'x2', a: 1, h: 5, k: 1 },
    { f: 'x2', a: 1, h: 1, k: -5 },
    { f: 'x2', a: 1.5, h: 1, k: 1 },
    { f: 'sin', a: 1, h: 1, k: 1 },
    { f: 'x2', a: 1, h: 1 },
    { a: 1, h: 1, k: 1 },
    { f: 'x2', a: 1, h: 1, k: 1, extra: 1 },
    null,
  ],
  edges: [
    { f: 'x3', a: 3, h: 4, k: 4 },
    { f: 'x3', a: -3, h: -4, k: -4 },
    { f: 'abs', a: 1, h: 0, k: 0 },
    { f: 'x2', a: -1, h: 4, k: -4 },
    { f: 'x2', a: 3, h: -4, k: 4 },
  ],
  // independent: the image of the base point (0, f(0)) written out from the definition of the transformation
  display: ({ f, a, h, k }) => ({
    x: h === 0 ? 0 : 0 + h,
    y: a * base(f, 0) + k === 0 ? 0 : a * base(f, 0) + k,
  }),
  sweep,
});

describe('graph-transform: specifics', () => {
  it('the presets show the image of the marked point from the card', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { x: 2, y: -1 },
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 0, y: 0 },
    ]);
  });

  it('every sample point lands on the transformed graph: (x0, f(x0)) → (x0 + h, a·f(x0) + k) on y = a·f(x − h) + k', () => {
    for (const i of sweep) {
      for (const x0 of SAMPLE_X) {
        const px = x0 + i.h;
        const py = i.a * base(i.f, x0) + i.k;
        expect(py).toBe(i.a * base(i.f, px - i.h) + i.k);
      }
    }
  });

  it('f(x − 2) moves RIGHT: the value f(0) now appears at x = +2 (the common mistake says left)', () => {
    const i: In = { f: 'x2', a: 1, h: 2, k: 0 };
    const g = (x: number) => i.a * base(i.f, x - i.h) + i.k;
    expect(g(2)).toBe(base('x2', 0)); // the old minimum is at x = 2
    expect(g(-2)).toBe(16); // and x = -2 is now far from it
    expect(expectedDisplay(i).x).toBe(2);
  });

  it('a negative a flips: the base point (1, f(1)) goes below the axis, a positive one keeps it above', () => {
    for (const f of ['x2', 'abs', 'x3'] as const) {
      expect(-1 * base(f, 1)).toBeLessThan(0);
      expect(1 * base(f, 1)).toBeGreaterThan(0);
    }
  });

  it('points with f = 0 do not move under a alone (the origin stays at the origin for h = k = 0)', () => {
    for (const f of ['x2', 'abs', 'x3'] as const)
      for (const a of [-3, -2, -1, 1, 2, 3])
        expect(expectedDisplay({ f, a, h: 0, k: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('the order matters: adding k before multiplying by a gives a different function', () => {
    const i: In = { f: 'x2', a: 2, h: 0, k: 1 };
    const right = (x: number) => i.a * base(i.f, x) + i.k;
    const wrongOrder = (x: number) => i.a * (base(i.f, x) + i.k);
    expect(right(3)).not.toBe(wrongOrder(3));
  });
});
