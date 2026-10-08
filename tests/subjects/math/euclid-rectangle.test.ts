import { describe, expect, it } from 'vitest';
import { euclidRectangleEntry as entry } from '@/lib/subjects/math/catalog/euclid-rectangle';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';
import { boxesOverlap, polygonArea, polygonBox } from './_figure-test';

type In = { a: number; b: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));

const FAMILY: In[] = [];
for (let a = 1; a <= 60; a += 1)
  for (const b of [1, 2, 7, 13, 18, 34, 55, 59, 60]) FAMILY.push({ a, b });
FAMILY.push({ a: 55, b: 34 }, { a: 34, b: 55 }, { a: 60, b: 60 });

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m2-euclid-diophantine'],
  maxFrames: 12,
  presets: ['48-18', 'equal', 'coprime', 'one'],
  beats: ['start', 'squares', 'repeat', 'gcd', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['a', 'b', 'big', 'small', 'x', 'q', 'y', 'r', 'g', 'n'],
  pointers: [],
  extra: [
    { a: 55, b: 34 },
    { a: 60, b: 60 },
    { a: 59, b: 1 },
  ],
  bad: [{ a: 0, b: 5 }, { a: 61, b: 5 }, { a: 2.5, b: 3 }, { a: 4 }, null],
  predict: {
    squares: { options: 3, expected: () => 0 },
    repeat: { options: 3, expected: () => 1 },
  },
  allow: [2],
});

describe('euclid-rectangle: the squares are the algorithm', () => {
  it('every pair fits the frame budget, and the last square has the side gcd(a, b)', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      expect(frames.length, JSON.stringify(i)).toBeLessThanOrEqual(12);
      const g = gcd(i.a, i.b);
      const gcdFrame = frames.find((f) => beatOf(f).includes('gcd'))!;
      expect(gcdFrame.meta.vars).toMatchObject({ g });
    }
  });

  it('the squares tile the rectangle exactly: they fill it, stay inside it and never overlap', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const last = frames[frames.length - 1];
      const ids = last.state.polygons.map((p) => p.id);
      expect(ids.length).toBeGreaterThan(0);
      const area = ids.reduce((s, id) => s + polygonArea(last, id)!, 0);
      expect(area, JSON.stringify(i)).toBe(i.a * i.b);
      const boxes = ids.map((id) => polygonBox(last, id));
      const big = Math.max(i.a, i.b);
      const small = Math.min(i.a, i.b);
      for (const bx of boxes) {
        expect(bx[0]).toBeGreaterThanOrEqual(0);
        expect(bx[1]).toBeGreaterThanOrEqual(0);
        expect(bx[2]).toBeLessThanOrEqual(big);
        expect(bx[3]).toBeLessThanOrEqual(small);
        expect(Math.abs(bx[2] - bx[0] - (bx[3] - bx[1]))).toBeLessThan(1e-9); // a square
      }
      for (let x = 0; x < boxes.length; x++)
        for (let y = x + 1; y < boxes.length; y++)
          expect(boxesOverlap(boxes[x], boxes[y])).toBe(false);
    }
  });

  it('each cut frame states x = q·y + r with the real numbers, ending with r = 0', () => {
    for (const i of FAMILY) {
      const cuts = gen(i)
        .map((f) => f.meta.vars as Record<string, number>)
        .filter((v) => 'q' in v && 'y' in v);
      expect(cuts.length).toBeGreaterThan(0);
      cuts.forEach((v, t) => {
        expect(v.x, JSON.stringify(i)).toBe(v.q * v.y + v.r);
        expect(v.r).toBeLessThan(v.y);
        if (t < cuts.length - 1) expect(v.r).toBeGreaterThan(0);
      });
      expect(cuts[cuts.length - 1].r).toBe(0);
      const done = gen(i)[gen(i).length - 1].meta.vars as Record<string, number>;
      expect(done.n).toBe(cuts.reduce((s, v) => s + v.q, 0));
    }
  });
});
