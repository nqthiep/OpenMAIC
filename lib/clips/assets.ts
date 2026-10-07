/**
 * Asset lookup of the clip templates (DATA-MODEL §4, tasks 3A-01/3A-07). The render script (3A-07) writes
 * `CLIP_ASSET_INDEX` (cache key → rendered files); until a clip is rendered `lookupClipAsset` returns null and the
 * provider reports `clip-not-prebuilt`. A clip entry builds its `cacheKeyInput` and `asset` from a small `base`:
 *
 *   const base = { id, engine, inputSpec, bakedText: false } as const;
 *   cacheKeyInput: (i, locale) => clipKeyParts(base, i, locale),
 *   asset: (i, locale) => lookupClipAsset(base, i, locale),
 *
 * Server-side only (the key uses node:crypto).
 */
import { clipCacheKey, quantise } from '@/lib/clips/cache-key';
import { CLIP_ASSET_INDEX } from '@/lib/clips/asset-index';
import type { ClipAsset, ClipEntry } from '@/lib/clips/types';
import type { Locale } from '@/lib/tutor/catalog/types';

/** Render profile of every clip (DATA-MODEL §4): quality medium, 720p, 30 fps. */
export const CLIP_PROFILE = 'qm-720p30';
/** Digest of the pinned Manim image; replaced by the real digest when the image is pinned (task 3A-04). */
export const CLIP_IMAGE_DIGEST = 'sha256:unpinned';

export type ClipBase = Pick<ClipEntry, 'id' | 'engine' | 'inputSpec' | 'bakedText'>;

/**
 * The app's part of the cache key: `[templateId, templateRev, quantised params, locale or null]`.
 * `locale` counts only when the clip bakes text into the picture.
 */
export function clipKeyParts(base: ClipBase, input: unknown, locale: Locale): unknown[] {
  return [
    base.id,
    base.engine.templateRev,
    quantise(base.inputSpec, input),
    base.bakedText ? locale : null,
  ];
}

/** Full cache key of one (clip, input, locale) at the current profile and image. */
export function clipAssetKey(base: ClipBase, input: unknown, locale: Locale): string {
  return clipCacheKey({
    templateId: base.id,
    templateRev: base.engine.templateRev,
    params: input,
    spec: base.inputSpec,
    locale,
    bakedText: base.bakedText,
    profile: CLIP_PROFILE,
    imageDigest: CLIP_IMAGE_DIGEST,
  });
}

/** The rendered files of a clip for this input, or null when it has not been rendered. */
export function lookupClipAsset(
  base: ClipBase,
  input: unknown,
  locale: Locale,
  index: Readonly<Record<string, ClipAsset>> = CLIP_ASSET_INDEX,
): ClipAsset | null {
  const key = clipAssetKey(base, input, locale);
  return Object.prototype.hasOwnProperty.call(index, key) ? index[key] : null;
}
