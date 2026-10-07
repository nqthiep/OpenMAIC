/**
 * Builds a `ClipEntry` for a Manim template (cards 3A-T*, 3B-T*, 3D-T*): the fields every template shares (kind,
 * pinned engine, 720p30, silent, no baked text, cache key and asset lookup) are filled in here, so a clip file holds
 * only what is specific to its mathematics. Server-side only through `assets.ts` (node:crypto).
 */
import { clipKeyParts, lookupClipAsset } from '@/lib/clips/assets';
import type { ClipEntry } from '@/lib/clips/types';
import type { Messages } from '@/lib/tutor/catalog/types';

export const CLIP_ENGINE = { name: 'manim-ce', version: '0.21.0', templateRev: 1 } as const;

export type ClipDef<I> = Omit<
  ClipEntry<I>,
  'kind' | 'engine' | 'render' | 'silent' | 'bakedText' | 'cacheKeyInput' | 'asset'
>;

export function defineClip<I>(def: ClipDef<I>): ClipEntry<I> {
  const base = {
    id: def.id,
    engine: CLIP_ENGINE,
    inputSpec: def.inputSpec,
    bakedText: false,
  } as const;
  return {
    ...def,
    kind: 'template',
    engine: CLIP_ENGINE,
    render: { w: 1280, h: 720, fps: 30 },
    silent: true,
    bakedText: false,
    cacheKeyInput: (input, locale) => clipKeyParts(base, input, locale),
    asset: (input, locale) => lookupClipAsset(base, input, locale),
  };
}

/** A vi/en pair. */
export const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Three hints, light to close to the answer: the three Vietnamese lines, then the three English ones. */
export const hints3 = (a: string, b: string, c: string, ea: string, eb: string, ec: string) =>
  [m(a, ea), m(b, eb), m(c, ec)] as const;
