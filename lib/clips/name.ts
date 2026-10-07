/**
 * Element name of a clip video (DATA-MODEL §4): `clip:<id>@<hash>#<chapterId>`. The name is the only
 * link from a slide back to the catalog, so it is parsed strictly and the text of the slide is never read.
 * Server-side only: hashing uses node:crypto.
 */
import { createHash } from 'node:crypto';
import type { AnyClipEntry } from '@/lib/clips/types';
import { canonicalJSON } from '@/lib/tutor/catalog/hash';

const NAME = /^clip:([a-z0-9][a-z0-9-]*)@([0-9a-f]{12})#([a-z0-9][a-z0-9-]*)$/;

export interface ClipRef {
  readonly clipId: string;
  readonly hash: string;
  readonly chapterId: string;
}

export function clipElementName(clipId: string, hash: string, chapterId: string): string {
  return `clip:${clipId}@${hash}#${chapterId}`;
}

/** null when `name` is not a well-formed clip name. */
export function parseClipName(name: unknown): ClipRef | null {
  if (typeof name !== 'string') return null;
  const m = NAME.exec(name);
  return m ? { clipId: m[1], hash: m[2], chapterId: m[3] } : null;
}

/** 12 hex digits identifying the content of one preset: the app's part of the cache key + `templateRev`. */
export function clipContentHash(entry: AnyClipEntry, presetInput: unknown, locale: string): string {
  const body = canonicalJSON([
    entry.id,
    entry.engine.templateRev,
    entry.cacheKeyInput(presetInput as never, locale),
  ]);
  return createHash('sha256').update(body).digest('hex').slice(0, 12);
}
