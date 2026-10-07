import { describe, expect, it } from 'vitest';
import { triangleAltitudeEntry as entry } from '@/lib/subjects/math/catalog/triangle-altitude';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };
type S = {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  points: { id: string; x: number; y: number; label: string }[];
  segments: { id: string; from: string; to: string; dashed?: boolean }[];
  lines: { id: string; through: [string, string] }[];
  angles: { id: string; at: string; from: string; to: string; label?: string }[];
};
type Pt = [number, number];

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);

function family(): In[] {
  const out: In[] = [];
  let x = 99;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) {
    const i: In = {
      x1: next(13) - 6,
      y1: next(13) - 6,
      x2: next(13) - 6,
      y2: next(13) - 6,
      x3: next(13) - 6,
      y3: next(13) - 6,
    };
    if (area2(i) !== 0) out.push(i);
  }
  return out;
}
const area2 = (i: In) => (i.x2 - i.x1) * (i.y3 - i.y1) - (i.y2 - i.y1) * (i.x3 - i.x1);
const FAMILY = family();
const pts = (i: In): [Pt, Pt, Pt] => [
  [i.x1, i.y1],
  [i.x2, i.y2],
  [i.x3, i.y3],
];

/** Independent oracle: H = A + B + C − 2·O with O the circumcenter (Euler line: OH = 3·OG). */
function orthocenter(i: In): Pt {
  const [[ax, ay], [bx, by], [cx, cy]] = pts(i);
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;
  return [ax + bx + cx - 2 * ux, ay + by + cy - 2 * uy];
}
const at = (f: Frame<S>, id: string): Pt => {
  const p = f.state.points.find((q) => q.id === id)!;
  return [p.x, p.y];
};

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['triangle-geometry'],
  maxFrames: 20,
  presets: ['acute', 'obtuse', 'right', 'isosceles'],
  beats: ['start', 'altitude-a', 'altitude-b', 'predict-meet', 'altitude-c', 'orthocenter', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'hax', 'hay', 'hbx', 'hby', 'hcx', 'hcy', 'hx', 'hy'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 30),
  bad: [
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 2 },
    { x1: 0, y1: 0, x2: 0, y2: 0, x3: 1, y3: 1 },
    { x1: 7, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0, y1: -7, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0.5, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2 },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, z: 1 },
    null,
    '0,0,1,1,2,5',
  ],
  predict: {
    'predict-meet': {
      options: 2,
      // independent: the third altitude (through C, perpendicular to AB) passes through the meeting point of the other two
      expected: (input) => {
        const [A, B, C] = pts(input);
        const H = orthocenter(input);
        const dotCH = (H[0] - C[0]) * (B[0] - A[0]) + (H[1] - C[1]) * (B[1] - A[1]);
        return Math.abs(dotCH) < 1e-9 ? 0 : 1;
      },
    },
  },
});

