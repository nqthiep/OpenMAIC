/**
 * The home page's error banner is an alert region, so a failed upload is read
 * out when it appears. The page is too large to render in this suite, so the
 * opening tag of the banner is checked in its source.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('the home page error banner', () => {
  it('is an alert, so a failed upload is announced', () => {
    const source = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    const anchor = source.indexOf('{/* ── Error ── */}');
    expect(anchor).toBeGreaterThan(-1);

    const opening = source.indexOf('<motion.div', anchor);
    const tag = source.slice(opening, source.indexOf('>', opening) + 1);
    expect(tag).toContain('role="alert"');
  });
});
