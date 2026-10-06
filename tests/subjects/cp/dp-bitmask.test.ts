import { describe, expect, it } from 'vitest';
import { dpBitmaskEntry as entry } from '@/lib/subjects/cp/catalog/dp-bitmask';
import { validateInput } from '@/lib/tutor/catalog/validate';
import { steps } from '@/lib/tutor/engine/generate';
import type { Frame } from '@/lib/tutor/engine/types';
import { beatOf, entryContract } from './contract';

type In = { d: number[][] };
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

/** Independent oracle: every order of nodes 1..n-1. */
function brute(d: number[][]): number {
  const n = d.length;
  let best = Infinity;
  const go = (rest: number[], last: number, cost: number): void => {
    if (rest.length === 0) {
      best = Math.min(best, cost + d[last][0]);
      return;
    }
    rest.forEach((v, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], v, cost + d[last][v]));
  };
  go(
    Array.from({ length: n - 1 }, (_, i) => i + 1),
    0,
    0,
  );
  return best;
}
function family(): In[] {
  const out: In[] = [];
  let x = 909;
  const next = (mod: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % mod;
  };
  for (let t = 0; t < 120; t++) {
    const n = 2 + next(3);
    const d = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 0 : next(21))),
    );
    out.push({ d });
  }
  out.push({
    d: [
      [0, 20, 20, 20],
      [20, 0, 20, 20],
      [20, 20, 0, 20],
      [20, 20, 20, 0],
    ],
  });
  return out;
}
const FAMILY = family();
const PRESETS = entry.presets.map((p) => p.input as In);

entryContract<In>({
  entry: entry as never,
  visualizer: 'grid',
  topics: ['t4-dp-bitmask'],
  maxFrames: 80,
  presets: ['n4', 'n3', 'n2', 'n4-asym'],
  beats: ['start', 'base', 'transition', 'close-tour', 'done'],
  required: ['start', 'done'],
  pseudoLines: 5,
  vars: ['n', 'mb', 'nb', 'v', 'u', 'cost', 'duv', 'nd', 'old', 'fb', 'dv', 'dv0', 'total', 'best'],
  pointers: [],
  allow: [0, 2],
  extra: FAMILY.slice(0, 20),
  bad: [
    { d: [[0]] },
    { d: [[0, 1], [1]] },
    {
      d: [
        [0, 1],
        [1, 0],
        [2, 2],
      ],
    },
    {
      d: [
        [0, 1, 2],
        [1, 0],
      ],
    },
    {
      d: [
        [1, 1],
        [1, 0],
      ],
    },
    {
      d: [
        [0, 21],
        [1, 0],
      ],
    },
    {
      d: [
        [0, -1],
        [1, 0],
      ],
    },
    { d: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0)) },
    {
      d: [
        [0, 1],
        [1, 0],
      ],
      extra: 1,
    },
    {},
  ],
  predict: { transition: { options: 3, expected: () => 0 } },
});

