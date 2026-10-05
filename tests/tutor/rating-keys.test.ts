import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = path.join(process.cwd(), 'lib', 'i18n', 'locales');
const FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
const KEYS = ['classroomComplete.rating.title', 'classroomComplete.rating.option'];

const get = (o: unknown, k: string) =>
  k.split('.').reduce<unknown>((a, p) => (a as Record<string, unknown> | undefined)?.[p], o);

describe('classroomComplete.rating locale keys', () => {
  it('covers all 12 locales', () => {
    expect(FILES).toHaveLength(12);
  });

  it.each(FILES)('%s has non-empty rating title and option', (file) => {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    for (const k of KEYS) {
      const v = get(data, k);
      expect(typeof v, `${file} missing ${k}`).toBe('string');
      expect((v as string).trim(), `${file} empty ${k}`).not.toBe('');
      expect(v, `${file} echoes ${k}`).not.toBe(k);
    }
    const option = get(data, 'classroomComplete.rating.option') as string;
    expect(option).toContain('{{value}}');
    expect(option).toContain('{{max}}');
  });
});