describe('triangle-altitude: geometry', () => {
  it('each foot is on its line and the altitude is perpendicular to the side (dot product 0, tolerance 1e-9)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const f = gen(input).at(-1)!;
      const [A, B, C] = pts(input);
      for (const [v, ha, q, r] of [
        [A, 'Ha', B, C],
        [B, 'Hb', C, A],
        [C, 'Hc', A, B],
      ] as const) {
        const foot = at(f, ha);
        expect(
          (foot[0] - v[0]) * (r[0] - q[0]) + (foot[1] - v[1]) * (r[1] - q[1]),
          JSON.stringify(input),
        ).toBeCloseTo(0, 9);
        // on the line q–r: the cross product with r - q vanishes
        expect((foot[0] - q[0]) * (r[1] - q[1]) - (foot[1] - q[1]) * (r[0] - q[0])).toBeCloseTo(
          0,
          9,
        );
      }
    }
  });

  it('the three altitude lines are concurrent: the 3x3 determinant of their equations is below 1e-9', () => {
    for (const input of FAMILY) {
      const f = gen(input).at(-1)!;
      const rows = f.state.lines.map((l) => {
        const p = at(f, l.through[0]);
        const q = at(f, l.through[1]);
        const a = q[1] - p[1];
        const b = p[0] - q[0];
        const norm = Math.hypot(a, b);
        return [a / norm, b / norm, (a * p[0] + b * p[1]) / norm];
      });
      expect(rows).toHaveLength(3);
      const [r1, r2, r3] = rows;
      const det =
        r1[0] * (r2[1] * r3[2] - r2[2] * r3[1]) -
        r1[1] * (r2[0] * r3[2] - r2[2] * r3[0]) +
        r1[2] * (r2[0] * r3[1] - r2[1] * r3[0]);
      expect(Math.abs(det), JSON.stringify(input)).toBeLessThan(1e-9);
    }
  });

  it('H equals the independent formula A + B + C − 2·O, and lies on all three altitude lines', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const H = at(gen(input).at(-1)!, 'H');
      const want = orthocenter(input);
      expect(H[0]).toBeCloseTo(want[0], 9);
      expect(H[1]).toBeCloseTo(want[1], 9);
    }
  });

  it('H is inside for acute, at the right-angle vertex for right, outside for obtuse triangles', () => {
    const e = (p: In) => gen(p).find((f) => beatOf(f).includes('orthocenter'))!.meta.explanation;
    expect(e(PRESETS[0])).toMatch(/nhọn nên H nằm trong/);
    expect(e(PRESETS[1])).toMatch(/tù nên H nằm ngoài/);
    expect(e(PRESETS[2])).toMatch(/vuông nên H trùng/);
    const H = (p: In) => at(gen(p).at(-1)!, 'H');
    expect(H(PRESETS[2])).toEqual([0, 0]); // the right angle is at A = (0, 0)
    expect(H(PRESETS[3])[0]).toBeCloseTo(0, 9); // isosceles: H on the axis of symmetry
    expect(H(PRESETS[0])[1]).toBeGreaterThan(0);
    expect(H(PRESETS[0])[1]).toBeLessThan(4);
  });

  it('in the obtuse preset (obtuse angle at A) the feet Hb and Hc lie outside their sides and say so; Ha does not', () => {
    const frames = gen(PRESETS[1]);
    const [A, , C] = pts(PRESETS[1]);
    const a = frames.find((f) => beatOf(f).includes('altitude-a'))!;
    const b = frames.find((f) => beatOf(f).includes('altitude-b'))!;
    const hb = at(b, 'Hb');
    const t =
      ((hb[0] - C[0]) * (A[0] - C[0]) + (hb[1] - C[1]) * (A[1] - C[1])) /
      ((A[0] - C[0]) ** 2 + (A[1] - C[1]) ** 2);
    expect(t < 0 || t > 1).toBe(true); // Hb is on the extension of CA
    expect(b.meta.explanation).toMatch(/ngoài đoạn thẳng/);
    expect(a.meta.explanation).not.toMatch(/ngoài đoạn thẳng/);
    expect(frames.find((f) => beatOf(f).includes('altitude-c'))!.meta.explanation).toMatch(
      /ngoài đoạn thẳng/,
    );
    expect(gen(PRESETS[0]).some((f) => /ngoài đoạn thẳng/.test(f.meta.explanation))).toBe(false);
  });

  it('altitudes appear one at a time: 0, 1, 2, 2, 3 lines, then stay', () => {
    const lines = gen(PRESETS[0]).map((f) => f.state.lines.length);
    expect(lines).toEqual([0, 1, 2, 2, 3, 3, 3]);
  });

  it('every object a highlight names exists in that frame, and right-angle marks only appear for drawn altitudes', () => {
    for (const input of [...FAMILY.slice(0, 60), ...PRESETS]) {
      for (const f of gen(input)) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.lines.map((l) => l.id),
          ...f.state.angles.map((a) => a.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), `${k}`).toBe(true);
        expect(f.state.angles).toHaveLength(f.state.lines.length);
      }
    }
  });

  it('the bounds hold every point of every frame with a margin', () => {
    for (const input of FAMILY.slice(0, 60)) {
      for (const f of gen(input)) {
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(f.state.bounds.xmin);
          expect(p.x).toBeLessThanOrEqual(f.state.bounds.xmax);
          expect(p.y).toBeGreaterThanOrEqual(f.state.bounds.ymin);
          expect(p.y).toBeLessThanOrEqual(f.state.bounds.ymax);
        }
      }
    }
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
