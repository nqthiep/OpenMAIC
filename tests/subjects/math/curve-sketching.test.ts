import { describe, expect, it } from 'vitest';
import {
  curveSketchingEntry as entry,
  horner,
  polyText,
} from '@/lib/subjects/math/catalog/curve-sketching';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type In = { c: number[] };
type S = {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  curves: { id: string; points: [number, number][] }[];
  marks: { id: string; x: number; y: number; label: string }[];
  vlines: { id: string; x: number; label?: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const PRESETS = entry.presets.map((p) => p.input as In);

/** every valid coefficient list: length 2..4, entries in [-3, 3], leading coefficient not 0 */
function all(): In[] {
  const out: In[] = [];
  const vals = [-3, -2, -1, 0, 1, 2, 3];
  for (const a of vals) for (const b of vals) if (b !== 0) out.push({ c: [a, b] });
  for (const a of vals)
    for (const b of vals) for (const c of vals) if (c !== 0) out.push({ c: [a, b, c] });
  for (const a of vals)
    for (const b of vals)
      for (const c of vals) for (const d of vals) if (d !== 0) out.push({ c: [a, b, c, d] });
  return out;
}
const ALL = all();
const SAMPLE = ALL.filter((_, i) => i % 53 === 0);

/** independent expansion, no Horner and no Math.pow */
const direct = (c: number[], x: number): number =>
  c.reduce((s, k, i) => s + k * Array.from({ length: i }, () => x).reduce((p, q) => p * q, 1), 0);
const dpoly = (c: number[]): number[] => c.slice(1).map((k, i) => k * (i + 1));
const fprime = (c: number[], x: number): number => direct(dpoly(c), x);

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'functionPlotter',
  topics: ['m3-derivative-graphs'],
  maxFrames: 20,
  presets: ['cubic', 'square', 'pure-cubic', 'neg-cubic'],
  beats: ['start', 'derivative', 'roots', 'sign', 'extrema', 'inflection', 'sketch', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['deg', 'f', 'fp', 'fpp', 'nr', 'r1', 'r2', 'x0', 'sl', 'sr', 'ci', 'ne', 'ni', 'xi', 'yi'],
  pointers: [],
  allow: [1],
  extra: SAMPLE.slice(0, 30),
  bad: [
    { c: [1] },
    { c: [1, 2, 3, 1, 1] },
    { c: [1, 0] },
    { c: [1, 2, 0] },
    { c: [0, 0, 0, 0] },
    { c: [4, 1] },
    { c: [-4, 1] },
    { c: [1.5, 1] },
    { c: [1, 2], extra: 1 },
    { c: 'abc' },
    null,
  ],
  predict: {
    sign: {
      options: 2,
      // independent: evaluate f' a little to the left and right of the exact critical point (the active vertical line)
      expected: (_input, frames, i) => {
        const f = frames[i] as Frame<S>;
        const id = Object.entries(f.meta.highlights ?? {}).find(([, k]) => k === 'active')![0];
        const x0 = f.state.vlines.find((v) => v.id === id)!.x;
        const c = (_input as In).c;
        return fprime(c, x0 - 1e-3) > 0 && fprime(c, x0 + 1e-3) < 0 ? 0 : 1;
      },
    },
  },
});

describe('polynomial helpers', () => {
  it('Horner equals the direct expansion on every polynomial and many x', () => {
    for (const { c } of ALL.filter((_, i) => i % 7 === 0)) {
      for (const x of [-4, -2.5, -1, 0, 0.25, 1, 3.75])
        expect(horner(c, x)).toBeCloseTo(direct(c, x), 9);
    }
  });

  it('polyText writes highest degree first with real minus signs and no 1 coefficients', () => {
    expect(polyText([0, -3, 0, 1])).toBe('x³ − 3x');
    expect(polyText([0, 0, 3, -1])).toBe('−x³ + 3x²');
    expect(polyText([2, 1])).toBe('x + 2');
    expect(polyText([-1, -1, 2])).toBe('2x² − x − 1');
    expect(polyText([0, 0])).toBe('0');
    expect(polyText([5])).toBe('5');
  });
});

describe('curve-sketching: critical points and extrema', () => {
  it('f′ is 0 at every vertical line (tolerance 1e-9), and the lines are the real roots of f′', () => {
    for (const input of ALL) {
      const roots = gen(input).find((f) => beatOf(f).includes('roots'))!;
      for (const v of roots.state.vlines)
        expect(Math.abs(fprime(input.c, v.x)), JSON.stringify(input)).toBeLessThan(1e-9);
      // brute force count of real roots of f′ (it has degree <= 2): sign changes plus double roots on a fine grid
      const d = dpoly(input.c);
      const expected =
        d.length === 3
          ? d[1] ** 2 - 4 * d[2] * d[0] > 0
            ? 2
            : d[1] ** 2 - 4 * d[2] * d[0] === 0
              ? 1
              : 0
          : d.length === 2
            ? 1
            : 0;
      expect(roots.state.vlines).toHaveLength(expected);
    }
  });

  it('a mark is a maximum exactly where f′ goes + to −, a minimum where it goes − to +; a double root is none', () => {
    for (const input of ALL) {
      const ext = gen(input).find((f) => beatOf(f).includes('extrema'))!;
      for (const mk of ext.state.marks) {
        const left = fprime(input.c, mk.x - 1e-3);
        const right = fprime(input.c, mk.x + 1e-3);
        expect(
          mk.id.startsWith('max') ? left > 0 && right < 0 : left < 0 && right > 0,
          `${mk.id} ${JSON.stringify(input)}`,
        ).toBe(true);
        expect(mk.y).toBeCloseTo(direct(input.c, mk.x), 9);
        expect(['Cực đại', 'Cực tiểu']).toContain(mk.label);
      }
      // every sign change of f′ appears as a mark
      const roots = gen(input)
        .find((f) => beatOf(f).includes('roots'))!
        .state.vlines.map((v) => v.x);
      const changing = roots.filter(
        (r) => fprime(input.c, r - 1e-3) * fprime(input.c, r + 1e-3) < 0,
      );
      expect(ext.state.marks).toHaveLength(changing.length);
    }
  });

  it('pure cubic x³ has a critical point but no extremum; x² has one minimum; a line has none', () => {
    const ext = (c: number[]) => gen({ c }).find((f) => beatOf(f).includes('extrema'))!;
    expect(ext([0, 0, 0, 1]).state.marks).toHaveLength(0);
    expect(gen({ c: [0, 0, 0, 1] }).filter((f) => beatOf(f).includes('sign'))).toHaveLength(0);
    expect(gen({ c: [0, 0, 0, 1] }).some((f) => /nghiệm kép/.test(f.meta.explanation))).toBe(true);
    expect(ext([0, 0, 1]).state.marks.map((k) => k.id)).toEqual(['min1']);
    expect(ext([5, 2]).state.marks).toHaveLength(0);
  });

  it('x³ − 3x: maximum at x = −1 (y = 2), minimum at x = 1 (y = −2)', () => {
    const marks = gen(PRESETS[0]).find((f) => beatOf(f).includes('extrema'))!.state.marks;
    expect(marks.map((k) => [k.id, k.x, k.y])).toEqual([
      ['max1', -1, 2],
      ['min2', 1, -2],
    ]);
  });

  it('3x² − x³: minimum at 0 and maximum at 2 (the sign beat is asked twice, different answers)', () => {
    const frames = gen(PRESETS[3]);
    const marks = frames.find((f) => beatOf(f).includes('extrema'))!.state.marks;
    expect(marks.map((k) => [k.id, k.x, k.y])).toEqual([
      ['min1', 0, 0],
      ['max2', 2, 4],
    ]);
    const asked = frames.filter((f) => beatOf(f).includes('sign'));
    expect(asked.map((f) => [f.meta.vars!.sl, f.meta.vars!.sr])).toEqual([
      ['−', '+'],
      ['+', '−'],
    ]);
    const def = entry.beatDefs.find((b) => b.id === 'sign')!.ask!.predict!;
    expect(asked.map((f) => def.answer(f, undefined))).toEqual([1, 0]);
  });
});

describe('curve-sketching: inflection and the plot', () => {
  it('a cubic has one inflection point where f″ = 0 and changes sign; other degrees have none', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const infl = frames.find((f) => beatOf(f).includes('inflection'));
      if (input.c.length !== 4) {
        expect(infl, JSON.stringify(input)).toBeUndefined();
        continue;
      }
      const mk = infl!.state.marks.find((k) => k.id === 'infl')!;
      const [, , c2, c3] = input.c;
      expect(6 * c3 * mk.x + 2 * c2).toBeCloseTo(0, 9);
      expect(mk.y).toBeCloseTo(direct(input.c, mk.x), 9);
      expect(frames.at(-1)!.meta.vars!.ni).toBe(1);
    }
  });

  it('curves are sampled at 33 x values with exact Horner values; no point is -0 or not finite', () => {
    for (const input of SAMPLE) {
      for (const f of gen(input)) {
        for (const c of f.state.curves) {
          expect(c.points).toHaveLength(33);
          expect(c.points[0][0]).toBe(-4);
          expect(c.points[32][0]).toBe(4);
          for (const [x, y] of c.points) {
            expect(Number.isFinite(y)).toBe(true);
            expect(Object.is(y, -0)).toBe(false);
            if (c.id === 'f') expect(y).toBeCloseTo(direct(input.c, x), 9);
            else expect(y).toBeCloseTo(fprime(input.c, x), 9);
          }
        }
      }
    }
  });

  it('the bounds always hold the extrema and the inflection, and have positive height', () => {
    for (const input of ALL) {
      const last = gen(input).at(-1)!;
      const b = last.state.bounds;
      expect(b.ymax).toBeGreaterThan(b.ymin);
      expect(b.xmax - b.xmin).toBe(8);
      for (const k of last.state.marks) {
        // within the clamp of [-20, 20] every mark is inside the frame
        if (Math.abs(k.y) <= 19) {
          expect(k.y).toBeGreaterThanOrEqual(b.ymin);
          expect(k.y).toBeLessThanOrEqual(b.ymax);
        }
        expect(k.x).toBeGreaterThanOrEqual(b.xmin);
        expect(k.x).toBeLessThanOrEqual(b.xmax);
      }
    }
  });

  it('the derivative curve shows only in the derivative, roots and sign frames; the sketch has f and the special points', () => {
    const frames = gen(PRESETS[0]);
    const shape = frames.map((f) => f.state.curves.map((c) => c.id).join('+'));
    expect(shape).toEqual(['f', 'f+df', 'f+df', 'f+df', 'f+df', 'f', 'f', 'f', 'f']);
    const sketch = frames.find((f) => beatOf(f).includes('sketch'))!;
    expect(sketch.state.marks.map((k) => k.id)).toEqual(['max1', 'min2', 'infl']);
    expect(sketch.state.vlines).toEqual([]);
  });

  it('every object a highlight names exists in that frame', () => {
    for (const input of SAMPLE) {
      for (const f of gen(input)) {
        const ids = new Set([
          ...f.state.curves.map((c) => c.id),
          ...f.state.marks.map((k) => k.id),
          ...f.state.vlines.map((v) => v.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {}))
          expect(ids.has(k), `${k} in ${JSON.stringify(input)}`).toBe(true);
      }
    }
  });

  it('mark labels follow the locale and stay within 8 characters', () => {
    const en = gen(PRESETS[0], 'en-US').find((f) => beatOf(f).includes('extrema'))!.state.marks;
    expect(en.map((k) => k.label)).toEqual(['max', 'min']);
    for (const input of SAMPLE)
      for (const l of ['vi-VN', 'en-US']) {
        for (const f of gen(input, l))
          for (const k of f.state.marks) expect(Array.from(k.label).length).toBeLessThanOrEqual(8);
      }
  });

  it('frame counts stay within maxFrames on every polynomial', () => {
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
