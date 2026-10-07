import { describe, expect, it } from 'vitest';
import { CLIP_PROFILE, clipAssetKey, clipKeyParts, lookupClipAsset } from '@/lib/clips/assets';
import { CLIP_ASSET_INDEX } from '@/lib/clips/asset-index';
import type { ClipAsset } from '@/lib/clips/types';
import { fakeClip } from './_fake-clip';

const base = fakeClip();
const asset: ClipAsset = {
  chapters: [{ id: 'first', url: '/clips/x/first.mp4', poster: '/clips/x/first.png' }],
};

describe('clip asset lookup', () => {
  it('the shipped index holds only content keys, and none of them is the fake entry', () => {
    for (const k of Object.keys(CLIP_ASSET_INDEX)) expect(k).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lookupClipAsset(base, { a: 2, b: 3 }, 'vi-VN')).toBeNull();
  });

  it('finds an asset by the cache key of the same input, and returns null for another input', () => {
    const key = clipAssetKey(base, { a: 2, b: 3 }, 'vi-VN');
    const index = { [key]: asset };
    expect(lookupClipAsset(base, { a: 2, b: 3 }, 'vi-VN', index)).toBe(asset);
    expect(lookupClipAsset(base, { a: 3, b: 2 }, 'vi-VN', index)).toBeNull();
  });

  it('the locale only matters when the clip bakes text into the picture', () => {
    expect(clipAssetKey(base, { a: 2, b: 3 }, 'vi-VN')).toBe(
      clipAssetKey(base, { a: 2, b: 3 }, 'en-US'),
    );
    const baked = { ...base, bakedText: true };
    expect(clipAssetKey(baked, { a: 2, b: 3 }, 'vi-VN')).not.toBe(
      clipAssetKey(baked, { a: 2, b: 3 }, 'en-US'),
    );
  });

  it('a new templateRev changes the key (old renders are not reused for new content)', () => {
    const rev2 = { ...base, engine: { ...base.engine, templateRev: 2 } };
    expect(clipAssetKey(rev2, { a: 2, b: 3 }, 'vi-VN')).not.toBe(
      clipAssetKey(base, { a: 2, b: 3 }, 'vi-VN'),
    );
  });

  it('a prototype key never counts as a hit', () => {
    expect(
      lookupClipAsset(base, { a: 2, b: 3 }, 'vi-VN', Object.create({ anything: asset })),
    ).toBeNull();
  });

  it('keyParts: id, templateRev, quantised params and null locale when not baked', () => {
    expect(clipKeyParts(base, { a: 2.00000000001, b: 3 }, 'vi-VN')).toEqual([
      base.id,
      1,
      { a: 2, b: 3 },
      null,
    ]);
    expect(clipKeyParts({ ...base, bakedText: true }, { a: 2, b: 3 }, 'vi-VN')[3]).toBe('vi-VN');
    expect(CLIP_PROFILE).toBe('qm-720p30');
  });
});
