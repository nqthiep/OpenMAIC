import { describe, expect, it } from 'vitest';
import { tilingColoringEntry as entry } from '@/lib/subjects/math/catalog/tiling-coloring';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { n: 4 | 6 | 8; removed: 'opposite-corners' | 'adjacent' };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const ALL: In[] = ([4, 6, 8] as const).flatMap((n) =>
  (['opposite-corners', 'adjacent'] as const).map((removed) => ({ n, removed })),
);
const vars = (f: Frame<FigState>) => f.meta.vars as Record<string, number>;
const box = (xy: [number, number][]) => ({
  x0: Math.min(...xy.map((p) => p[0])),
  x1: Math.max(...xy.map((p) => p[0])),
  y0: Math.min(...xy.map((p) => p[1])),
  y1: Math.max(...xy.map((p) => p[1])),
});
/** the cells (row, column) under a domino rectangle, from its drawn coordinates; the board has n rows, row 0 on top */
const cellsOf = (xy: [number, number][], n: number): [number, number][] => {
  const b = box(xy);
  const out: [number, number][] = [];
  for (let c = Math.floor(b.x0 + 0.5); c < b.x1 - 0.5; c++)
    for (let y = Math.floor(b.y0 + 0.5); y < b.y1 - 0.5; y++) out.push([n - 1 - y, c]);
  return out;
};

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-pigeonhole-invariants'],
  maxFrames: 6,
  presets: ['n8-opposite', 'n4-opposite', 'n6-adjacent', 'n8-adjacent'],
  beats: ['start', 'color', 'count', 'conclude', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['n', 'black', 'white', 'total', 'd'],
  pointers: [],
  allow: [],
  extra: ALL,
  bad: [
    { n: 5, removed: 'adjacent' },
    { n: 10, removed: 'adjacent' },
    { n: 4, removed: 'diagonal' },
    { n: 4 },
    { n: 4, removed: 'adjacent', z: 1 },
    null,
  ],
  predict: {
    color: { options: 2, expected: () => 1 },
    count: { options: 3, expected: () => 0 },
  },
});

describe('tiling-coloring: the figure is the mathematics', () => {
  it('the counts are the real black and white cells left (independent loop over the board)', () => {
    for (const i of ALL) {
      const gone =
        i.removed === 'adjacent'
          ? [
              [0, 0],
              [0, 1],
            ]
          : [
              [0, 0],
              [i.n - 1, i.n - 1],
            ];
      let b = 0;
      let w = 0;
      for (let r = 0; r < i.n; r++)
        for (let c = 0; c < i.n; c++) {
          if (gone.some(([p, q]) => p === r && q === c)) continue;
          if ((r + c) % 2 === 0) b++;
          else w++;
        }
      const f = gen(i).find((fr) => beatOf(fr).includes('count'))!;
      expect([vars(f).black, vars(f).white, vars(f).total, vars(f).d]).toEqual([
        b,
        w,
        i.n * i.n - 2,
        (i.n * i.n - 2) / 2,
      ]);
      // two opposite corners are the same colour: the counts differ by 2; two adjacent cells differ in colour: equal
      expect(b - w).toBe(i.removed === 'opposite-corners' ? -2 : 0);
    }
  });

  it('the board is n × n unit cells, the removed ones are orange, and black cells are exactly those with row + column even', () => {
    for (const i of ALL) {
      const f = gen(i).find((fr) => beatOf(fr).includes('count'))!;
      const cells = f.state.polygons.filter((p) => /^c\d+_\d+$/.test(p.id));
      expect(cells).toHaveLength(i.n * i.n);
      let orange = 0;
      for (const p of cells) {
        const [r, c] = p.id.slice(1).split('_').map(Number);
        const mark = f.meta.highlights?.[p.id];
        if (mark === 'compare') orange++;
        else expect(mark === 'group-1', `${i.n} ${p.id}`).toBe((r + c) % 2 === 0);
        const b = box(p.xy!);
        expect([b.x1 - b.x0, b.y1 - b.y0]).toEqual([1, 1]);
        expect([b.x0, b.y0]).toEqual([c, i.n - 1 - r]);
      }
      expect(orange).toBe(2);
    }
  });

  it('adjacent: the dominoes cover every cell that is left exactly once, each on two touching cells of different colours', () => {
    for (const i of ALL.filter((x) => x.removed === 'adjacent')) {
      const f = gen(i).find((fr) => beatOf(fr).includes('conclude'))!;
      const dominoes = f.state.polygons.filter((p) => /^d\d+$/.test(p.id));
      expect(dominoes).toHaveLength((i.n * i.n - 2) / 2);
      const covered = new Set<string>();
      for (const d of dominoes) {
        const cells = cellsOf(d.xy!, i.n);
        expect(cells, d.id).toHaveLength(2);
        const [a, b] = cells;
        expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])).toBe(1);
        expect((a[0] + a[1]) % 2).not.toBe((b[0] + b[1]) % 2);
        for (const c of cells) covered.add(c.join());
      }
      expect(covered.size).toBe(i.n * i.n - 2);
      expect(covered.has('0,0')).toBe(false);
      expect(covered.has('0,1')).toBe(false);
    }
  });

  it('opposite corners: no dominoes are drawn and the text says the counts differ', () => {
    for (const i of ALL.filter((x) => x.removed === 'opposite-corners')) {
      const frames = gen(i);
      for (const f of frames.slice(3))
        expect(f.state.polygons.some((p) => /^d\d+$/.test(p.id))).toBe(false);
      expect(frames[3].meta.explanation).toMatch(/≠/);
    }
  });

  it('every named object exists in its frame; counts within the polygon limit', () => {
    for (const i of ALL) {
      const frames = gen(i);
      expect(frames).toHaveLength(5);
      for (const f of frames) {
        expect(f.state.polygons.length).toBeLessThanOrEqual(140);
        const ids = new Set(f.state.polygons.map((p) => p.id));
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
      }
    }
  });
});
