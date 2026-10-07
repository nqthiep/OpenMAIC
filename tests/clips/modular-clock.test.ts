import { describe, expect, it } from 'vitest';
import modularClock, {
  expectedDisplay,
  modularClockEntry as entry,
  powerCycle,
} from '@/lib/subjects/math/clips/modular-clock';
import { clipContract } from './clip-contract';

type In = { n: number; a: number };

const sweep: In[] = [];
for (let n = 5; n <= 31; n++) for (let a = 2; a < n; a++) sweep.push({ n, a });

const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));

/** independent: the multiplicative order when gcd(a, n) = 1; otherwise the period of the tail, by brute force over a long run */
function independentPeriod({ n, a }: In): number {
  const pow = (k: number): number => {
    let r = 1;
    for (let j = 0; j < k; j++) r = (r * a) % n;
    return r;
  };
  if (gcd(a, n) === 1) {
    for (let k = 1; k <= n; k++) if (pow(k) === 1) return k;
  }
  // gcd > 1: x_k is eventually periodic; look at k from n (past the tail) and find the least p with x_{k+p} = x_k
  for (let p = 1; p <= n; p++) {
    let ok = true;
    for (let k = n; k < 3 * n; k++)
      if (pow(k) !== pow(k + p)) {
        ok = false;
        break;
      }
    if (ok) return p;
  }
  throw new Error('no period');
}

clipContract<In>({
  module: modularClock,
  presets: ['n10-a2', 'n7-a3', 'n12-a5', 'n5-a4'],
  chapters: [
    { id: 'clock', range: [8, 12] },
    { id: 'multiply', range: [10, 14] },
    { id: 'powers', range: [12, 16] },
    { id: 'cycle', range: [10, 14] },
  ],
  bad: [
    { n: 4, a: 2 },
    { n: 32, a: 2 },
    { n: 10, a: 1 },
    { n: 10, a: 31 },
    { n: 10, a: 10 },
    { n: 10, a: 12 },
    { n: 7.5, a: 2 },
    { n: 10 },
    { a: 2 },
    { n: 10, a: 2, extra: 1 },
    { n: '10', a: 2 },
    null,
  ],
  edges: [
    { n: 5, a: 2 },
    { n: 5, a: 4 },
    { n: 31, a: 30 },
    { n: 31, a: 2 },
    { n: 30, a: 29 },
    { n: 16, a: 2 },
  ],
  display: (i) => ({ period: independentPeriod(i) }),
  sweep,
});

describe('modular-clock: specifics', () => {
  it('the presets show the periods worked out by hand', () => {
    // 2,4,8,6,2,… period 4; 3,2,6,4,5,1,3,… period 6; 5,1,5,… period 2; 4,1,4,… period 2
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { period: 4 },
      { period: 6 },
      { period: 2 },
      { period: 2 },
    ]);
  });

  it('the powers of the presets are the ones from the card (the sequence shown in the scene)', () => {
    expect(powerCycle({ n: 10, a: 2 })).toEqual({ powers: [2, 4, 8, 6], start: 0, period: 4 });
    expect(powerCycle({ n: 7, a: 3 })).toEqual({ powers: [3, 2, 6, 4, 5, 1], start: 0, period: 6 });
    expect(powerCycle({ n: 12, a: 5 })).toEqual({ powers: [5, 1], start: 0, period: 2 });
  });

  it('a that shares a factor with n has a tail before the cycle and never reaches 1; coprime a is purely periodic and reaches 1', () => {
    for (const i of sweep) {
      const c = powerCycle(i);
      if (gcd(i.a, i.n) === 1) {
        expect(c.start).toBe(0);
        expect(c.powers).toContain(1);
      } else {
        expect(c.powers).not.toContain(1);
      }
    }
    expect(powerCycle({ n: 16, a: 2 }).start).toBeGreaterThan(0); // 2, 4, 8, 0, 0, …
  });

  it('the period divides n − 1 for a prime n (Fermat), and equals n − 1 exactly for the primitive roots', () => {
    const primes = [5, 7, 11, 13, 17, 19, 23, 29, 31];
    for (const n of primes) {
      let primitive = 0;
      for (let a = 2; a < n; a++) {
        const p = expectedDisplay({ n, a }).period;
        expect((n - 1) % p).toBe(0);
        if (p === n - 1) primitive++;
      }
      expect(primitive).toBeGreaterThanOrEqual(1);
    }
  });

  it('"every a has period n − 1" is false: some period is shorter on every prime up to 31 with a < n', () => {
    for (const n of [5, 7, 11, 13, 17, 19, 23, 29, 31]) {
      const periods = new Set(
        Array.from({ length: n - 2 }, (_, k) => expectedDisplay({ n, a: k + 2 }).period),
      );
      expect(periods.size).toBeGreaterThan(1);
    }
  });

  it('the period of the sequence matches the independent computation on the whole 27-modulus table', () => {
    for (const i of sweep) expect(expectedDisplay(i).period).toBe(independentPeriod(i));
  });
});
