import { describe, expect, it } from 'vitest';
import { euclidGcdEntry as entry } from '@/lib/subjects/cp/catalog/euclid-gcd';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { a: number; b: number };
type S = {
  values: (number | string)[];
  mode: 'cells';
  rows: { label: string; values: (number | string)[]; offset: number }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

/** Independent oracle: try every number from min(a, b) down. */
function gcdOracle(a: number, b: number): number {
  if (a === 0) return b;
  if (b === 0) return a;
  for (let d = Math.min(a, b); d >= 1; d--) if (a % d === 0 && b % d === 0) return d;
  return 1;
}
/** Every pair on a coarse grid plus the Fibonacci worst case and the edges. */
const PAIRS: In[] = [];
for (let a = 0; a <= 200; a += 7)
  for (let b = 0; b <= 200; b += 9) if (a + b > 0) PAIRS.push({ a, b });
PAIRS.push(
  { a: 144, b: 89 },
  { a: 89, b: 144 },
  { a: 200, b: 200 },
  { a: 200, b: 1 },
  { a: 0, b: 200 },
);

entryContract<In>({
  entry: entry as never,
  visualizer: 'array',
  topics: ['t2-number-basics'],
  maxFrames: 30,
  presets: ['basic', 'coprime', 'b-zero', 'equal', 'a-less'],
  beats: ['start', 'insight', 'mod-step', 'stop', 'done'],
  required: ['start', 'done'],
  pseudoLines: 4,
  vars: ['a', 'b', 'k', 'r', 'a0', 'b0', 'g', 'steps'],
  pointers: [],
  allow: [2],
  extra: PAIRS.filter((_, k) => k % 6 === 0),
  bad: [
    { a: 0, b: 0 },
    { a: 201, b: 1 },
    { a: -1, b: 5 },
    { a: 1.5, b: 5 },
    { a: 5 },
    { a: 5, b: 5, extra: 1 },
  ],
  predict: {
    'mod-step': {
      options: 2,
      expected: (_input, frames, idx) => {
        const { a, b } = frames[idx].meta.vars as { a: number; b: number };
        return a % b === 0 ? 0 : 1;
      },
    },
  },
});

describe('euclid-gcd: result', () => {
  it('the gcd equals the brute-force oracle', () => {
    for (const input of PAIRS) {
      const frames = gen(input);
      const last = frames.at(-1)!;
      expect(last.meta.vars?.g, JSON.stringify(input)).toBe(gcdOracle(input.a, input.b));
      expect(beatOf(last)).toEqual(['done']);
    }
  });

  it('check rejects only (0, 0)', () => {
    expect(validateInput(entry as never, { a: 0, b: 0 }).ok).toBe(false);
    expect(validateInput(entry as never, { a: 0, b: 5 }).ok).toBe(true);
    expect(validateInput(entry as never, { a: 5, b: 0 }).ok).toBe(true);
  });

  it('every step really replaces (a, b) by (b, a mod b); the gcd never changes', () => {
    for (const input of PAIRS) {
      const frames = gen(input);
      const g = gcdOracle(input.a, input.b);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('mod-step')) return;
        const { a, b } = f.meta.vars as { a: number; b: number };
        expect(gcdOracle(a, b)).toBe(g);
        const after = frames[k + 1].meta.vars as { r: number };
        expect(after.r).toBe(a % b);
        expect(frames[k + 1].state.values).toEqual([a, b, a % b]);
      });
    }
  });

  it('the remainder strictly decreases, so the loop ends within 2·log2(max) + 2 steps', () => {
    for (const input of PAIRS) {
      const frames = gen(input);
      const steps = frames.at(-1)!.meta.vars!.steps as number;
      expect(steps).toBeLessThanOrEqual(
        Math.ceil(2 * Math.log2(Math.max(input.a, input.b, 2))) + 2,
      );
    }
    expect(gen({ a: 144, b: 89 }).at(-1)!.meta.vars!.steps).toBe(10);
  });

  it('presets: beats and the first step swaps when a < b', () => {
    const seq = (a: number, b: number) => beats(gen({ a, b }));
    expect(seq(7, 0)).toEqual(['start', 'stop', 'done']);
    expect(seq(12, 12)).toEqual(['start', 'insight', 'mod-step', 'stop', 'done']);
    const frames = gen({ a: 18, b: 48 });
    expect(frames.find((f) => beatOf(f).includes('mod-step'))!.state.values).toEqual([18, 48, '']);
    expect(frames[3].state.values).toEqual([18, 48, 18]); // 18 mod 48 = 18: the pair swaps
    expect(frames[3].meta.explanation).toMatch(/đổi chỗ/);
  });

  it('history rows: one per finished step, at most 8, newest last', () => {
    const frames = gen({ a: 144, b: 89 });
    const last = frames.at(-1)!;
    expect(last.state.rows).toHaveLength(8);
    expect(last.state.rows.at(-1)!.values).toEqual([2, 1, 0]);
    expect(
      gen({ a: 48, b: 18 })
        .at(-1)!
        .state.rows.map((r) => r.values),
    ).toEqual([
      [48, 18, 12],
      [18, 12, 6],
      [12, 6, 0],
    ]);
  });

  it('the question frame does not show the remainder', () => {
    for (const input of PAIRS.slice(0, 40)) {
      for (const f of gen(input)) {
        if (beatOf(f).includes('mod-step')) expect(f.state.values[2]).toBe('');
      }
    }
  });
});
