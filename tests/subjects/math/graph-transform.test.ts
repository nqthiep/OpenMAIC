import { describe, expect, it } from 'vitest';
import { graphTransformEntry as entry } from '@/lib/subjects/math/catalog/graph-transform';
import type { FigState } from '@/lib/subjects/math/figure';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from '../cp/contract';

type Fn = 'x2' | 'abs' | 'x3';
type In = { f: Fn; a: number; h: number; k: number };
type V = { eq: string; h: number; a: number; k: number; qx: number; qy: number; n: number };
const gen = (input: In, locale = 'vi-VN'): readonly Frame<FigState>[] =>
  steps<In, FigState>(entry, input, { locale });
const FNS: Record<Fn, (x: number) => number> = {
  x2: (x) => x * x,
  abs: (x) => Math.abs(x),
  x3: (x) => x ** 3,
};

function family(): In[] {
  const out: In[] = [];
  let x = 31337;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return (x >>> 8) % mod;
  };
  while (out.length < 200) {
    const i: In = {
      f: (['x2', 'abs', 'x3'] as const)[next(3)],
      a: next(7) - 3,
      h: next(9) - 4,
      k: next(9) - 4,
    };
    if (i.a !== 0) out.push(i);
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const pt = (fr: Frame<FigState>, id: string) => fr.state.points.find((p) => p.id === id)!;

entryContract<In>({
  entry: entry as never,
  subject: 'math',
  noImpl: true,
  visualizer: 'geometry',
  topics: ['m1-quadratic-vieta'],
  maxFrames: 16,
  presets: ['shift', 'stretch', 'reflect', 'identity'],
  beats: ['start', 'shift-h', 'scale', 'shift-k', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['eq', 'h', 'a', 'k', 'qx', 'qy', 'n'],
  pointers: [],
  extra: FAMILY.slice(0, 30),
  bad: [
    { f: 'x2', a: 0, h: 1, k: 1 },
    { f: 'x4', a: 1, h: 1, k: 1 },
    { f: 'x2', a: 4, h: 1, k: 1 },
    { f: 'x2', a: 1, h: 5, k: 1 },
    { f: 'x2', a: 1, h: 1, k: -5 },
    { f: 'x2', a: 1.5, h: 1, k: 1 },
    { f: 'x2', a: 1, h: 1 },
    { f: 'x2', a: 1, h: 1, k: 1, z: 1 },
    null,
  ],
  predict: {
    'shift-h': { options: 2, expected: () => 1 },
    scale: { options: 2, expected: () => 1 },
  },
});

describe('graph-transform: the figure is the mathematics', () => {
  it('the drawn curve is y = a·f(x − h) + k for the values in the frame, and so are O and Q', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const f = FNS[i.f];
      for (const fr of gen(i)) {
        const v = fr.meta.vars as unknown as V;
        const drawn = fr.state.polylines.filter((p) => p.id.startsWith('g'));
        expect(drawn.length, JSON.stringify(i)).toBeGreaterThan(0);
        for (const pl of drawn) {
          for (const [x, y] of pl.xy) {
            expect(
              Math.abs(y - (v.a * f(x - v.h) + v.k)),
              `${JSON.stringify(i)} (${x}, ${y})`,
            ).toBeLessThan(2e-3);
          }
        }
        expect([pt(fr, 'O').x, pt(fr, 'O').y]).toEqual([v.h, v.k]);
        expect([pt(fr, 'Q').x, pt(fr, 'Q').y]).toEqual([1 + v.h, v.a + v.k]);
        expect([v.qx, v.qy]).toEqual([1 + v.h, v.a + v.k]);
      }
    }
  });

  it('the three parameters change one at a time, in the order h, a, k, one unit per frame, and end on the input', () => {
    for (const i of FAMILY) {
      const vs = gen(i).map((fr) => fr.meta.vars as unknown as V);
      expect(vs[0]).toMatchObject({ h: 0, a: 1, k: 0 });
      expect(vs.at(-1)).toMatchObject({ h: i.h, a: i.a, k: i.k });
      for (let j = 1; j < vs.length; j++) {
        const [p, q] = [vs[j - 1], vs[j]];
        const changed = (['h', 'a', 'k'] as const).filter((key) => p[key] !== q[key]);
        expect(changed.length, `${JSON.stringify(i)} frame ${j}`).toBeLessThanOrEqual(1);
        for (const key of changed) expect(Math.abs(p[key] - q[key])).toBe(1);
      }
    }
  });

  it('the equation in the text is the formula: "−|x − 1| + 2" for the reflect preset, "x³" for the identity', () => {
    const last = (i: In) => (gen(i).at(-1)!.meta.vars as unknown as V).eq;
    expect(last(PRESETS[2])).toBe('−|x − 1| + 2');
    expect(last(PRESETS[3])).toBe('x³');
    expect(last(PRESETS[0])).toBe('(x − 2)² − 1');
    expect(last(PRESETS[1])).toBe('2x²');
    expect(last({ f: 'x3', a: -3, h: -2, k: 4 })).toBe('−3(x + 2)³ + 4');
  });

  it('the text names the direction right: h > 0 moves right, h < 0 left; a < 0 flips; k > 0 up, k < 0 down', () => {
    const text = (i: In, beat: string) =>
      gen(i).find((f) => beatOf(f).includes(beat))!.meta.explanation;
    expect(text({ f: 'x2', a: 1, h: 3, k: 0 }, 'shift-h')).toMatch(/sang phải/);
    expect(text({ f: 'x2', a: 1, h: -3, k: 0 }, 'shift-h')).toMatch(/sang trái/);
    expect(text({ f: 'x2', a: -2, h: 0, k: 0 }, 'scale')).toMatch(
      /nhân giá trị với 0|Nhân giá trị với 0/,
    );
    expect(text({ f: 'x2', a: 1, h: 0, k: 2 }, 'shift-k')).toMatch(/lên trên/);
    expect(text({ f: 'x2', a: 1, h: 0, k: -2 }, 'shift-k')).toMatch(/xuống dưới/);
    const flip = gen({ f: 'x2', a: -2, h: 0, k: 0 }).filter((f) =>
      /lật qua trục ngang/.test(f.meta.explanation),
    );
    expect(flip).toHaveLength(2); // a = −1 and a = −2; a = 0 only flattens
  });

  it('a graph before a step stays as a dashed ghost, and every named object exists in its frame', () => {
    for (const i of FAMILY.slice(0, 60)) {
      const frames = gen(i);
      for (const [j, f] of frames.entries()) {
        const ids = new Set([
          ...f.state.points.map((p) => p.id),
          ...f.state.segments.map((s) => s.id),
          ...f.state.polylines.map((p) => p.id),
        ]);
        for (const k of Object.keys(f.meta.highlights ?? {})) expect(ids.has(k), k).toBe(true);
        const ghosts = f.state.polylines.filter((p) => p.id.startsWith('o'));
        for (const g of ghosts) expect(g.dashed).toBe(true);
        const stage = beatOf(f)[0];
        if (j === 0 || stage === 'done') expect(ghosts).toHaveLength(0);
      }
    }
  });

  it('bounds hold O and Q; frame counts stay within maxFrames', () => {
    for (const i of [...FAMILY, ...PRESETS]) {
      const frames = gen(i);
      expect(frames.length).toBeLessThanOrEqual(entry.maxFrames);
      for (const f of frames) {
        const b = f.state.bounds;
        for (const p of f.state.points) {
          expect(p.x).toBeGreaterThanOrEqual(b.xmin);
          expect(p.x).toBeLessThanOrEqual(b.xmax);
          expect(p.y).toBeGreaterThanOrEqual(b.ymin);
          expect(p.y).toBeLessThanOrEqual(b.ymax);
        }
      }
    }
  });
});
