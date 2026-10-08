import { describe, expect, it } from 'vitest';
import { powerOfPointEntry as entry } from '@/lib/subjects/math/catalog/power-of-point';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { R: number; px: number; py: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const power = (i: In) => i.px * i.px + i.py * i.py - i.R * i.R;
const pt = (f: Frame<FigState>, id: string): [number, number] | undefined => {
  const p = f.state.points.find((q) => q.id === id);
  return p ? [p.x, p.y] : undefined;
};
const num = (t: string) => {
  const [p, q] = t.replace('−', '-').split('/');
  return Number(p) / Number(q ?? 1);
};

function family(): In[] {
  const out: In[] = [];
  let x = 1618;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 300) out.push({ R: 2 + next(5), px: next(19) - 9, py: next(19) - 9 });
  // P on the circle, at the centre and on each axis point
  for (const R of [2, 3, 4, 5, 6])
    out.push({ R, px: R, py: 0 }, { R, px: 0, py: -R }, { R, px: 0, py: 0 });
  out.push({ R: 5, px: 3, py: 4 }, { R: 5, px: -4, py: 3 });
  return out;
}
const FAMILY = family();

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-circle-power'],
  maxFrames: 9,
  presets: ['outside', 'inside', 'on-circle', 'far'],
  beats: ['start', 'secant-1', 'secant-2', 'tangent', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['R', 'px', 'py', 'op2', 'r2', 'p', 'pa2', 'pb2', 'p2', 'pabs'],
  pointers: [],
  extra: FAMILY.slice(0, 40),
  bad: [
    { R: 1, px: 0, py: 0 },
    { R: 7, px: 0, py: 0 },
    { R: 3, px: 10, py: 0 },
    { R: 3, px: 0, py: -10 },
    { R: 3.5, px: 0, py: 0 },
    { R: 3, px: 0 },
    { R: 3, px: 0, py: 0, z: 1 },
    null,
  ],
  predict: {
    'secant-1': { options: 3, expected: () => 0 },
    'secant-2': { options: 2, expected: () => 0 },
  },
});

describe('power-of-point: the figure is the mathematics', () => {
  it('A and B are on the circle, P, A, B are collinear, and PA·PB = |OP² − R²| (from the drawn points, tolerance 1%)', () => {
    for (const i of FAMILY) {
      const p = power(i);
      for (const f of gen(i).filter(
        (fr) => fr.state.lines.length === 1 && fr.state.points.some((q) => q.id === 'A'),
      )) {
        const [P, A] = [pt(f, 'P')!, pt(f, 'A')!];
        expect(Math.abs(Math.hypot(...A) - i.R), JSON.stringify(i)).toBeLessThan(2e-3);
        const B = pt(f, 'B') ?? P; // on the circle P = B and the point is not drawn twice
        expect(
          Math.abs((A[0] - P[0]) * (B[1] - P[1]) - (A[1] - P[1]) * (B[0] - P[0])),
        ).toBeLessThan(0.05);
        if (p !== 0) {
          expect(Math.abs(Math.hypot(...B) - i.R), JSON.stringify(i)).toBeLessThan(2e-3);
          const prod = Math.hypot(A[0] - P[0], A[1] - P[1]) * Math.hypot(B[0] - P[0], B[1] - P[1]);
          expect(Math.abs(prod - Math.abs(p)) / Math.abs(p), JSON.stringify(i)).toBeLessThan(0.01);
          // P is between A and B exactly when it is inside the circle
          const dot = (A[0] - P[0]) * (B[0] - P[0]) + (A[1] - P[1]) * (B[1] - P[1]);
          expect(dot < 0).toBe(p < 0);
        }
      }
    }
  });

  it('the exact fractions PA² and PB² multiply to p² in every secant frame, and match the figure', () => {
    for (const i of FAMILY) {
      const p = power(i);
      for (const f of gen(i)) {
        const v = f.meta.vars as
          | { pa2?: string; pb2?: string; p2?: number; pabs?: number }
          | undefined;
        if (v?.pa2 === undefined) continue;
        expect(num(v.pa2) * num(v.pb2!), JSON.stringify(i)).toBeCloseTo(p * p, 6);
        expect(v.p2).toBe(p * p);
        expect(v.pabs).toBe(Math.abs(p));
        const [P, A] = [pt(f, 'P')!, pt(f, 'A')!];
        expect(Math.hypot(A[0] - P[0], A[1] - P[1]) ** 2).toBeCloseTo(num(v.pa2), 1);
      }
    }
  });

  it('five secants on every input: one in secant-1 and four in secant-2, all different lines', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const upTo = frames.findIndex((f) => beatOf(f).includes('tangent'));
      const sec = frames.slice(1, upTo);
      expect(sec).toHaveLength(5);
      expect(sec.every((f) => f.state.lines.length === 1)).toBe(true);
      expect(new Set(sec.map((f) => pt(f, 'A')!.join())).size).toBe(5);
    }
  });

  it('the tangent: T on the circle, OT ⊥ PT, PT² = OP² − R² (outside only); no tangent frame for P inside or on the circle', () => {
    for (const i of FAMILY) {
      const p = power(i);
      const f = gen(i).find((fr) => beatOf(fr).includes('tangent'))!;
      const T = pt(f, 'T');
      if (p > 0) {
        const P = pt(f, 'P')!;
        expect(Math.abs(Math.hypot(...T!) - i.R)).toBeLessThan(2e-3);
        expect(Math.abs(T![0] * (T![0] - P[0]) + T![1] * (T![1] - P[1]))).toBeLessThan(0.05);
        expect(Math.abs(Math.hypot(T![0] - P[0], T![1] - P[1]) ** 2 - p) / p).toBeLessThan(0.01);
        expect(f.state.angles).toHaveLength(1);
      } else {
        expect(T).toBeUndefined();
        expect(f.meta.explanation).toMatch(p === 0 ? /nằm trên đường tròn/ : /không có tiếp tuyến/);
      }
    }
  });

  it('the start text names the position of P right', () => {
    const start = (i: In) => gen(i)[0].meta.explanation;
    expect(start(PRESETS[0])).toMatch(/ở ngoài/);
    expect(start(PRESETS[1])).toMatch(/ở trong/);
    expect(start(PRESETS[2])).toMatch(/nằm trên đường tròn/);
  });

  it('every object a highlight names exists in its frame; bounds hold the circle and P; counts stay within maxFrames', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((q) => q.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.lines.map((l) => l.id),
          ...f.state.circles.map((c) => c.id),
          ...f.state.angles.map((a) => a.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
        const b = f.state.bounds;
        expect(b.xmin).toBeLessThanOrEqual(Math.min(-i.R, i.px));
        expect(b.xmax).toBeGreaterThanOrEqual(Math.max(i.R, i.px));
        expect(b.ymin).toBeLessThanOrEqual(Math.min(-i.R, i.py));
        expect(b.ymax).toBeGreaterThanOrEqual(Math.max(i.R, i.py));
      }
    }
  });
});
