/**
 * The render plan (task 3A-07): every preset of every clip whose cache key is not in the asset index yet, once each, in
 * a fixed order. Pure: no I/O, so the plan is the same on every machine and easy to test.
 * Server-side only (the cache key uses node:crypto).
 */
import { clipAssetKey } from '@/lib/clips/assets';
import type { ClipAsset, ClipModule } from '@/lib/clips/types';

export interface RenderJob {
  clipId: string;
  presetId: string;
  input: unknown;
  cacheKey: string;
  /** the Manim template file of the clip, `manim/templates/<id with underscores>.py` */
  template: string;
  /** the numbers the scene must write to manifest.json */
  expectedDisplay: Record<string, number>;
}

/** `manim/templates/amgm_semicircle.py` for `amgm-semicircle`. */
export const templatePath = (clipId: string): string =>
  `manim/templates/${clipId.replace(/-/g, '_')}.py`;

export function planRenders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- modules with different inputs share one list
  modules: readonly ClipModule<any>[],
  index: Readonly<Record<string, ClipAsset>>,
  only?: string,
): RenderJob[] {
  const jobs: RenderJob[] = [];
  const seen = new Set<string>();
  const sorted = [...modules].sort((a, b) =>
    a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0,
  );
  for (const mod of sorted) {
    if (only !== undefined && mod.entry.id !== only) continue;
    for (const preset of mod.entry.presets) {
      // a clip without baked text renders once for every locale, so the key does not depend on the locale
      const cacheKey = clipAssetKey(mod.entry, preset.input, 'vi-VN');
      if (seen.has(cacheKey) || Object.prototype.hasOwnProperty.call(index, cacheKey)) continue;
      seen.add(cacheKey);
      jobs.push({
        clipId: mod.entry.id,
        presetId: preset.id,
        input: preset.input,
        cacheKey,
        template: templatePath(mod.entry.id),
        expectedDisplay: mod.expectedDisplay(preset.input),
      });
    }
  }
  return jobs;
}
