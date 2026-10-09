import { describe, expect, it } from 'vitest';
import { mvtLagrangeEntry as entry, rootsIn } from '@/lib/subjects/math/catalog/mvt-lagrange';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { c: number[]; a: number; b: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const f = (c: number[], x: number) => c.reduceRight((acc, k) => acc * x + k, 0);
const fp = (c: number[], x: number) =>
  c.slice(1).reduceRight((acc, k, i) => acc * x + (i + 1) * k, 0);
const num = (t: string) => {
  const [p, q] = t.replace('−', '-').split('/');
  return Number(p) / Number(q ?? 1);
};
const vars = (fr: Frame<FigState>) => fr.meta.vars as Record<string, number | string>;

function family(): In[] {
  const out: In[] = [];
  let x = 6174;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 400) {
    const len = 3 + next(2);
    const c = Array.from({ length: len }, () => next(7) - 3);
    const a = next(5) - 3;
    const b = next(5) - 1;
    if (c[len - 1] !== 0 && a < b) out.push({ c, a, b });
  }
  return out;
}
const FAMILY = family();

/** independent: the points c in (a, b) with f′(c) = m, by a fine scan for sign changes of f′ − m; a double root is told by its exact discriminant */
function pointsC(i: In): number {
  const { c, a, b } = i;
  const m = (f(c, b) - f(c, a)) / (b - a);
  const c3 = c[3] ?? 0;
  if (c3 === 0) return 1; // a quadratic: f′ is linear and takes the value m once, at the midpoint
  // h(x) = (b − a)(f′(x) − m) = A x² + B x + C with integer coefficients
  const D = b - a;
  const A = 3 * c3 * D;
  const B = 2 * c[2] * D;
  const C = c[1] * D - (f(c, b) - f(c, a));
  const disc = B * B - 4 * A * C;
  if (disc === 0) {
    const v = -B / (2 * A); // the single (double) root
    return v > a && v < b ? 1 : 0;
  }
  let changes = 0;
  const N = 40000;
  let prev = 0;
  for (let k = 1; k < N; k++) {
    const x = a + (D * k) / N;
    const s = Math.sign(fp(c, x) - m);
    if (s !== 0 && prev !== 0 && s !== prev) changes++;
    if (s !== 0) prev = s;
  }
  return changes;
}

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m4-limits-mvt'],
  maxFrames: 10,
  presets: ['square', 'cubic-two', 'cubic-one', 'quad-skew'],
  beats: ['start', 'chord', 'slide', 'rolle', 'mvt', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['a', 'b', 'fa', 'fb', 'd', 'nn', 'slope', 'x', 's', 'nc', 'mid'],
  pointers: [],
  allow: [],
  extra: FAMILY.slice(0, 40),
  bad: [
    { c: [1, 2, 0], a: 0, b: 1 },
    { c: [1, 2], a: 0, b: 1 },
    { c: [1, 2, 3, 1, 1], a: 0, b: 1 },
    { c: [1, 2, 4], a: 0, b: 1 },
    { c: [1, 2, 3], a: 1, b: 1 },
    { c: [1, 2, 3], a: 2, b: 1 },
    { c: [1, 2, 3], a: -4, b: 1 },
    { c: [1, 2, 3], a: 0, b: 4 },
    { c: [1, 2, 3], a: 0 },
    { c: [1, 2, 3], a: 0, b: 1, z: 1 },
    null,
  ],
  predict: { slide: { options: 2, expected: () => 0 }, rolle: { options: 2, expected: () => 0 } },
});

