import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tailwind splits class names on whitespace, so `shadow-[0_0_8px_rgba(66, 111, 171,0.3)]` is not
 * one class: it is dropped and the shadow or gradient silently disappears. A mechanical colour
 * swap produced 34 of these once; this keeps them out.
 */
const BROKEN = /-\[[^\]\s]*\(\d+, /;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(tsx|ts)$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe('Tailwind arbitrary values', () => {
  it('never hold a space after a comma inside rgba() or another function', () => {
    const offenders: string[] = [];
    for (const dir of ['app', 'components']) {
      for (const file of sources(dir)) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (BROKEN.test(line)) offenders.push(`${file}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('catches the broken form', () => {
    expect(BROKEN.test('className="shadow-[0_0_8px_rgba(66, 111, 171,0.3)]"')).toBe(true);
    expect(BROKEN.test('className="shadow-[0_0_8px_rgba(66,111,171,0.3)]"')).toBe(false);
    expect(BROKEN.test("const c = 'rgba(66, 111, 171, 0.3)';")).toBe(false);
  });
});
