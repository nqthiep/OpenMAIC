import { describe, expect, it } from 'vitest';
import { planeTransformEntry as entry } from '@/lib/subjects/math/catalog/plane-transform';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type Mode = 'rotate90' | 'reflect-x' | 'homothety2' | 'mult-i';
type In = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; mode: Mode };
type Pt = [number, number];
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const pts = (i: In): [Pt, Pt, Pt] => [
  [i.x1, i.y1],
  [i.x2, i.y2],
  [i.x3, i.y3],
];
const area2 = ([A, B, C]: [Pt, Pt, Pt]) =>
  (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
const d2 = (p: Pt, q: Pt) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
/** independent: complex arithmetic. z = x + iy; z·i, conj(z), 2z */
const image = (mode: Mode, [x, y]: Pt): Pt => {
  if (mode === 'reflect-x') return [x, -y]; // conjugate
  if (mode === 'homothety2') return [2 * x, 2 * y];
  // (x + iy)(0 + 1i) = (x·0 − y·1) + (x·1 + y·0)i
  return [x * 0 - y * 1, x * 1 + y * 0];
};
const at = (f: Frame<FigState>, id: string): Pt | undefined => {
  const p = f.state.points.find((q) => q.id === id);
  return p ? [p.x, p.y] : undefined;
};

function family(): In[] {
  const out: In[] = [];
  let x = 90210;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 300) {
    const i: In = {
      x1: next(13) - 6,
      y1: next(13) - 6,
      x2: next(13) - 6,
      y2: next(13) - 6,
      x3: next(13) - 6,
      y3: next(13) - 6,
      mode: (['rotate90', 'reflect-x', 'homothety2', 'mult-i'] as const)[next(4)],
    };
    if (area2(pts(i)) !== 0) out.push(i);
  }
  return out;
}
const FAMILY = family();

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m3-vector-transform-complex'],
  maxFrames: 10,
  presets: ['rotate90', 'reflect-x', 'homothety2', 'mult-i'],
  beats: ['start', 'transform', 'invariants', 'complex', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: [
    'x1',
    'y1',
    'x2',
    'y2',
    'x3',
    'y3',
    'P',
    'px',
    'py',
    'qx',
    'qy',
    'rule',
    'k',
    'ab2',
    'pab2',
    'bc2',
    'pbc2',
    'ca2',
    'pca2',
    's2',
    'ps2',
    'za',
    'zi',
    'ix',
    'iy',
  ],
  pointers: [],
  allow: [2, 4, 90],
  extra: FAMILY.slice(0, 40),
  bad: [
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 2, mode: 'rotate90' },
    { x1: 0, y1: 0, x2: 0, y2: 0, x3: 1, y3: 1, mode: 'rotate90' },
    { x1: 7, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate90' },
    { x1: 0.5, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate90' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'rotate45' },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5 },
    { x1: 0, y1: 0, x2: 1, y2: 1, x3: 2, y3: 5, mode: 'mult-i', z: 1 },
    null,
  ],
  predict: {
    transform: { options: 3, expected: (i: In) => (i.mode === 'homothety2' ? 1 : 0) },
    invariants: { options: 2, expected: (i: In) => (i.mode === 'homothety2' ? 1 : 0) },
  },
});

describe('plane-transform: the figure is the mathematics', () => {
  it('the image of each vertex is the map applied to it (independent: complex arithmetic), vertex by vertex', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      const V = pts(i);
      const last = frames.find((f) => f.state.polygons.some((p) => p.id === 'img'))!;
      V.forEach((v, j) => {
        expect(at(last, ['A2', 'B2', 'C2'][j]), JSON.stringify(i)).toEqual(
          image(i.mode, v).map((c) => (c === 0 ? 0 : c)),
        );
      });
      // the transformation beat adds one image point per frame
      const counts = frames.map((f) => f.state.points.filter((p) => /2$/.test(p.id)).length);
      expect(counts.slice(0, 5)).toEqual([0, 1, 2, 3, 3]);
    }
  });

  it('squared sides and twice the signed area in the text are the real ones; ratios are 1, 1 (area sign flips for the reflection) and 4', () => {
    for (const i of FAMILY) {
      const V = pts(i);
      const W = V.map((p) => image(i.mode, p)) as [Pt, Pt, Pt];
      const len = gen(i).find((f) => beatOf(f).includes('invariants'))!;
      expect(len.meta.vars).toMatchObject({
        ab2: d2(V[0], V[1]),
        pab2: d2(W[0], W[1]),
        bc2: d2(V[1], V[2]),
        pbc2: d2(W[1], W[2]),
        ca2: d2(V[2], V[0]),
        pca2: d2(W[2], W[0]),
      });
      const k = i.mode === 'homothety2' ? 4 : 1;
      expect(d2(W[0], W[1])).toBe(k * d2(V[0], V[1]));
      const ar = gen(i).find((f) => f.meta.vars && 's2' in f.meta.vars)!;
      expect(ar.meta.vars).toMatchObject({ s2: area2(V), ps2: area2(W) });
      expect(area2(W)).toBe((i.mode === 'reflect-x' ? -1 : 1) * k * area2(V));
      expect(ar.meta.explanation).toMatch(
        i.mode === 'reflect-x' ? /đổi dấu/ : i.mode === 'homothety2' ? /nhân 4/ : /Giữ nguyên/,
      );
    }
  });

  it('the complex frame multiplies by i: (x + iy)·i = −y + ix, whatever the map is', () => {
    for (const i of FAMILY) {
      const f = gen(i).find((fr) => beatOf(fr).includes('complex'))!;
      const [x, y] = [i.x1, i.y1];
      const v = f.meta.vars as { ix: number; iy: number; za: string; zi: string };
      expect([v.ix, v.iy]).toEqual([-y === 0 ? 0 : -y, x]);
      expect(v.za).toBe(`${x} ${y < 0 ? '−' : '+'} ${Math.abs(y)}i`);
      expect(at(f, 'A2')).toEqual([v.ix, v.iy]);
    }
    // the preset "mult-i" and "rotate90" end on the same image
    const a = gen(PRESETS[0])
      .at(-1)!
      .state.points.map((p) => [p.id, p.x, p.y]);
    const b = gen(PRESETS[3])
      .at(-1)!
      .state.points.map((p) => [p.id, p.x, p.y]);
    expect(a).toEqual(b);
  });

  it('arrows are drawn only for the vertices that move, and every named object exists in its frame', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      for (const f of gen(i)) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.polygons.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
        for (const s of f.state.segments.filter((q) => q.arrow)) {
          const [a, b] = [at(f, s.from)!, at(f, s.to)!];
          expect(a[0] !== b[0] || a[1] !== b[1]).toBe(true);
        }
      }
    }
  });

  it('the bounds hold every point and polygon of every frame; counts stay within maxFrames; the English text names the map', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
    expect(gen(PRESETS[1], 'en-US')[0].meta.explanation).toMatch(/reflection in the x axis/);
    expect(gen(PRESETS[1], 'vi-VN')[0].meta.explanation).toMatch(/đối xứng qua trục hoành/);
  });
});
