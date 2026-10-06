import { describe, expect, it } from 'vitest';
import { knapsack01Entry as entry } from '@/lib/subjects/cp/catalog/knapsack-01';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { w: number[]; v: number[]; cap: number };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
  arrows: { from: string; to: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: all 2^n sets of items. */
function brute({ w, v, cap }: In): number {
  let best = 0;
  for (let mask = 0; mask < 1 << w.length; mask++) {
    let weight = 0;
    let value = 0;
    w.forEach((x, k) => {
      if ((mask >> k) & 1) {
        weight += x;
        value += v[k];
      }
    });
    if (weight <= cap) best = Math.max(best, value);
  }
  return best;
}
function family(): In[] {
  const out: In[] = [];
  let x = 99;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 120; t++) {
    const n = 1 + next(5);
    out.push({
      w: Array.from({ length: n }, () => 1 + next(20)),
      v: Array.from({ length: n }, () => 1 + next(30)),
      cap: next(13),
    });
  }
  out.push({ w: [1, 2, 3, 1, 1], v: [20, 20, 20, 20, 20], cap: 12 }); // the widest table, many fits
  out.push({ w: [1, 1, 1, 1, 1], v: [1, 2, 3, 4, 5], cap: 12 });
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const dpOf = (f: Frame<S>): number[][] =>
  f.state.cells.map((r) => r.map((x) => (x === '' ? -1 : (x as number))));

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t3-dp-basic'],
  maxFrames: 100,
  presets: ['classic', 'cap-zero', 'one-item', 'too-heavy'],
  beats: ['start', 'base-row', 'cell', 'take', 'skip', 'traceback', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: [
    'cap',
    'n',
    'i',
    'c',
    'wi',
    'vi',
    'i1',
    'cw',
    'a',
    'b',
    'val',
    'x',
    'y',
    'cn',
    'best',
    'chosen',
  ],
  pointers: [],
  allow: [0],
  extra: FAMILY.slice(0, 20),
  bad: [
    { w: [], v: [], cap: 3 },
    { w: [1, 2], v: [3], cap: 3 },
    { w: [1], v: [3, 4], cap: 3 },
    { w: [0], v: [3], cap: 3 },
    { w: [21], v: [3], cap: 3 },
    { w: [1], v: [31], cap: 3 },
    { w: [1], v: [3], cap: 13 },
    { w: [1], v: [3], cap: -1 },
    { w: Array.from({ length: 6 }, () => 1), v: Array.from({ length: 6 }, () => 1), cap: 3 },
    { w: [1], v: [3], cap: 3, extra: 1 },
  ],
  predict: {
    cell: {
      options: 2,
      expected: (input, frames, idx) => {
        const { i, c, wi, vi } = frames[idx].meta.vars as {
          i: number;
          c: number;
          wi: number;
          vi: number;
        };
        // independent: best value of the first i - 1 items at capacity c vs at capacity c - wi, plus vi
        const best = (items: number, cp: number) =>
          brute({ w: input.w.slice(0, items), v: input.v.slice(0, items), cap: cp });
        return best(i - 1, c - wi) + vi > best(i - 1, c) ? 0 : 1;
      },
    },
  },
});

