import { describe, expect, it } from 'vitest';
import { convexChordEntry as entry } from '@/lib/subjects/math/catalog/convex-chord';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type Fn = 'x2' | 'abs' | 'x4';
type In = { f: Fn; x1: number; x2: number; tn: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const FNS: Record<Fn, (x: number) => number> = {
  x2: (x) => x * x,
  abs: (x) => Math.abs(x),
  x4: (x) => x ** 4,
};

function family(): In[] {
  const out: In[] = [];
  let x = 4242;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) {
    const i: In = {
      f: (['x2', 'abs', 'x4'] as const)[next(3)],
      x1: next(7) - 3,
      x2: next(7) - 3,
      tn: next(11),
    };
    if (i.x1 !== i.x2) out.push(i);
  }
  return out;
}
const FAMILY = family();
const pt = (fr: Frame<FigState>, id: string) => fr.state.points.find((p) => p.id === id);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-3;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-inequality-classic'],
  maxFrames: 12,
  presets: ['x2-mid', 'abs-skew', 'x4', 't-zero'],
  beats: ['start', 'chord', 'point', 'inequality', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['fname', 'x1', 'x2', 'f1', 'f2', 'tn', 'xn', 'gn', 'cn', 'd'],
  pointers: [],
  allow: [10],
  extra: FAMILY.slice(0, 30),
  bad: [
    { f: 'x2', x1: 1, x2: 1, tn: 5 },
    { f: 'x3', x1: 1, x2: 2, tn: 5 },
    { f: 'x2', x1: 4, x2: 2, tn: 5 },
    { f: 'x2', x1: 1, x2: 2, tn: 11 },
    { f: 'x2', x1: 1, x2: 2, tn: -1 },
    { f: 'x2', x1: 1, x2: 2, tn: 0.5 },
    { f: 'x2', x1: 1, x2: 2 },
    { f: 'x2', x1: 1, x2: 2, tn: 5, z: 1 },
    null,
  ],
  predict: {
    chord: { options: 2, expected: () => 0 },
    point: { options: 2, expected: () => 0 },
  },
});

describe('convex-chord: the figure is the mathematics', () => {
  it('G is on the graph and C on the chord above the mixture M, at every scrub step and at the chosen t', () => {
    for (const i of [...FAMILY, ...entry.presets.map((p) => p.input as In)]) {
      const f = FNS[i.f];
      for (const fr of gen(i)) {
        const vars = fr.meta.vars as { tn?: number; xn?: number } | undefined;
        if (vars?.tn === undefined || vars.xn === undefined) continue;
        const t = vars.tn / 10;
        const x = t * i.x1 + (1 - t) * i.x2;
        const G = pt(fr, 'G')!;
        expect(close(G.x, x), JSON.stringify(i)).toBe(true);
        expect(close(G.y, f(x)), `${JSON.stringify(i)} G.y ${G.y} vs ${f(x)}`).toBe(true);
        const C = pt(fr, 'C');
        const chord = t * f(i.x1) + (1 - t) * f(i.x2);
        if (C) {
          expect(close(C.x, x)).toBe(true);
          expect(close(C.y, chord), `${JSON.stringify(i)} C.y ${C.y} vs ${chord}`).toBe(true);
        } else expect(close(G.y, chord), JSON.stringify(i)).toBe(true);
      }
    }
  });

  it('the chord is never below the graph: gn ≤ cn in every frame (Jensen), exactly in integers', () => {
    for (const i of FAMILY) {
      for (const fr of gen(i)) {
        const v = fr.meta.vars as { gn?: number; cn?: number } | undefined;
        if (v?.gn !== undefined) expect(v.gn, JSON.stringify(i)).toBeLessThanOrEqual(v.cn!);
      }
    }
  });

  it('the text says "below" only when the graph is strictly lower, and "equality" when the points coincide', () => {
    for (const i of FAMILY) {
      const fr = gen(i).find((f) => beatOf(f).includes('inequality'))!;
      const v = fr.meta.vars as { gn: number; cn: number };
      if (v.gn < v.cn) expect(fr.meta.explanation).toMatch(/nằm dưới dây cung/);
      else expect(fr.meta.explanation).toMatch(/trùng nhau/);
    }
  });

  it('t = 0 and t = 1 are the two ends: the points coincide there', () => {
    for (const i of FAMILY.slice(0, 40)) {
      for (const tn of [0, 10]) {
        const fr = gen({ ...i, tn }).find((f) => beatOf(f).includes('inequality'))!;
        const v = fr.meta.vars as { gn: number; cn: number };
        expect(v.gn).toBe(v.cn);
        expect(pt(fr, 'C')).toBeUndefined();
      }
    }
  });

  it('|x| with both points on one side of 0 is a straight line: the chord lies on the graph for every t', () => {
    const fr = gen({ f: 'abs', x1: 1, x2: 3, tn: 4 });
    for (const f of fr) {
      const v = f.meta.vars as { gn?: number; cn?: number } | undefined;
      if (v?.gn !== undefined) expect(v.gn).toBe(v.cn);
    }
  });

  it('the scrub runs t = 0, 2, …, 10 and every object a highlight names exists in its frame', () => {
    for (const i of FAMILY.slice(0, 60)) {
      const frames = gen(i);
      const scrub = frames
        .filter((f) => f.meta.explanation.startsWith('t = '))
        .map((f) => (f.meta.vars as { tn: number }).tn);
      expect(scrub).toEqual([0, 2, 4, 6, 8, 10]);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.polylines.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
      }
    }
  });

  it('the bounds hold every point of every frame, and frame counts stay within maxFrames', () => {
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
  });
});
