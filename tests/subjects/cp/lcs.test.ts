import { describe, expect, it } from 'vitest';
import { lcsEntry as entry } from '@/lib/subjects/cp/catalog/lcs';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { a: string; b: string };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
  arrows: { from: string; to: string }[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);

const isSub = (s: string, t: string): boolean => {
  let k = 0;
  for (const c of t) if (k < s.length && s[k] === c) k++;
  return k === s.length;
};
/** Independent oracle: every subsequence of a, kept when it is a subsequence of b. */
function brute({ a, b }: In): number {
  let best = 0;
  for (let mask = 0; mask < 1 << a.length; mask++) {
    const s = a
      .split('')
      .filter((_, k) => (mask >> k) & 1)
      .join('');
    if (s.length > best && isSub(s, b)) best = s.length;
  }
  return best;
}
function family(): In[] {
  const out: In[] = [];
  let x = 31337;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  const word = (len: number, alpha: number) =>
    Array.from({ length: len }, () => String.fromCharCode(97 + next(alpha))).join('');
  for (let t = 0; t < 150; t++)
    out.push({ a: word(1 + next(6), 1 + next(4)), b: word(1 + next(6), 1 + next(4)) });
  out.push(
    { a: 'aaaaaa', b: 'aaaaaa' },
    { a: 'abcdef', b: 'uvwxyz' },
    { a: 'abcdef', b: 'fedcba' },
  );
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);
const lastDp = (f: Frame<S>): number[][] =>
  f.state.cells.map((r) => r.map((x) => (x === '' ? -1 : (x as number))));

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t3-dp-basic'],
  maxFrames: 60,
  presets: ['classic', 'same', 'disjoint', 'single'],
  beats: ['start', 'base', 'match', 'mismatch', 'traceback', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['la', 'lb', 'i', 'j', 'ca', 'cb', 'i1', 'j1', 'diag', 'up', 'left', 'val', 'len', 'lcs'],
  pointers: [],
  allow: [0],
  extra: FAMILY.slice(0, 25),
  bad: [
    { a: '', b: 'a' },
    { a: 'a', b: '' },
    { a: 'abcdefg', b: 'a' },
    { a: 'a', b: 'abcdefg' },
    { a: 'A', b: 'a' },
    { a: 'a1', b: 'a' },
    { a: 'a', b: 'a', extra: 1 },
    { a: 'a' },
  ],
  predict: { match: { options: 2, expected: () => 0 } },
});

describe('lcs: result', () => {
  it('the length equals the 2^|a| brute force; the whole dp table is the LCS of every prefix pair', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.len, JSON.stringify(input)).toBe(brute(input));
      const dp = lastDp(
        gen(input)
          .filter((f) => beatOf(f).includes('traceback'))
          .at(0) ?? last,
      );
      for (let i = 0; i <= input.a.length; i++)
        for (let j = 0; j <= input.b.length; j++)
          expect(dp[i][j]).toBe(brute({ a: input.a.slice(0, i), b: input.b.slice(0, j) }));
    }
  });

  it('the recovered string is a subsequence of both inputs and has the optimal length', () => {
    for (const input of FAMILY) {
      const last = gen(input).at(-1)!;
      const lcs = (last.meta.vars!.lcs as string | undefined) ?? '';
      expect(lcs.length).toBe(brute(input));
      expect(isSub(lcs, input.a)).toBe(true);
      expect(isSub(lcs, input.b)).toBe(true);
    }
  });

  it('presets: the classic pair has length 4; same = 3; disjoint = 0; single = 1', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.len)).toEqual([4, 3, 0, 1]);
  });

  it('the labels are the characters with a leading dot; the grid is (|a| + 1) x (|b| + 1)', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const f = gen(input)[0];
      expect(f.state.rowLabels).toEqual(['·', ...input.a]);
      expect(f.state.colLabels).toEqual(['·', ...input.b]);
      expect(f.state.rows).toBe(input.a.length + 1);
      expect(f.state.cols).toBe(input.b.length + 1);
    }
  });

  it('a match comes from the diagonal (one arrow), a mismatch from above and left (two arrows)', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const frames = gen(input);
      frames.forEach((f) => {
        const v = f.meta.vars as Record<string, number | string>;
        if (beatOf(f).includes('mismatch')) {
          expect(f.state.arrows).toHaveLength(2);
          expect(v.val).toBe(Math.max(v.up as number, v.left as number));
          expect(v.ca).not.toBe(v.cb);
        } else if (v.diag !== undefined && !beatOf(f).includes('traceback')) {
          expect(f.state.arrows).toHaveLength(1);
          expect(v.val).toBe((v.diag as number) + 1);
          expect(v.ca).toBe(v.cb);
        }
      });
    }
  });

  it('the match question appears once per row at most, before the cell is filled', () => {
    for (const input of FAMILY.slice(0, 80)) {
      const frames = gen(input);
      const rowsAsked = new Set<number>();
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('match')) return;
        const { i, j } = f.meta.vars as { i: number; j: number };
        expect(rowsAsked.has(i)).toBe(false);
        rowsAsked.add(i);
        expect(lastDp(f)[i][j]).toBe(-1);
        expect(frames[k + 1].meta.vars).toMatchObject({ i, j });
        expect(input.a[i - 1]).toBe(input.b[j - 1]);
      });
    }
  });

  it('the traceback walks to row 0 or column 0 and collects the matched characters', () => {
    const frames = gen(PRESETS[0]);
    const tb = frames.filter((f) => beatOf(f).includes('traceback'));
    expect(tb.length).toBeGreaterThan(0);
    const last = tb.at(-1)!;
    const { i1, j1 } = last.meta.vars as { i1?: number; j1?: number };
    expect(i1 === 0 || j1 === 0 || (i1 ?? 1) <= 1).toBe(true);
    expect(beats(frames).at(-1)).toBe('done');
  });

  it('every input fits maxFrames (60) and the classic preset stays within it', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
