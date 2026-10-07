import { describe, expect, it } from 'vitest';
import concurrencyDynamic, {
  MOVE_STEPS,
  centerLines,
  concurrencyDet,
  concurrencyDynamicEntry as entry,
  expectedDisplay,
} from '@/lib/subjects/math/clips/concurrency-dynamic';
import { clipContract } from './clip-contract';

type Center = 'orthocenter' | 'centroid' | 'circumcenter' | 'incenter';
type In = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  center: Center;
};
type Pt = [number, number];

const CENTERS: Center[] = ['orthocenter', 'centroid', 'circumcenter', 'incenter'];

function family(): In[] {
  const out: In[] = [];
  let x = 4242;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 300) {
    const i = {
      x1: next(19) - 9,
      y1: next(19) - 9,
      x2: next(19) - 9,
      y2: next(19) - 9,
      x3: next(19) - 9,
      y3: next(19) - 9,
      center: CENTERS[next(4)],
    };
    if ((i.x2 - i.x1) * (i.y3 - i.y1) - (i.y2 - i.y1) * (i.x3 - i.x1) !== 0) out.push(i);
  }
  return out;
}
const sweep = family();
const pts = (i: In): [Pt, Pt, Pt] => [
  [i.x1, i.y1],
  [i.x2, i.y2],
  [i.x3, i.y3],
];
const r3 = (x: number) => (Math.round(x * 1000) / 1000 === 0 ? 0 : Math.round(x * 1000) / 1000);

/** Independent: solve the defining linear conditions of each center (not the closed formulas of the module). */
function solve(a: number, b: number, c: number, d: number, e: number, f: number): Pt {
  const det = a * d - b * c;
  return [(e * d - b * f) / det, (a * f - e * c) / det];
}
function independentCenter(i: In): Pt {
  const [A, B, C] = pts(i);
  if (i.center === 'centroid') return [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
  if (i.center === 'orthocenter') {
    // (H - A)·(C - B) = 0 and (H - B)·(C - A) = 0
    const u = [C[0] - B[0], C[1] - B[1]];
    const v = [C[0] - A[0], C[1] - A[1]];
    return solve(u[0], u[1], v[0], v[1], A[0] * u[0] + A[1] * u[1], B[0] * v[0] + B[1] * v[1]);
  }
  if (i.center === 'circumcenter') {
    // |O - A|² = |O - B|² and |O - A|² = |O - C|²
    return solve(
      2 * (B[0] - A[0]),
      2 * (B[1] - A[1]),
      2 * (C[0] - A[0]),
      2 * (C[1] - A[1]),
      B[0] ** 2 + B[1] ** 2 - A[0] ** 2 - A[1] ** 2,
      C[0] ** 2 + C[1] ** 2 - A[0] ** 2 - A[1] ** 2,
    );
  }
  // incenter: by bisecting two angles numerically is heavy; use the weights and verify the equal distances below
  const a = Math.hypot(B[0] - C[0], B[1] - C[1]);
  const b = Math.hypot(C[0] - A[0], C[1] - A[1]);
  const c = Math.hypot(A[0] - B[0], A[1] - B[1]);
  return [
    (a * A[0] + b * B[0] + c * C[0]) / (a + b + c),
    (a * A[1] + b * B[1] + c * C[1]) / (a + b + c),
  ];
}

clipContract<In>({
  module: concurrencyDynamic,
  presets: ['acute-ortho', 'obtuse-ortho', 'right-ortho', 'scalene-centroid', 'acute-circum'],
  chapters: [
    { id: 'triangle', range: [8, 12] },
    { id: 'lines', range: [10, 15] },
    { id: 'meet', range: [8, 12] },
    { id: 'move', range: [12, 18] },
    { id: 'special', range: [8, 12] },
  ],
  bad: [
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 2, center: 'orthocenter' },
    { x1: 0, y1: 0, x2: 0, y2: 0, x3: 5, y3: 5, center: 'centroid' },
    { x1: 10, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'orthocenter' },
    { x1: 0, y1: -10, x2: 1, y2: 1, x3: 2, y3: 5, center: 'orthocenter' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'nine-point' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0, y1: 0, x2: 1.5, y2: 1, x3: 2, y3: 5, center: 'incenter' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'incenter', w: 1 },
    null,
    'orthocenter',
  ],
  edges: [
    { x1: -9, y1: -9, x2: 9, y2: -9, x3: 9, y3: 9, center: 'orthocenter' },
    { x1: -9, y1: -9, x2: 9, y2: -9, x3: -9, y3: 9, center: 'circumcenter' },
    { x1: 0, y1: 0, x2: 9, y2: 0, x3: 4, y3: 1, center: 'incenter' },
    { x1: 0, y1: 0, x2: 9, y2: 0, x3: -9, y3: 1, center: 'orthocenter' }, // very obtuse: the center is far outside
    { x1: -9, y1: 9, x2: 9, y2: 9, x3: 0, y3: -9, center: 'centroid' },
  ],
  display: (i) => {
    const [cx, cy] = independentCenter(i);
    return { cx: r3(cx), cy: r3(cy) };
  },
  sweep,
});

