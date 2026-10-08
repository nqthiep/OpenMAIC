import { describe, expect, it } from 'vitest';
import { amgmSemicircleEntry as entry } from '@/lib/subjects/math/catalog/amgm-semicircle';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { a: number; b: number };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const at = (f: Frame<FigState>, id: string) => f.state.points.find((p) => p.id === id)!;

const FAMILY: In[] = [];
for (let a = 1; a <= 20; a += 1) for (let b = 1; b <= 20; b += 3) FAMILY.push({ a, b });

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m1-inequality-basic'],
  maxFrames: 14,
  presets: ['two-eight', 'equal', 'far', 'nine-sixteen'],
  beats: ['start', 'height', 'compare', 'equality', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['a', 'b', 's', 'ab', 'ab4', 's2', 'k', 'parts'],
  pointers: [],
  extra: [
    { a: 1, b: 1 },
    { a: 20, b: 20 },
    { a: 1, b: 20 },
    { a: 20, b: 1 },
  ],
  bad: [{ a: 0, b: 5 }, { a: 5, b: 21 }, { a: 2.5, b: 3 }, { a: 'x', b: 1 }, { a: 1 }, null, []],
  predict: {
    height: { options: 3, expected: () => 1 },
    equality: { options: 3, expected: () => 1 },
  },
  allow: [2, 4, 8, 90],
});

describe('amgm-semicircle: the figure is the mathematics', () => {
  it('the semicircle is drawn on the diameter AB: every sampled point is at the radius from O', () => {
    for (const i of FAMILY) {
      const f = gen(i)[1];
      const arc = f.state.polylines.find((p) => p.id === 'arc')!;
      const r = (i.a + i.b) / 2;
      expect(arc.xy[0]).toEqual([i.a + i.b, 0]);
      expect(arc.xy[arc.xy.length - 1]).toEqual([0, 0]);
      for (const [x, y] of arc.xy) {
        expect(Math.abs(Math.hypot(x - r, y) - r), `${JSON.stringify(i)}`).toBeLessThan(2e-3);
        expect(y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('D lies on the semicircle above C and CD squared is a·b (the altitude on the hypotenuse)', () => {
    for (const i of FAMILY) {
      const f = gen(i).find((x) => beatOf(x).includes('height'))!;
      const d = at(f, 'D');
      const r = (i.a + i.b) / 2;
      expect(d.x).toBe(at(f, 'C').x);
      expect(Math.abs(Math.hypot(d.x - r, d.y) - r)).toBeLessThan(2e-3);
      expect(Math.abs(d.y * d.y - i.a * i.b), JSON.stringify(i)).toBeLessThan(0.05);
    }
  });

  it('while C slides, CD never exceeds OP = r, and the two are equal exactly at the centre', () => {
    for (const i of FAMILY) {
      const frames = gen(i);
      const r = (i.a + i.b) / 2;
      const sliding = frames.filter(
        (f) => f.state.points.some((p) => p.id === 'P') && beatOf(f)[0] !== 'done',
      );
      expect(sliding.length).toBeGreaterThanOrEqual(8);
      for (const f of sliding) {
        const d = at(f, 'D');
        expect(d.y, JSON.stringify(i)).toBeLessThanOrEqual(r + 1e-3);
        const centre = Math.abs(at(f, 'C').x - r) < 1e-9;
        expect(Math.abs(d.y - r) < 2e-3, `${JSON.stringify(i)} ${at(f, 'C').x}`).toBe(centre);
      }
      const eq = frames.find((f) => beatOf(f).includes('equality'))!;
      expect(at(eq, 'C').x).toBe(r);
    }
  });

  it('the preset a = b starts with C already at the centre', () => {
    const f = gen({ a: 4, b: 4 })[0];
    expect(at(f, 'C').x).toBe(at(f, 'O').x);
  });

  it('the numbers in the explanations are exact: ab, 4ab and (a+b)^2', () => {
    for (const i of FAMILY.slice(0, 40)) {
      const f = gen(i).find((x) => beatOf(x).includes('compare'))!;
      expect(f.meta.vars).toEqual({ ab: i.a * i.b, ab4: 4 * i.a * i.b, s2: (i.a + i.b) ** 2 });
      expect(4 * i.a * i.b).toBeLessThanOrEqual((i.a + i.b) ** 2);
    }
  });
});
