import { describe, expect, it } from 'vitest';
import { bitSubsetsEntry as entry } from '@/lib/subjects/cp/catalog/bit-subsets';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { items: number[]; target: number };
type S = {
  values: (number | string)[];
  mode: 'bits';
  rows: { label: string; values: number[]; offset: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: take-or-skip recursion (no bits). */
const countOracle = ({ items, target }: In): number => {
  const go = (i: number, left: number): number =>
    i === items.length ? (left === 0 ? 1 : 0) : go(i + 1, left - items[i]) + go(i + 1, left);
  return go(0, target);
};
function* family(): Generator<In> {
  for (let len = 1; len <= 4; len++)
    for (let code = 0; code < 3 ** len; code++) {
      const items: number[] = [];
      for (let k = 0, c = code; k < len; k++, c = Math.floor(c / 3)) items.push([1, 4, 9][c % 3]);
      const total = items.reduce((s, x) => s + x, 0);
      for (const target of [0, 1, 4, 5, 9, 10, total, Math.min(36, total + 1)])
        yield { items, target };
    }
}
const ALL = [...family()];

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t2-bitwise'],
  maxFrames: 40,
  presets: ['n3', 'n1', 'none', 'many'],
  beats: ['start', 'mask', 'test-bit', 'match', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['n', 'total', 'last', 'target', 'mask', 'i', 'picked', 'sum', 'count'],
  pointers: [],
  allow: [2],
  extra: ALL.filter((_, k) => k % 11 === 0),
  bad: [
    { items: [], target: 1 },
    { items: [1, 2, 3, 4, 5], target: 1 },
    { items: [0], target: 0 },
    { items: [10], target: 1 },
    { items: [1], target: 37 },
    { items: [1], target: -1 },
    { items: [1], target: 1, extra: 1 },
    { items: [1] },
  ],
  predict: {
    'test-bit': {
      options: 2,
      expected: (_input, frames, idx) => {
        const { mask, i } = frames[idx].meta.vars as { mask: number; i: number };
        return (mask >> i) & 1 ? 0 : 1;
      },
    },
  },
});

describe('bit-subsets: result', () => {
  it('the count equals the take-or-skip oracle', () => {
    for (const input of ALL) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.count, JSON.stringify(input)).toBe(countOracle(input));
    }
  });

  it('presets: the four counts', () => {
    const c = (id: string) =>
      gen(entry.presets.find((p) => p.id === id)!.input).at(-1)!.meta.vars!.count;
    expect([c('n3'), c('n1'), c('none'), c('many')]).toEqual([2, 1, 0, 4]);
  });

  it('each mask appears once, in order 0..2^n - 1, with its bits and sum', () => {
    for (const input of ALL.filter((_, k) => k % 5 === 0)) {
      const frames = gen(input);
      const masks = frames.filter((f) => beatOf(f).includes('mask'));
      expect(masks.map((f) => f.meta.vars!.mask)).toEqual(
        Array.from({ length: 1 << input.items.length }, (_, k) => k),
      );
      for (const f of masks) {
        const mask = f.meta.vars!.mask as number;
        expect(f.state.values).toEqual(input.items.map((_, k) => (mask >> k) & 1));
        const sum = input.items.reduce((s, x, k) => s + ((mask >> k) & 1) * x, 0);
        expect(f.meta.vars!.sum).toBe(sum);
      }
    }
  });

  it('a match frame follows a mask frame exactly when the sum equals target', () => {
    for (const input of ALL.filter((_, k) => k % 5 === 0)) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('mask')) return;
        const matched = frames[k + 1] && beatOf(frames[k + 1]).includes('match');
        expect(matched ? 1 : 0, JSON.stringify(input)).toBe(
          f.meta.vars!.sum === input.target ? 1 : 0,
        );
      });
    }
  });

  it('the test-bit frame (the question) hides the bits; the mask frame after it shows them', () => {
    for (const input of ALL.filter((_, k) => k % 7 === 0)) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('test-bit')) return;
        expect(f.state.values.every((x) => x === '')).toBe(true);
        expect(beatOf(frames[k + 1])).toEqual(['mask']);
      });
    }
  });

  it('the item row is aligned: rows[0] holds the items at offset 0', () => {
    for (const p of entry.presets) {
      for (const f of gen(p.input)) {
        expect(f.state.rows).toEqual([{ label: 'a', values: p.input.items, offset: 0 }]);
      }
    }
  });

  it('beat order per mask and the frame count of the widest input', () => {
    const seq = beats(gen({ items: [4], target: 4 }));
    expect(seq).toEqual(['start', 'test-bit', 'mask', 'test-bit', 'mask', 'match', 'done']);
    expect(gen({ items: [1, 1, 2, 2], target: 3 })).toHaveLength(2 + 16 * 2 + 4);
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
