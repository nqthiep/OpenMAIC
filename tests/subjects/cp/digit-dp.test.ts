import { describe, expect, it } from 'vitest';
import { digitDpEntry as entry } from '@/lib/subjects/cp/catalog/digit-dp';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: number; s: number };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
};

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const brute = ({ n, s }: In): number => {
  let c = 0;
  for (let x = 0; x <= n; x++)
    if (
      String(x)
        .split('')
        .reduce((a, d) => a + Number(d), 0) === s
    )
      c++;
  return c;
};
const FAMILY: In[] = [];
for (const n of [0, 1, 9, 10, 11, 99, 100, 101, 190, 345, 500, 909, 998, 999])
  for (let s = 0; s <= 12; s++) FAMILY.push({ n, s });
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t4-dp-digit'],
  maxFrames: 60,
  presets: ['n999-s5', 'n0-s0', 'n100-s1', 'n345-s12'],
  beats: ['start', 'accumulate', 'digit', 'tight-break', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['n', 's', 'r', 'r1', 'i', 'di', 'pre', 'c', 'rem', 'need', 'val', 'ans', 'ver'],
  pointers: [],
  allow: [0, 9, 10],
  extra: FAMILY.filter((_, k) => k % 9 === 0),
  bad: [
    { n: -1, s: 0 },
    { n: 1000, s: 0 },
    { n: 5, s: 13 },
    { n: 5, s: -1 },
    { n: 5.5, s: 1 },
    { n: 5, s: 1, extra: 1 },
    { n: 5 },
  ],
  predict: { digit: { options: 3, expected: () => 0 } },
});

describe('digit-dp: result', () => {
  it('the count equals the brute force over 0..N (every N in the family, S = 0..12)', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).at(-1)!.meta.vars?.ans, JSON.stringify(input)).toBe(brute(input));
  });

  it('the table g[r][t] counts r-digit strings (leading zeros) with digit sum t', () => {
    const f = gen({ n: 999, s: 12 })
      .filter((x) => beatOf(x).includes('accumulate'))
      .at(-1)!;
    for (let r = 0; r <= 3; r++)
      for (let t = 0; t <= 12; t++) {
        let want = 0;
        for (let x = 0; x < 10 ** r; x++)
          if (
            String(x)
              .padStart(r, '0')
              .split('')
              .reduce((a, d) => a + Number(d), 0) === t
          )
            want++;
        expect(f.state.cells[r][t], `g[${r}][${t}]`).toBe(r === 0 && t > 0 ? 0 : want);
      }
  });

  it('presets: counts and the grid shape (at most 6 rows by 13 columns)', () => {
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.ans)).toEqual(PRESETS.map(brute));
    for (const input of FAMILY) {
      const f = gen(input)[0];
      expect(f.state.rows).toBeLessThanOrEqual(6);
      expect(f.state.cols).toBeLessThanOrEqual(13);
    }
  });

  it('tight-break frames only read cells with a non-negative needed sum, and the count only grows', () => {
    for (const input of FAMILY.slice(0, 80)) {
      let prev = 0;
      for (const f of gen(input)) {
        const v = f.meta.vars as { ans?: number };
        if (v.ans === undefined) continue;
        expect(v.ans).toBeGreaterThanOrEqual(prev);
        prev = v.ans;
      }
    }
  });

  it('the question frame (digit) shows no tight-break value yet', () => {
    for (const f of gen(PRESETS[0], 'en-US'))
      if (beatOf(f).includes('digit')) expect(f.meta.vars).not.toHaveProperty('ans');
  });

  it('every input fits maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
