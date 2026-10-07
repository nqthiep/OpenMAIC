import { describe, expect, it } from 'vitest';
import planeTransform, {
  apply,
  expectedDisplay,
  planeTransformEntry as entry,
} from '@/lib/subjects/math/clips/plane-transform';
import { clipContract } from './clip-contract';

type Mode = 'rotate90' | 'reflect-x' | 'homothety2' | 'mult-i';
type In = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; mode: Mode };
type Pt = [number, number];

const MODES: Mode[] = ['rotate90', 'reflect-x', 'homothety2', 'mult-i'];

function family(): In[] {
  const out: In[] = [];
  let x = 77;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 300) {
    const i = {
      x1: next(13) - 6,
      y1: next(13) - 6,
      x2: next(13) - 6,
      y2: next(13) - 6,
      x3: next(13) - 6,
      y3: next(13) - 6,
      mode: MODES[next(4)],
    };
    if ((i.x2 - i.x1) * (i.y3 - i.y1) - (i.y2 - i.y1) * (i.x3 - i.x1) !== 0) out.push(i);
  }
  return out;
}
const sweep = family();
const pts = (i: In): Pt[] => [
  [i.x1, i.y1],
  [i.x2, i.y2],
  [i.x3, i.y3],
];

/** independent: complex arithmetic (a + bi)(c + di) = (ac − bd) + (ad + bc)i, and the shoelace formula for the area */
const cmul = (p: Pt, q: Pt): Pt => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
const image = (mode: Mode, p: Pt): Pt =>
  mode === 'rotate90' || mode === 'mult-i'
    ? cmul(p, [0, 1])
    : mode === 'reflect-x'
      ? [p[0], -p[1]]
      : cmul(p, [2, 0]);
const shoelace = (q: Pt[]): number =>
  Math.abs(q.reduce((s, p, k) => s + (p[0] * q[(k + 1) % 3][1] - q[(k + 1) % 3][0] * p[1]), 0)) / 2;

clipContract<In>({
  module: planeTransform,
  presets: ['rotate90', 'reflect-x', 'homothety2', 'mult-i'],
  chapters: [
    { id: 'shape', range: [8, 12] },
    { id: 'transform', range: [10, 14] },
    { id: 'invariants', range: [12, 14] },
    { id: 'complex', range: [10, 14] },
  ],
  bad: [
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 2, mode: 'rotate90' },
    { x1: 0, y1: 0, x2: 0, y2: 0, x3: 1, y3: 1, mode: 'mult-i' },
    { x1: 7, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate90' },
    { x1: 0, y1: -7, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate90' },
    { x1: 0.5, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate90' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'shear' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate90', extra: 1 },
    null,
    'rotate90',
  ],
  edges: [
    { x1: -6, y1: -6, x2: 6, y2: -6, x3: 6, y3: 6, mode: 'homothety2' },
    { x1: -6, y1: 6, x2: 6, y2: 6, x3: 0, y3: -6, mode: 'reflect-x' },
    { x1: 0, y1: 0, x2: 6, y2: 0, x3: 0, y3: 6, mode: 'mult-i' },
    { x1: 0, y1: 0, x2: 1, y2: 0, x3: 0, y3: 1, mode: 'rotate90' },
    { x1: -6, y1: -6, x2: -5, y2: -6, x3: -6, y3: -5, mode: 'homothety2' },
  ],
  display: (i) => {
    const before = pts(i);
    return {
      areaBefore: shoelace(before),
      areaAfter: shoelace(before.map((p) => image(i.mode, p))),
    };
  },
  sweep,
});

describe('plane-transform: specifics', () => {
  it('the presets show the areas worked out by hand', () => {
    // the triangle (1,0), (4,1), (2,3): twice the area = (3)(3) − (1)(1) = 8, so the area is 4
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { areaBefore: 4, areaAfter: 4 },
      { areaBefore: 4, areaAfter: 4 },
      { areaBefore: 4, areaAfter: 16 }, // ratio 2 multiplies the area by 4
      { areaBefore: 4, areaAfter: 4 },
    ]);
  });

  it('multiplying by i equals the rotation by 90° on every point of the plane grid', () => {
    for (let x = -6; x <= 6; x++)
      for (let y = -6; y <= 6; y++) {
        expect(apply('mult-i', [x, y])).toEqual(apply('rotate90', [x, y]));
        expect(apply('mult-i', [x, y])).toEqual(cmul([x, y], [0, 1]).map((v) => (v === 0 ? 0 : v)));
      }
  });

  it('rotation and reflection keep all distances, the homothety doubles them (exact, integer squares)', () => {
    for (const i of sweep) {
      const [A, B] = pts(i);
      const [A2, B2] = [A, B].map((p) => image(i.mode, p));
      const d2 = (p: Pt, q: Pt) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      expect(d2(A2, B2)).toBe((i.mode === 'homothety2' ? 4 : 1) * d2(A, B));
    }
  });

  it('the reflection reverses the orientation (signed area changes sign); rotation and homothety keep it', () => {
    const signed = (q: Pt[]) =>
      q.reduce((s, p, k) => s + (p[0] * q[(k + 1) % 3][1] - q[(k + 1) % 3][0] * p[1]), 0);
    for (const i of sweep) {
      const before = signed(pts(i));
      const after = signed(pts(i).map((p) => image(i.mode, p)));
      expect(Math.sign(after)).toBe(
        i.mode === 'reflect-x' ? -Math.sign(before) : Math.sign(before),
      );
    }
  });

  it('the module agrees with the independent complex-number image on every vertex of the sweep', () => {
    for (const i of sweep)
      for (const p of pts(i))
        expect(apply(i.mode, p).map((v) => v + 0)).toEqual(image(i.mode, p).map((v) => v + 0));
  });

  it('four rotations by 90° bring every point back; two reflections too', () => {
    for (let x = -6; x <= 6; x++)
      for (let y = -6; y <= 6; y++) {
        let p: Pt = [x, y];
        for (let k = 0; k < 4; k++) p = apply('rotate90', p);
        expect(p).toEqual([x === 0 ? 0 : x, y === 0 ? 0 : y]);
        expect(apply('reflect-x', apply('reflect-x', [x, y]))).toEqual([
          x === 0 ? 0 : x,
          y === 0 ? 0 : y,
        ]);
      }
  });
});
