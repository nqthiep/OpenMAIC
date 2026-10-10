/**
 * The student door's catalog (what the `/learn` page lists): one item per released walkthrough,
 * grouped by curriculum tier. Pure, so the page and its test share it; the server page feeds it the
 * widget registry's entries (which already honours the release gate) and the curriculum index.
 */
import type { Messages } from '@/lib/tutor/catalog/types';
import { buildPractice } from '@/lib/tutor/door/practice';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

/** One topic row of `skills/agent-runtime/*\/references/curriculum/index.json` (only what the door reads). */
export interface CurriculumTopic {
  readonly id: string;
  readonly name_vi: string;
  readonly name_en: string;
  readonly tier: number;
  readonly difficulty?: number;
  readonly tracks?: readonly string[];
}

export interface DoorItem {
  readonly id: string;
  readonly subject: string;
  readonly title: Messages;
  readonly topic: Messages | null;
  readonly tier: number;
  readonly difficulty: number;
  /** `ts10` / `hsg` for informatics; empty for the other subjects. */
  readonly tracks: readonly string[];
  readonly presets: number;
  /** Position in the curriculum's suggested order (smaller first); unplaced entries sort last. */
  readonly order: number;
  /** The entry yields at least one practice question (some entries only ever give the answer away). */
  readonly practice: boolean;
}

const UNPLACED_TIER = 99;
const UNPLACED_ORDER = 9999;

/**
 * The topic ids of a curriculum's `sequencing` block in suggested order: the lists are keyed `grade_8`,
 * `tier_2`, … so they are read by the number in the key (a text sort would put `grade_10` first).
 */
export function sequenceOf(sequencing: Readonly<Record<string, unknown>>): string[] {
  const n = (key: string) => Number(key.match(/\d+/)?.[0] ?? 0);
  return Object.entries(sequencing)
    .filter((e): e is [string, string[]] => Array.isArray(e[1]))
    .sort(([a], [b]) => n(a) - n(b))
    .flatMap(([, ids]) => ids.filter((id) => typeof id === 'string'));
}

export function buildDoorCatalog(
  entries: readonly AnyWalkthroughEntry[],
  topics: readonly CurriculumTopic[],
  sequence: readonly string[] = [],
): DoorItem[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const position = new Map(sequence.map((id, i) => [id, i]));
  const items = entries.map((e): DoorItem => {
    const topic = e.curriculumTopics.map((id) => byId.get(id)).find((t) => t !== undefined);
    return {
      id: e.id,
      subject: e.subject,
      title: e.title,
      topic: topic ? { 'vi-VN': topic.name_vi, 'en-US': topic.name_en } : null,
      tier: topic?.tier ?? UNPLACED_TIER,
      difficulty: topic?.difficulty ?? 0,
      tracks: [...(topic?.tracks ?? [])],
      presets: e.presets.length,
      order: Math.min(
        UNPLACED_ORDER,
        ...e.curriculumTopics.map((id) => position.get(id) ?? UNPLACED_ORDER),
      ),
      practice: ['vi-VN', 'en-US'].some((locale) => buildPractice(e, { locale }).length > 0),
    };
  });
  const title = (i: DoorItem) => i.title['vi-VN'] ?? i.title['en-US'] ?? i.id;
  return items.sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) ||
      a.tier - b.tier ||
      a.order - b.order ||
      a.difficulty - b.difficulty ||
      title(a).localeCompare(title(b)) ||
      a.id.localeCompare(b.id),
  );
}