describe('concurrency-dynamic: specifics', () => {
  it('the presets show the centers worked out by hand', () => {
    const shown = (name: string) =>
      expectedDisplay(entry.presets.find((p) => p.id === name)!.input);
    expect(shown('acute-ortho')).toEqual({ cx: 2, cy: 1.6 }); // A(0,0) B(6,0) C(2,5): the altitude from C is x = 2; from A, perpendicular to BC = (-4,5), it is y = 0.8x
    expect(shown('right-ortho')).toEqual({ cx: 0, cy: 0 }); // right angle at the origin
    expect(shown('acute-circum')).toEqual({ cx: 3, cy: 1.7 }); // x = 3 on the bisector of AB; 9 + y² = 1 + (y - 5)² gives y = 1.7
    expect(shown('scalene-centroid')).toEqual({ cx: 3, cy: 2.333 });
    const obtuse = shown('obtuse-ortho');
    expect(obtuse).toEqual({ cx: -2, cy: -8 }); // the orthocenter of the obtuse preset lies far below AB
  });

  it('the three lines of each center pass through one point for 5 positions of the running vertex on every test triangle', () => {
    for (const i of sweep) {
      const [A, B, C] = pts(i);
      for (const t of MOVE_STEPS) {
        const moved: Pt = [C[0] + t * (B[0] - A[0]), C[1] + t * (B[1] - A[1])];
        expect(
          Math.abs(concurrencyDet(centerLines(i.center, A, B, moved))),
          JSON.stringify(i),
        ).toBeLessThan(1e-6);
      }
    }
  });

  it('an arbitrary triple of lines is NOT concurrent: the determinant test can fail', () => {
    const [A, B, C] = pts(entry.presets[0].input as In);
    const lines = centerLines('orthocenter', A, B, C);
    const shifted: [number, number, number] = [lines[2][0], lines[2][1], lines[2][2] + 0.5];
    expect(Math.abs(concurrencyDet([lines[0], lines[1], shifted]))).toBeGreaterThan(0.1);
  });

  it('the incenter is equally far from the three sides and lies inside; the circumcenter is equally far from the vertices', () => {
    for (const i of sweep.filter((x) => x.center === 'incenter' || x.center === 'circumcenter')) {
      const [A, B, C] = pts(i);
      const [cx, cy] = independentCenter(i);
      if (i.center === 'circumcenter') {
        const d = [A, B, C].map((p) => Math.hypot(p[0] - cx, p[1] - cy));
        expect(Math.abs(d[0] - d[1])).toBeLessThan(1e-9);
        expect(Math.abs(d[0] - d[2])).toBeLessThan(1e-9);
      } else {
        const side = (P: Pt, Q: Pt) =>
          Math.abs((Q[0] - P[0]) * (cy - P[1]) - (Q[1] - P[1]) * (cx - P[0])) /
          Math.hypot(Q[0] - P[0], Q[1] - P[1]);
        const r = [side(A, B), side(B, C), side(C, A)];
        expect(Math.abs(r[0] - r[1])).toBeLessThan(1e-9);
        expect(Math.abs(r[1] - r[2])).toBeLessThan(1e-9);
        // inside: the same sign of the three cross products
        const cr = (P: Pt, Q: Pt) => (Q[0] - P[0]) * (cy - P[1]) - (Q[1] - P[1]) * (cx - P[0]);
        const signs = [cr(A, B), cr(B, C), cr(C, A)].map(Math.sign);
        expect(new Set(signs).size).toBe(1);
      }
    }
  });

  it('the orthocenter is outside for an obtuse triangle, at the vertex for a right one, inside for an acute one', () => {
    const inside = (i: In): boolean => {
      const [A, B, C] = pts(i);
      const [hx, hy] = independentCenter(i);
      const cr = (P: Pt, Q: Pt) => (Q[0] - P[0]) * (hy - P[1]) - (Q[1] - P[1]) * (hx - P[0]);
      const s = [cr(A, B), cr(B, C), cr(C, A)];
      return s.every((v) => v > 1e-9) || s.every((v) => v < -1e-9);
    };
    expect(inside(entry.presets[0].input as In)).toBe(true);
    expect(inside(entry.presets[1].input as In)).toBe(false);
    const right = independentCenter(entry.presets[2].input as In);
    expect(Math.abs(right[0]) + Math.abs(right[1])).toBe(0);
  });
});
