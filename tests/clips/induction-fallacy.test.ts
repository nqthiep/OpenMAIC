import { describe, expect, it } from 'vitest';
import inductionFallacy, {
  claimMissingBase,
  expectedDisplay,
  failAt,
  horseOverlap,
  inductionFallacyEntry as entry,
} from '@/lib/subjects/math/clips/induction-fallacy';
import { clipContract } from './clip-contract';

type Kind = 'all-same-color' | 'missing-base';
type In = { n: number; kind: Kind };

const sweep: In[] = [];
for (let n = 3; n <= 8; n++)
  for (const kind of ['all-same-color', 'missing-base'] as const) sweep.push({ n, kind });

/** independent: the horses of the "proof" as real sets; two groups of k inside k + 1 horses and their common part */
function commonHorses(k: number): number {
  const horses = Array.from({ length: k + 1 }, (_, i) => i);
  const g1 = new Set(horses.slice(0, k)); // without the last horse
  const g2 = new Set(horses.slice(1)); // without the first horse
  return [...g1].filter((h) => g2.has(h)).length;
}

clipContract<In>({
  module: inductionFallacy,
  presets: ['colors-4', 'colors-8', 'base-3', 'base-6'],
  chapters: [
    { id: 'claim', range: [8, 12] },
    { id: 'step', range: [10, 14] },
    { id: 'crack', range: [12, 16] },
    { id: 'fix', range: [10, 14] },
  ],
  bad: [
    { n: 2, kind: 'all-same-color' },
    { n: 9, kind: 'all-same-color' },
    { n: 0, kind: 'missing-base' },
    { n: 3.5, kind: 'missing-base' },
    { n: 4, kind: 'strong-induction' },
    { n: 4 },
    { kind: 'missing-base' },
    { n: 4, kind: 'missing-base', extra: 1 },
    { n: '4', kind: 'missing-base' },
    null,
    4,
  ],
  edges: sweep,
  // independent: the first n where the claim is false (the horses: n = 2 has no common horse to chain through)
  display: ({ kind }) => {
    if (kind === 'missing-base') {
      for (let n = 1; n <= 20; n++) if ((n * n + n) % 2 === 0) return { failAt: n };
    }
    // the proof for n + 1 horses needs the two groups of n to share a horse: the first n + 1 where they do not
    for (let total = 2; total <= 20; total++)
      if (commonHorses(total - 1) === 0) return { failAt: total };
    return { failAt: -1 };
  },
  sweep,
});

describe('induction-fallacy: specifics', () => {
  it('the presets show where the argument breaks', () => {
    expect(entry.presets.map((p) => expectedDisplay(p.input))).toEqual([
      { failAt: 2 },
      { failAt: 2 },
      { failAt: 1 },
      { failAt: 1 },
    ]);
  });

  it('two groups of k horses share k − 1 horses: nothing at k = 1, a real common horse from k = 2 on', () => {
    for (let k = 1; k <= 10; k++) {
      expect(horseOverlap(k)).toBe(commonHorses(k));
      expect(horseOverlap(k) > 0).toBe(k >= 2);
    }
  });

  it('the claim "n² + n is odd" is false for EVERY n (n² + n = n(n + 1) is always even), yet the step is valid for every k', () => {
    for (let n = 1; n <= 200; n++) {
      expect(claimMissingBase(n)).toBe(false);
      expect((n * n + n) % 2).toBe(0);
      expect((n * (n + 1)) % 2).toBe(0);
    }
    // the step: if k² + k is odd then (k + 1)² + (k + 1) is odd: it is vacuously true and also true by the parity argument
    for (let k = 1; k <= 200; k++) {
      const next = (k + 1) * (k + 1) + (k + 1);
      expect((next - (k * k + k)) % 2).toBe(0); // the difference 2(k + 1) is even, so parity is preserved
      if (claimMissingBase(k)) expect(claimMissingBase(k + 1)).toBe(true);
    }
  });

  it('the base case n = 1 gives 1 + 1 = 2, an even number: that is the crack', () => {
    expect(claimMissingBase(1)).toBe(false);
    expect(1 * 1 + 1).toBe(2);
    expect(failAt('missing-base')).toBe(1);
  });

  it('the horse "proof" does not fail at the base: one horse trivially has one colour', () => {
    expect(failAt('all-same-color')).toBeGreaterThan(1);
  });

  it('the display does not depend on the number shown, only on the kind of fallacy', () => {
    for (const kind of ['all-same-color', 'missing-base'] as const) {
      const values = new Set(
        Array.from({ length: 6 }, (_, k) => expectedDisplay({ n: k + 3, kind }).failAt),
      );
      expect(values.size).toBe(1);
    }
  });
});
