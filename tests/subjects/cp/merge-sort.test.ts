import { describe, expect, it, vi } from 'vitest';
import { mergeSortEntry as entry } from '@/lib/subjects/cp/catalog/merge-sort';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

// the exhaustive checks below are CPU heavy; a loaded CI machine needs more than the 5 s default
vi.setConfig({ testTimeout: 60_000 });

type In = { values: number[] };
type S = {
  values: number[];
  mode: 'bars';
  rows: { label: string; values: (number | null)[]; offset: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const sorted = (v: readonly number[]): number[] => [...v].sort((x, y) => x - y);

function* arrays(maxLen: number): Generator<In> {
  for (let len = 2; len <= maxLen; len++) {
    for (let code = 0; code < 3 ** len; code++) {
      const values: number[] = [];
      for (let k = 0, c = code; k < len; k++, c = Math.floor(c / 3)) values.push(c % 3);
      yield { values };
    }
  }
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
  presets: ['random', 'reverse', 'dups', 'n2'],
  beats: ['start', 'split', 'merge-compare', 'copy-rest', 'merged', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['n', 'lo', 'mid', 'hi', 'r0', 'i', 'j', 'ai', 'aj', 'v', 'w', 'k', 'cnt'],
  pointers: ['i', 'j'],
  extra: [...WIDE, ...arrays(4)],
  bad: [
    { values: [1] },
    { values: [] },
    { values: Array.from({ length: 9 }, (_, i) => i) },
    { values: [1000, 1] },
    { values: [1.5, 2] },
    { values: [1, 2], extra: 1 },
    {},
  ],
  predict: {
    'merge-compare': {
      options: 2,
      expected: (_input, frames, idx) => {
        const v = frames[idx].meta.vars as { ai: number; aj: number };
        return v.ai <= v.aj ? 0 : 1;
      },
    },
  },
});

describe('merge-sort: result', () => {
  it('sorts every array (exhaustive over {0,1,2} up to length 6, plus wide ones)', () => {
    let runs = 0;
    for (const input of [...arrays(6), ...WIDE]) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(last.state.values, JSON.stringify(input)).toEqual(sorted(input.values));
      expect(Object.values(last.meta.highlights ?? {}).every((k) => k === 'result')).toBe(true);
      expect(last.state.rows).toEqual([]);
      runs++;
    }
    expect(runs).toBeGreaterThan(1000);
  });

  it('the array only changes at the merged frames, and then the range is sorted', () => {
    for (const input of [...WIDE, ...[...arrays(5)].slice(0, 200)]) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (k === 0) return;
        const before = frames[k - 1].state.values;
        if (!beatOf(f).includes('merged')) {
          expect(f.state.values).toEqual(before);
          return;
        }
        const { lo, hi } = f.meta.vars as { lo: number; hi: number };
        expect(sorted(f.state.values.slice(lo, hi + 1))).toEqual(f.state.values.slice(lo, hi + 1));
        expect(sorted(before.slice(lo, hi + 1))).toEqual(f.state.values.slice(lo, hi + 1));
        expect(f.state.values.filter((_, t) => t < lo || t > hi)).toEqual(
          before.filter((_, t) => t < lo || t > hi),
        );
      });
    }
  });

  it('tmp holds exactly the merged values (full at copy-rest and merged) and aligns at offset lo', () => {
    for (const input of [...WIDE, ...[...arrays(5)].slice(0, 200)]) {
      for (const f of gen(input)) {
        if (!beatOf(f).some((b) => b === 'copy-rest' || b === 'merged')) continue;
        const { lo, hi } = f.meta.vars as { lo: number; hi: number };
        const row = f.state.rows[0];
        expect(row.label).toBe('tmp');
        expect(row.offset).toBe(lo);
        expect(row.values).toHaveLength(hi - lo + 1);
        expect(row.values.every((x) => x !== null)).toBe(true);
        if (beatOf(f).includes('merged'))
          expect(row.values).toEqual(f.state.values.slice(lo, hi + 1));
      }
    }
  });

  it('stability: with a[i] = a[j] the left element is taken first', () => {
    for (const input of [{ values: [3, 3] }, { values: [3, 1, 3, 2, 3] }, ...WIDE]) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('merge-compare')) return;
        const v = f.meta.vars as { ai: number; aj: number; i: number };
        if (v.ai !== v.aj) return;
        expect(frames[k + 1].meta.vars?.i).toBe(v.i + 1);
      });
    }
  });

  it('there are n - 1 splits and n - 1 merges; the comparisons stay below n log n', () => {
    for (const input of [...WIDE, ...[...arrays(5)].slice(0, 100)]) {
      const seq = beats(gen(input));
      const n = input.values.length;
      expect(seq.filter((b) => b === 'split')).toHaveLength(n - 1);
      expect(seq.filter((b) => b === 'merged')).toHaveLength(n - 1);
      expect(seq.filter((b) => b === 'copy-rest')).toHaveLength(n - 1);
      expect(seq.filter((b) => b === 'merge-compare').length).toBeLessThanOrEqual(
        n * Math.ceil(Math.log2(n)),
      );
    }
  });

  it('frame counts fit maxFrames at the widest input', () => {
    for (const input of WIDE) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });

  it('the question frame (merge-compare) shows no verdict', () => {
    for (const p of entry.presets) {
      for (const f of gen(p.input, 'en-US')) {
        if (!beatOf(f).includes('merge-compare')) continue;
        expect(f.meta.explanation).not.toMatch(/take|≤|>/);
      }
    }
  });
});