describe('dp-bitmask: result', () => {
  it('the tour cost equals the brute force over all orders', () => {
    for (const input of [...FAMILY, ...PRESETS]) {
      const last = gen(input).at(-1)!;
      expect(last.meta.vars?.best, JSON.stringify(input)).toBe(brute(input.d));
    }
  });

  it('presets: 18 (3 nodes), 12 (2 nodes) and the 4-node optima, all matching the brute force', () => {
    expect(brute(PRESETS[1].d)).toBe(18);
    expect(brute(PRESETS[2].d)).toBe(12);
    expect(PRESETS.map((p) => gen(p).at(-1)!.meta.vars!.best)).toEqual(
      PRESETS.map((p) => brute(p.d)),
    );
  });

  it('every dp[mask][v] at the end is the best cost over orders of exactly the nodes in mask', () => {
    for (const input of FAMILY.slice(0, 40)) {
      const frames = gen(input);
      const n = input.d.length;
      const lastTransition = [...frames].reverse().find((f) => f.state.arrows.length > 0)!;
      lastTransition.state.cells.forEach((row, mask) => {
        row.forEach((cell, v) => {
          if (!(mask & 1) || !((mask >> v) & 1)) return;
          // independent: best path 0 -> ... -> v through exactly the nodes of mask
          const others = Array.from({ length: n }, (_, i) => i).filter(
            (i) => i !== 0 && i !== v && (mask >> i) & 1,
          );
          let best = Infinity;
          const go = (rest: number[], last: number, cost: number): void => {
            if (rest.length === 0) {
              best = Math.min(best, cost + (v === 0 ? 0 : input.d[last][v]));
              return;
            }
            rest.forEach((u, i) =>
              go([...rest.slice(0, i), ...rest.slice(i + 1)], u, cost + input.d[last][u]),
            );
          };
          if (v === 0) {
            if (mask === 1) best = 0;
          } else go(others, 0, 0);
          expect(cell, `${JSON.stringify(input)} mask ${mask} v ${v}`).toBe(
            best === Infinity ? '∞' : best,
          );
        });
      });
    }
  });

  it('row labels are binary masks of length n (bit v = node v); column labels are the nodes', () => {
    for (const input of FAMILY.slice(0, 20)) {
      const n = input.d.length;
      const f = gen(input)[0];
      expect(f.state.rows).toBe(1 << n);
      expect(f.state.cols).toBe(n);
      expect(f.state.rowLabels[5 & ((1 << n) - 1)]).toBe(
        (5 & ((1 << n) - 1)).toString(2).padStart(n, '0'),
      );
      expect(f.state.colLabels).toEqual(Array.from({ length: n }, (_, v) => String(v)));
    }
  });

  it('each transition frame has one arrow from (mask, v) to (mask | 1 << u, u); never to a visited node', () => {
    for (const input of FAMILY.slice(0, 40)) {
      for (const f of gen(input)) {
        if (f.state.arrows.length === 0) continue;
        const { u, v } = f.meta.vars as { u: number; v: number };
        const [from, to] = [f.state.arrows[0].from, f.state.arrows[0].to].map((k) =>
          k.split(',').map(Number),
        );
        expect(f.state.arrows).toHaveLength(1);
        expect(from[0] & (1 << u)).toBe(0);
        expect(to[0]).toBe(from[0] | (1 << u));
        expect([from[1], to[1]]).toEqual([v, u]);
      }
    }
  });

  it('transitions: 15 result frames for n = 4 (the reachable states), 2 question frames in total', () => {
    const frames = gen(PRESETS[0]);
    expect(frames.filter((f) => f.state.arrows.length > 0)).toHaveLength(15);
    expect(beats(frames).filter((b) => b === 'transition')).toHaveLength(2);
    expect(beats(frames).filter((b) => b === 'close-tour')).toHaveLength(3);
  });

  it('check() needs a square matrix with a zero diagonal', () => {
    const v = (x: unknown) => validateInput(entry as never, x).ok;
    expect(
      v({
        d: [
          [0, 1],
          [1, 0],
        ],
      }),
    ).toBe(true);
    expect(v({ d: [[0, 1], [1]] })).toBe(false);
    expect(
      v({
        d: [
          [1, 1],
          [1, 0],
        ],
      }),
    ).toBe(false);
  });

  it('the transition question frame hides the target cell and the new mask', () => {
    for (const f of gen(PRESETS[0], 'en-US')) {
      if (beatOf(f).includes('transition')) {
        expect(f.state.arrows).toEqual([]);
        expect(f.meta.vars).not.toHaveProperty('nb');
      }
    }
  });

  it('frame counts stay within maxFrames', () => {
    for (const input of [...FAMILY, ...PRESETS])
      expect(gen(input).length).toBeLessThanOrEqual(entry.maxFrames);
  });
});
