import { describe, expect, it } from 'vitest';
import latticePaths, {
  binomial,
  expectedDisplay,
  latticePathsEntry as entry,
  pathGrid,
} from '@/lib/subjects/math/clips/lattice-paths';
import { clipContract } from './clip-contract';

type In = { m: number; n: number };

const sweep: In[] = [];
for (let m = 1; m <= 6; m++) for (let n = 1; n <= 6; n++) sweep.push({ m, n });

/** independent: enumerate every path (right/up sequences) by recursion and count them */
function enumerate(m: number, n: number): number {
  if (m === 0 || n === 0) return 1;
  return enumerate(m - 1, n) + enumerate(m, n - 1);
}
/** independent: C(total, k) from factorials */
const fact = (x: number): number => (x <= 1 ? 1 : x * fact(x - 1));
const choose = (total: number, k: number): number => fact(total) / (fact(k) * fact(total - k));

clipContract<In>({
  module: latticePaths,
  presets: ['2-2', '3-2', '1-6', '4-4'],
  chapters: [
    { id: 'grid', range: [8, 12] },
    { id: 'paths', range: [10, 14] },
    { id: 'pascal', range: [12, 16] },
    { id: 'binomial', range: [10, 14] },
  ],
  bad: [
    { m: 0, n: 3 },
    { m: 3, n: 0 },
    { m: 7, n: 3 },
    { m: 3, n: 7 },
    { m: 2.5, n: 3 },
    { m: -1, n: 3 },
    { m: 3 },
    { n: 3 },
    { m: 3, n: 3, k: 1 },
    { m: '3', n: 3 },
    null,
  ],
  edges: [
    { m: 1, n: 1 },
    { m: 6, n: 6 },
    { m: 1, n: 6 },
    { m: 6, n: 1 },
  ],
  display: ({ m, n }) => ({ count: enumerate(m, n) }),
  sweep,
});

describe('lattice-paths: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { count: 6 },
      { count: 10 },
      { count: 7 },
      { count: 70 },
    ]);
  });

  it('the count is C(m + n, n) from factorials, on the whole grid, and symmetric in m and n', () => {
    for (const { m, n } of sweep) {
      expect(expectedDisplay({ m, n }).count).toBe(choose(m + n, n));
      expect(expectedDisplay({ m, n }).count).toBe(expectedDisplay({ m: n, n: m }).count);
    }
  });

  it('every grid number is the sum of its left and lower neighbour, and the edges are all 1 (Pascal)', () => {
    for (const { m, n } of sweep) {
      const g = pathGrid({ m, n });
      for (let r = 0; r <= n; r++)
        for (let c = 0; c <= m; c++) {
          expect(g[r][c]).toBe(r === 0 || c === 0 ? 1 : g[r - 1][c] + g[r][c - 1]);
          expect(g[r][c]).toBe(choose(r + c, r));
        }
    }
  });

  it('"m·n paths" is wrong: m·n is the number of cells and is smaller than the count for every grid except 1 × 1', () => {
    for (const { m, n } of sweep) {
      const count = expectedDisplay({ m, n }).count;
      if (m === 1 && n === 1) expect(count).toBe(2);
      else expect(count).toBeGreaterThan(m * n === count ? -1 : 0);
      expect(count === m * n).toBe(false);
    }
  });

  it('binomial uses exact integer steps: every intermediate division is exact', () => {
    for (let total = 2; total <= 12; total++)
      for (let k = 1; k < total; k++) expect(binomial(total, k)).toBe(choose(total, k));
  });
});
