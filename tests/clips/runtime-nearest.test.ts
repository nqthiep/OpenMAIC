import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { nearestPreset, paramDistance } from '@/lib/clips/nearest';
import {
  getRuntimeAsset,
  recordRuntimeAsset,
  resetRuntimeIndexCache,
} from '@/lib/clips/runtime-index';
import type { ClipAsset } from '@/lib/clips/types';
import { amgmSemicircleEntry } from '@/lib/subjects/math/clips/amgm-semicircle';
import { secantTangentEntry } from '@/lib/subjects/math/clips/secant-tangent';
import { tilingColoringEntry } from '@/lib/subjects/math/clips/tiling-coloring';

describe('nearestPreset', () => {
  it('picks the preset with the smallest relative distance (amgm: a, b in 1..20)', () => {
    expect(nearestPreset(amgmSemicircleEntry, { a: 2, b: 7 })?.id).toBe('two-eight');
    expect(nearestPreset(amgmSemicircleEntry, { a: 4, b: 5 })?.id).toBe('equal');
    expect(nearestPreset(amgmSemicircleEntry, { a: 1, b: 19 })?.id).toBe('far');
    expect(nearestPreset(amgmSemicircleEntry, { a: 10, b: 15 })?.id).toBe('nine-sixteen');
  });

  it('the first preset wins a tie, and an exact preset has distance 0', () => {
    const exact = nearestPreset(amgmSemicircleEntry, amgmSemicircleEntry.presets[2].input);
    expect(exact).toEqual({ id: 'far', distance: 0 });
    // equidistant from two-eight (2,8) and a hypothetical: the earlier one is kept
    expect(
      nearestPreset(
        {
          ...amgmSemicircleEntry,
          presets: [amgmSemicircleEntry.presets[0], amgmSemicircleEntry.presets[0]],
        },
        { a: 3, b: 8 },
      )?.id,
    ).toBe('two-eight');
  });

  it('enums count 0 or 1 and arrays are compared position by position', () => {
    expect(nearestPreset(tilingColoringEntry, { n: 8, removed: 'adjacent' })?.id).toBe(
      'n8-adjacent',
    );
    // a choice is 0 or 1, never "close": 6 is as far from 8 as from 4, so the first preset with the same `removed` wins
    expect(nearestPreset(tilingColoringEntry, { n: 6, removed: 'opposite-corners' })?.id).toBe(
      'n8-opposite',
    );
    const quad = nearestPreset(secantTangentEntry, { c: [0, 0, 1], x0: 2 });
    expect(quad?.id).toBe('square-at-1');
    expect(
      paramDistance({ kind: 'int-array', len: [2, 4], range: [-3, 3] }, [0, 1], [0, 1, 2]),
    ).toBeCloseTo(1, 9); // the extra element counts 1
    expect(paramDistance({ kind: 'enum', values: ['a', 'b'] }, 'a', 'b')).toBe(1);
    expect(paramDistance({ kind: 'int', range: [0, 10] }, 2, 7)).toBeCloseTo(0.5, 9);
  });

  it('wrong shapes are far, not an error; an entry without presets has none', () => {
    expect(paramDistance({ kind: 'int', range: [0, 10] }, 'x', 3)).toBe(1);
    expect(paramDistance({ kind: 'record', fields: {} }, null, {})).toBe(1);
    expect(nearestPreset({ ...amgmSemicircleEntry, presets: [] }, { a: 1, b: 1 })).toBeNull();
  });
});

describe('runtime index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clip-index-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  beforeEach(() => resetRuntimeIndexCache());
  const asset: ClipAsset = {
    chapters: [{ id: 'a', url: '/api/clips/a.mp4', poster: '/api/clips/a.png' }],
    manifest: '/api/clips/m.json',
  };

  it('is empty at first, remembers an asset across a restart (the file), and never overwrites a key', async () => {
    expect(await getRuntimeAsset('sha256:k', dir)).toBeNull();
    await recordRuntimeAsset('sha256:k', asset, dir);
    expect(await getRuntimeAsset('sha256:k', dir)).toEqual(asset);
    resetRuntimeIndexCache(); // as after a restart: read from the file
    expect(await getRuntimeAsset('sha256:k', dir)).toEqual(asset);
    await recordRuntimeAsset('sha256:k', { chapters: [] }, dir);
    expect(await getRuntimeAsset('sha256:k', dir)).toEqual(asset);
    expect(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))['sha256:k']).toEqual(asset);
  });

  it('a prototype key is never a hit, and a corrupt file starts an empty index', async () => {
    expect(await getRuntimeAsset('constructor', dir)).toBeNull();
    const bad = mkdtempSync(join(tmpdir(), 'clip-index-bad-'));
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(bad, 'index.json'), '{not json');
    resetRuntimeIndexCache();
    expect(await getRuntimeAsset('x', bad)).toBeNull();
    await recordRuntimeAsset('x', asset, bad);
    expect(await getRuntimeAsset('x', bad)).toEqual(asset);
    rmSync(bad, { recursive: true, force: true });
  });
});
