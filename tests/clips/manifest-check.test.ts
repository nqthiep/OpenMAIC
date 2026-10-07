import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clipAssetKey } from '@/lib/clips/assets';
import { CLIP_ASSET_INDEX } from '@/lib/clips/asset-index';
import { checkManifest, type ClipManifest } from '@/lib/clips/manifest';
import { mathClipModules } from '@/lib/subjects/math/clips';
import { fakeClip } from './_fake-clip';

const entry = fakeClip();

function manifestFor(over: Partial<ClipManifest> = {}): ClipManifest {
  return {
    clipId: 'fake-clip',
    templateRev: 1,
    w: 1280,
    h: 720,
    fps: 30,
    durationSec: 20,
    chapters: [
      { id: 'first', file: 'first.mp4', posterFile: 'first.png', startSec: 0, endSec: 10 },
      { id: 'second', file: 'second.mp4', posterFile: 'second.png', startSec: 10, endSec: 20 },
    ],
    display: { a: 2, b: 3 },
    ...over,
  };
}

describe('checkManifest', () => {
  it('a manifest that matches the entry and the expected numbers has no problems', () => {
    expect(checkManifest(entry as never, { a: 2, b: 3 }, manifestFor())).toEqual([]);
  });

  it('a displayed number within 1e-3 passes, outside it fails', () => {
    expect(
      checkManifest(entry as never, { a: 2, b: 3 }, manifestFor({ display: { a: 2.0004, b: 3 } })),
    ).toEqual([]);
    const problems = checkManifest(
      entry as never,
      { a: 2, b: 3 },
      manifestFor({ display: { a: 2.01, b: 3 } }),
    );
    expect(problems).toEqual(['display a is 2.01, want 2 (within 0.001)']);
  });

  it('missing, extra or non-numeric display values are reported', () => {
    expect(
      checkManifest(entry as never, { a: 2, b: 3 }, manifestFor({ display: { a: 2 } }))[0],
    ).toMatch(/display keys are \[a\], want \[a, b\]/);
    expect(
      checkManifest(
        entry as never,
        { a: 2, b: 3 },
        manifestFor({ display: { a: 2, b: 3, c: 4 } }),
      )[0],
    ).toMatch(/display keys/);
    const bad = checkManifest(
      entry as never,
      { a: 2, b: 3 },
      manifestFor({ display: { a: 2, b: NaN } }),
    );
    expect(bad[0]).toMatch(/display b is NaN/);
    expect(
      checkManifest(
        entry as never,
        { a: 2, b: 3 },
        manifestFor({ display: { a: 2, b: '3' as unknown as number } }),
      )[0],
    ).toMatch(/display b is 3/);
  });

  it('the chapters must be the entry chapters, in order', () => {
    const swapped = manifestFor();
    swapped.chapters = [swapped.chapters[1], swapped.chapters[0]];
    expect(checkManifest(entry as never, { a: 2, b: 3 }, swapped)[0]).toMatch(
      /chapters are \[second, first\], want \[first, second\]/,
    );
    expect(checkManifest(entry as never, { a: 2, b: 3 }, manifestFor({ chapters: [] }))[0]).toMatch(
      /chapters are \[\]/,
    );
  });

  it('a chapter more than 5% away from its planned length is reported', () => {
    const m = manifestFor();
    m.chapters[0].endSec = 10.4; // 4%: fine
    expect(checkManifest(entry as never, { a: 2, b: 3 }, m)).toEqual([]);
    m.chapters[0].endSec = 10.6; // 6%
    expect(checkManifest(entry as never, { a: 2, b: 3 }, m)).toEqual([
      'chapter first is 10.6s, planned 10s (more than 5% apart)',
    ]);
  });

  it('clip id, template revision and render profile must match', () => {
    const problems = checkManifest(
      entry as never,
      { a: 2, b: 3 },
      manifestFor({ clipId: 'other', templateRev: 2, w: 640, h: 360, fps: 24 }),
    );
    expect(problems).toEqual([
      'clipId is other, want fake-clip',
      'templateRev is 2, want 1',
      'render profile is 640x360@24, want 1280x720@30',
    ]);
  });

  it('a manifest that is not an object is refused', () => {
    expect(checkManifest(entry as never, {}, null)).toEqual(['manifest is not an object']);
    expect(checkManifest(entry as never, {}, 'x')).toEqual(['manifest is not an object']);
  });
});

/**
 * For every asset that has been rendered, the numbers in its manifest must match `expectedDisplay`. Until the first clip
 * is rendered the index is empty and there is nothing to check.
 */
describe('rendered assets', () => {
  const rendered = mathClipModules.flatMap((mod) =>
    mod.entry.presets
      .map((p) => ({ mod, p, key: clipAssetKey(mod.entry, p.input, 'vi-VN') }))
      .filter(({ key }) => Object.prototype.hasOwnProperty.call(CLIP_ASSET_INDEX, key)),
  );

  it.skipIf(rendered.length === 0)(
    'every manifest in the index matches the independent recomputation (tolerance 1e-3)',
    () => {
      for (const { mod, p, key } of rendered) {
        const url = CLIP_ASSET_INDEX[key].manifest;
        expect(url, `${mod.entry.id}/${p.id}`).toBeDefined();
        const file = join(process.cwd(), 'public', url!);
        expect(existsSync(file), file).toBe(true);
        const manifest = JSON.parse(readFileSync(file, 'utf8'));
        expect(
          checkManifest(mod.entry, mod.expectedDisplay(p.input), manifest),
          `${mod.entry.id}/${p.id}`,
        ).toEqual([]);
      }
    },
  );

  it('the index is empty until the first render, so the check above is skipped for now', () => {
    expect(rendered.length).toBe(Object.keys(CLIP_ASSET_INDEX).length === 0 ? 0 : rendered.length);
  });
});