describe('mvt-lagrange: the figure is the mathematics', () => {
  it('the chord slope in the text is (f(b) − f(a))/(b − a) and the points c are counted exactly (independent scan)', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      const chord = frames.find((fr) => beatOf(fr).includes('chord'))!;
      expect(num(vars(chord).slope as string), JSON.stringify(i)).toBeCloseTo(
        (f(i.c, i.b) - f(i.c, i.a)) / (i.b - i.a),
        12,
      );
      const mvt = frames.find((fr) => beatOf(fr).includes('mvt'))!;
      const expected = pointsC(i);
      expect(expected, JSON.stringify(i)).toBeGreaterThanOrEqual(1); // the theorem
      expect(i.c.length === 3 ? 1 : (vars(mvt).nc as number), JSON.stringify(i)).toBe(expected);
    }
  });

  it('every drawn parallel tangent has slope m and touches the graph at a point c inside (a, b)', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const m = (f(i.c, i.b) - f(i.c, i.a)) / (i.b - i.a);
      const fr = gen(i).find((x) => beatOf(x).includes('mvt'))!;
      const points = fr.state.points.filter((p) => /^C\d$/.test(p.id));
      expect(points.length, JSON.stringify(i)).toBe(pointsC(i));
      for (const p of points) {
        expect(p.x).toBeGreaterThan(i.a);
        expect(p.x).toBeLessThan(i.b);
        expect(Math.abs(p.y - f(i.c, p.x)), JSON.stringify(i)).toBeLessThan(
          6e-4 * (2 + Math.abs(fp(i.c, p.x))),
        ); // the data are rounded to 3 decimals
        expect(Math.abs(fp(i.c, p.x) - m), `${JSON.stringify(i)} c=${p.x}`).toBeLessThan(0.02);
      }
      for (const l of fr.state.lines) {
        const [p, q] = l.through.map((id) => fr.state.points.find((z) => z.id === id)!);
        expect((q.y - p.y) / (q.x - p.x)).toBeCloseTo(m, 2);
      }
    }
  });

  it('the three slide frames name the right comparison (exact integers) and the slope shown is f′ at the point', () => {
    for (const i of FAMILY) {
      const m = (f(i.c, i.b) - f(i.c, i.a)) / (i.b - i.a);
      const slide = gen(i).filter((fr) => /^Tại x = /.test(fr.meta.explanation));
      expect(slide).toHaveLength(3);
      slide.forEach((fr, j) => {
        const x = i.a + ((i.b - i.a) * (j + 1)) / 4;
        expect(num(vars(fr).x as string)).toBeCloseTo(x, 12);
        expect(num(vars(fr).s as string), JSON.stringify(i)).toBeCloseTo(fp(i.c, x), 12);
        const diff = fp(i.c, x) - m;
        if (Math.abs(diff) < 1e-12) expect(fr.meta.explanation).toMatch(/song song với dây cung/);
        else if (diff > 0) expect(fr.meta.explanation).toMatch(/dốc hơn dây cung/);
        else expect(fr.meta.explanation).toMatch(/thoải hơn dây cung/);
      });
    }
  });

  it('g = f − chord is 0 at both ends and its horizontal tangents sit at the points c', () => {
    for (const i of FAMILY.slice(0, 120)) {
      const fr = gen(i).find((x) => beatOf(x).includes('rolle'))!;
      const ends = fr.state.points.filter((p) => p.id === 'A0' || p.id === 'B0');
      expect(ends.map((p) => [p.x, p.y])).toEqual([
        [i.a, 0],
        [i.b, 0],
      ]);
      for (const l of fr.state.lines) {
        const [p, q] = l.through.map((id) => fr.state.points.find((z) => z.id === id)!);
        expect(q.y).toBe(p.y); // horizontal
      }
      for (const poly of fr.state.polylines) {
        const first = poly.xy[0];
        expect(Math.abs(first[1])).toBeLessThan(2e-3); // g(a) = 0
      }
    }
  });

  it('rootsIn: exact classification against the ends (a root on an end is not inside), a double root counts once', () => {
    expect(rootsIn(1, 0, -1, -1, 1)).toEqual([]); // x² − 1: roots ±1 are the ends
    expect(rootsIn(1, 0, -1, -2, 2)).toEqual([-1, 1]);
    expect(rootsIn(1, -2, 1, 0, 3)).toEqual([1]); // (x − 1)²: one point
    expect(rootsIn(0, 2, -2, 0, 3)).toEqual([1]); // 2x − 2
    expect(rootsIn(0, 2, 0, 0, 3)).toEqual([]); // the root 0 is the end
    expect(rootsIn(1, 0, 1, -3, 3)).toEqual([]); // no real root
  });

  it('every named object exists in its frame, the bounds hold every point, and the counts stay within maxFrames', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      expect(frames).toHaveLength(8);
      for (const fr of frames) {
        const ids = new Set([
          ...fr.state.points.map((p) => p.id),
          ...fr.state.segments.map((s) => s.id),
          ...fr.state.lines.map((l) => l.id),
          ...fr.state.polylines.map((p) => p.id),
        ]);
        for (const k of Object.keys(fr.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
        const b = fr.state.bounds;
        for (const p of fr.state.points.filter((q) => !q.hidden)) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin - 1e-9);
          expect(p.x).toBeLessThanOrEqual(b.xmax + 1e-9);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin - 1e-9);
          expect(p.y).toBeLessThanOrEqual(b.ymax + 1e-9);
        }
      }
    }
  });
});
