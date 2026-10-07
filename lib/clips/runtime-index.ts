/**
 * The index of clips rendered on demand (task 3C-08): cache key → files, kept in `<store dir>/index.json` beside the
 * assets they name. It is the run-time twin of the build-time `generated/asset-index.json`; a second request for the
 * same parameters finds its clip here and answers at once. Entries are only ever added (a released clip is never removed).
 * Server-side only. Writes are atomic (temporary file then rename).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { clipAssetDir } from '@/lib/clips/asset-store';
import type { ClipAsset } from '@/lib/clips/types';

const FILE = 'index.json';
let cache: { dir: string; index: Record<string, ClipAsset> } | null = null;

async function load(dir: string): Promise<Record<string, ClipAsset>> {
  if (cache && cache.dir === dir) return cache.index;
  let index: Record<string, ClipAsset> = {};
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path.join(dir, FILE), 'utf8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
      index = parsed as Record<string, ClipAsset>;
  } catch {
    // no index yet, or an unreadable one: start empty (the files themselves are still there)
  }
  cache = { dir, index };
  return index;
}

export async function getRuntimeAsset(
  key: string,
  dir: string = clipAssetDir(),
): Promise<ClipAsset | null> {
  const index = await load(dir);
  return Object.prototype.hasOwnProperty.call(index, key) ? index[key] : null;
}

/** Adds an entry; an existing key is never overwritten (the same key always names the same render). */
export async function recordRuntimeAsset(
  key: string,
  asset: ClipAsset,
  dir: string = clipAssetDir(),
): Promise<void> {
  const index = await load(dir);
  if (Object.prototype.hasOwnProperty.call(index, key)) return;
  index[key] = asset;
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${FILE}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, `${JSON.stringify(index, null, 2)}\n`);
  await fs.rename(tmp, path.join(dir, FILE));
}

/** Test seam: forget the in-memory copy so the next call reads the file again. */
export function resetRuntimeIndexCache(): void {
  cache = null;
}
