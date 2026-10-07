/**
 * Rendered clip files by cache key. The data is `generated/asset-index.json`, written by `scripts/render-clips.ts`
 * (task 3A-07); it is empty until the first clip is rendered, so every clip is "not prebuilt" and the clip tool
 * answers `clip-not-prebuilt`.
 */
import index from '@/lib/clips/generated/asset-index.json';
import type { ClipAsset } from '@/lib/clips/types';

export const CLIP_ASSET_INDEX: Readonly<Record<string, ClipAsset>> = index as Record<
  string,
  ClipAsset
>;
