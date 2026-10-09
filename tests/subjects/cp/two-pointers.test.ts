import { describe, expect, it } from 'vitest';
import { twoPointersEntry as entry } from '@/lib/subjects/cp/catalog/two-pointers';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { values: number[]; target: number };
type S = { values: number[]; mode: 'cells' };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const pairExists = ({ values, target }: In): boolean =>
  values.some((x, i) => values.slice(i + 1).some((y) => x + y === target));
const resultPair = (frames: readonly Frame<S>[]): number[] =>
  Object.entries(frames[frames.length - 1].meta.highlights ?? {})
    .filter(([, k]) => k === 'result')
    .map(([i]) => Number(i));

/** Every increasing subset of 0..width-1 with every target in a small window. */
function* exhaustive(width: number): Generator<In> {
  for (let mask = 3; mask < 1 << width; mask++) {
    const values: number[] = [];
    for (let i = 0; i < width; i++) if (mask & (1 << i)) values.push(i - 2);
    if (values.length < 2) continue;
    for (let target = -6; target <= 2 * width; target++) yield { values, target };
  }
}
const WIDE: In[] = [
  { values: [-99, -98, 98, 99], target: -197 },
  { values: [-99, -98, 98, 99], target: 198 },
  { values: [-99, 99], target: 0 },
  { values: [98, 99], target: -198 },
];

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t1-array-prefix'],
  maxFrames: 30,
  presets: ['middle', 'ends', 'absent', 'n2', 'negative'],
  beats: ['start', 'compare', 'move-right', 'move-left', 'found', 'exhausted', 'done'],
  required: ['start', 'done'],
  pseudoLines: 7,
  vars: ['i', 'j', 'ai', 'aj', 'sum', 'target', 'steps'],
  pointers: ['i', 'j'],
  extra: [...WIDE, ...exhaustive(5)],
  bad: [
    { values: [1], target: 1 },
    { values: [2, 2], target: 4 },
    { values: [3, 2], target: 5 },
    { values: Array.from({ length: 11 }, (_, i) => i), target: 1 },
    { values: [1, 2], target: 199 },
    { values: [100, 101], target: 1 },
    { values: [1, 2], target: 1.5 },
    { values: [1, 2] },
    { values: [1, 2], target: 3, extra: 1 },
  ],
  predict: {
    compare: {
      options: 3,
      expected: (input, frames, idx) => {
        const p = frames[idx].meta.pointers as { i: number; j: number };
        const sum = input.values[p.i] + input.values[p.j];
        return sum < input.target ? 0 : sum > input.target ? 1 : 2;
      },
    },
  },
});

describe('two-pointers: result', () => {
  it('finds a valid pair exactly when one exists (exhaustive)', () => {
    let runs = 0;
    for (const input of [...exhaustive(7), ...WIDE]) {
      const frames = gen(input);
      const pair = resultPair(frames);
      if (pairExists(input)) {
        expect(pair, JSON.stringify(input)).toHaveLength(2);
        const [i, j] = pair;
        expect(i).toBeLessThan(j);
        expect(input.values[i] + input.values[j]).toBe(input.target);
      } else {
        expect(pair, JSON.stringify(input)).toEqual([]);
      }
      runs++;
    }
    expect(runs).toBeGreaterThan(1000);
  });

  it('preset beat sequences', () => {
    const seq = (id: string) => beats(gen(entry.presets.find((p) => p.id === id)!.input));
    expect(seq('ends')).toEqual(['start', 'compare', 'found', 'done']);
    expect(seq('n2')).toEqual(['start', 'compare', 'found', 'done']);
    expect(seq('middle')).toEqual([
      'start',
      'compare',
      'move-left',
      'compare',
      'move-right',
      'compare',
      'move-left',
      'compare',
      'move-right',
      'compare',
      'found',
      'done',
    ]);
    const absent = seq('absent');
    expect(absent.slice(-1)).toEqual(['done']);
    expect(absent).not.toContain('found');
  });

  it('exactly one of found / miss; a compare is always followed by a move or found', () => {
    for (const input of [...exhaustive(5), ...WIDE]) {
      const seq = beats(gen(input));
      seq.forEach((b, k) => {
        if (b === 'compare') expect(['move-left', 'move-right', 'found']).toContain(seq[k + 1]);
      });
      expect(seq.filter((b) => b === 'found').length).toBe(pairExists(input) ? 1 : 0);
    }
  });

  it('pointers stay inside the array and i < j on every compare frame', () => {
    for (const input of [...exhaustive(6), ...WIDE]) {
      for (const f of gen(input)) {
        const { i, j } = f.meta.pointers as { i: number; j: number };
        expect(i).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThanOrEqual(input.values.length - 1);
        if (beatOf(f).includes('compare')) expect(i).toBeLessThan(j);
      }
    }
  });

  it('the compare frame (the question) shows the sum but no verdict', () => {
    for (const p of entry.presets) {
      for (const f of gen(p.input, 'en-US')) {
        if (!beatOf(f).includes('compare')) continue;
        expect(f.meta.explanation).not.toMatch(/too|smaller|bigger|found|equals|move/);
      }
    }
  });

  it('every comparison removes one element: frames <= 2n + 1 (n - 1 moves + found/miss + done)', () => {
    for (const input of [...exhaustive(6), ...WIDE]) {
      expect(gen(input).length).toBeLessThanOrEqual(2 * input.values.length + 1);
    }
  });
});
