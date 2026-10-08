import { describe, expect, it } from 'vitest';
import { inscribedAngleEntry as entry } from '@/lib/subjects/math/catalog/inscribed-angle';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { arc: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ARCS = Array.from({ length: 321 }, (_, i) => 20 + i);
const PRESETS = entry.presets.map((p) => p.input as In);
const pt = (f: Frame<FigState>, id: string): [number, number] => {
  const p = f.state.points.find((q) => q.id === id)!;
  return [p.x, p.y];
};
/** counter-clockwise angle in degrees from the ray O→U to the ray O→V, in [0, 360) (independent: atan2) */
const polar = (p: [number, number]) => ((Math.atan2(p[1], p[0]) * 180) / Math.PI + 360) % 360;
/** the angle at `v` between the rays to `a` and `b`, in degrees */
const angleAt = (v: [number, number], a: [number, number], b: [number, number]) => {
  const [ux, uy, wx, wy] = [a[0] - v[0], a[1] - v[1], b[0] - v[0], b[1] - v[1]];
  return (
    (Math.acos((ux * wx + uy * wy) / (Math.hypot(ux, uy) * Math.hypot(wx, wy))) * 180) / Math.PI
  );
};
/** the counter-clockwise sweep from degrees a to degrees b */
const sweep = (a: number, b: number) => (((b - a) % 360) + 360) % 360;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m1-circle-angles'],
  maxFrames: 9,
  presets: ['arc-100', 'arc-60', 'arc-180', 'arc-300'],
  beats: ['start', 'central', 'inscribed', 'cyclic', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['arc', 'rest', 'k', 'half', 'halfQ'],
  pointers: [],
  allow: [180, 360],
  extra: [{ arc: 21 }, { arc: 339 }, { arc: 20 }, { arc: 340 }, { arc: 101 }],
  bad: [{ arc: 19 }, { arc: 341 }, { arc: 100.5 }, { arc: '100' }, {}, { arc: 100, z: 1 }, null],
  predict: {
    central: { options: 3, expected: () => 0 },
    inscribed: { options: 2, expected: () => 0 },
  },
});

describe('inscribed-angle: the figure is the mathematics', () => {
  it('every arc 20..340: A, B, P, Q lie on the circle, and the angle at P is arc/2 (acos, tolerance 0.3°)', () => {
    for (const arc of ARCS) {
      const frames = gen({ arc });
      for (const f of frames) {
        for (const id of ['A', 'B', 'P', 'Q']) {
          const p = f.state.points.find((q) => q.id === id);
          if (p) expect(Math.hypot(p.x, p.y), `${arc} ${id}`).toBeCloseTo(3, 2);
        }
      }
      const Ps = frames.filter(
        (f) => f.state.points.some((p) => p.id === 'P') && f.state.angles.length === 1,
      );
      expect(Ps.length).toBeGreaterThanOrEqual(3);
      for (const f of Ps.slice(0, 3)) {
        expect(
          Math.abs(angleAt(pt(f, 'P'), pt(f, 'A'), pt(f, 'B')) - arc / 2),
          `${arc}`,
        ).toBeLessThan(0.3);
      }
    }
  });

  it('the arc AB runs counter-clockwise from A to B for `arc` degrees; P stays on the other arc, Q inside the arc AB', () => {
    for (const arc of ARCS) {
      const f = gen({ arc })[2];
      const [a, b, p] = [polar(pt(f, 'A')), polar(pt(f, 'B')), polar(pt(f, 'P'))];
      expect(Math.abs(sweep(a, b) - arc), `${arc}`).toBeLessThan(0.4);
      const fromB = sweep(b, p);
      expect(fromB).toBeGreaterThan(0.5);
      expect(fromB).toBeLessThan(360 - arc - 0.5);
      const q = polar(pt(gen({ arc }).at(-1)!, 'Q'));
      const fromA = sweep(a, q);
      expect(fromA).toBeGreaterThan(0.5);
      expect(fromA).toBeLessThan(arc - 0.5);
    }
  });

  it('opposite angles of APBQ add up to 180° (acos, tolerance 0.4°), and the text says so', () => {
    for (const arc of ARCS) {
      const f = gen({ arc }).at(-1)!;
      const [P, Q, A, B] = [pt(f, 'P'), pt(f, 'Q'), pt(f, 'A'), pt(f, 'B')];
      expect(Math.abs(angleAt(P, A, B) + angleAt(Q, A, B) - 180), `${arc}`).toBeLessThan(0.4);
      expect(Math.abs(angleAt(Q, A, B) - (360 - arc) / 2), `${arc}`).toBeLessThan(0.4);
    }
    expect(gen({ arc: 100 }).at(-1)!.meta.vars).toMatchObject({ half: '50', halfQ: '130' });
    expect(gen({ arc: 101 }).at(-1)!.meta.vars).toMatchObject({ half: '101/2', halfQ: '259/2' });
  });

  it('arc 180 is a diameter and the inscribed angle is a right angle', () => {
    const f = gen({ arc: 180 })[2];
    expect(angleAt(pt(f, 'P'), pt(f, 'A'), pt(f, 'B'))).toBeCloseTo(90, 1);
    expect(pt(f, 'A')[0] + pt(f, 'B')[0]).toBeCloseTo(0, 2);
    expect(pt(f, 'A')[1] + pt(f, 'B')[1]).toBeCloseTo(0, 2);
  });

  it('the three positions of P are different and the angle label never changes between them', () => {
    for (const arc of [20, 60, 100, 181, 300, 340]) {
      const Ps = gen({ arc }).filter(
        (f) => beatOf(f).includes('inscribed') || /vị trí/.test(f.meta.explanation),
      );
      const where = Ps.map((f) => pt(f, 'P').join());
      expect(new Set(where).size).toBe(3);
      expect(new Set(Ps.map((f) => f.state.angles[0].label)).size).toBe(1);
    }
  });

  it('every object a highlight names exists in its frame; counts and bounds hold', () => {
    for (const arc of ARCS) {
      const frames = gen({ arc });
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.circles.map((c) => c.id),
          ...f.state.angles.map((a) => a.id),
          ...f.state.polygons.map((p) => p.id),
          ...f.state.polylines.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${arc} ${k}`).toBe(true);
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

  it('presets and the same input in English give the same figure', () => {
    for (const p of PRESETS) {
      expect(gen(p, 'en-US').map((f) => f.state)).toEqual(gen(p, 'vi-VN').map((f) => f.state));
    }
  });
});
