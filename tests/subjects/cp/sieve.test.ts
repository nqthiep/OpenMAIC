import { describe, expect, it } from 'vitest';
import { sieveEntry as entry } from '@/lib/subjects/cp/catalog/sieve';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: number };
type S = { rows: number; cols: number; cells: (number | null)[][] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const ALL: In[] = Array.from({ length: 59 }, (_, i) => ({ n: i + 2 }));

/** Independent oracle: trial division. */
const isPrime = (k: number): boolean => {
  if (k < 2) return false;
  for (let d = 2; d < k; d++) if (k % d === 0) return false;
  return true;
};
const at = (n: number, k: number): string => `${Math.floor((k - 1) / 10)},${(k - 1) % 10}`;

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t2-number-basics'],
  maxFrames: 30,
  presets: ['n30', 'n2', 'n49', 'n60'],
  beats: ['start', 'next-prime', 'cross', 'stop', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'prev', 'p', 'from', 'new', 'pp', 'count'],
  pointers: [],
  allow: [2],
  extra: ALL,
  bad: [{ n: 1 }, { n: 61 }, { n: 0 }, { n: 2.5 }, { n: '30' }, { n: 30, extra: 1 }, {}],
  // the sieve starts at p·p, which is not 2p for the odd primes asked about
  predict: { 'next-prime': { options: 2, expected: () => 1 } },
});

describe('sieve: result', () => {
  it('the cells left uncrossed at the end are exactly the primes, for every n', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const last = frames.at(-1)!;
      const prime = Object.entries(last.meta.highlights ?? {})
        .filter(([, k]) => k === 'result')
        .map(([key]) => key);
      const want = Array.from({ length: input.n }, (_, i) => i + 1)
        .filter(isPrime)
        .map((k) => at(input.n, k));
      expect(prime.sort(), `n=${input.n}`).toEqual(want.sort());
      expect(last.meta.vars?.count).toBe(want.length);
    }
  });

  it('the grid is 10 columns wide, ceil(n / 10) rows, cells hold 1..n then null', () => {
    for (const input of ALL) {
      const f = gen(input)[0];
      expect(f.state.cols).toBe(10);
      expect(f.state.rows).toBe(Math.ceil(input.n / 10));
      expect(f.state.cells.flat()).toEqual([
        ...Array.from({ length: input.n }, (_, i) => i + 1),
        ...Array(f.state.rows * 10 - input.n).fill(null),
      ]);
    }
  });

  it('every cross frame crosses only multiples of p from p*p, and nothing prime', () => {
    for (const input of ALL) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('cross')) return;
        const { p, from } = f.meta.vars as { p: number; from: number };
        expect(from).toBe(p * p);
        expect(from).toBeLessThanOrEqual(input.n);
        const before = new Set(
          Object.entries(frames[k - 1].meta.highlights ?? {})
            .filter(([, h]) => h === 'muted')
            .map(([key]) => key),
        );
        for (const [key, h] of Object.entries(f.meta.highlights ?? {})) {
          if (h !== 'muted' || before.has(key)) continue;
          const [r, c] = key.split(',').map(Number);
          const value = r * 10 + c + 1;
          expect(value % p, `${input.n}: ${value}`).toBe(0);
          expect(value).toBeGreaterThanOrEqual(from);
          expect(isPrime(value)).toBe(false);
        }
        expect(f.meta.highlights?.[at(input.n, p)]).toBe('active');
      });
    }
  });

  it('only primes p with p*p <= n are crossed from; the loop stops at the first p with p*p > n', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const crossed = frames.filter((f) => beatOf(f).includes('cross')).map((f) => f.meta.vars!.p);
      const want: number[] = [];
      for (let p = 2; p * p <= input.n; p++) if (isPrime(p)) want.push(p);
      expect(crossed).toEqual(want);
      const stop = frames.find((f) => beatOf(f).includes('stop'))!;
      const sp = stop.meta.vars!.p as number;
      expect(sp * sp).toBeGreaterThan(input.n);
      expect((sp - 1) * (sp - 1)).toBeLessThanOrEqual(Math.max(input.n, 1));
    }
  });

  it('beat sequences of the presets', () => {
    const seq = (n: number) => beats(gen({ n }));
    expect(seq(2)).toEqual(['start', 'stop', 'done']);
    expect(seq(30)).toEqual([
      'start',
      'cross',
      'next-prime',
      'cross',
      'next-prime',
      'cross',
      'stop',
      'done',
    ]);
    expect(seq(49).filter((b) => b === 'cross')).toHaveLength(4);
    expect(seq(60).filter((b) => b === 'cross')).toHaveLength(4);
  });

  it('n = 49: the last prime 7 crosses exactly one new number (49)', () => {
    const frames = gen({ n: 49 });
    const last = frames.filter((f) => beatOf(f).includes('cross')).at(-1)!;
    expect(last.meta.vars).toMatchObject({ p: 7, from: 49, new: 1 });
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });

  it('the next-prime frame (the question) does not cross anything yet', () => {
    for (const input of ALL) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('next-prime')) return;
        const muted = (x: Frame<S>) =>
          Object.values(x.meta.highlights ?? {}).filter((h) => h === 'muted').length;
        expect(muted(f)).toBe(muted(frames[k - 1]));
      });
    }
  });
});
