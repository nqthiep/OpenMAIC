import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIP_ASSET_INDEX } from '@/lib/clips/asset-index';
import { clipRegistry } from '@/lib/clips';
import { MAX_PUBLIC_BYTES, MAX_PUBLIC_CLIPS } from '@/lib/clips/render-pipeline';
import type { ClipManifest } from '@/lib/clips/manifest';
import { checkManifest } from '@/lib/clips/manifest';
import { mathClipModules } from '@/lib/subjects/math/clips';

const pub = (url: string) => join(process.cwd(), 'public', url);

describe('the clips shipped in public/clips', () => {
  const entries = Object.entries(CLIP_ASSET_INDEX);

  it('every file the index names exists, the sizes add up inside the NFR-P8 budget', () => {
    let bytes = 0;
    const dirs = new Set<string>();
    for (const [key, asset] of entries) {
      expect(key).toMatch(/^sha256:[0-9a-f]{64}$/);
      for (const ch of asset.chapters) {
        for (const url of [ch.url, ch.poster]) {
          expect(existsSync(pub(url)), url).toBe(true);
          bytes += statSync(pub(url)).size;
          dirs.add(url.split('/')[2]);
        }
      }
      expect(asset.manifest && existsSync(pub(asset.manifest)), asset.manifest).toBe(true);
    }
    expect(dirs.size).toBeLessThanOrEqual(MAX_PUBLIC_CLIPS);
    expect(bytes).toBeLessThanOrEqual(MAX_PUBLIC_BYTES);
  });

  it('every shipped manifest agrees with the TypeScript formulas of its preset', () => {
    let checked = 0;
    for (const mod of mathClipModules) {
      for (const p of mod.entry.presets) {
        const asset = mod.entry.asset(p.input as never, 'vi-VN');
        if (!asset) continue;
        const manifest = JSON.parse(readFileSync(pub(asset.manifest!), 'utf8')) as ClipManifest;
        expect(
          checkManifest(mod.entry, mod.expectedDisplay(p.input as never), manifest),
          `${mod.entry.id}/${p.id}`,
        ).toEqual([]);
        expect(asset.chapters.map((c) => c.id)).toEqual(mod.entry.chapters.map((c) => c.id));
        checked++;
      }
    }
    expect(checked).toBe(entries.length);
  });

  it('the registry offers exactly the clips that have a shipped preset', () => {
    const shipped = mathClipModules
      .filter((m) => m.entry.presets.some((p) => m.entry.asset(p.input as never, 'vi-VN')))
      .map((m) => m.entry.id)
      .sort();
    expect([...clipRegistry.prebuiltIds()].sort()).toEqual(shipped);
    expect(shipped.length).toBeGreaterThan(0);
  });
});
