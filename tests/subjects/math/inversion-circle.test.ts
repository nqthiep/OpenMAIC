import { describe, expect, it } from 'vitest';
import { inversionCircleEntry as entry } from '@/lib/subjects/math/catalog/inversion-circle';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { r: number; d: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ALL: In[] = [2, 3, 4].flatMap((r) => [1, 2, 3, 4].map((d) => ({ r, d })));
const PRESETS = entry.presets.map((p) => p.input as In);
const pt = (f: Frame<FigState>, id: string) => f.state.points.find((p) => p.id === id)!;
const num = (t: string) => {
  const [p, q] = t.replace('−', '-').split('/');
  return Number(p) / Number(q ?? 1);
};
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number | string>;
const T = [0, 1, -1, 2, -2, 3, -3];

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m4-projective-inversion'],
  maxFrames: 14,
  presets: ['r2-d1', 'r3-d2', 'r3-d1', 'r2-d3'],
  beats: ['start', 'rule', 'line', 'circle', 'through', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['r', 'd', 'rc', 'op2', 'opp2', 'r4', 'side', 't', 'xs', 'ys'],
  pointers: [],
  allow: [2],
  extra: ALL,
  bad: [
    { r: 1, d: 1 },
    { r: 5, d: 1 },
    { r: 2, d: 0 },
    { r: 2, d: 5 },
    { r: 2.5, d: 1 },
    { r: 2 },
    { r: 2, d: 1, z: 1 },
    null,
  ],
  predict: {
    rule: {
      options: 3,
      // independent: P = (1, d) is inside the circle when 1 + d² < r²; then OP′ = r²/OP is bigger than r
      expected: (i: In) => (1 + i.d * i.d < i.r * i.r ? 0 : 1 + i.d * i.d > i.r * i.r ? 1 : 2),
    },
    circle: { options: 3, expected: () => 1 },
  },
});

describe('inversion-circle: the figure is the mathematics', () => {
  it('OP·OP′ = r² for every drawn pair, and P′ is on the ray OP (from the drawn points, tolerance 1%)', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const f = gen(i).find((fr) => beatOf(fr).includes('rule'))!;
      const [P, Q] = [pt(f, 'P'), pt(f, 'P1')];
      expect((Math.hypot(P.x, P.y) * Math.hypot(Q.x, Q.y)) / (i.r * i.r) - 1).toBeLessThan(0.01);
      expect(
        Math.abs((Math.hypot(P.x, P.y) * Math.hypot(Q.x, Q.y)) / (i.r * i.r) - 1),
      ).toBeLessThan(0.01);
      expect(Math.abs(P.x * Q.y - P.y * Q.x)).toBeLessThan(
        0.01 * Math.hypot(P.x, P.y) * Math.hypot(Q.x, Q.y),
      );
      expect(P.x * Q.x + P.y * Q.y).toBeGreaterThan(0); // the same side of O
    }
  });

  it('the text numbers are exact: OP′² = r⁴/OP² and the images (r²x, r²y)/(x² + y²)', () => {
    for (const i of ALL) {
      const frames = gen(i);
      const rule = frames.find((fr) => beatOf(fr).includes('rule'))!;
      expect(num(vars(rule).opp2 as string)).toBeCloseTo(i.r ** 4 / (1 + i.d * i.d), 12);
      const line = frames.filter((fr) => /^P = \(.*tới P′/.test(fr.meta.explanation));
      expect(line).toHaveLength(7);
      line.forEach((fr, k) => {
        const t = T[k];
        const den = t * t + i.d * i.d;
        expect(vars(fr).t).toBe(t);
        expect(num(vars(fr).xs as string)).toBeCloseTo((i.r * i.r * t) / den, 12);
        expect(num(vars(fr).ys as string)).toBeCloseTo((i.r * i.r * i.d) / den, 12);
      });
    }
  });

  it('all seven images and O lie on the circle with centre (0, r²/(2d)) and radius r²/(2d)', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const f = gen(i).find((fr) => beatOf(fr).includes('circle'))!;
      const rc = (i.r * i.r) / (2 * i.d);
      const circle = f.state.circles.find((c) => c.id === 'img')!;
      expect(Math.abs(circle.r - rc)).toBeLessThan(1e-3);
      const centre = pt(f, circle.center);
      expect([centre.x, Math.abs(centre.y - rc) < 1e-3]).toEqual([0, true]);
      const qs = f.state.points.filter((p) => /^Q\d$/.test(p.id));
      expect(qs).toHaveLength(7);
      for (const q of qs)
        expect(
          Math.abs(Math.hypot(q.x - centre.x, q.y - centre.y) - rc),
          `${JSON.stringify(i)} ${q.id}`,
        ).toBeLessThan(2e-3);
      // O is on it too: the distance from the centre to O is the radius
      expect(Math.abs(Math.hypot(centre.x, centre.y) - rc)).toBeLessThan(1e-3);
    }
  });

  it('a line through O: P and P′ lie on that line and the line is the same before and after', () => {
    for (const i of ALL) {
      const f = gen(i).find((fr) => beatOf(fr).includes('through'))!;
      const [P, Q] = [pt(f, 'P'), pt(f, 'P1')];
      expect(Math.abs(P.x * Q.y - P.y * Q.x)).toBeLessThan(
        0.01 * Math.hypot(P.x, P.y) * Math.hypot(Q.x, Q.y),
      );
      expect(
        Math.abs((Math.hypot(P.x, P.y) * Math.hypot(Q.x, Q.y)) / (i.r * i.r) - 1),
      ).toBeLessThan(0.01);
    }
  });

  it('every named object exists in its frame; the bounds hold every visible point; 12 frames', () => {
    for (const i of [...ALL, ...PRESETS]) {
      const frames = gen(i);
      expect(frames).toHaveLength(12);
      for (const fr of frames) {
        const ids = new Set([
          ...fr.state.points.map((p) => p.id),
          ...fr.state.segments.map((s) => s.id),
          ...fr.state.lines.map((l) => l.id),
          ...fr.state.circles.map((c) => c.id),
        ]);
        for (const k of Object.keys(fr.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
        const b = fr.state.bounds;
        for (const p of fr.state.points.filter((q) => !q.hidden)) {
          expect(p.x, JSON.stringify(i)).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
  });
});
