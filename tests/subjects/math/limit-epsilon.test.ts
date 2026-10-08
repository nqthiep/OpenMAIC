import { describe, expect, it } from 'vitest';
import { limitEpsilonEntry as entry } from '@/lib/subjects/math/catalog/limit-epsilon';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type Seq = 'inv-n' | 'n1-over-n' | 'alt-inv-n';
type In = { seq: Seq; e: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ALL: In[] = (['inv-n', 'n1-over-n', 'alt-inv-n'] as const).flatMap((seq) =>
  Array.from({ length: 10 }, (_, i) => ({ seq, e: i + 1 })),
);
/** independent: the terms by their formulas, and N found by scanning down from a far term */
const a = (seq: Seq, n: number) =>
  seq === 'inv-n' ? 1 / n : seq === 'n1-over-n' ? (n + 1) / n : n % 2 === 0 ? 1 / n : -1 / n;
const L = (seq: Seq) => (seq === 'n1-over-n' ? 1 : 0);
function smallestN(seq: Seq, eps: number): number {
  let N = 4000;
  while (N > 1 && Math.abs(a(seq, N - 1) - L(seq)) < eps - 1e-12) N--;
  return N;
}
const num = (t: string) => {
  const [p, q] = t.split('/');
  return Number(p) / Number(q ?? 1);
};
/** the scale of the n axis: the window is xmax wide and holds K + 1 units, K the last term drawn */
const scaleOf = (f: Frame<FigState>) => {
  const K = Math.max(
    ...f.state.points.filter((q) => /^t\d+$/.test(q.id)).map((q) => Number(q.id.slice(1))),
  );
  return f.state.bounds.xmax / (K + 1);
};
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number | string>;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m3-sequences-limits'],
  maxFrames: 8,
  presets: ['inv-0.2', 'inv-0.05', 'n1-0.1', 'alt-0.25'],
  beats: ['start', 'band', 'find-n', 'shrink', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['seq', 'L', 'eps', 'out', 'bound', 'N'],
  pointers: [],
  allow: [],
  extra: ALL,
  bad: [
    { seq: 'inv-n', e: 0 },
    { seq: 'inv-n', e: 11 },
    { seq: 'n-over-n', e: 3 },
    { seq: 'inv-n', e: 2.5 },
    { seq: 'inv-n' },
    { seq: 'inv-n', e: 3, z: 1 },
    null,
  ],
  predict: {
    band: { options: 2, expected: () => 1 },
    'find-n': { options: 3, expected: () => 0 },
  },
});

describe('limit-epsilon: the figure is the mathematics', () => {
  it('N is the smallest index from which every term is inside the band (independent scan), for the band and for the two narrower ones', () => {
    for (const i of ALL) {
      const frames = gen(i);
      const band = frames.find((f) => beatOf(f).includes('find-n'))!;
      expect(vars(band).N, JSON.stringify(i)).toBe(smallestN(i.seq, i.e / 20));
      const shrinks = frames.filter((f) => /^Thu hẹp/.test(f.meta.explanation));
      expect(shrinks).toHaveLength(2);
      shrinks.forEach((f, j) => {
        expect(vars(f).N, `${JSON.stringify(i)} j=${j + 1}`).toBe(
          smallestN(i.seq, i.e / (20 * 2 ** (j + 1))),
        );
        expect(num(vars(f).eps as string)).toBeCloseTo(i.e / (20 * 2 ** (j + 1)), 12);
      });
      // narrower bands need strictly larger N
      expect(vars(shrinks[0]).N as number).toBeGreaterThan(vars(band).N as number);
      expect(vars(shrinks[1]).N as number).toBeGreaterThan(vars(shrinks[0]).N as number);
    }
  });

  it('the dots are the terms: (n, aₙ) for the right sequence, coloured by whether they are inside the band', () => {
    for (const i of ALL) {
      const f = gen(i).find((fr) => beatOf(fr).includes('band'))!;
      const eps = i.e / 20;
      const sx = scaleOf(f);
      for (const p of f.state.points.filter((q) => /^t\d+$/.test(q.id))) {
        const n = Number(p.id.slice(1));
        expect(Math.abs(p.x - n * sx)).toBeLessThan(6e-4);
        expect(Math.abs(p.y - a(i.seq, n)), `${JSON.stringify(i)} n=${n}`).toBeLessThan(6e-4); // the data are rounded to 3 decimals
        const inside = Math.abs(a(i.seq, n) - L(i.seq)) < eps - 1e-12;
        expect(f.meta.highlights?.[p.id]).toBe(inside ? 'result' : 'compare');
      }
      expect(f.state.points.filter((q) => /^t\d+$/.test(q.id))).toHaveLength(30);
      // the band polygon spans L ± ε
      const ys = f.state.polygons[0].xy!.map((q) => q[1]);
      expect(Math.abs(Math.min(...ys) - (L(i.seq) - eps))).toBeLessThan(6e-4);
      expect(Math.abs(Math.max(...ys) - (L(i.seq) + eps))).toBeLessThan(6e-4);
    }
  });

  it('the line at N sits just left of the Nth term, and every term to its right is inside the band', () => {
    for (const i of ALL) {
      for (const f of gen(i).filter((fr) => fr.state.segments.some((s) => s.id === 'lineN'))) {
        const sx = scaleOf(f);
        const x = f.state.points.find((p) => p.id === 'n0')!.x / sx; // in units of n
        const eps = (num(vars(f).eps as string) as number) || 0;
        if (f.meta.explanation.length === 0) continue;
        for (const p of f.state.points.filter(
          (q) => /^t\d+$/.test(q.id) && Number(q.id.slice(1)) > x,
        )) {
          expect(Math.abs(p.y - L(i.seq)), `${JSON.stringify(i)} n=${p.x}`).toBeLessThan(
            eps + 1e-9,
          );
        }
        for (const p of f.state.points.filter(
          (q) => /^t\d+$/.test(q.id) && Number(q.id.slice(1)) < x,
        )) {
          expect(Math.abs(p.y - L(i.seq))).toBeGreaterThanOrEqual(eps - 1e-3 - 1e-9);
        }
      }
    }
  });

  it('every named object exists in its frame, bounds hold every point, and the point count stays within the limit', () => {
    for (const i of ALL) {
      for (const f of gen(i)) {
        expect(f.state.points.length).toBeLessThanOrEqual(160);
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.polygons.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${JSON.stringify(i)} ${k}`).toBe(true);
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin - 1e-9);
          expect(p.y).toBeLessThanOrEqual(b.ymax + 1e-9);
        }
      }
    }
  });
});
