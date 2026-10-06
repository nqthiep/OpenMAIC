import { describe, expect, it } from 'vitest';
import { nimGrundyEntry as entry } from '@/lib/subjects/cp/catalog/nim-grundy';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';
import harness from './impl/nim-grundy';

type In = { piles: number[] };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
/** Independent oracle: exhaustive minimax. */
const wins = (input: In): boolean => harness.expected(input) === '1';
const mexOf = (xs: number[]): number => {
  let v = 0;
  while (xs.includes(v)) v++;
  return v;
};
function* positions(): Generator<In> {
  for (let a = 0; a <= 7; a++) {
    yield { piles: [a] };
    for (let b = 0; b <= 7; b++) {
      yield { piles: [a, b] };
      for (let c = 0; c <= 7; c++) yield { piles: [a, b, c] };
    }
  }
}
const ALL = [...positions()];
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t4-game-theory'],
  maxFrames: 40,
  presets: ['win', 'lose', 'single', 'empty'],
  beats: ['start', 'mex', 'xor', 'verdict', 'winning-move', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['k', 'x', 'opts', 'set', 'g', 'gs', 'xor', 'res', 't', 'p', 'np', 'gp', 'gn'],
  pointers: [],
  allow: [0, 1, 2, 3],
  extra: ALL.filter((_, k) => k % 23 === 0),
  bad: [
    { piles: [] },
    { piles: [1, 2, 3, 4] },
    { piles: [8] },
    { piles: [-1] },
    { piles: [1.5] },
    { piles: [1], extra: 1 },
    {},
  ],
  predict: {
    mex: {
      options: 4,
      expected: (_input, frames, idx) => {
        const x = (frames[idx].meta.vars as { x: number }).x;
        // g(x) of the take-1-to-3 game: x mod 4, derived independently by definition below
        const g: number[] = [];
        for (let y = 0; y <= x; y++)
          g.push(mexOf([1, 2, 3].filter((t) => t <= y).map((t) => g[y - t])));
        return g[x];
      },
    },
    verdict: {
      options: 2,
      expected: (input) => (wins(input) ? 0 : 1),
    },
  },
});

describe('nim-grundy: result', () => {
  it('g(x) = x mod 4 and the verdict equals exhaustive minimax, for every position of 1 to 3 piles', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const verdict = frames.find((f) => beatOf(f).includes('verdict'))!;
      expect((verdict.meta.vars!.xor as number) !== 0, JSON.stringify(input)).toBe(wins(input));
      const xor = input.piles.reduce((a, p) => a ^ (p % 4), 0);
      expect(verdict.meta.vars!.xor).toBe(xor);
    }
  });

  it('the g row is filled by mex: 0 1 2 3 0 1 2 3', () => {
    const last = gen(PRESETS[0]).find((f) => beatOf(f).includes('xor'))!;
    expect(last.state.cells[0]).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('the winning move leaves a losing position (minimax) and exists exactly when the first player wins', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const mv = frames.find((f) => beatOf(f).includes('winning-move'));
      expect(mv !== undefined, JSON.stringify(input)).toBe(wins(input));
      if (!mv) continue;
      const { t, p } = mv.meta.vars as { t: number; p: number };
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(3);
      expect(input.piles[p]).toBeGreaterThanOrEqual(t);
      const next = input.piles.map((x, i) => (i === p ? x - t : x));
      expect(wins({ piles: next })).toBe(false);
    }
  });

  it('presets: win, lose, single (6 -> g = 2, wins), empty (loses)', () => {
    expect(PRESETS.map(wins)).toEqual([true, false, true, false]);
    expect(
      PRESETS.map((p) => gen(p).find((f) => beatOf(f).includes('verdict'))!.meta.vars!.xor),
    ).toEqual([2, 0, 2, 0]);
  });

  it('the mex question frames (x = 3 and 4) hide g; the result frame shows it', () => {
    const frames = gen(PRESETS[0]);
    frames.forEach((f, k) => {
      if (!beatOf(f).includes('mex')) return;
      expect(f.meta.vars).not.toHaveProperty('g');
      expect(frames[k + 1].meta.vars).toHaveProperty('g');
    });
    expect(frames.flatMap(beatOf).filter((b) => b === 'mex')).toHaveLength(2);
  });

  it('every input fits maxFrames', () => {
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
