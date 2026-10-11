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

/** The workflow split into its steps: each `- name:` or `- uses:` item with its `run:` and `env:`. */
const ciSteps = readFileSync('.github/workflows/ci.yml', 'utf8').split(/\n(?= {6}- )/);

describe('CI browser test steps', () => {
  it.each(browserTests('tests'))('%s has a step in ci.yml that sets its env flag', (file) => {
    const path = file.replaceAll('\\', '/');
    const flag = /process\.env\.(\w+) === '1'/.exec(readFileSync(path, 'utf8'))?.[1];
    expect(flag, `${path} must read its env flag as process.env.NAME === '1'`).toBeDefined();
    const step = ciSteps.find((s) => s.includes(`pnpm exec vitest run ${path}`));
    expect(step, `add a CI step running ${path} with its env flag`).toBeDefined();
    expect(step, `the CI step running ${path} must set ${flag}: '1'`).toContain(`${flag}: '1'`);
  });
});
