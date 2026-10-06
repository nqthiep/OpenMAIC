import { describe, expect, it } from 'vitest';
import { hashCountEntry as entry } from '@/lib/subjects/cp/catalog/hash-count';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { s: string };
type S = { values: string[]; mode: 'cells' };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const aux = (f: Frame<S>): string[] => f.meta.aux!.find((a) => a.id === 'count')!.items as string[];

/** Independent oracle: split into characters, count each letter, smallest letter wins ties. */
function oracle(s: string): { best: string; cnt: number; distinct: number } {
  let best = '';
  let cnt = 0;
  let distinct = 0;
  for (const c of 'abcdefghijklmnopqrstuvwxyz') {
    const k = s.split('').filter((x) => x === c).length;
    if (k > 0) distinct++;
    if (k > cnt) {
      best = c;
      cnt = k;
    }
  }
  return { best, cnt, distinct };
}
function* strings(): Generator<In> {
  let level = [''];
  for (let len = 1; len <= 6; len++) {
    level = level.flatMap((p) => ['a', 'b', 'c'].map((c) => p + c));
    for (const s of level) yield { s };
  }
}
const ALL = [...strings()];
const LONG: In[] = [
  { s: 'zyxwvutsrqpo' },
  { s: 'abababababab' },
  { s: 'mississippi' },
  { s: 'zzzzzzzzzzzz' },
];

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t1-hash'],
  maxFrames: 30,
  presets: ['repeat', 'all-same', 'distinct', 'single'],
  beats: ['start', 'read', 'new-key', 'increment', 'max', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'i', 'c', 'k', 'best', 'cnt', 'distinct'],
  pointers: ['i'],
  extra: [...LONG, ...ALL.filter((x) => x.s.length <= 3)],
  bad: [
    { s: '' },
    { s: 'abcdefghijklm' },
    { s: 'A' },
    { s: 'a1' },
    { s: 'a b' },
    { s: 3 },
    { s: 'a', extra: 1 },
    {},
  ],
  predict: {
    read: {
      options: 2,
      expected: (input, frames, idx) => {
        const i = (frames[idx].meta.pointers as { i: number }).i;
        return input.s.slice(0, i).includes(input.s[i]) ? 0 : 1;
      },
    },
  },
});

describe('hash-count: result', () => {
  it('the most frequent character, its count and the distinct count match the oracle', () => {
    for (const input of [...ALL, ...LONG]) {
      const last = gen(input).at(-1)!;
      const want = oracle(input.s);
      expect(last.meta.vars, input.s).toMatchObject(want);
    }
  });

  it('the table lists the counts so far, keys in alphabetical order', () => {
    for (const input of [...ALL.filter((_, k) => k % 4 === 0), ...LONG]) {
      const frames = gen(input);
      frames.forEach((f) => {
        const read = (f.meta.pointers as { i?: number }).i ?? input.s.length;
        const upto = beatOf(f).includes('start')
          ? 0
          : beatOf(f).includes('read')
            ? read
            : beatOf(f).some((b) => b === 'new-key' || b === 'increment')
              ? read + 1
              : read;
        const want = 'abcdefghijklmnopqrstuvwxyz'
          .split('')
          .map(
            (c) =>
              [
                c,
                input.s
                  .slice(0, upto)
                  .split('')
                  .filter((x) => x === c).length,
              ] as const,
          )
          .filter(([, k]) => k > 0)
          .map(([c, k]) => `${c}:${k}`);
        expect(aux(f), `${input.s}/${f.meta.index}`).toEqual(want);
      });
    }
  });

  it('new-key exactly at first occurrences, increment at repeats; one pair of frames per character', () => {
    for (const input of ALL.filter((_, k) => k % 3 === 0)) {
      const seq = beats(gen(input));
      const reads = seq.filter((b) => b === 'read').length;
      expect(reads).toBe(input.s.length);
      expect(seq.filter((b) => b === 'new-key').length).toBe(new Set(input.s).size);
      expect(seq.filter((b) => b === 'increment').length).toBe(
        input.s.length - new Set(input.s).size,
      );
      seq.forEach((b, k) => {
        if (b === 'read') expect(['new-key', 'increment']).toContain(seq[k + 1]);
      });
    }
  });

  it('ties go to the smallest letter', () => {
    expect(gen({ s: 'baab' }).at(-1)!.meta.vars).toMatchObject({ best: 'a', cnt: 2 });
    expect(gen({ s: 'abcdef' }).at(-1)!.meta.vars).toMatchObject({ best: 'a', cnt: 1 });
    expect(gen({ s: 'banana' }).at(-1)!.meta.vars).toMatchObject({ best: 'a', cnt: 3 });
  });

  it('the read frame (the question) does not announce new or repeated', () => {
    for (const input of ALL.slice(0, 80)) {
      for (const f of gen(input, 'en-US')) {
        if (beatOf(f).includes('read')) expect(f.meta.explanation).not.toMatch(/new key|raise/);
      }
    }
  });

  it('frames = 2n + 3 and within maxFrames', () => {
    for (const input of [...ALL, ...LONG]) {
      expect(gen(input)).toHaveLength(2 * input.s.length + 3);
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    }
  });
});