describe('knapsack-01: result', () => {
  it('dp[n][cap] equals the 2^n brute force (and every row is the brute force of its prefix)', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      const dp = dpOf(last);
      for (let i = 0; i <= input.w.length; i++)
        for (let c = 0; c <= input.cap; c++)
          expect(dp[i][c], `${JSON.stringify(input)} dp[${i}][${c}]`).toBe(
            brute({ w: input.w.slice(0, i), v: input.v.slice(0, i), cap: c }),
          );
      expect(last.meta.vars?.best).toBe(brute(input));
    }
  });

  it('the traced items are a valid set whose weight fits and whose value is the optimum', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const chosen = last.meta.aux![0].items.map(Number);
      expect(chosen.reduce((s, i) => s + input.w[i - 1], 0)).toBeLessThanOrEqual(input.cap);
      expect(chosen.reduce((s, i) => s + input.v[i - 1], 0)).toBe(brute(input));
      expect(new Set(chosen).size).toBe(chosen.length);
    }
  });

  it('presets: the four optima', () => {
    expect(PRESETS.map((p) => brute(p))).toEqual([35, 0, 3, 0]);
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.best)).toEqual([35, 0, 3, 0]);
  });

  it('one frame per cell, filled left to right, top to bottom, with exactly the dp formula', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const frames = gen(input);
      let seen = 0;
      frames.forEach((f, k) => {
        if (!beatOf(f).some((b) => b === 'take' || b === 'skip')) return;
        const before = dpOf(frames[k - 1]);
        const now = dpOf(f);
        const { i, c } = f.meta.vars as { i: number; c: number };
        const changed = now.flatMap((row, r) =>
          row.flatMap((x, cc) => (x !== before[r][cc] ? [[r, cc]] : [])),
        );
        expect(changed.length).toBeLessThanOrEqual(1);
        if (changed.length === 1) expect(changed[0]).toEqual([i, c]);
        seen++;
      });
      expect(seen).toBe(input.w.length * (input.cap + 1));
    }
  });

  it('a take frame has two source arrows and a strictly better value; a not-fitting item has one arrow', () => {
    for (const input of FAMILY.slice(0, 60)) {
      for (const f of gen(input)) {
        const b = beatOf(f)[0];
        const v = f.meta.vars as Record<string, number>;
        if (b === 'take') {
          expect(f.state.arrows).toHaveLength(2);
          expect(v.b).toBeGreaterThan(v.a);
          expect(v.val).toBe(v.b);
        }
        if (b === 'skip' && v.b !== undefined) {
          expect(v.b).toBeLessThanOrEqual(v.a);
          expect(v.val).toBe(v.a);
        }
        if (b === 'skip' && v.b === undefined) {
          expect(f.state.arrows).toHaveLength(1);
          expect(v.wi).toBeGreaterThan(v.c);
        }
      }
    }
  });

  it('row labels are item:weight/value with at most 8 characters, column labels the capacities', () => {
    for (const input of FAMILY) {
      const f = gen(input)[0];
      expect(f.state.rowLabels).toEqual([
        '0',
        ...input.w.map((x, k) => `${k + 1}:${x}/${input.v[k]}`),
      ]);
      for (const l of f.state.rowLabels) expect(l.length).toBeLessThanOrEqual(8);
      expect(f.state.colLabels).toEqual(Array.from({ length: input.cap + 1 }, (_, c) => String(c)));
      expect(f.state.rows).toBe(input.w.length + 1);
      expect(f.state.cols).toBe(input.cap + 1);
    }
  });

  it('check() rejects mismatched lengths only', () => {
    expect(validateInput(entry as never, { w: [1, 2], v: [3], cap: 3 }).ok).toBe(false);
    expect(validateInput(entry as never, { w: [1], v: [3], cap: 3 }).ok).toBe(true);
  });

  it('beat order and frame counts: at most 100 on the widest table', () => {
    expect(beats(gen(PRESETS[1]))).toContain('traceback');
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    const widest = gen({ w: [1, 1, 1, 1, 1], v: [1, 2, 3, 4, 5], cap: 12 });
    expect(widest.length).toBeLessThanOrEqual(100);
  });

  it('the cell frame (the question) comes once per row, before the cell is filled', () => {
    const frames = gen(PRESETS[0]);
    frames.forEach((f, k) => {
      if (!beatOf(f).includes('cell')) return;
      const { i, c } = f.meta.vars as { i: number; c: number };
      expect(dpOf(f)[i][c]).toBe(-1);
      expect(f.state.arrows).toEqual([]);
      expect(frames[k + 1].meta.vars).toMatchObject({ i, c });
    });
    expect(beats(frames).filter((b) => b === 'cell')).toHaveLength(3);
  });
});
