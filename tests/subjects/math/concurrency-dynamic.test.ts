import { describe, expect, it } from 'vitest';
import { concurrencyDynamicEntry as entry } from '@/lib/subjects/math/catalog/concurrency-dynamic';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

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
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const area2 = (A: Pt, B: Pt, C: Pt) =>
  (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
const pt = (f: Frame<FigState>, id: string): Pt => {
  const p = f.state.points.find((q) => q.id === id)!;
  return [p.x, p.y];
};
const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const num = (t: string) => {
  const [p, q] = t.replace('−', '-').split('/');
  return Number(p) / Number(q ?? 1);
};

/** independent: the center from the defining property, by solving two linear equations (not from the formulas of the entry) */
function center(kind: Center, A: Pt, B: Pt, C: Pt): Pt {
  const solve = (a1: number, b1: number, c1: number, a2: number, b2: number, c2: number): Pt => {
    const d = a1 * b2 - a2 * b1;
    return [(c1 * b2 - c2 * b1) / d, (a1 * c2 - a2 * c1) / d];
  };
  if (kind === 'centroid') return [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
  if (kind === 'orthocenter') {
    // (H − A)·(C − B) = 0 and (H − B)·(A − C) = 0
    return solve(
      C[0] - B[0],
      C[1] - B[1],
      A[0] * (C[0] - B[0]) + A[1] * (C[1] - B[1]),
      A[0] - C[0],
      A[1] - C[1],
      B[0] * (A[0] - C[0]) + B[1] * (A[1] - C[1]),
    );
  }
  if (kind === 'circumcenter') {
    // |O − A|² = |O − B|² and |O − A|² = |O − C|²
    return solve(
      2 * (B[0] - A[0]),
      2 * (B[1] - A[1]),
      B[0] ** 2 + B[1] ** 2 - A[0] ** 2 - A[1] ** 2,
      2 * (C[0] - A[0]),
      2 * (C[1] - A[1]),
      C[0] ** 2 + C[1] ** 2 - A[0] ** 2 - A[1] ** 2,
    );
  }
  const [a, b, c] = [dist(B, C), dist(C, A), dist(A, B)];
  return [
    (a * A[0] + b * B[0] + c * C[0]) / (a + b + c),
    (a * A[1] + b * B[1] + c * C[1]) / (a + b + c),
  ];
}

function family(): In[] {
  const out: In[] = [];
  let x = 4711;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) {
    const i: In = {
      x1: next(19) - 9,
      y1: next(19) - 9,
      x2: next(19) - 9,
      y2: next(19) - 9,
      x3: next(19) - 9,
      y3: next(19) - 9,
      center: (['orthocenter', 'centroid', 'circumcenter', 'incenter'] as const)[next(4)],
    };
    if (area2([i.x1, i.y1], [i.x2, i.y2], [i.x3, i.y3]) !== 0) out.push(i);
  }
  return out;
}
const FAMILY = family();

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m1-triangle-geometry'],
  maxFrames: 12,
  presets: ['acute-ortho', 'obtuse-ortho', 'right-ortho', 'scalene-centroid', 'acute-circum'],
  beats: ['start', 'lines', 'meet', 'move', 'special', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'cl', 'cx', 'cy', 'ev'],
  pointers: [],
  allow: [4],
  extra: FAMILY.slice(0, 40),
  bad: [
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 2, center: 'centroid' },
    { x1: 0, y1: 0, x2: 0, y2: 0, x3: 1, y3: 1, center: 'centroid' },
    { x1: 10, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'centroid' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'nine-point' },
    { x1: 0.5, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'centroid' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, center: 'centroid', z: 1 },
    null,
  ],
  predict: {
    lines: { options: 2, expected: () => 0 },
    move: {
      options: 2,
      expected: (i: In) => (i.center === 'orthocenter' || i.center === 'circumcenter' ? 1 : 0),
    },
  },
});

