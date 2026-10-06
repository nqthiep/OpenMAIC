import { describe, expect, it } from 'vitest';
import { stringScanEntry as entry } from '@/lib/subjects/cp/catalog/string-scan';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { s: string };
type S = { values: string[]; mode: 'cells' };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const isPal = (s: string): boolean => s === s.split('').reverse().join('');

/** Every string over {a, b, c} up to length 6, plus 12-letter edge cases. */
function* strings(): Generator<In> {
  let level = [''];
  for (let len = 1; len <= 6; len++) {
    level = level.flatMap((p) => ['a', 'b', 'c'].map((c) => p + c));
    for (const s of level) yield { s };
  }
}
const ALL = [...strings()];
const LONG: In[] = [
  { s: 'abcdefggfedcba'.slice(0, 12) },
  { s: 'abcdeffedcba' },
  { s: 'abcdefghijkl' },
  { s: 'zzzzzzzzzzzz' },
];

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t1-string'],
  maxFrames: 20,
  presets: ['odd', 'even', 'not', 'single', 'near'],
  beats: ['start', 'compare', 'move', 'mismatch', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['i', 'j', 'ci', 'cj'],
  pointers: ['i', 'j'],
  extra: [...LONG, ...ALL.filter((x) => x.s.length <= 3)],
  bad: [
    { s: '' },
    { s: 'abcdefghijklm' },
    { s: 'Abc' },
    { s: 'ab1' },
    { s: 'a b' },
    { s: 5 },
    { s: 'ab', extra: 1 },
    {},
  ],
  predict: {
    compare: {
      options: 2,
      expected: (input, frames, idx) => {
        const { i, j } = frames[idx].meta.vars as { i: number; j: number };
        return input.s[i] === input.s[j] ? 0 : 1;
      },
    },
  },
});

describe('string-scan: result', () => {
  it('agrees with the reversed-string oracle (exhaustive up to length 6)', () => {
    for (const input of [...ALL, ...LONG]) {
      const frames = gen(input);
      expect(beats(frames).includes('mismatch'), input.s).toBe(!isPal(input.s));
      expect(frames.at(-1)!.meta.explanation).toMatch(
        isPal(input.s) ? /đối xứng\.$/ : /không đối xứng\.$/,
      );
    }
  });

  it('the number of compares is at most floor(n / 2); pointers cross exactly when it is a palindrome', () => {
    for (const input of [...ALL, ...LONG]) {
      const frames = gen(input);
      const compares = beats(frames).filter((b) => b === 'compare').length;
      expect(compares).toBeLessThanOrEqual(Math.floor(input.s.length / 2));
      if (isPal(input.s)) expect(compares).toBe(Math.floor(input.s.length / 2));
    }
  });

  it('beat order: compare is followed by move or mismatch; presets', () => {
    for (const input of ALL.filter((_, k) => k % 3 === 0)) {
      const seq = beats(gen(input));
      seq.forEach((b, k) => {
        if (b === 'compare') expect(['move', 'mismatch']).toContain(seq[k + 1]);
      });
    }
    expect(beats(gen({ s: 'a' }))).toEqual(['start', 'done']);
    expect(beats(gen({ s: 'abca' }))).toEqual([
      'start',
      'compare',
      'move',
      'compare',
      'mismatch',
      'done',
    ]);
  });

  it('the matched part is marked visited, the middle stays active', () => {
    const frames = gen({ s: 'racecar' });
    const move = frames.filter((f) => beatOf(f).includes('move'))[1];
    expect(move.meta.highlights).toMatchObject({
      '0': 'visited',
      '1': 'visited',
      '2': 'active',
      '3': 'active',
      '4': 'active',
      '5': 'visited',
      '6': 'visited',
    });
  });

  it('the compare frame (the question) shows both characters but no verdict', () => {
    for (const input of ALL.slice(0, 80)) {
      for (const f of gen(input, 'en-US')) {
        if (beatOf(f).includes('compare'))
          expect(f.meta.explanation).not.toMatch(/match|differ|equal|≠/);
      }
    }
  });

  it('frames <= 2 * floor(n / 2) + 3 and within maxFrames', () => {
    for (const input of [...ALL, ...LONG]) {
      expect(gen(input).length).toBeLessThanOrEqual(2 * Math.floor(input.s.length / 2) + 3);
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
    }
  });
});
