import { describe, expect, it } from 'vitest';
import { prefixSumEntry as entry } from '@/lib/subjects/cp/catalog/prefix-sum';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { values: number[]; l: number; r: number };
type S = { values: number[]; mode: 'cells'; rows: { label: string; values: (number | null)[] }[] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const direct = ({ values, l, r }: In): number => {
  let s = 0;
  for (let i = l; i <= r; i++) s += values[i];
  return s;
};

/** Every (l, r) over a few arrays, including negatives and the widest numbers. */
const ARRAYS = [
  [7],
  [3, 1],
  [-2, 5, -1],
  [-99, 99, -99, 99],
  [99, 99, 99, 99, 99, 99, 99, 99, 99, 99],
];
function* queries(): Generator<In> {
  for (const values of ARRAYS)
    for (let l = 0; l < values.length; l++)
      for (let r = l; r < values.length; r++) yield { values, l, r };
}

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t1-array-prefix'],
  maxFrames: 40,
  presets: ['basic', 'whole', 'one-cell', 'negative', 'n1'],
  beats: ['start', 'naive', 'build', 'query', 'answer', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['i', 'j', 'pi', 'ai', 'pn', 'l', 'r', 'r1', 'count', 'direct', 'hiP', 'loP', 'total'],
  pointers: ['i', 'l', 'r'],
  extra: [...queries()],
  bad: [
    { values: [1, 2, 3], l: 2, r: 1 },
    { values: [1, 2, 3], l: 0, r: 3 },
    { values: [], l: 0, r: 0 },
    { values: Array.from({ length: 11 }, () => 1), l: 0, r: 1 },
    { values: [100], l: 0, r: 0 },
    { values: [1], l: -1, r: 0 },
    { values: [1], l: 0, r: 10 },
    { values: [1], l: 0, r: 0, extra: 1 },
    { values: [1], l: 0 },
  ],
  predict: { query: { options: 2, expected: () => 0 } },
});

describe('prefix-sum: result and shape', () => {
  it('the answer equals the direct sum, for every query (exhaustive)', () => {
    let runs = 0;
    for (const input of queries()) {
      const frames = gen(input);
      const last = frames[frames.length - 1];
      expect(last.meta.vars?.total).toBe(direct(input));
      const answer = frames[frames.length - 2];
      expect(answer.meta.vars).toMatchObject({ hiP: expect.any(Number), loP: expect.any(Number) });
      expect((answer.meta.vars!.hiP as number) - (answer.meta.vars!.loP as number)).toBe(
        direct(input),
      );
      runs++;
    }
    expect(runs).toBeGreaterThan(40);
  });

  it('the built row P is exactly the prefix sums, with P[0] = 0 and n + 1 cells', () => {
    for (const p of entry.presets) {
      const frames = gen(p.input);
      const rows = frames[frames.length - 1].state.rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].label).toBe('P');
      const want = [0];
      for (const x of p.input.values) want.push(want[want.length - 1] + x);
      expect(rows[0].values).toEqual(want);
    }
  });

  it('P fills left to right: after the build frame i, cells 0..i+1 are set and the rest are null', () => {
    const input = entry.presets[0].input;
    const frames = gen(input);
    frames.forEach((f) => {
      if (!beatOf(f).includes('build')) return;
      const i = f.meta.vars!.i as number;
      f.state.rows[0].values.forEach((v, k) => expect(v === null, `${k}`).toBe(k > i + 1));
    });
  });

  it('beat order: start, naive, one build per element, query, answer, done', () => {
    for (const p of entry.presets) {
      expect(beats(gen(p.input)), p.id).toEqual([
        'start',
        'naive',
        ...Array<string>(p.input.values.length).fill('build'),
        'query',
        'answer',
        'done',
      ]);
    }
  });

  it('the question frame does not show P[l] or the result', () => {
    for (const p of entry.presets) {
      const frames = gen(p.input);
      const q = frames.find((f) => beatOf(f).includes('query'))!;
      expect(q.meta.highlights?.[`r0:${p.input.l}`]).toBeUndefined();
      expect(q.meta.vars).not.toHaveProperty('total');
      expect(q.meta.explanation).not.toContain(String(direct(p.input)) + '.');
    }
  });

  it('frame count is n + 5', () => {
    for (const input of queries()) expect(gen(input).length).toBe(input.values.length + 5);
  });
});
