import { describe, expect, it } from 'vitest';
import geometricSeriesArea, {
  expectedDisplay,
  geometricSeriesAreaEntry as entry,
  partialSum,
  seriesLimit,
} from '@/lib/subjects/math/clips/geometric-series-area';
import { clipContract } from './clip-contract';

type Ratio = '1/2' | '1/3' | '1/4';
type In = { r: Ratio };

const sweep: In[] = [{ r: '1/2' }, { r: '1/3' }, { r: '1/4' }];
const den = (r: Ratio) => Number(r.slice(2));

/** independent: S_k = (d^k − 1) / (d^k (d − 1)); every integer here is below 2^53, so the numerator and denominator are exact */
function exactFraction(r: Ratio, k: number): { num: number; den: number } {
  const d = den(r);
  let dk = 1;
  for (let j = 0; j < k; j++) dk *= d;
  return { num: dk - 1, den: dk * (d - 1) };
}
const toNumber = (f: { num: number; den: number }) => f.num / f.den;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

clipContract<In>({
  module: geometricSeriesArea,
  presets: ['half', 'third', 'quarter'],
  chapters: [
    { id: 'square', range: [8, 12] },
    { id: 'cut', range: [10, 14] },
    { id: 'repeat', range: [12, 16] },
    { id: 'sum', range: [10, 14] },
  ],
  bad: [
    { r: '1/5' },
    { r: '2/3' },
    { r: 0.5 },
    { r: '0.5' },
    { r: 'half' },
    { r: '1/2', extra: 1 },
    {},
    null,
    '1/2',
  ],
  edges: sweep,
  display: ({ r }) => ({ limit: r4(1 / (den(r) - 1)), s5: r4(toNumber(exactFraction(r, 5))) }),
  sweep,
});

describe('geometric-series-area: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { limit: 1, s5: 0.9688 }, // 31/32
      { limit: 0.5, s5: 0.4979 }, // 121/243
      { limit: 0.3333, s5: 0.333 }, // 341/1024
    ]);
  });

  it('the partial sums equal the exact fractions, increase, and stay strictly below the limit', () => {
    for (const { r } of sweep) {
      let prev = 0;
      for (let k = 1; k <= 20; k++) {
        const s = partialSum(r, k);
        expect(s).toBeCloseTo(toNumber(exactFraction(r, k)), 12);
        expect(s).toBeGreaterThan(prev);
        expect(s).toBeLessThan(seriesLimit(r));
        prev = s;
      }
    }
  });

  it('S20 is within 1e-6 of the limit, and the limit equals r / (1 − r)', () => {
    for (const { r } of sweep) {
      const q = 1 / den(r);
      expect(seriesLimit(r)).toBeCloseTo(q / (1 - q), 12);
      expect(seriesLimit(r) - partialSum(r, 20)).toBeLessThan(1e-6);
    }
  });

  it('the infinite sum is finite but only r = 1/2 fills the square: the sum is 1 only there', () => {
    expect(seriesLimit('1/2')).toBe(1);
    expect(seriesLimit('1/3')).toBeLessThan(1);
    expect(seriesLimit('1/4')).toBeLessThan(seriesLimit('1/3'));
  });

  it('the telescoping argument: (1 − r)·S_k = r − r^(k+1)', () => {
    for (const { r } of sweep) {
      const q = 1 / den(r);
      for (let k = 1; k <= 10; k++)
        expect((1 - q) * partialSum(r, k)).toBeCloseTo(q - q ** (k + 1), 12);
    }
  });
});
