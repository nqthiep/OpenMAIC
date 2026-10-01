import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'lib/i18n/locales');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

const KEYS = [
  'play',
  'pause',
  'prev',
  'next',
  'reset',
  'speed',
  'explanation',
  'pseudocode',
  'cpp',
  'python',
  'beats',
  'preset',
  'variables',
  'predict',
  'skip',
  'blocked',
  'blockedHint',
  'input',
  'apply',
  'inputError',
];

describe('subject.tutor.* locales', () => {
  it('covers all 12 locale files including en-US', () => {
    expect(files).toHaveLength(12);
    expect(files).toContain('en-US.json');
  });

  for (const file of files) {
    it(`${file} has every key as a non-empty string`, () => {
      const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const tutor = json?.subject?.tutor;
      expect(tutor, 'subject.tutor').toBeTypeOf('object');
      for (const key of KEYS) {
        expect(tutor[key], `subject.tutor.${key}`).toBeTypeOf('string');
        expect(tutor[key].trim().length, `subject.tutor.${key}`).toBeGreaterThan(0);
      }
    });
  }
});
