import { describe, expect, it, vi } from 'vitest';
import { quickSortEntry as entry } from '@/lib/subjects/cp/catalog/quick-sort';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

// the exhaustive checks below are CPU heavy; a loaded CI machine needs more than the 5 s default
vi.setConfig({ testTimeout: 60_000 });

type In = { values: number[] };
type S = { values: number[]; mode: 'bars' };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const sorted = (v: readonly number[]): number[] => [...v].sort((x, y) => x - y);

/** Every array over {0,1,2} of length 2..5 (duplicates included) plus a few wide ones. */
function* arrays(): Generator<In> {
  for (let len = 2; len <= 5; len++) {
    for (let code = 0; code < 3 ** len; code++) {
      const values: number[] = [];
      for (let k = 0, c = code; k < len; k++, c = Math.floor(c / 3)) values.push(c % 3);
      yield { values };
    }
  }
}
function* permutations(n: number): Generator<number[]> {
  const rec = function* (rest: number[], acc: number[]): Generator<number[]> {
    if (rest.length === 0) yield acc;
    for (let i = 0; i < rest.length; i++)
      yield* rec([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
  };
  yield* rec(
    Array.from({ length: n }, (_, i) => i),
    [],
  );
}
const WIDE: In[] = [
  { values: [999, -999] },
  { values: [-999, 999, 0, -1, 1, 998, -998, 5] },
  { values: [8, 7, 6, 5, 4, 3, 2, 1] },
  { values: [1, 2, 3, 4, 5, 6, 7, 8] },
  { values: [4, 4, 4, 4, 4, 4, 4, 4] },
];

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t2-sorting', 't2-divide-conquer'],
  maxFrames: 120,
  presets: ['random', 'sorted', 'dups', 'n2'],
  beats: ['start', 'pick-pivot', 'compare', 'swap', 'place-pivot', 'recurse', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['n', 'lo', 'hi', 'i', 'j', 'aj', 'pivot', 'p'],
  pointers: ['i', 'j', 'pivot'],
  extra: [...WIDE, ...[...arrays()].filter((x) => x.values.length <= 4)],
  bad: [
    { values: [1] },
    { values: [] },
    { values: Array.from({ length: 9 }, (_, i) => i) },
    { values: [1000, 1] },
    { values: [-1000, 1] },
    { values: [1.5, 2] },
    { values: [1, 2], extra: 1 },
    {},
  ],
  predict: {
    compare: {
      options: 2,
      expected: (_input, frames, idx) => {
        const v = frames[idx].meta.vars as { aj: number; pivot: number };
        return v.aj <= v.pivot ? 0 : 1;
      },
    },
  },
});

describe('quick-sort: result', () => {
  it('the last frame is the sorted array and all cells are fixed (exhaustive)', () => {
    let runs = 0;
    const check = (input: In) => {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(last.state.values, JSON.stringify(input)).toEqual(sorted(input.values));
      expect(Object.values(last.meta.highlights ?? {}).every((k) => k === 'result')).toBe(true);
      runs++;
    };
    for (const input of arrays()) check(input);
    for (let n = 2; n <= 6; n++) for (const values of permutations(n)) check({ values });
    for (const input of WIDE) check(input);
    expect(runs).toBeGreaterThan(1000);
  });

  it('every frame keeps a permutation of the input', () => {
    for (const input of [...WIDE, ...[...arrays()].slice(0, 200)]) {
      for (const f of gen(input)) expect(sorted(f.state.values)).toEqual(sorted(input.values));
    }
  });

  it('place-pivot fixes the pivot: all left cells <= pivot < all right cells', () => {
    for (const input of [...WIDE, ...[...arrays()].slice(0, 300)]) {
      for (const f of gen(input)) {
        if (!beatOf(f).includes('place-pivot')) continue;
        const { lo, hi, p, pivot } = f.meta.vars as Record<string, number>;
        expect(f.state.values[p]).toBe(pivot);
        for (let k = lo; k < p; k++) expect(f.state.values[k]).toBeLessThanOrEqual(pivot);
        for (let k = p + 1; k <= hi; k++) expect(f.state.values[k]).toBeGreaterThan(pivot);
        expect(f.meta.highlights?.[p]).toBe('result');
      }
    }
  });

  it('one compare per j: compare frames of a partition number hi - lo', () => {
    for (const input of WIDE) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('pick-pivot')) return;
        const { lo, hi } = f.meta.vars as Record<string, number>;
        let compares = 0;
        for (let t = k + 1; !beatOf(frames[t]).includes('place-pivot'); t++)
          if (beatOf(frames[t]).includes('compare')) compares++;
        expect(compares).toBe(hi - lo);
      });
    }
  });

  it('presets: the sorted array is the worst case, and the frame counts fit', () => {
    const count = (id: string) => gen(entry.presets.find((p) => p.id === id)!.input).length;
    expect(count('sorted')).toBeGreaterThan(count('random'));
    expect(beats(gen({ values: [1, 2] }))).toEqual([
      'start',
      'pick-pivot',
      'compare',
      'swap',
      'place-pivot',
      'done',
    ]);
    for (const input of WIDE) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });

  it('the compare frame (the question) shows no verdict', () => {
    for (const p of entry.presets) {
      for (const f of gen(p.input, 'en-US')) {
        if (!beatOf(f).includes('compare')) continue;
        expect(f.meta.explanation).not.toMatch(/≤|>|gather|leave|swap/);
      }
    }
  });
});
