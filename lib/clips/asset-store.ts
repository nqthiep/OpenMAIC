/**
 * The store of rendered clip files that came back from the manim-service (INTERFACES §6, DATA-MODEL §4, task 3C-06).
 * Files are named by the SHA-256 of their bytes, so a name always means the same file: it is served as immutable and a
 * classroom that saved the URL keeps working. **There is no function that deletes a file** (a released clip is never
 * removed, OPERATIONS §5). Local disk only (`data/clips`); S3 is not wired in yet [Unverified].
 * Server-side only.
 */
import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** The only file types a clip asset can have. */
export const CLIP_ASSET_EXTENSIONS = ['mp4', 'png', 'json', 'vtt'] as const;
export type ClipAssetExtension = (typeof CLIP_ASSET_EXTENSIONS)[number];

export const CLIP_ASSET_NAME = /^[0-9a-f]{64}\.(mp4|png|json|vtt)$/;
/** One file may not be larger than this (a chapter is a few MB; a master stays far below). */
export const MAX_CLIP_ASSET_BYTES = 64 * 1024 * 1024;

export const CONTENT_TYPES: Readonly<Record<ClipAssetExtension, string>> = {
  mp4: 'video/mp4',
  png: 'image/png',
  json: 'application/json',
  vtt: 'text/vtt',
};

/** The directory of the store; `CLIP_ASSET_DIR` overrides it (tests, a volume mounted elsewhere). */
export const clipAssetDir = (): string =>
  process.env.CLIP_ASSET_DIR?.trim() || path.join(process.cwd(), 'data', 'clips');

export function isClipAssetName(name: unknown): name is string {
  return typeof name === 'string' && CLIP_ASSET_NAME.test(name);
}

export interface PutResult {
  /** `<sha256 hex>.<ext>` */
  name: string;
  /** the URL the route serves it under */
  url: string;
  /** false when the same bytes were already stored: nothing was written */
  created: boolean;
}

export const clipAssetUrl = (name: string): string => `/api/clips/${name}`;

export async function putClipAsset(
  bytes: Uint8Array,
  ext: ClipAssetExtension,
  dir: string = clipAssetDir(),
): Promise<PutResult> {
  if (!(CLIP_ASSET_EXTENSIONS as readonly string[]).includes(ext))
    throw new Error(`clip asset extension "${ext}" is not allowed`);
  if (bytes.byteLength === 0) throw new Error('a clip asset cannot be empty');
  if (bytes.byteLength > MAX_CLIP_ASSET_BYTES)
    throw new Error('clip asset is larger than the limit');
  const name = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`;
  const target = path.join(dir, name);
  try {
    await fs.access(target);
    return { name, url: clipAssetUrl(name), created: false }; // same bytes, same name: never written again
  } catch {
    // not stored yet
  }
  await fs.mkdir(dir, { recursive: true });
  // write beside the target and rename, so a reader never sees half a file
  const tmp = path.join(dir, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
  await fs.writeFile(tmp, bytes, { flag: 'wx' });
  try {
    await fs.link(tmp, target); // fails if another writer got there first: then theirs stays
    return { name, url: clipAssetUrl(name), created: true };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST')
      return { name, url: clipAssetUrl(name), created: false };
    throw e;
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

/** The absolute path of a stored asset, or null when the name is not a valid asset name or the file is missing. */
export async function clipAssetFile(
  name: string,
  dir: string = clipAssetDir(),
): Promise<{ file: string; size: number; ext: ClipAssetExtension } | null> {
  if (!isClipAssetName(name)) return null;
  const file = path.join(dir, name);
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return null;
    return {
      file,
      size: stat.size,
      ext: name.slice(name.lastIndexOf('.') + 1) as ClipAssetExtension,
    };
  } catch {
    return null;
  }
}
