import { describe, expect, it } from 'vitest';
import { pythagorasDissectionEntry as entry } from '@/lib/subjects/math/catalog/pythagoras-dissection';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';
import { boxesOverlap, polygonArea, polygonBox, verticesOf } from './_figure-test';

type In = { a: number; b: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const beat = (fr: readonly Frame<FigState>[], id: string) =>
  fr.find((f) => beatOf(f).includes(id))!;
const FAMILY: In[] = [];
for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) FAMILY.push({ a, b });

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m1-triangle-geometry'],
  maxFrames: 6,
  presets: ['three-four', 'equal', 'thin', 'six-eight'],
  beats: ['start', 'big-square', 'rearrange', 'conclude', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['a', 'b', 'ab', 'half', 's', 'a2', 'b2', 'c2', 's2'],
  pointers: [],
  extra: [
    { a: 9, b: 9 },
    { a: 1, b: 1 },
    { a: 9, b: 1 },
  ],
  bad: [{ a: 0, b: 3 }, { a: 3, b: 10 }, { a: 1.5, b: 2 }, { a: 3 }, null],
  predict: {
    'big-square': { options: 3, expected: () => 0 },
    rearrange: { options: 3, expected: () => 0 },
  },
  allow: [2],
});

/** is the polygon `id` a right triangle with the legs a and b (any order)? */
function rightTriangleLegs(f: Frame<FigState>, id: string): [number, number] | null {
  const v = verticesOf(f, id)!;
  if (v.length !== 3) return null;
  for (let k = 0; k < 3; k++) {
    const [r, p, q] = [v[k], v[(k + 1) % 3], v[(k + 2) % 3]];
    const d = (p[0] - r[0]) * (q[0] - r[0]) + (p[1] - r[1]) * (q[1] - r[1]);
    if (Math.abs(d) < 1e-9)
      return [
        Math.hypot(p[0] - r[0], p[1] - r[1]),
        Math.hypot(q[0] - r[0], q[1] - r[1]),
      ].sort() as [number, number];
  }
  return null;
}

describe('pythagoras-dissection: the areas are the theorem', () => {
  it('every triangle of every arrangement is a right triangle with legs a and b', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const want = [i.a, i.b].sort();
      for (const [beatId, ids] of [
        ['big-square', ['t1.0', 't2.0', 't3.0', 't4.0']],
        ['rearrange', ['u1.0', 'u2.0', 'u3.0', 'u4.0']],
      ] as const)
        for (const id of ids) {
          const legs = rightTriangleLegs(beat(frames, beatId), id)!;
          expect(legs[0]).toBeCloseTo(want[0], 6);
          expect(legs[1]).toBeCloseTo(want[1], 6);
          expect(polygonArea(beat(frames, beatId), id)).toBeCloseTo((i.a * i.b) / 2, 6);
        }
    }
  });

  it('first arrangement: four triangles and a tilted square of area c² tile the square of side a + b', () => {
    for (const i of FAMILY) {
      const f = beat(gen(i), 'big-square');
      const tri = ['t1.0', 't2.0', 't3.0', 't4.0'].map((id) => polygonArea(f, id)!);
      const mid = polygonArea(f, 'mid.0')!;
      expect(mid).toBeCloseTo(i.a * i.a + i.b * i.b, 6);
      expect(tri.reduce((x, y) => x + y, 0) + mid).toBeCloseTo((i.a + i.b) ** 2, 6);
      const [sx0, sy0, sx1, sy1] = [0, 0, i.a + i.b, i.a + i.b];
      for (const id of ['t1.0', 't2.0', 't3.0', 't4.0', 'mid.0']) {
        const bx = polygonBox(f, id);
        expect(bx[0]).toBeGreaterThanOrEqual(sx0);
        expect(bx[1]).toBeGreaterThanOrEqual(sy0);
        expect(bx[2]).toBeLessThanOrEqual(sx1);
        expect(bx[3]).toBeLessThanOrEqual(sy1);
      }
    }
  });

  it('second arrangement: the same triangles and the squares a² and b² tile the same square', () => {
    for (const i of FAMILY) {
      const f = beat(gen(i), 'rearrange');
      const tri = ['u1.0', 'u2.0', 'u3.0', 'u4.0'].map((id) => polygonArea(f, id)!);
      expect(polygonArea(f, 'sqa.0')).toBe(i.a * i.a);
      expect(polygonArea(f, 'sqb.0')).toBe(i.b * i.b);
      expect(tri.reduce((x, y) => x + y, 0) + i.a * i.a + i.b * i.b).toBeCloseTo(
        (i.a + i.b) ** 2,
        6,
      );
      const boxes = ['u1.0', 'u2.0', 'u3.0', 'u4.0', 'sqa.0', 'sqb.0'].map((id) =>
        polygonBox(f, id),
      );
      // triangles are halves of rectangles and may share a box with their partner: only the two squares are compared
      expect(boxesOverlap(boxes[4], boxes[5])).toBe(false);
    }
  });

  it('the conclusion frame puts the two squares side by side without overlap, with c² = a² + b²', () => {
    for (const i of FAMILY.slice(0, 30)) {
      const f = beat(gen(i), 'conclude');
      const s = i.a + i.b;
      const left = polygonBox(f, 'mid.0');
      const right = polygonBox(f, `sqa.${s + 1.2}`);
      expect(right[0]).toBeGreaterThan(left[2]);
      expect(f.meta.vars).toMatchObject({
        c2: i.a * i.a + i.b * i.b,
        a2: i.a * i.a,
        b2: i.b * i.b,
        s2: s * s,
      });
    }
  });
});
