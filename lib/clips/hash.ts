/**
 * The content hash of a clip entry, for the review gate (INTERFACES 8.2): it covers everything a reviewer reads (texts,
 * presets, chapters, the sheet) and the template revision, so editing a clip invalidates the review of its old text.
 * Functions (`invariants`, `check`, `asset`) are not part of it. Server-side only (node:crypto).
 */
import { createHash } from 'node:crypto';
import type { AnyClipEntry } from '@/lib/clips/types';
import { canonicalJSON } from '@/lib/tutor/catalog/hash';

export function clipEntryHash(entry: AnyClipEntry): string {
  const body = {
    id: entry.id,
    kind: entry.kind,
    curriculumTopics: entry.curriculumTopics,
    title: entry.title,
    inputSpec: entry.inputSpec,
    presets: entry.presets,
    engine: entry.engine,
    render: entry.render,
    chapters: entry.chapters,
    sheet: entry.sheet,
  };
  return createHash('sha256').update(canonicalJSON(body)).digest('hex').slice(0, 16);
}
