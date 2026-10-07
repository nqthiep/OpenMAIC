import { describe, expect, it } from 'vitest';
import tilingColoring, {
  colourCounts,
  expectedDisplay,
  isValidTiling,
  removedCells,
  tilingColoringEntry as entry,
  tilingFor,
} from '@/lib/subjects/math/clips/tiling-coloring';
import { clipContract } from './clip-contract';

type In = { n: 4 | 6 | 8; removed: 'opposite-corners' | 'adjacent' };

const sweep: In[] = [];
for (const n of [4, 6, 8] as const)
  for (const removed of ['opposite-corners', 'adjacent'] as const) sweep.push({ n, removed });

/** independent: backtracking search for a domino tiling of the board without the two cells */
function hasTiling(n: number, removed: [number, number][]): boolean {
  const filled = Array.from({ length: n }, () => Array<boolean>(n).fill(false));
  for (const [r, c] of removed) filled[r][c] = true;
  const go = (): boolean => {
    let r = -1;
    let c = -1;
    outer: for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if (!filled[y][x]) {
          r = y;
          c = x;
          break outer;
        }
    if (r < 0) return true;
    filled[r][c] = true;
    if (c + 1 < n && !filled[r][c + 1]) {
      filled[r][c + 1] = true;
      if (go()) return true;
      filled[r][c + 1] = false;
    }
    if (r + 1 < n && !filled[r + 1][c]) {
      filled[r + 1][c] = true;
      if (go()) return true;
      filled[r + 1][c] = false;
    }
    filled[r][c] = false;
    return false;
  };
  return go();
}

clipContract<In>({
  module: tilingColoring,
  presets: ['n8-opposite', 'n4-opposite', 'n6-adjacent', 'n8-adjacent'],
  chapters: [
    { id: 'board', range: [8, 12] },
    { id: 'color', range: [10, 15] },
    { id: 'count', range: [12, 16] },
    { id: 'conclude', range: [10, 14] },
  ],
  bad: [
    { n: 5, removed: 'adjacent' },
    { n: 2, removed: 'adjacent' },
    { n: 10, removed: 'adjacent' },
    { n: 8, removed: 'diagonal' },
    { n: '8', removed: 'adjacent' },
    { n: 8 },
    { removed: 'adjacent' },
    { n: 8, removed: 'adjacent', extra: 1 },
    null,
    8,
  ],
  edges: sweep,
  display: ({ n, removed }) => {
    // count cell by cell with the colour rule written differently: black iff row and column have the same parity
    const rem = removed === 'opposite-corners' ? [`0,0`, `${n - 1},${n - 1}`] : ['0,0', '0,1'];
    let black = 0;
    let white = 0;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (rem.includes(`${r},${c}`)) continue;
        if (r % 2 === c % 2) black++;
        else white++;
      }
    return { black, white };
  },
  sweep,
});

describe('tiling-coloring: specifics', () => {
  it('the presets show the counts worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { black: 30, white: 32 }, // 8 × 8 without two black corners
      { black: 6, white: 8 }, // 4 × 4
      { black: 17, white: 17 }, // 6 × 6 without one black and one white cell
      { black: 31, white: 31 },
    ]);
  });

  it('no domino tiling exists exactly when the counts differ (brute force on 4 × 4 and 6 × 6)', () => {
    for (const n of [4, 6] as const) {
      for (const removed of ['opposite-corners', 'adjacent'] as const) {
        const i: In = { n, removed };
        const { black, white } = colourCounts(i);
        expect(hasTiling(n, removedCells(i)), JSON.stringify(i)).toBe(black === white);
      }
    }
  });

  it('opposite corners have the same colour and leave the counts 2 apart; adjacent cells leave them equal', () => {
    for (const n of [4, 6, 8] as const) {
      const a = colourCounts({ n, removed: 'opposite-corners' });
      expect(a.white - a.black).toBe(2);
      const b = colourCounts({ n, removed: 'adjacent' });
      expect(b.white).toBe(b.black);
    }
  });

  it('the tiling shown for adjacent cells is valid and uses n²/2 − 1 dominoes; there is none for opposite corners', () => {
    for (const n of [4, 6, 8] as const) {
      const i: In = { n, removed: 'adjacent' };
      const t = tilingFor(i)!;
      expect(isValidTiling(i, t)).toBe(true);
      expect(t).toHaveLength((n * n) / 2 - 1);
      expect(tilingFor({ n, removed: 'opposite-corners' })).toBeNull();
    }
  });

  it('isValidTiling rejects overlaps, gaps, non-adjacent pairs and covering a removed cell', () => {
    const i: In = { n: 4, removed: 'adjacent' };
    const good = tilingFor(i)!;
    expect(isValidTiling(i, good.slice(1))).toBe(false); // a gap
    expect(isValidTiling(i, [...good, good[0]])).toBe(false); // an overlap
    expect(
      isValidTiling(i, [
        [
          [0, 0],
          [1, 0],
        ],
        ...good.slice(1),
      ]),
    ).toBe(false); // covers the removed (0,0)
    expect(
      isValidTiling(i, [
        [
          [1, 0],
          [1, 2],
        ],
        ...good.slice(1),
      ]),
    ).toBe(false); // not adjacent
  });
});
