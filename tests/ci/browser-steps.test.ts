import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every `*.browser.test.ts` is skipped without its env flag, so CI must run it in a step of its own. */
function browserTests(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return browserTests(p);
    return name.endsWith('.browser.test.ts') ? [p] : [];
  });
}

describe('CI browser test steps', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  it.each(browserTests('tests'))('%s has a step in ci.yml', (file) => {
    expect(ci, `add a CI step running ${file} with its env flag`).toContain(
      file.replaceAll('\\', '/'),
    );
  });
});
