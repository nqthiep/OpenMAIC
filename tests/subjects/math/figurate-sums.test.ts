import { describe, expect, it } from 'vitest';
import { figurateSumsEntry as entry } from '@/lib/subjects/math/catalog/figurate-sums';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { series: 'odd' | 'natural'; n: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);
const ALL: In[] = (['odd', 'natural'] as const).flatMap((series) =>
  Array.from({ length: 9 }, (_, i) => ({ series, n: i + 2 })),
);
/** independent: the sum added term by term */
const added = (i: In, k = i.n) => {
  let s = 0;
  for (let j = 1; j <= k; j++) s += i.series === 'odd' ? 2 * j - 1 : j;
  return s;
};
const dots = (f: Frame<FigState>) => f.state.points.map((p) => [p.x, p.y] as const);
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number>;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-induction'],
  maxFrames: 16,
  presets: ['odd-4', 'odd-2', 'natural-5', 'natural-10'],
  beats: ['start', 'grow', 'count', 'induction', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['odd', 'n', 'last', 'k', 'km', 'add', 'tot', 'n1', 'rect', 'k1', 'sk'],
  pointers: [],
  allow: [2],
  extra: ALL,
  bad: [
    { series: 'odd', n: 1 },
    { series: 'odd', n: 11 },
    { series: 'even', n: 4 },
    { series: 'odd', n: 4.5 },
    { series: 'odd' },
    { series: 'odd', n: 4, z: 1 },
    null,
  ],
  predict: {
    grow: { options: 3, expected: (i: In) => (i.series === 'odd' ? 1 : 0) },
    count: { options: 3, expected: (i: In) => (i.series === 'odd' ? 0 : 1) },
  },
});

describe('figurate-sums: the figure is the mathematics', () => {
  it('the number of dots in each frame is the sum counted term by term (independent), and every frame has distinct dots', () => {
    for (const i of ALL) {
      const frames = gen(i);
      const n = i.n;
      const counts = frames.map((f) => f.state.points.length);
      const odd = i.series === 'odd';
      const expected = [
        added(i), // start: all the rows
        ...Array.from({ length: n }, (_, j) => added(i, j + 1)), // grow: layers 1..k
        odd ? n * n : n * (n + 1), // count: the square, or the whole rectangle
        added(i, n - 1), // induction: the figure for k
        added(i), // induction: after the new layer
        added(i), // done
      ];
      expect(counts, JSON.stringify(i)).toEqual(expected);
      for (const f of frames)
        expect(new Set(dots(f).map((d) => d.join())).size).toBe(f.state.points.length);
    }
  });

  it('the odd layers are the L-shapes (larger coordinate = layer) and the square is filled with no gap', () => {
    for (const n of [2, 5, 10]) {
      const f = gen({ series: 'odd', n }).find((fr) => beatOf(fr).includes('count'))!;
      const xs = new Set(dots(f).map((d) => d.join()));
      for (let x = 1; x <= n; x++)
        for (let y = 1; y <= n; y++) expect(xs.has(`${x},${y}`)).toBe(true);
      // the active layer of grow frame k holds exactly the dots with max(x, y) = k
      for (let k = 1; k <= n; k++) {
        const g = gen({ series: 'odd', n }).filter((fr) => /^Lớp/.test(fr.meta.explanation))[k - 1];
        const active = g.state.points.filter((p) => g.meta.highlights?.[p.id] === 'active');
        expect(active).toHaveLength(2 * k - 1);
        for (const p of active) expect(Math.max(p.x, p.y)).toBe(k);
      }
    }
  });

  it('two staircases fill the rectangle n × (n + 1) exactly once each', () => {
    for (const n of [2, 5, 10]) {
      const f = gen({ series: 'natural', n }).find((fr) => beatOf(fr).includes('count'))!;
      const xs = f.state.points.map((p) => `${p.x},${p.y}`);
      const set = new Set(xs);
      expect(set.size).toBe(n * (n + 1));
      for (let r = 0; r < n; r++)
        for (let x = 0; x <= n; x++) expect(set.has(`${x},${-r}`)).toBe(true);
      const g0 = f.state.points.filter((p) => f.meta.highlights?.[p.id] === 'group-0').length;
      const g1 = f.state.points.filter((p) => f.meta.highlights?.[p.id] === 'group-1').length;
      expect([g0, g1]).toEqual([(n * (n + 1)) / 2, (n * (n + 1)) / 2]);
    }
  });

  it('the numbers in the text: the term, the total and the induction step add up (k terms then one more)', () => {
    for (const i of ALL) {
      const frames = gen(i);
      const grow = frames.filter(
        (f) => vars(f).k !== undefined && vars(f).add !== undefined && vars(f).km !== undefined,
      );
      expect(grow).toHaveLength(i.n);
      grow.forEach((f, j) => {
        expect(vars(f).tot).toBe(added(i, j + 1));
        expect(vars(f).add).toBe(added(i, j + 1) - added(i, j));
      });
      const step = frames.find((f) => beatOf(f).includes('induction'))!;
      expect(vars(step).sk).toBe(added(i, i.n - 1));
      expect(vars(step).sk + vars(step).add).toBe(added(i));
      expect(vars(frames.at(-1)!).tot).toBe(added(i));
    }
  });

  it('every dot a highlight names exists; bounds hold every dot; counts stay within maxFrames and the point limit', () => {
    for (const i of ALL) {
      const frames = gen(i);
      expect(frames.length).toBe(i.n + 5);
      for (const f of frames) {
        expect(f.state.points.length).toBeLessThanOrEqual(160);
        const ids = new Set(f.state.points.map((p) => p.id));
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k)).toBe(true);
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
    expect(PRESETS).toHaveLength(4);
  });
});
