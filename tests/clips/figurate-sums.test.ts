import { describe, expect, it } from 'vitest';
import figurateSums, {
  expectedDisplay,
  figurateSumsEntry as entry,
} from '@/lib/subjects/math/clips/figurate-sums';
import { clipContract } from './clip-contract';

type In = { series: 'odd' | 'natural'; n: number };

const sweep: In[] = [];
for (let n = 2; n <= 10; n++)
  for (const series of ['odd', 'natural'] as const) sweep.push({ series, n });

clipContract<In>({
  module: figurateSums,
  presets: ['odd-4', 'odd-2', 'natural-5', 'natural-10'],
  chapters: [
    { id: 'dots', range: [8, 12] },
    { id: 'grow', range: [10, 15] },
    { id: 'count', range: [10, 15] },
    { id: 'induction', range: [8, 14] },
  ],
  bad: [
    { series: 'odd', n: 1 },
    { series: 'odd', n: 11 },
    { series: 'even', n: 4 },
    { series: 'odd', n: 4.5 },
    { series: 'odd' },
    { n: 4 },
    { series: 'odd', n: 4, k: 1 },
    { series: 'odd', n: '4' },
    null,
  ],
  edges: [
    { series: 'odd', n: 2 },
    { series: 'odd', n: 10 },
    { series: 'natural', n: 2 },
    { series: 'natural', n: 10 },
  ],
  // independent: lay the dots out row by row and count them
  display: ({ series, n }) => {
    const rows = Array.from({ length: n }, (_, k) => (series === 'odd' ? 2 * k + 1 : k + 1));
    return { n, sum: rows.reduce((s, r) => s + r, 0) };
  },
  sweep,
});

describe('figurate-sums: specifics', () => {
  it('the presets show the numbers worked out by hand', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { n: 4, sum: 16 },
      { n: 2, sum: 4 },
      { n: 5, sum: 15 },
      { n: 10, sum: 55 },
    ]);
  });

  it('the induction step: adding the next term turns the formula for k into the formula for k + 1', () => {
    for (let k = 1; k <= 20; k++) {
      expect(k * k + (2 * k + 1)).toBe((k + 1) * (k + 1));
      expect((k * (k + 1)) / 2 + (k + 1)).toBe(((k + 1) * (k + 2)) / 2);
    }
  });

  it('two staircases make an n × (n + 1) rectangle, so a triangular number is an integer', () => {
    for (let n = 2; n <= 10; n++) {
      expect(2 * expectedDisplay({ series: 'natural', n }).sum).toBe(n * (n + 1));
    }
  });

  it('the L-shaped layer of the k-th odd square has 2k − 1 dots', () => {
    for (let k = 2; k <= 10; k++) {
      expect(
        expectedDisplay({ series: 'odd', n: k }).sum -
          expectedDisplay({ series: 'odd', n: k - 1 }).sum,
      ).toBe(2 * k - 1);
    }
  });

  it('a few true cases are not a proof: the sheet says so for the first chapter', () => {
    expect(entry.sheet.chapters[0].misconceptions[0]['en-US']).toMatch(/proves it/);
  });
});
