import { describe, expect, it } from 'vitest';
import { nQueensEntry as entry } from '@/lib/subjects/cp/catalog/n-queens';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { n: 1 | 3 | 4 | 5 };
type S = { rows: number; cols: number; cells: string[][] };

const gen = (input: In, locale = 'vi-VN'): readonly Frame<S>[] =>
  steps<In, S>(entry, input, { locale });
const beats = (frames: readonly Frame<S>[]): string[] => frames.flatMap(beatOf);
const ALL: In[] = [{ n: 1 }, { n: 3 }, { n: 4 }, { n: 5 }];

/** Independent oracle: does any column permutation give a placement without attacks? */
function solvable(n: number): boolean {
  const ok = (cols: number[]) =>
    cols.every((c, r) => cols.every((d, q) => q <= r || Math.abs(r - q) !== Math.abs(c - d)));
  const go = (rest: number[], acc: number[]): boolean =>
    rest.length === 0
      ? ok(acc)
      : rest.some((c, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, c]));
  return go(
    Array.from({ length: n }, (_, i) => i),
    [],
  );
}
const queensOf = (f: Frame<S>): [number, number][] =>
  f.state.cells.flatMap((row, r) =>
    row.flatMap((x, c) => (x === 'Q' ? [[r, c] as [number, number]] : [])),
  );
const attacked = (qs: [number, number][], r: number, c: number): boolean =>
  qs.some(([qr, qc]) => qc === c || Math.abs(qr - r) === Math.abs(qc - c));

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t2-backtracking'],
  maxFrames: 120,
  presets: ['n1', 'n3-none', 'n4', 'n5'],
  beats: ['start', 'try', 'conflict-check', 'place', 'backtrack', 'solution', 'done'],
  required: ['start', 'done'],
  pseudoLines: 6,
  vars: ['n', 'r', 'c', 'rr', 'qc', 'pr', 'pc', 'cols', 'attempts'],
  pointers: [],
  allow: [0],
  extra: ALL,
  bad: [{ n: 2 }, { n: 6 }, { n: 0 }, { n: 7 }, { n: '4' }, { n: 4, extra: 1 }, {}],
  predict: {
    'conflict-check': {
      options: 2,
      expected: (_input, frames, idx) => {
        const f = frames[idx];
        const { r, c } = f.meta.vars as { r: number; c: number };
        return attacked(queensOf(f as Frame<S>), r, c) ? 0 : 1;
      },
    },
  },
});

describe('n-queens: result', () => {
  it('finds a solution exactly when one exists, and the solution is valid', () => {
    for (const input of ALL) {
      const frames = gen(input);
      const has = beats(frames).includes('solution');
      expect(has, `n=${input.n}`).toBe(solvable(input.n));
      if (!has) continue;
      const sol = frames.find((f) => beatOf(f).includes('solution'))!;
      const qs = queensOf(sol);
      expect(qs).toHaveLength(input.n);
      qs.forEach(([r, c], k) =>
        qs.slice(k + 1).forEach(([r2, c2]) => {
          expect(c).not.toBe(c2);
          expect(Math.abs(r - r2)).not.toBe(Math.abs(c - c2));
        }),
      );
      expect(new Set(qs.map(([r]) => r)).size).toBe(input.n);
    }
  });

  it('n = 3 backtracks all the way: no solution, queens removed, last frame is empty', () => {
    const frames = gen({ n: 3 });
    expect(beats(frames)).toContain('backtrack');
    expect(beats(frames)).not.toContain('solution');
    expect(queensOf(frames.at(-1)!)).toEqual([]);
    expect(frames.at(-1)!.meta.explanation).toMatch(/không có cách/);
  });

  it('every placed queen was safe, and every conflict frame explains a real attack', () => {
    for (const input of ALL) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (beatOf(f).includes('place')) {
          const { r, c } = f.meta.vars as { r: number; c: number };
          const before = queensOf(frames[k - 1]);
          expect(attacked(before, r, c), `${input.n}@${k}`).toBe(false);
          expect(queensOf(f)).toHaveLength(before.length + 1);
        }
        const v = f.meta.vars as { r: number; c: number; rr?: number; qc?: number };
        if (v.rr !== undefined) {
          const qs = queensOf(f);
          expect(qs).toContainEqual([v.rr, v.qc]);
          expect(attacked([[v.rr, v.qc!]], v.r, v.c)).toBe(true);
        }
      });
    }
  });

  it('backtrack lifts exactly the queen of the row above', () => {
    for (const input of ALL) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('backtrack')) return;
        const v = f.meta.vars as { pr: number; pc: number };
        expect(queensOf(frames[k - 1])).toContainEqual([v.pr, v.pc]);
        expect(queensOf(f)).not.toContainEqual([v.pr, v.pc]);
        expect(queensOf(f)).toHaveLength(queensOf(frames[k - 1]).length - 1);
      });
    }
  });

  it('the conflict-check frame (the question) shows no dimmed cells and no queen change', () => {
    for (const input of ALL) {
      const frames = gen(input);
      frames.forEach((f, k) => {
        if (!beatOf(f).includes('conflict-check')) return;
        expect(Object.values(f.meta.highlights ?? {})).not.toContain('muted');
        expect(queensOf(f)).toEqual(queensOf(frames[k - 1]));
      });
    }
  });

  it('cell checks: 1, 18, 26 and 15 for n = 1, 3, 4, 5; frames fit maxFrames', () => {
    const attempts = (n: 1 | 3 | 4 | 5) => gen({ n }).at(-1)!.meta.vars!.attempts;
    expect([1, 3, 4, 5].map((n) => attempts(n as 1 | 3 | 4 | 5))).toEqual([1, 18, 26, 15]);
    for (const input of ALL) expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });

  it('the board is square and n × n on every frame', () => {
    for (const input of ALL)
      for (const f of gen(input)) {
        expect(f.state.rows).toBe(input.n);
        expect(f.state.cols).toBe(input.n);
        expect(f.state.cells).toHaveLength(input.n);
        for (const row of f.state.cells) expect(row).toHaveLength(input.n);
      }
  });
});
