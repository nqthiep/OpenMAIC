/**
 * Writes `manim/service/templates.json`: what the manim-service needs to know about every clip template (task 3C-01):
 * its revision, whether text is baked into the picture, and the `inputSpec` that its parameters must satisfy. The
 * service cannot import TypeScript, so this file is how the catalog reaches it; a test keeps it in step.
 *
 * Usage: pnpm exec tsx scripts/export-clip-specs.ts [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { clipSpecs } from '@/lib/clips/service-specs';

const file = path.join(process.cwd(), 'manim/service/templates.json');
const text = `${JSON.stringify(clipSpecs(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== text) {
    console.error(
      'manim/service/templates.json is out of date; run `pnpm exec tsx scripts/export-clip-specs.ts`',
    );
    process.exit(1);
  }
  console.log('clip specs: up to date');
} else {
  writeFileSync(file, text);
  console.log('clip specs: written');
}
