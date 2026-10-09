import { describe, expect, it } from 'vitest';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { steps } from '@/lib/tutor/engine/generate';
import { fill, msg } from '@/lib/tutor/catalog/messages';

/** Counted nouns the catalog uses; "1 nodes" must be written `{n|node|nodes}` (see `fill`). */
const PLURALS = [
  'nodes',
  'chains',
  'augmentations',
  'lines',
  'occurrences',
  'digits',
  'numbers',
  'piles',
  'units',
  'times',
  'steps',
  'terms',
  'sticks',
  'squares',
  'dots',
  'rows',
  'edges',
  'items',
  'subsets',
  'comparisons',
  'characters',
  'queens',
  'elements',
  'primes',
  'stones',
  'paths',
  'columns',
  'cells',
  'bits',
  'minutes',
  'hours',
  'customers',
  'components',
  'trees',
  'unions',
  'vertices',
  'dominoes',
  'meters',
  'horses',
  'additions',
  'placements',
  'nails',
  'masks',
];
// a "1" that is a whole number, not the tail of 11, 2.1, x−1 or a label such as "Row 1 adds"
const ONE_PLURAL = new RegExp(`(?<![\\w.]|[−+*·×/^-] )1 (?:[a-z-]+ )?(?:${PLURALS.join('|')})\\b`);

describe('English text never says "1 nodes"', () => {
  for (const pack of SUBJECT_PACKS) {
    for (const entry of pack.walkthroughs) {
      it(`${pack.id}/${entry.id}: explanations and narrations of every preset`, () => {
        const bad: string[] = [];
        for (const preset of entry.presets) {
          for (const frame of steps(entry, preset.input, { locale: 'en-US' })) {
            const texts = [frame.meta.explanation];
            for (const tag of frame.meta.tags ?? []) {
              const def = entry.beatDefs.find((b) => `beat:${b.id}` === tag);
              if (def) texts.push(fill(msg(def.narration, 'en-US'), frame.meta.vars));
            }
            for (const t of texts)
              if (ONE_PLURAL.test(t)) bad.push(`${preset.id}: ${t.slice(0, 140)}`);
          }
        }
        expect(bad).toEqual([]);
      });
    }
  }
});
