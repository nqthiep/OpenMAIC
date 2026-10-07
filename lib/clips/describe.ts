/**
 * Static digest of a clip slide for the tutor prompt (ARCHITECTURE §8b). From the scene we read only
 * the video element's name; every word comes from `entry.sheet`, never from the slide text, so text
 * injected into a slide (or a slide image) cannot steer the tutor.
 */
import { parseClipName } from '@/lib/clips/name';
import type { AnyClipEntry } from '@/lib/clips/types';
import { msg } from '@/lib/tutor/catalog/messages';

export const MAX_CLIP_DIGEST_CHARS = 1500;

export interface ClipDescribeDeps {
  findClip(id: string): AnyClipEntry | undefined;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** The `clip:` video element name of a slide scene, or null. */
export function clipNameOfScene(scene: unknown): string | null {
  const canvas = asRecord(asRecord(asRecord(scene)?.content)?.canvas);
  const elements = Array.isArray(canvas?.elements) ? canvas.elements : [];
  for (const el of elements) {
    const e = asRecord(el);
    if (e?.type === 'video' && typeof e.name === 'string' && e.name.startsWith('clip:')) {
      return e.name;
    }
  }
  return null;
}

export function describeClip(scene: unknown, deps: ClipDescribeDeps, locale = 'vi-VN'): string {
  const name = clipNameOfScene(scene);
  const ref = parseClipName(name);
  if (!ref) return 'A clip slide whose reference is not valid.';
  const entry = deps.findClip(ref.clipId);
  const chapter = entry?.sheet.chapters.find((c) => c.id === ref.chapterId);
  if (!entry || !chapter)
    return `A clip slide "${ref.clipId}#${ref.chapterId}" that is no longer in the catalog.`;
  const t = (m: Parameters<typeof msg>[0]) => msg(m, locale);
  const lines = [
    `Clip "${t(entry.title)}", chapter "${ref.chapterId}" (silent video; the teacher speaks over it).`,
    `It shows: ${t(chapter.shows)}`,
  ];
  if (chapter.formulas.length > 0) lines.push(`Formulas: ${chapter.formulas.join('; ')}`);
  if (chapter.misconceptions.length > 0) {
    lines.push(`Common misconceptions: ${chapter.misconceptions.map(t).join('; ')}`);
  }
  return lines.join('\n').slice(0, MAX_CLIP_DIGEST_CHARS);
}