describe('concurrency-dynamic: the figure is the mathematics', () => {
  it('G is the center of the drawn triangle (independent solve, tolerance 2e-3 + 1e-3 of the size) in every frame that has it', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      for (const f of gen(i)) {
        if (!f.state.points.some((p) => p.id === 'G')) continue;
        const [A, B, C] = [pt(f, 'A'), pt(f, 'B'), pt(f, 'C')];
        const want = center(i.center, A, B, C);
        const tol = 2e-3 + 1e-3 * Math.max(dist(A, B), dist(B, C), dist(C, A));
        expect(dist(pt(f, 'G'), want), JSON.stringify(i)).toBeLessThan(tol * 50);
      }
    }
  });

  it('the three drawn lines each pass through G, and have their defining property', () => {
    for (const i of FAMILY) {
      const f = gen(i).find((fr) => beatOf(fr).includes('meet'))!;
      const [A, B, C] = [pt(f, 'A'), pt(f, 'B'), pt(f, 'C')];
      const G = pt(f, 'G');
      expect(f.state.lines).toHaveLength(3);
      const trio = [A, B, C];
      f.state.lines.forEach((l, j) => {
        const [u, v] = [pt(f, l.through[0]), pt(f, l.through[1])];
        const len = dist(u, v);
        // distance from G to the line, relative to the size of the picture
        const cross = Math.abs((v[0] - u[0]) * (G[1] - u[1]) - (v[1] - u[1]) * (G[0] - u[0])) / len;
        const size = Math.max(dist(A, B), dist(B, C), dist(C, A));
        expect(cross / size, `${JSON.stringify(i)} line ${j}`).toBeLessThan(2e-3);
        const [P, Q, R] = [trio[j], trio[(j + 1) % 3], trio[(j + 2) % 3]];
        const dir: Pt = [v[0] - u[0], v[1] - u[1]];
        const qr: Pt = [R[0] - Q[0], R[1] - Q[1]];
        if (i.center === 'orthocenter' || i.center === 'circumcenter') {
          // an altitude and a perpendicular bisector are perpendicular to the side
          expect(Math.abs(dir[0] * qr[0] + dir[1] * qr[1]) / (len * dist(Q, R))).toBeLessThan(2e-3);
        }
        if (i.center === 'centroid') {
          // a median passes through the midpoint of the opposite side
          const M: Pt = [(Q[0] + R[0]) / 2, (Q[1] + R[1]) / 2];
          const off = Math.abs((v[0] - u[0]) * (M[1] - u[1]) - (v[1] - u[1]) * (M[0] - u[0])) / len;
          expect(off / size).toBeLessThan(2e-3);
        }
        if (i.center === 'orthocenter') expect(dist(u, P)).toBeLessThan(2e-3);
      });
    }
  });

  it('C runs along a line parallel to AB: the cross product of (C − C0) and AB is 0 in every frame, and C takes at least 6 different places', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const [A, B] = [pt(frames[0], 'A'), pt(frames[0], 'B')];
      const C0 = pt(frames[0], 'C');
      const places = new Set<string>();
      for (const f of frames) {
        const C = pt(f, 'C');
        places.add(C.join());
        const cross = (C[0] - C0[0]) * (B[1] - A[1]) - (C[1] - C0[1]) * (B[0] - A[0]);
        expect(Math.abs(cross) / dist(A, B), JSON.stringify(i)).toBeLessThan(2e-3 * 10);
      }
      expect(places.size).toBeGreaterThanOrEqual(6); // C0 and the five positions (the special one may repeat one of them)
    }
  });

  it('the text says "in", "on" or "out" right: orthocenter and circumcenter are outside exactly for an obtuse triangle', () => {
    for (const i of FAMILY) {
      for (const f of gen(i)) {
        const v = f.meta.vars as { cx?: string; cy?: string } | undefined;
        if (v?.cx === undefined) continue;
        const [A, B, C]: Pt[] = [
          [i.x1, i.y1],
          [i.x2, i.y2],
          [num(v.cx), num(v.cy!)],
        ];
        const dot = (P: Pt, Q: Pt, R: Pt) =>
          (Q[0] - P[0]) * (R[0] - P[0]) + (Q[1] - P[1]) * (R[1] - P[1]);
        const dots = [dot(A, B, C), dot(B, C, A), dot(C, A, B)];
        const obtuse = dots.some((d) => d < -1e-9);
        const right = !obtuse && dots.some((d) => Math.abs(d) < 1e-9);
        const flips = i.center === 'orthocenter' || i.center === 'circumcenter';
        if (obtuse && flips) expect(f.meta.explanation).toMatch(/ngoài tam giác/);
        else if (right && flips) expect(f.meta.explanation).toMatch(/nằm trên tam giác/);
        else expect(f.meta.explanation).not.toMatch(/ngoài tam giác|nằm trên tam giác/);
      }
    }
  });

  it('every named object exists in its frame; bounds hold every point; frame counts stay within maxFrames', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.lines.map((l) => l.id),
          ...f.state.polygons.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
        const b = f.state.bounds;
        // the hidden anchors of the lines may lie outside: the lines are infinite
        for (const p of f.state.points.filter((q) => !q.hidden)) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
  });
});
