import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/clips/[...path]/route';
import * as store from '@/lib/clips/asset-store';
import {
  MAX_CLIP_ASSET_BYTES,
  clipAssetFile,
  isClipAssetName,
  putClipAsset,
} from '@/lib/clips/asset-store';

let dir = '';
let original: string | undefined;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'clip-store-'));
  original = process.env.CLIP_ASSET_DIR;
  process.env.CLIP_ASSET_DIR = dir;
});
afterAll(() => {
  if (original === undefined) delete process.env.CLIP_ASSET_DIR;
  else process.env.CLIP_ASSET_DIR = original;
  rmSync(dir, { recursive: true, force: true });
});

const bytes = (s: string) => new TextEncoder().encode(s);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('putClipAsset', () => {
  it('names the file by the SHA-256 of its bytes and returns the route URL', async () => {
    const data = bytes('hello clip');
    const r = await putClipAsset(data, 'mp4', dir);
    expect(r).toEqual({
      name: `${sha(data)}.mp4`,
      url: `/api/clips/${sha(data)}.mp4`,
      created: true,
    });
    expect(readFileSync(join(dir, r.name))).toEqual(Buffer.from(data));
  });

  it('writing the same bytes again changes nothing: not rewritten, same name, created false', async () => {
    const data = bytes('same bytes');
    const first = await putClipAsset(data, 'png', dir);
    const old = new Date(2020, 0, 1);
    utimesSync(join(dir, first.name), old, old);
    const again = await putClipAsset(data, 'png', dir);
    expect(again).toMatchObject({ name: first.name, created: false });
    expect(statSync(join(dir, first.name)).mtime.getTime()).toBe(old.getTime()); // the file was not touched
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]); // no leftover temporary file
  });

  it('refuses an empty file, an unknown extension and an oversized file', async () => {
    await expect(putClipAsset(new Uint8Array(0), 'mp4', dir)).rejects.toThrow('empty');
    await expect(putClipAsset(bytes('x'), 'exe' as never, dir)).rejects.toThrow('not allowed');
    await expect(
      putClipAsset(new Uint8Array(MAX_CLIP_ASSET_BYTES + 1), 'mp4', dir),
    ).rejects.toThrow('larger than the limit');
  });

  it('two concurrent writes of the same bytes both succeed and leave one file', async () => {
    const data = bytes('race');
    const results = await Promise.all([
      putClipAsset(data, 'json', dir),
      putClipAsset(data, 'json', dir),
      putClipAsset(data, 'json', dir),
    ]);
    expect(new Set(results.map((r) => r.name)).size).toBe(1);
    expect(results.filter((r) => r.created).length).toBeGreaterThanOrEqual(1);
    expect(readdirSync(dir).filter((f) => f.startsWith(sha(data)))).toHaveLength(1);
  });

  it('the module has no way to delete a file (a released clip is never removed)', () => {
    expect(
      Object.keys(store).filter((k) => /remove|delete|unlink|rm|clean|purge/i.test(k)),
    ).toEqual([]);
  });
});

describe('names', () => {
  it('only <64 hex>.<mp4|png|json|vtt> is a valid asset name', () => {
    const h = 'a'.repeat(64);
    for (const ok of [`${h}.mp4`, `${h}.png`, `${h}.json`, `${h}.vtt`])
      expect(isClipAssetName(ok)).toBe(true);
    for (const bad of [
      '',
      'x.mp4',
      `${h}`,
      `${h}.exe`,
      `${h}.mp4.exe`,
      `../${h}.mp4`,
      `${h}/../x.mp4`,
      `${'A'.repeat(64)}.mp4`,
      `${h.slice(1)}.mp4`,
      `${h}.MP4`,
      `${h}.mp4\0`,
      null,
      7,
    ]) {
      expect(isClipAssetName(bad as never), String(bad)).toBe(false);
    }
  });

  it('clipAssetFile finds a stored asset and returns null for a missing or invalid one', async () => {
    const r = await putClipAsset(bytes('findable'), 'vtt', dir);
    expect(await clipAssetFile(r.name, dir)).toMatchObject({ size: 8, ext: 'vtt' });
    expect(await clipAssetFile(`${'b'.repeat(64)}.mp4`, dir)).toBeNull();
    expect(await clipAssetFile('../../etc/passwd', dir)).toBeNull();
  });
});

describe('GET /api/clips/[...path]', () => {
  const get = (segments: string[], range?: string) =>
    GET(
      new Request('http://localhost/api/clips/x', {
        headers: range ? { Range: range } : {},
      }) as unknown as NextRequest,
      {
        params: Promise.resolve({ path: segments }),
      },
    );
  const text = async (res: Response) => new TextDecoder().decode(await res.arrayBuffer());

  it('serves a file whole with immutable caching, its content type and Accept-Ranges', async () => {
    const r = await putClipAsset(bytes('0123456789'), 'mp4', dir);
    const res = await get([r.name]);
    expect(res.status).toBe(200);
    expect(await text(res)).toBe('0123456789');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-length')).toBe('10');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('answers a byte range with 206 and Content-Range, a suffix range too', async () => {
    const r = await putClipAsset(bytes('abcdefghij'), 'mp4', dir);
    const part = await get([r.name], 'bytes=2-5');
    expect(part.status).toBe(206);
    expect(await text(part)).toBe('cdef');
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(part.headers.get('content-length')).toBe('4');
    const tail = await get([r.name], 'bytes=-3');
    expect(await text(tail)).toBe('hij');
    expect(tail.headers.get('content-range')).toBe('bytes 7-9/10');
  });

  it('an unsatisfiable range is a 416 that is never cached', async () => {
    const r = await putClipAsset(bytes('abcdefghij'), 'mp4', dir);
    const res = await get([r.name], 'bytes=50-60');
    expect(res.status).toBe(416);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });

  it('refuses every odd name with 404: traversal, extra segments, wrong extension, unknown hash', async () => {
    const r = await putClipAsset(bytes('secret-ish'), 'png', dir);
    writeFileSync(join(dir, 'notes.txt'), 'x');
    for (const segments of [
      ['..', r.name],
      ['notes.txt'],
      [`${r.name}`, 'more'],
      [`${'c'.repeat(64)}.mp4`],
      [''],
      [],
      ['%2e%2e%2fpasswd'],
    ]) {
      expect((await get(segments)).status, JSON.stringify(segments)).toBe(404);
    }
  });
});
