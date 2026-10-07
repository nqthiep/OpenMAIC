import { describe, expect, it } from 'vitest';
import euclidRectangle, {
  cuts,
  euclidRectangleEntry as entry,
  expectedDisplay,
} from '@/lib/subjects/math/clips/euclid-rectangle';
import { clipContract } from './clip-contract';

type In = { a: number; b: number };

const sweep: In[] = [];
for (let a = 1; a <= 60; a += 1) for (let b = 1; b <= 60; b += 3) sweep.push({ a, b });
sweep.push({ a: 60, b: 60 }, { a: 59, b: 60 }, { a: 55, b: 34 }, { a: 1, b: 1 }, { a: 60, b: 1 });

/** independent: gcd by trial division from the top; the squares by a greedy tiling of a grid of unit cells */
function bruteGcd({ a, b }: In): number {
  for (let g = Math.min(a, b); g >= 1; g--) if (a % g === 0 && b % g === 0) return g;
  return 1;
}
function tileCount({ a, b }: In): number {
  // grid of cells; repeatedly take the largest square whose top-left cell is the first free cell
  const w = Math.max(a, b);
  const h = Math.min(a, b);
  const free = Array.from({ length: h }, () => Array<boolean>(w).fill(true));
  let squares = 0;
  // follow Euclid's cuts exactly but place the squares on the grid, checking each cell is free and in bounds
  let x0 = 0;
  let y0 = 0;
  let cw = w;
  let ch = h;
  let alongWidth = true;
  while (cw > 0 && ch > 0) {
    const side = Math.min(cw, ch);
    const q = Math.floor(Math.max(cw, ch) / side);
    for (let k = 0; k < q; k++) {
      const ox = alongWidth ? x0 + k * side : x0;
      const oy = alongWidth ? y0 : y0 + k * side;
      for (let yy = oy; yy < oy + side; yy++)
        for (let xx = ox; xx < ox + side; xx++) {
          if (!free[yy]?.[xx]) throw new Error('overlap or out of range');
          free[yy][xx] = false;
        }
      squares++;
    }
    if (alongWidth) {
      x0 += q * side;
      cw -= q * side;
    } else {
      y0 += q * side;
      ch -= q * side;
    }
    alongWidth = cw >= ch;
  }
  if (free.some((row) => row.some(Boolean))) throw new Error('cells left');
  return squares;
}

clipContract<In>({
  module: euclidRectangle,
  presets: ['48-18', 'equal', 'coprime', 'one'],
  chapters: [
    { id: 'rectangle', range: [8, 12] },
    { id: 'squares', range: [10, 14] },
    { id: 'repeat', range: [12, 16] },
    { id: 'gcd', range: [10, 14] },
  ],
  bad: [
    { a: 0, b: 5 },
    { a: 5, b: 0 },
    { a: 61, b: 5 },
    { a: 5, b: 61 },
    { a: -3, b: 6 },
    { a: 4.5, b: 6 },
    { a: 6 },
    { b: 6 },
    { a: 6, b: 4, c: 2 },
    { a: '6', b: 4 },
    null,
  ],
  edges: [
    { a: 1, b: 1 },
    { a: 60, b: 60 },
    { a: 1, b: 60 },
    { a: 60, b: 1 },
    { a: 59, b: 60 },
    { a: 55, b: 34 },
  ],
  display: (i) => ({ gcd: bruteGcd(i), squares: tileCount(i) }),
  sweep,
});

describe('euclid-rectangle: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    // 48 = 2·18 + 12 (2 squares), 18 = 1·12 + 6 (1), 12 = 2·6 (2): five squares, last side 6
    expect(expectedDisplay({ a: 48, b: 18 })).toEqual({ gcd: 6, squares: 5 });
    expect(expectedDisplay({ a: 12, b: 12 })).toEqual({ gcd: 12, squares: 1 });
    // 13 = 1·8 + 5, 8 = 1·5 + 3, 5 = 1·3 + 2, 3 = 1·2 + 1, 2 = 2·1: 1 + 1 + 1 + 1 + 2 = 6
    expect(expectedDisplay({ a: 13, b: 8 })).toEqual({ gcd: 1, squares: 6 });
    expect(expectedDisplay({ a: 1, b: 60 })).toEqual({ gcd: 1, squares: 60 });
    expect(entry.presets.map((p) => expectedDisplay(p.input).gcd)).toEqual([6, 12, 1, 1]);
  });

  it('the squares tile the rectangle: their total area is a·b and each cut leaves the Euclid remainder', () => {
    for (const i of sweep) {
      const steps = cuts(i);
      expect(steps.reduce((s, c) => s + c.count * c.side * c.side, 0)).toBe(i.a * i.b);
      for (let k = 1; k < steps.length; k++) expect(steps[k].side).toBeLessThan(steps[k - 1].side);
    }
  });

  it('the last side is the gcd and is NOT always the smaller of the two numbers', () => {
    expect(expectedDisplay({ a: 48, b: 18 }).gcd).toBeLessThan(18);
    expect(expectedDisplay({ a: 12, b: 30 }).gcd).toBe(6);
    expect(expectedDisplay({ a: 7, b: 49 }).gcd).toBe(7); // here the gcd IS the smaller number: only when it divides the larger
  });

  it('the order of a and b does not matter', () => {
    for (const { a, b } of sweep)
      expect(expectedDisplay({ a, b })).toEqual(expectedDisplay({ a: b, b: a }));
  });

  it('the number of squares is the sum of the quotients of the Euclidean algorithm', () => {
    for (const i of sweep) {
      let x = Math.max(i.a, i.b);
      let y = Math.min(i.a, i.b);
      let sum = 0;
      while (y > 0) {
        sum += Math.floor(x / y);
        [x, y] = [y, x % y];
      }
      expect(expectedDisplay(i).squares).toBe(sum);
    }
  });
});
