import { describe, expect, it } from 'vitest';
import { kmpEntry as entry } from '@/lib/subjects/cp/catalog/kmp';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { text: string; pattern: string };
type S = {
  values: string[];
  mode: 'cells';
  rows: { label: string; values: (number | string | null)[]; offset: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const naive = ({ text, pattern }: In): number[] => {
  const out: number[] = [];
  for (let i = 0; i + pattern.length <= text.length; i++)
    if (text.startsWith(pattern, i)) out.push(i);
  return out;
};
/** Independent failure function: longest proper prefix that is a suffix, by brute force. */
const failOf = (p: string): number[] =>
  Array.from({ length: p.length }, (_, i) => {
    const s = p.slice(0, i + 1);
    for (let l = s.length - 1; l > 0; l--) if (s.slice(0, l) === s.slice(s.length - l)) return l;
    return 0;
  });
function* words(max: number): Generator<string> {
  let level = [''];
  for (let len = 1; len <= max; len++) {
    level = level.flatMap((w) => ['a', 'b'].map((c) => w + c));
    yield* level;
  }
}
const FAMILY: In[] = [];
for (const text of words(8))
  for (const pattern of words(4)) if (pattern.length <= text.length) FAMILY.push({ text, pattern });
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t4-string-advanced'],
  maxFrames: 60,
  presets: ['twice', 'none', 'whole', 'periodic'],
  beats: ['start', 'build-fail', 'match', 'jump', 'found', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['p', 't', 'i', 'pre', 'f', 'c', 'j0', 'j', 's', 'm', 'm1', 'pos', 'count'],
  pointers: ['i'],
  allow: [0, 1],
  extra: FAMILY.filter((_, k) => k % 97 === 0),
  bad: [
    { text: 'ab', pattern: 'abc' },
    { text: '', pattern: 'a' },
    { text: 'a', pattern: '' },
    { text: 'abababababab', pattern: 'ababab' },
    { text: 'ababababababa', pattern: 'a' },
    { text: 'abc', pattern: 'a' },
    { text: 'ab', pattern: 'A' },
    { text: 'ab', pattern: 'a', extra: 1 },
    { text: 'ab' },
  ],
  predict: {
    'build-fail': {
      options: 4,
      expected: (input, frames, idx) => {
        const i = (frames[idx].meta.pointers as { i: number }).i;
        return Math.min(failOf(input.pattern)[i], 3);
      },
    },
    jump: { options: 3, expected: () => 1 },
  },
});

describe('kmp: result', () => {
  it('every occurrence is found (naive oracle), overlaps included', () => {
    for (const input of FAMILY.filter((_, k) => k % 3 === 0)) {
      const frames = gen(input);
      const pos = frames
        .filter((f) => beatOf(f).includes('found'))
        .map((f) => f.meta.vars!.pos as number);
      expect(pos, JSON.stringify(input)).toEqual(naive(input));
      expect(frames.at(-1)!.meta.vars!.count).toBe(naive(input).length);
    }
  });

  it('the fail row equals the brute-force failure function once built', () => {
    for (const input of FAMILY.filter((_, k) => k % 7 === 0)) {
      const f = gen(input).find(
        (x) =>
          beatOf(x).includes('match') ||
          beatOf(x).includes('found') ||
          x.state.rows[1].values.every((v) => v !== null),
      )!;
      expect(f.state.rows[1].values, JSON.stringify(input)).toEqual(failOf(input.pattern));
    }
  });

  it('the text pointer only moves forward (i never decreases)', () => {
    for (const input of FAMILY.slice(0, 300)) {
      let prev = -1;
      for (const f of gen(input)) {
        const i = (f.meta.pointers as { i?: number }).i;
        if (i === undefined) continue;
        if (beatOf(f).includes('build-fail') || f.meta.codeLine === 2) continue;
        expect(i).toBeGreaterThanOrEqual(prev);
        prev = i;
      }
    }
  });

  it('presets: 2, 0, 1 and 4 occurrences', () => {
    expect(PRESETS.map((p) => naive(p).length)).toEqual([2, 0, 1, 4]);
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.count)).toEqual([2, 0, 1, 4]);
  });

  it('a jump question names no result; the next frame shows j already lowered', () => {
    for (const input of FAMILY.slice(0, 200)) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('jump')) return;
        expect(f.meta.vars).not.toHaveProperty('j0');
        expect(frames[k + 1].meta.vars).toHaveProperty('j0');
      });
    }
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  }, 60_000);
});
