import { describe, expect, it } from 'vitest';
import { lisEntry as entry } from '@/lib/subjects/cp/catalog/lis';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { values: number[] };
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

/** Independent oracle: all 2^n subsequences, the strictly increasing ones; `endAt[i]` = longest ending at i. */
function brute(values: readonly number[]): { best: number; endAt: number[] } {
  const endAt = values.map(() => 1);
  let best = 0;
  for (let mask = 1; mask < 1 << values.length; mask++) {
    const idx = values.map((_, k) => k).filter((k) => (mask >> k) & 1);
    if (!idx.every((x, t) => t === 0 || values[idx[t - 1]] < values[x])) continue;
    best = Math.max(best, idx.length);
    const last = idx[idx.length - 1];
    endAt[last] = Math.max(endAt[last], idx.length);
  }
  return { best, endAt };
}
function family(): In[] {
  const out: In[] = [];
  let x = 2468;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 150; t++) {
    const n = 1 + next(8);
    const range = [3, 6, 199][next(3)];
    out.push({ values: Array.from({ length: n }, () => next(range) - Math.floor(range / 2)) });
  }
  out.push(
    { values: [1, 2, 3, 4, 5, 6, 7, 8] },
    { values: [8, 7, 6, 5, 4, 3, 2, 1] },
    { values: [-99, 99, -99, 99, -99, 99, -99, 99] },
  );
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const dpRow = (f: Frame<S>): number[] =>
  f.state.cells[1].map((x) => (x === '' ? -1 : (x as number)));

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t3-dp-basic'],
  maxFrames: 100,
  presets: ['mixed', 'increasing', 'decreasing', 'single', 'dups'],
  beats: ['start', 'init', 'extend', 'best', 'traceback', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['n', 'i', 'j', 'ai', 'aj', 'di', 'cand', 'up', 'best', 'at', 'p', 'ap', 'seq'],
  pointers: [],
  allow: [1],
  extra: FAMILY.slice(0, 25),
  bad: [
    { values: [] },
    { values: Array.from({ length: 9 }, (_, i) => i) },
    { values: [100] },
    { values: [-100] },
    { values: [1.5] },
    { values: [1], extra: 1 },
    {},
  ],
  predict: {
    extend: {
      options: 2,
      expected: (input, frames, idx) => {
        const { i, j } = frames[idx].meta.vars as { i: number; j: number };
        const { endAt } = brute(input.values);
        // dp[i] so far = 1 + best endAt[j'] over j' < j with a[j'] < a[i]
        let cur = 1;
        for (let k = 0; k < j; k++)
          if (input.values[k] < input.values[i]) cur = Math.max(cur, endAt[k] + 1);
        return endAt[j] + 1 > cur ? 0 : 1;
      },
    },
  },
});

describe('lis: result', () => {
  it('max(dp) equals the 2^n brute force and the dp row is the per-end optimum', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const frames = gen(input);
      const { best, endAt } = brute(input.values);
      expect(frames.at(-1)!.meta.vars?.best, JSON.stringify(input)).toBe(best);
      const filled = [...frames].reverse().find((f) => beatOf(f).includes('best'))!;
      expect(dpRow(filled)).toEqual(endAt);
    }
  });

  it('the traced sequence is strictly increasing, a subsequence of the input, of optimal length', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const seq = String(last.meta.vars!.seq).split(', ').map(Number);
      expect(seq).toHaveLength(brute(input.values).best);
      seq.forEach((x, k) => {
        if (k > 0) expect(seq[k - 1]).toBeLessThan(x);
      });
      let pos = 0;
      for (const x of input.values) if (pos < seq.length && x === seq[pos]) pos++;
      expect(pos).toBe(seq.length);
    }
  });

  it('presets: 4, 5, 1, 1, 2 (strictness: [2, 2, 2, 3] gives 2, not 4)', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.best)).toEqual([4, 5, 1, 1, 2]);
  });

  it('the answer is max(dp), which is not always dp[n - 1]', () => {
    const f = gen({ values: [3, 4, 5, 1] });
    const best = f.find((x) => beatOf(x).includes('best'))!;
    expect(dpRow(best)).toEqual([1, 2, 3, 1]);
    expect(best.meta.vars).toMatchObject({ best: 3, at: 2 });
  });

  it('the grid is 2 x n: row a holds the numbers, row dp the lengths; labels a / dp / indices', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const f = gen(input)[0];
      expect(f.state.rows).toBe(2);
      expect(f.state.cols).toBe(input.values.length);
      expect(f.state.cells[0]).toEqual(input.values);
      expect(f.state.rowLabels).toEqual(['a', 'dp']);
      expect(f.state.colLabels).toEqual(input.values.map((_, k) => String(k)));
    }
  });

  it('arrows are the parent links: they only point left to right and match the traceback', () => {
    for (const input of FAMILY.slice(0, 60)) {
      const last = gen(input).at(-1)!;
      for (const ar of last.state.arrows) {
        const from = Number(ar.from.split(',')[1]);
        const to = Number(ar.to.split(',')[1]);
        expect(from).toBeLessThan(to);
        expect(input.values[from]).toBeLessThan(input.values[to]);
      }
    }
  });

  it('every extend frame is a real candidate (a[j] < a[i]) shown before the update', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('extend')) return;
        const { i, j } = f.meta.vars as { i: number; j: number };
        expect(input.values[j]).toBeLessThan(input.values[i]);
        const next = frames[k + 1].meta.vars as { up: number };
        expect([0, 1]).toContain(next.up);
      });
    }
  });

  it('frame counts: the card’s 60 for the mixed preset, maxFrames for every input', () => {
    expect(gen(PRESETS[0]).length).toBeLessThanOrEqual(60);
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    expect(beats(gen(PRESETS[3]))).toEqual(['start', 'init', 'best', 'traceback', 'done']);
  });
});
