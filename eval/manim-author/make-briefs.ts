/**
 * Writes eval/manim-author/briefs.json: one Vietnamese brief per clip except `amgm-semicircle`, which is the worked example
 * in the author prompt (20 briefs, card 3A-08). The text comes from the clip's own entry (title, what each chapter shows),
 * so it cannot disagree with the catalog. Run: pnpm exec tsx eval/manim-author/make-briefs.ts [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { msg } from '@/lib/tutor/catalog/messages';
import { mathClipModules } from '@/lib/subjects/math/clips';
import type { Brief } from './author';

export const EXAMPLE_CLIP = 'amgm-semicircle';

export function makeBriefs(): Brief[] {
  return mathClipModules
    .filter((m) => m.entry.id !== EXAMPLE_CLIP)
    .map((m) => {
      const parts = m.entry.sheet.chapters.map(
        (s, i) => `Chương ${i + 1}: ${msg(s.shows, 'vi-VN')}.`,
      );
      return {
        id: `b-${m.entry.id}`,
        clipId: m.entry.id,
        presetId: m.entry.presets[0].id,
        text: `Dựng clip "${msg(m.entry.title, 'vi-VN')}" gồm ${m.entry.chapters.length} chương. ${parts.join(' ')}`,
      };
    });
}

const file = join(process.cwd(), 'eval/manim-author/briefs.json');
if (process.argv[1]?.endsWith('make-briefs.ts')) {
  const text = `${JSON.stringify(makeBriefs(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== text) {
      console.error(
        'briefs.json is out of date: run pnpm exec tsx eval/manim-author/make-briefs.ts',
      );
      process.exit(1);
    }
  } else writeFileSync(file, text);
}
