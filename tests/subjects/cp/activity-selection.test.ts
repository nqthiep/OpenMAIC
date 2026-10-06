import { describe, expect, it } from 'vitest';
import { activitySelectionEntry as entry } from '@/lib/subjects/cp/catalog/activity-selection';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { seg: number[][] };
type S = {
  values: number[];
  mode: 'cells';
  intervals: { id: string; start: number; end: number; label: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: every subset of the segments, the biggest set of pairwise disjoint ones. */
function brute(seg: number[][]): number {
  let best = 0;
  for (let mask = 0; mask < 1 << seg.length; mask++) {
    const chosen = seg.filter((_, k) => (mask >> k) & 1);
    const ok = chosen.every(([s, e], a) =>
      chosen.every(([s2, e2], b) => a === b || e <= s2 || e2 <= s),
    );
    if (ok) best = Math.max(best, chosen.length);
  }
  return best;
}
/** A deterministic family: segments from a small linear congruential sequence. */
function family(): In[] {
  const out: In[] = [];
  let x = 12345;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 120; t++) {
    const n = 1 + next(8);
    const seg: number[][] = [];
    for (let k = 0; k < n; k++) {
      const s = next(24);
      seg.push([s, s + 1 + next(24 - s)]);
    }
    out.push({ seg });
  }
  return out;
}
const FAMILY = family();

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t3-greedy'],
  maxFrames: 40,
  presets: ['classic', 'nested', 'disjoint', 'single', 'same-end'],
  beats: ['start', 'sort', 'pick', 'skip', 'exchange', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['n', 'k', 's', 'e', 'last', 'count'],
  pointers: ['last'],
  allow: [2],
  extra: FAMILY.slice(0, 30),
  bad: [
    { seg: [] },
    { seg: [[3, 3]] },
    { seg: [[5, 2]] },
    {
      seg: [
        [1, 4],
        [4, 4],
      ],
    },
    { seg: [[0, 25]] },
    { seg: [[-1, 3]] },
    { seg: [[1, 2, 3]] },
    { seg: Array.from({ length: 9 }, () => [0, 1]) },
    { seg: [[1, 2]], extra: 1 },
  ],
  predict: { sort: { options: 2, expected: () => 1 } },
});

describe('activity-selection: result', () => {
  it('the greedy count equals the brute-force optimum', () => {
    for (const input of [...FAMILY, ...entry.presets.map((p) => p.input as In)]) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.count, JSON.stringify(input)).toBe(brute(input.seg));
    }
  });

  it('the chosen segments are pairwise disjoint and listed in the result highlights', () => {
    for (const input of FAMILY) {
      const frames = gen(input);
      const last = frames.at(-1)!;
      const chosen = last.state.intervals.filter(
        (iv) => last.meta.highlights?.[iv.id] === 'result',
      );
      chosen.forEach((a, i) =>
        chosen.slice(i + 1).forEach((b) => expect(a.end <= b.start || b.end <= a.start).toBe(true)),
      );
      expect(chosen).toHaveLength(last.meta.vars!.count as number);
    }
  });

  it('presets: the counts of the cards', () => {
    const c = (id: string) =>
      gen(entry.presets.find((p) => p.id === id)!.input as In).at(-1)!.meta.vars!.count;
    expect([c('classic'), c('nested'), c('disjoint'), c('single'), c('same-end')]).toEqual([
      3, 3, 3, 1, 1,
    ]);
  });

  it('the scan order is by end point, equal ends keep the input order (stable)', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const frames = gen(input);
      const f = frames.find((x) => beatOf(x).includes('pick') || beatOf(x).includes('skip'))!;
      const items = f.meta.aux![0].items as string[];
      const ends = items.map((t) => Number(/, (\d+)\)/.exec(t)![1]));
      expect([...ends].sort((a, b) => a - b)).toEqual(ends);
    }
    const same = gen({
      seg: [
        [1, 4],
        [2, 4],
        [3, 4],
      ],
    });
    expect(same.find((f) => beatOf(f).includes('pick'))!.meta.vars).toMatchObject({ s: 1, e: 4 });
  });

  it('pick when s >= last (touching segments do not overlap), skip when s < last', () => {
    for (const input of FAMILY) {
      for (const f of gen(input)) {
        const v = f.meta.vars as { s?: number; last?: number };
        if (beatOf(f).includes('pick')) expect(v.s! >= v.last!).toBe(true);
        if (beatOf(f).includes('skip')) expect(v.s! < v.last!).toBe(true);
      }
    }
    // [1,4) then [4,6): they touch at 4 and both are chosen
    expect(
      gen({
        seg: [
          [1, 4],
          [4, 6],
        ],
      }).at(-1)!.meta.vars!.count,
    ).toBe(2);
  });

  it('the exchange argument appears exactly once, right after the first pick', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const seq = beats(gen(input));
      expect(seq.filter((b) => b === 'exchange')).toHaveLength(1);
      expect(seq[seq.indexOf('pick') + 1]).toBe('exchange');
    }
  });

  it('the order list shows the input order at the sort question and the sorted order after it', () => {
    const f = gen(entry.presets[0].input as In);
    const [, sort, sorted] = f;
    expect(beatOf(sort)).toEqual(['sort']);
    expect(sort.meta.aux![0].items).toEqual([
      '[1, 4)',
      '[3, 5)',
      '[0, 6)',
      '[5, 7)',
      '[3, 9)',
      '[8, 9)',
    ]);
    expect(sorted.meta.aux![0].items).toEqual([
      '[1, 4)',
      '[3, 5)',
      '[0, 6)',
      '[5, 7)',
      '[3, 9)',
      '[8, 9)',
    ]);
    expect(sorted.meta.aux![0].items).toEqual(
      [...(sort.meta.aux![0].items as string[])].sort(
        (a, b) => Number(/, (\d+)\)/.exec(a)![1]) - Number(/, (\d+)\)/.exec(b)![1]),
      ),
    );
  });

  it('check() only rejects a segment with start >= end', () => {
    expect(validateInput(entry as never, { seg: [[1, 2]] }).ok).toBe(true);
    expect(validateInput(entry as never, { seg: [[2, 2]] }).ok).toBe(false);
  });

  it('frame counts stay within maxFrames at 8 segments', () => {
    const input: In = { seg: Array.from({ length: 8 }, (_, k) => [k * 3, k * 3 + 2]) };
    expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    for (const x of FAMILY) expect(gen(x).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
