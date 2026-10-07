import { describe, expect, it } from 'vitest';
import limitEpsilon, {
  expectedDisplay,
  inBand,
  limitEpsilonEntry as entry,
  smallestN,
} from '@/lib/subjects/math/clips/limit-epsilon';
import { clipContract } from './clip-contract';

type Seq = 'inv-n' | 'n1-over-n' | 'alt-inv-n';
type In = { seq: Seq; eps: number };

const sweep: In[] = [];
for (const seq of ['inv-n', 'n1-over-n', 'alt-inv-n'] as const)
  for (let k = 1; k <= 10; k++) sweep.push({ seq, eps: Math.round(k * 5) / 100 });

const term = (seq: Seq, n: number): number =>
  seq === 'inv-n' ? 1 / n : seq === 'n1-over-n' ? (n + 1) / n : (n % 2 === 0 ? 1 : -1) / n;
const limit = (seq: Seq): number => (seq === 'n1-over-n' ? 1 : 0);

/** independent: scan the real terms in floating point, with a margin that keeps the strict inequality honest */
function independentN(i: In): number {
  const L = limit(i.seq);
  let N = 1;
  for (let n = 1; n <= 1000; n++) if (!(Math.abs(term(i.seq, n) - L) < i.eps - 1e-12)) N = n + 1;
  return N;
}

clipContract<In>({
  module: limitEpsilon,
  presets: ['inv-0.2', 'inv-0.05', 'n1-0.1', 'alt-0.25'],
  chapters: [
    { id: 'sequence', range: [8, 12] },
    { id: 'band', range: [10, 12] },
    { id: 'find-n', range: [12, 16] },
    { id: 'shrink', range: [10, 14] },
  ],
  bad: [
    { seq: 'inv-n', eps: 0.04 },
    { seq: 'inv-n', eps: 0.55 },
    { seq: 'inv-n', eps: 0 },
    { seq: 'inv-n', eps: 0.07 },
    { seq: 'geometric', eps: 0.2 },
    { seq: 'inv-n' },
    { eps: 0.2 },
    { seq: 'inv-n', eps: '0.2' },
    { seq: 'inv-n', eps: 0.2, extra: 1 },
    null,
  ],
  edges: [
    { seq: 'inv-n', eps: 0.05 },
    { seq: 'inv-n', eps: 0.5 },
    { seq: 'n1-over-n', eps: 0.05 },
    { seq: 'alt-inv-n', eps: 0.5 },
    { seq: 'alt-inv-n', eps: 0.05 },
  ],
  display: (i) => ({ L: limit(i.seq), N: independentN(i) }),
  sweep,
});

describe('limit-epsilon: specifics', () => {
  it('the presets show L and N worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { L: 0, N: 6 }, // 1/5 = 0.2 is not < 0.2, 1/6 is
      { L: 0, N: 21 },
      { L: 1, N: 11 },
      { L: 0, N: 5 }, // 1/4 = 0.25 is not < 0.25
    ]);
  });

  it('the strict inequality is decided in integers: a term exactly at the edge is outside', () => {
    expect(inBand({ seq: 'inv-n', eps: 0.2 }, 5)).toBe(false); // 1/5 = 0.2
    expect(inBand({ seq: 'inv-n', eps: 0.2 }, 6)).toBe(true);
    expect(inBand({ seq: 'inv-n', eps: 0.05 }, 20)).toBe(false);
    expect(inBand({ seq: 'inv-n', eps: 0.05 }, 21)).toBe(true);
  });

  it('N is floor(1/ε) + 1 and grows as ε shrinks, for all three sequences', () => {
    for (const seq of ['inv-n', 'n1-over-n', 'alt-inv-n'] as const) {
      let prev = 0;
      for (let k = 10; k >= 1; k--) {
        const eps = Math.round(k * 5) / 100;
        const N = expectedDisplay({ seq, eps }).N;
        expect(N).toBe(Math.floor(100 / Math.round(eps * 100)) + 1);
        expect(N).toBeGreaterThanOrEqual(prev);
        prev = N;
      }
    }
  });

  it('the alternating sequence jumps across L but stays inside the band from N on', () => {
    const i: In = { seq: 'alt-inv-n', eps: 0.25 };
    expect(term(i.seq, 1)).toBe(-1);
    expect(term(i.seq, 2)).toBe(0.5);
    const N = smallestN(i)!;
    for (let n = N; n <= 1000; n++) expect(Math.abs(term(i.seq, n))).toBeLessThan(0.25);
    expect(Math.abs(term(i.seq, N - 1))).toBeGreaterThanOrEqual(0.25);
  });

  it('no term of 1/n equals its limit 0: the limit is approached, not reached', () => {
    for (let n = 1; n <= 1000; n++) expect(term('inv-n', n)).not.toBe(0);
  });

  it('smallestN returns null when no term in the scan range is inside the band', () => {
    expect(smallestN({ seq: 'inv-n', eps: 0.05 }, 20)).toBeNull();
  });
});
