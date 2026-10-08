import { describe, expect, it } from 'vitest';
import { algIdentityAreaEntry as entry } from '@/lib/subjects/math/catalog/alg-identity-area';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';
import { boxesOverlap, polygonArea, polygonBox } from './_figure-test';

type In = { id: 'square-sum' | 'diff-squares'; a: number; b: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const beat = (frames: readonly Frame<FigState>[], id: string) =>
  frames.find((f) => beatOf(f).includes(id))!;

const SUMS: In[] = [];
const DIFFS: In[] = [];
for (let a = 1; a <= 9; a++)
  for (let b = 1; b <= 9; b++) {
    SUMS.push({ id: 'square-sum', a, b });
    if (a > b) DIFFS.push({ id: 'diff-squares', a, b });
  }

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m1-alg-identities'],
  maxFrames: 6,
  presets: ['sum-3-2', 'sum-1-1', 'diff-5-2', 'diff-9-1'],
  beats: ['start', 'decompose', 'rearrange', 'formula', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['a', 'b', 's', 'a2', 'b2', 'ab', 'ab2', 't', 'd', 'sa', 'db', 'p'],
  pointers: [],
  extra: [
    { id: 'square-sum', a: 9, b: 9 },
    { id: 'diff-squares', a: 2, b: 1 },
  ],
  bad: [
    { id: 'diff-squares', a: 2, b: 2 },
    { id: 'diff-squares', a: 1, b: 5 },
    { id: 'cube', a: 2, b: 1 },
    { id: 'square-sum', a: 0, b: 1 },
    { id: 'square-sum', a: 10, b: 1 },
    { id: 'square-sum' },
    null,
  ],
  predict: { decompose: { options: 3, expected: () => 1 } },
  allow: [2],
});

describe('alg-identity-area: the areas are the identity', () => {
  it('square of a sum: the four parts have areas a², ab, ab, b² and tile the square of side a + b', () => {
    for (const i of SUMS) {
      const frames = gen(i);
      const cut = beat(frames, 'decompose');
      const areas = ['qa', 'r1', 'r2', 'qb'].map((id) => polygonArea(cut, id)!);
      expect(areas).toEqual([i.a * i.a, i.a * i.b, i.a * i.b, i.b * i.b]);
      expect(areas.reduce((x, y) => x + y, 0)).toBe((i.a + i.b) ** 2);
      expect(polygonArea(frames[0], 'whole')).toBe((i.a + i.b) ** 2);
      // the parts do not overlap, in place and pulled apart
      for (const f of [cut, beat(frames, 'rearrange'), beat(frames, 'formula')]) {
        const boxes = ['qa', 'r1', 'r2', 'qb'].map((id) => polygonBox(f, id));
        for (let x = 0; x < 4; x++)
          for (let y = x + 1; y < 4; y++)
            expect(boxesOverlap(boxes[x], boxes[y]), JSON.stringify(i)).toBe(false);
      }
      expect(cut.meta.vars).toMatchObject({ a2: i.a * i.a, ab: i.a * i.b, b2: i.b * i.b });
    }
  });

  it('the numbers of the formula frame add up: (a+b)^2 = a^2 + 2ab + b^2', () => {
    for (const i of SUMS) {
      const v = beat(gen(i), 'formula').meta.vars as Record<string, number>;
      expect(v.t).toBe(v.a2 + v.ab2 + v.b2);
      expect(v.t).toBe((i.a + i.b) ** 2);
    }
  });

  it('difference of squares: the L has area a² − b², and the two rectangles refit into (a+b) by (a−b)', () => {
    for (const i of DIFFS) {
      const frames = gen(i);
      const d = i.a * i.a - i.b * i.b;
      const cut = beat(frames, 'decompose');
      expect(polygonArea(cut, 'r1')! + polygonArea(cut, 'r2')!).toBe(d);
      const moved = beat(frames, 'rearrange');
      expect(polygonArea(moved, 'r2')).toBe(polygonArea(cut, 'r2')); // moving does not change the area
      const fin = beat(frames, 'formula');
      const [x0, y0, x1, y1] = [
        Math.min(...['r1', 'r2'].map((id) => polygonBox(fin, id)[0])),
        0,
        Math.max(...['r1', 'r2'].map((id) => polygonBox(fin, id)[2])),
        Math.max(...['r1', 'r2'].map((id) => polygonBox(fin, id)[3])),
      ];
      expect([x1 - x0, y1 - y0]).toEqual([i.a + i.b, i.a - i.b]);
      expect(polygonArea(fin, 'r1')! + polygonArea(fin, 'r2')!).toBe((i.a + i.b) * (i.a - i.b));
      expect(boxesOverlap(polygonBox(fin, 'r1'), polygonBox(fin, 'r2'))).toBe(false);
      expect(fin.meta.vars).toMatchObject({ d, p: d, sa: i.a + i.b, db: i.a - i.b });
    }
  });
});
