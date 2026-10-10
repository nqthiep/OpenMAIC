/**
 * Frames and their hash for one (entry, preset, locale), computed once per process. Catalog entries are
 * module constants and `steps` is pure, so the staleness checks and the tutor digest share this instead of
 * replaying every preset on each call. Frames are frozen by `generateSteps`, so sharing them is safe.
 */
import { framesHash } from '@/lib/tutor/catalog/hash';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';
import { steps } from './generate';
import type { Frame } from './types';

type Preset = AnyWalkthroughEntry['presets'][number];

export interface PresetFrames {
  readonly frames: readonly Frame<unknown>[];
  readonly hash: string;
}

const cache = new WeakMap<AnyWalkthroughEntry, Map<string, Map<string, PresetFrames>>>();

/** `steps` of one preset in one locale, and its `framesHash`. A run that throws is not cached. */
export function presetFrames(
  entry: AnyWalkthroughEntry,
  preset: Preset,
  locale: string,
): PresetFrames {
  let byLocale = cache.get(entry);
  if (!byLocale) {
    byLocale = new Map();
    cache.set(entry, byLocale);
  }
  let byPreset = byLocale.get(locale);
  if (!byPreset) {
    byPreset = new Map();
    byLocale.set(locale, byPreset);
  }
  const hit = byPreset.get(preset.id);
  if (hit) return hit;
  const frames = steps(entry, preset.input, { locale });
  const value = { frames, hash: framesHash(frames) };
  byPreset.set(preset.id, value);
  return value;
}
