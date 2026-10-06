import { describe, expect, it } from 'vitest';
import { convexHullTrickEntry as entry } from '@/lib/subjects/cp/catalog/convex-hull-trick';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { lines: number[][]; xs: number[] };
type S = {
  rows: number;
  cols: number;
  cells: number[][];
  rowLabels: string[];
  colLabels: string[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const mins = ({ lines, xs }: In): number[] =>
  xs.map((x) => Math.min(...lines.map(([k, m]) => k * x + m)));
function family(): In[] {
  const out: In[] = [];
  let x = 6502;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 200; t++) {
    const n = 1 + next(5);
    const slopes = new Set<number>();
    while (slopes.size < n) slopes.add(next(21) - 10);
    const lines = [...slopes].sort((a, b) => b - a).map((k) => [k, next(21) - 10]);
    const xset = new Set<number>();
    const q = 1 + next(5);
    while (xset.size < q) xset.add(next(21) - 10);
    out.push({ lines, xs: [...xset].sort((a, b) => a - b) });
  }
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const finalMins = (f: Frame<S>, i: In): number[] =>
  i.xs.map((_, c) => {
    const r = Object.entries(f.meta.highlights ?? {}).find(
      ([k, h]) => h === 'result' && k.endsWith(`,${c}`),
    )![0];
    return f.state.cells[Number(r.split(',')[0])][c];
  });

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t4-dp-optimize'],
  maxFrames: 50,
  presets: ['classic', 'useless-line', 'single-line', 'parallel-like'],
  beats: ['start', 'add-line', 'pop-back', 'query', 'pop-front', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'q', 'l', 'k', 'mm', 'a', 'b', 'dq', 'x', 'va', 'vb', 'v', 'res'],
  pointers: [],
  allow: [0, 1],
  extra: FAMILY.slice(0, 25),
  bad: [
    { lines: [], xs: [1] },
    {
      lines: [
        [1, 1],
        [2, 2],
      ],
      xs: [1],
    },
    {
      lines: [
        [1, 1],
        [1, 2],
      ],
      xs: [1],
    },
    { lines: [[1, 1]], xs: [] },
    { lines: [[1, 1]], xs: [2, 1] },
    { lines: [[1, 1]], xs: [1, 1] },
    { lines: [[11, 1]], xs: [1] },
    { lines: [[1, 11]], xs: [1] },
    { lines: [[1, 1, 1]], xs: [1] },
    { lines: [[1, 1]], xs: [1], extra: 1 },
    { lines: [[1, 1]] },
  ],
  predict: {
    'add-line': {
      options: 2,
      expected: (input, frames, idx) => {
        const { l, a, b } = frames[idx].meta.vars as { l: number; a: number; b: number };
        const [k1, m1] = input.lines[a];
        const [k2, m2] = input.lines[b];
        const [k3, m3] = input.lines[l];
        // independent, with exact rationals: crossing x of l1/l3 against l1/l2
        return (m3 - m1) / (k1 - k3) <= (m2 - m1) / (k1 - k2) ? 0 : 1;
      },
    },
  },
});

describe('convex-hull-trick: result', () => {
  it('the minimum of each column equals the best over every line (all queries)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars!.res, JSON.stringify(input)).toBe(mins(input).join(', '));
      expect(finalMins(last, input)).toEqual(mins(input));
    }
  });

  it('a popped line is never the unique minimum of any query', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const popped = new Set<number>();
      for (const f of gen(input)) {
        if (beatOf(f).includes('pop-back')) popped.add((f.meta.vars as { b: number }).b);
      }
      for (const l of popped)
        input.xs.forEach((x) => {
          const others = Math.min(
            ...input.lines.filter((_, i) => i !== l).map(([k, m]) => k * x + m),
          );
          expect(input.lines[l][0] * x + input.lines[l][1] >= others).toBe(true);
        });
    }
  });

  it('the useless-line and concurrent presets pop the middle line; the single line pops nothing', () => {
    expect(gen(PRESETS[1]).flatMap(beatOf)).toContain('pop-back');
    expect(gen(PRESETS[3]).flatMap(beatOf)).toContain('pop-back');
    expect(gen(PRESETS[2]).flatMap(beatOf)).not.toContain('pop-back');
  });

  it('the grid holds k*x + m with readable labels; removed lines turn muted', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const f = gen(input)[0];
      input.lines.forEach(([k, m], r) =>
        input.xs.forEach((x, c) => expect(f.state.cells[r][c]).toBe(k * x + m)),
      );
      for (const l of f.state.rowLabels) expect(l.length).toBeLessThanOrEqual(8);
    }
    const last = gen(PRESETS[1]).at(-1)!;
    expect(Object.values(last.meta.highlights ?? {})).toContain('muted');
  });

  it('check() needs strictly decreasing slopes; xs must be strictly increasing', () => {
    expect(
      validateInput(entry as never, {
        lines: [
          [2, 0],
          [1, 0],
        ],
        xs: [0],
      }).ok,
    ).toBe(true);
    expect(
      validateInput(entry as never, {
        lines: [
          [1, 0],
          [1, 5],
        ],
        xs: [0],
      }).ok,
    ).toBe(false);
  });

  it('the add-line frame (the question) shows the deque before the pops', () => {
    for (const f of gen(PRESETS[1], 'en-US'))
      if (beatOf(f).includes('add-line'))
        expect(f.meta.explanation).not.toMatch(/never the minimum|Pop/);
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
