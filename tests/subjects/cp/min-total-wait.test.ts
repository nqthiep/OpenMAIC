import { describe, expect, it } from 'vitest';
import { minTotalWaitEntry as entry } from '@/lib/subjects/cp/catalog/min-total-wait';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { t: number[] };
type S = {
  values: number[];
  mode: 'bars';
  rows: { label: string; values: (number | null)[]; offset: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

const totalOf = (order: readonly number[]): number => {
  let wait = 0;
  let total = 0;
  for (const x of order) {
    total += wait;
    wait += x;
  }
  return total;
};
/** Independent oracle: all permutations. */
function brute(t: readonly number[]): number {
  let best = Infinity;
  const go = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) best = Math.min(best, totalOf(acc));
    rest.forEach((x, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]));
  };
  go([...t], []);
  return best;
}
function family(): In[] {
  const out: In[] = [];
  let x = 8080;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let k = 0; k < 40; k++)
    out.push({ t: Array.from({ length: 1 + next(6) }, () => 1 + next(20)) });
  out.push(
    { t: [20, 19, 18, 17, 16, 15, 14, 13] },
    { t: [20, 20, 20, 20, 20, 20, 20, 20] },
    { t: [1, 1, 1, 1, 1, 1, 1, 1] },
  );
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t3-greedy'],
  maxFrames: 40,
  presets: ['classic', 'sorted', 'equal', 'single'],
  beats: ['start', 'brute', 'swap-argument', 'sort', 'accumulate', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'total', 'perms', 'best', 'x', 'y', 'gain', 'before', 'after', 'k', 'w', 'tk'],
  pointers: [],
  allow: [1, 2],
  subtasks: 3,
  extra: FAMILY.slice(0, 12),
  bad: [
    { t: [] },
    { t: Array.from({ length: 9 }, () => 1) },
    { t: [0] },
    { t: [21] },
    { t: [1.5] },
    { t: [1], extra: 1 },
    {},
  ],
  predict: { 'swap-argument': { options: 2, expected: () => 0 } },
});

describe('min-total-wait: result', () => {
  it('the final total equals the best permutation (8! = 40320 checked for the long inputs)', () => {
    for (const input of [...FAMILY.slice(0, 20), ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.total, JSON.stringify(input)).toBe(brute(input.t));
    }
    const eight = { t: [20, 19, 18, 17, 16, 15, 14, 13] };
    expect(gen(eight).at(-1)!.meta.vars?.total).toBe(brute(eight.t));
  });

  it('the brute frame reports n! orders and the same optimum', () => {
    for (const input of FAMILY.slice(0, 20)) {
      const f = gen(input).find((x) => beatOf(x).includes('brute'))!;
      let fact = 1;
      for (let k = 2; k <= input.t.length; k++) fact *= k;
      expect(f.meta.vars).toMatchObject({ perms: fact, best: brute(input.t) });
    }
  });

  it('presets: classic [8, 3, 5, 1] gives 1 + (1 + 3) + (1 + 3 + 5) = 14 after sorting', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.total)).toEqual([14, 10, 12, 0]);
    expect(totalOf([8, 3, 5, 1])).toBe(0 + 8 + 11 + 16);
    expect(totalOf([1, 3, 5, 8])).toBe(14);
  });

  it('the exchange argument: swapping a longer-then-shorter neighbour pair lowers the total by x - y', () => {
    for (const input of FAMILY) {
      const frames = gen(input);
      const k = frames.findIndex((f) => beatOf(f).includes('swap-argument'));
      const hasInversion = input.t.some((x, i) => i + 1 < input.t.length && x > input.t[i + 1]);
      expect(k >= 0).toBe(hasInversion);
      if (k < 0) continue;
      const { x, y } = frames[k].meta.vars as { x: number; y: number };
      const sw = frames[k + 1].meta.vars as { gain: number; before: number; after: number };
      expect(sw.gain).toBe(x - y);
      expect(sw.before - sw.after).toBe(x - y);
      expect(sw.after).toBe(totalOf(frames[k + 1].state.values));
    }
  });

  it('the bars show the order and the wait row the cumulative waits, aligned', () => {
    for (const input of FAMILY.slice(0, 20)) {
      const frames = gen(input);
      for (const f of frames) {
        if (beatOf(f).includes('accumulate') || beatOf(f).includes('done')) continue;
        const waits = f.state.rows[0].values as number[];
        let wait = 0;
        f.state.values.forEach((x, i) => {
          expect(waits[i]).toBe(wait);
          wait += x;
        });
      }
    }
  });

  it('accumulate builds the wait row one customer at a time', () => {
    const frames = gen({ t: [4, 4, 4] }).filter((f) => beatOf(f).includes('accumulate'));
    expect(frames.map((f) => f.state.rows[0].values)).toEqual([
      [0, null, null],
      [0, 4, null],
      [0, 4, 8],
    ]);
    expect(frames.map((f) => f.meta.vars!.total)).toEqual([0, 4, 12]);
  });

  it('beat sequences: only an input with an inverted neighbour pair has the swap argument', () => {
    expect(beats(gen(PRESETS[0]))).toEqual([
      'start',
      'brute',
      'swap-argument',
      'sort',
      'accumulate',
      'accumulate',
      'accumulate',
      'accumulate',
      'done',
    ]);
    for (const p of PRESETS.slice(1)) expect(beats(gen(p))).not.toContain('swap-argument');
  });

  it('frames stay within maxFrames at n = 8 and the step budget holds (8! orders)', () => {
    for (const input of FAMILY.slice(0, 20))
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    expect(gen({ t: [20, 19, 18, 17, 16, 15, 14, 13] }).length).toBeLessThanOrEqual(
      entry.maxFrames,
    );
  });

  it('the swap-argument frame (the question) shows no gain yet', () => {
    for (const f of gen(PRESETS[0], 'en-US')) {
      if (beatOf(f).includes('swap-argument')) {
        expect(f.meta.vars).not.toHaveProperty('gain');
        expect(f.meta.explanation).not.toMatch(/drops|gain/);
      }
    }
  });
});
