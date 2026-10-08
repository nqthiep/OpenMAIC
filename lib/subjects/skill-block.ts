/**
 * Walkthrough id block for a subject skill's SKILL.md (ADR 0006 decision 6b, task 1b-23).
 * Pure and deterministic: the same packs and locale always give the same text.
 * Used by `scripts/generate-skill-catalog.ts` (writes it) and `tests/tutor/skill-catalog-sync.test.ts` (checks it).
 */
import { msg } from '@/lib/tutor/catalog/messages';
import type { SubjectPack } from '@/lib/widgets/types';

export const WALKTHROUGH_IDS_BEGIN = '<!-- BEGIN GENERATED: walkthrough-ids -->';
export const WALKTHROUGH_IDS_END = '<!-- END GENERATED: walkthrough-ids -->';

/** Keep a value on one table row: no pipes, no line breaks. */
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const codeList = (ids: readonly string[]): string => ids.map((id) => `\`${cell(id)}\``).join(', ');

/** Markdown table of every walkthrough, sorted by id (plain code-unit order, no locale). */
export function renderWalkthroughIdBlock(
  packs: readonly SubjectPack[],
  locale: string = 'en-US',
): string {
  const entries = packs
    .flatMap((p) => p.walkthroughs)
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rows = entries.map(
    (e) =>
      `| \`${cell(e.id)}\` | ${cell(msg(e.title, locale))} | ${codeList(e.presets.map((p) => p.id))} | ${codeList(e.curriculumTopics)} |`,
  );
  return [
    '| walkthroughId | Title | presetId | Curriculum topics |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/** Text between the markers (trimmed of the surrounding newlines), or null when a marker is missing. */
export function extractWalkthroughIdBlock(md: string): string | null {
  const start = md.indexOf(WALKTHROUGH_IDS_BEGIN);
  const end = md.indexOf(WALKTHROUGH_IDS_END);
  if (start < 0 || end < start) return null;
  return md.slice(start + WALKTHROUGH_IDS_BEGIN.length, end).replace(/^\n+|\n+$/g, '');
}

/** Replaces the text between the markers with `block`; throws when a marker is missing. */
export function replaceWalkthroughIdBlock(md: string, block: string): string {
  if (extractWalkthroughIdBlock(md) === null) {
    throw new Error(`SKILL.md must contain ${WALKTHROUGH_IDS_BEGIN} ... ${WALKTHROUGH_IDS_END}`);
  }
  const start = md.indexOf(WALKTHROUGH_IDS_BEGIN) + WALKTHROUGH_IDS_BEGIN.length;
  return `${md.slice(0, start)}\n${block}\n${md.slice(md.indexOf(WALKTHROUGH_IDS_END))}`;
}
