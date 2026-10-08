import { describe, expect, it } from 'vitest';
import { geometricSeriesAreaEntry as entry } from '@/lib/subjects/math/catalog/geometric-series-area';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';
import { polygonArea, polygonBox } from './_figure-test';

type In = { r: '1/2' | '1/3' | '1/4' };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const D = { '1/2': 2, '1/3': 3, '1/4': 4 } as const;
const INPUTS: In[] = [{ r: '1/2' }, { r: '1/3' }, { r: '1/4' }];

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m3-sequences-limits'],
  maxFrames: 8,
  presets: ['half', 'third', 'quarter'],
  beats: ['start', 'cut', 'repeat', 'sum', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['d', 'k', 'pw', 'dm1'],
  pointers: [],
  bad: [{ r: '1/5' }, { r: 0.5 }, { r: '' }, {}, null],
  predict: {
    cut: { options: 3, expected: () => 1 },
    repeat: { options: 2, expected: () => 1 },
  },
  allow: [2],
});

describe('geometric-series-area: the pieces are the series', () => {
  it('piece k has area r^k of the square: the widths shrink by the ratio each time', () => {
    for (const i of INPUTS) {
      const d = D[i.r];
      const last = gen(i).find((f) => f.state.polygons.some((p) => p.id === 'p4'))!;
      // coordinates are rounded to 3 decimals, so the width of a tiny piece is checked in absolute terms
      for (let k = 0; k < 5; k++) {
        const [x0, , x1] = polygonBox(last, `p${k}`);
        expect(Math.abs(x1 - x0 - 8 / d ** (k + 1)), `${i.r} k=${k}`).toBeLessThan(0.002);
      }
      expect(polygonArea(last, 'square')).toBe(64);
    }
  });

  it('the pieces sit side by side, the bar below is their total, and the total stays under the limit 1/(d-1)', () => {
    for (const i of INPUTS) {
      const d = D[i.r];
      for (const f of gen(i).filter((x) => x.state.polygons.some((p) => p.id === 'bar'))) {
        const shown = f.state.polygons.filter((p) => /^p\d$/.test(p.id)).length;
        const right = polygonBox(f, `p${shown - 1}`)[2];
        expect(polygonBox(f, 'bar')[2]).toBeCloseTo(right, 2);
        expect(right).toBeLessThan(8 / (d - 1) + 1e-6);
        for (let k = 1; k < shown; k++)
          expect(polygonBox(f, `p${k}`)[0]).toBeCloseTo(polygonBox(f, `p${k - 1}`)[2], 2);
      }
      const sum = gen(i).find((f) => beatOf(f).includes('sum'))!;
      expect(sum.meta.vars).toEqual({ dm1: d - 1 });
      const mark = sum.state.points.find((p) => p.id === 'll')!;
      expect(mark.label).toBe(`1/${d - 1}`);
      expect(mark.x).toBeCloseTo(8 / (d - 1), 2);
    }
  });

  it('the exponents and powers in the explanations are exact', () => {
    for (const i of INPUTS) {
      const d = D[i.r];
      const pieces = gen(i).filter((f) => f.meta.vars && 'pw' in f.meta.vars);
      expect(pieces).toHaveLength(4);
      pieces.forEach((f, idx) => expect(f.meta.vars).toEqual({ k: idx + 2, pw: d ** (idx + 2) }));
    }
  });
});
