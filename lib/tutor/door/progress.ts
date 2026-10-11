/**
 * Teacher / parent progress: what learners did in walkthroughs (`tutorLearning`) and practice quizzes
 * (`quizAttempt`), read straight from the runtime tables.
 *
 * The runtime store deliberately has no cross-learner listing (every store call is partition-scoped),
 * so this is the one place that reads across learners. It is only reachable behind the teacher code
 * (`lib/server/teacher-gate.ts`); `summarize` is pure so it can be tested without a database.
 */
import { createHash } from 'node:crypto';

import type { Queryable } from '@openmaic/storage/document/pg';

export const PROGRESS_ROW_LIMIT = 50_000;
const HARD_BEAT_MIN_ANSWERS = 3;
const HARD_BEAT_MAX_RATE = 0.6;
const LABEL_HEX_DIGITS = 12;
const NAME_PREFIX = /^(Học sinh|Student): /;

export interface RawRecord {
  readonly stageId: string;
  readonly learnerKey: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly payload: unknown;
  readonly stageName: string;
  readonly stageDescription: string | null;
}

export interface AttemptRow {
  readonly stageId: string;
  readonly who: string;
  readonly lesson: string;
  readonly walkthroughId: string | null;
  /** Steps reached, and the steps of the presets this learner ran (null when unknown). */
  readonly beats: { readonly reached: number; readonly total: number | null };
  readonly predictions: { readonly answered: number; readonly correct: number };
  readonly hints: number;
  readonly practice: { readonly correct: number; readonly total: number } | null;
  /** Latest lesson-level "easy to understand" rating, 1..5; null when the learner did not rate. */
  readonly easy: number | null;
  readonly lastAt: string;
}

export interface HardBeat {
  readonly beatId: string;
  /** Step name a teacher can read; undefined when the lesson no longer defines the step. */
  readonly label: string | undefined;
  readonly answered: number;
  readonly rate: number;
}

export interface LessonRow {
  readonly walkthroughId: string;
  readonly title: string;
  readonly attempts: number;
  readonly predictionRate: number | null;
  readonly hintsPerAttempt: number;
  readonly practiceRate: number | null;
  /** Mean lesson-level "easy to understand" rating over the learners who rated; null when none did. */
  readonly easyAverage: number | null;
  readonly easyCount: number;
  /** Beats most learners miss: at least 3 answers and under 60% right, worst first. */
  readonly hardBeats: readonly HardBeat[];
}

export interface ProgressReport {
  readonly generatedAt: string;
  /** True when older learning records exist beyond {@link PROGRESS_ROW_LIMIT} and are not counted. */
  readonly truncated: boolean;
  readonly attempts: readonly AttemptRow[];
  readonly lessons: readonly LessonRow[];
}

export interface LessonMeta {
  readonly title: string;
  /** Beats of the whole lesson; used only when `presetBeats` is not given. */
  readonly beatCount: number;
  /** Beat id to the step name shown to teachers. */
  readonly beatLabels?: Readonly<Record<string, string>>;
  /** Distinct beat ids a preset plays; null when the preset cannot be read. */
  readonly presetBeats?: (presetId: string) => readonly string[] | null;
}

type Payload = Record<string, unknown>;
const asPayload = (v: unknown): Payload | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Payload) : null;

/** A quiz result the AI grader failed on: `status: 'ungraded'`, or the null `correct` of older records. */
const isUngraded = (x: Payload): boolean => x.status === 'ungraded' || x.correct === null;

/** SHA-256 of the learner key, cut to 12 hex digits: a stable pseudonym that tells learners apart. */
function tagOf(key: string): string {
  return createHash('sha256').update(key).digest('hex').slice(0, LABEL_HEX_DIGITS);
}

/**
 * Steps reached and steps planned, counted over the presets the learner ran. The whole lesson is never
 * the denominator: a preset may play only some of its steps.
 */
function stepCount(
  meta: LessonMeta | null,
  presetsRun: ReadonlySet<string>,
  reached: ReadonlySet<string>,
): { reached: number; total: number | null } {
  if (!meta) return { reached: reached.size, total: null };
  if (!meta.presetBeats) return { reached: reached.size, total: meta.beatCount };

  const planned = new Set<string>();
  let known = false;
  for (const preset of presetsRun) {
    const ids = meta.presetBeats(preset);
    if (!ids) continue;
    known = true;
    for (const id of ids) planned.add(id);
  }
  if (!known) return { reached: reached.size, total: null };
  return {
    reached: [...reached].filter((id) => planned.has(id)).length,
    total: planned.size,
  };
}

interface Group {
  records: RawRecord[];
}

export function summarize(
  rows: readonly RawRecord[],
  lessonMeta: (walkthroughId: string) => LessonMeta | null,
  now: () => string = () => new Date().toISOString(),
  truncated = false,
): ProgressReport {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.stageId}\u0000${r.learnerKey}`;
    const g = groups.get(key) ?? { records: [] };
    g.records.push(r);
    groups.set(key, g);
  }

  const beatStats = new Map<string, Map<string, { answered: number; correct: number }>>();
  const attempts: AttemptRow[] = [];

  for (const g of groups.values()) {
    const first = g.records[0];
    const reached = new Set<string>();
    const presetsRun = new Set<string>();
    let walkthroughId: string | null = null;
    let answered = 0;
    let correct = 0;
    let hints = 0;
    let easy: number | null = null;
    let practice: AttemptRow['practice'] = null;
    let lastAt = '';
    const predictions: { beatId: string; correct: boolean }[] = [];

    for (const r of g.records) {
      if (r.createdAt > lastAt) lastAt = r.createdAt;
      const p = asPayload(r.payload);
      if (!p) continue;
      if (r.kind === 'tutorLearning') {
        if (p.type === 'beat' && typeof p.beatId === 'string') {
          reached.add(p.beatId);
          if (typeof p.walkthroughId === 'string') walkthroughId = p.walkthroughId;
          if (typeof p.preset === 'string') presetsRun.add(p.preset);
        } else if (p.type === 'prediction' && typeof p.beatId === 'string' && p.skipped !== true) {
          answered += 1;
          if (p.correct === true) correct += 1;
          predictions.push({ beatId: p.beatId, correct: p.correct === true });
        } else if (p.type === 'hint') {
          hints += 1;
        } else if (
          p.type === 'rating' &&
          typeof p.easy === 'number' &&
          p.easy >= 1 &&
          p.easy <= 5
        ) {
          // Records are read oldest first, so the last rating wins.
          easy = p.easy;
        }
      } else if (r.kind === 'quizAttempt' && (p.phase === 'submitted' || p.phase === 'reviewed')) {
        const results = Array.isArray(p.results) ? (p.results as Payload[]) : [];
        if (results.length > 0) {
          // A grader failure is neither right nor wrong, so it is left out of the practice rate.
          // Older records mark it with `correct: null` alone; the rule matches state-context.
          const graded = results.filter((x) => !isUngraded(x));
          if (graded.length > 0) {
            practice = {
              correct: graded.filter((x) => x.status === 'correct').length,
              total: graded.length,
            };
          }
          const qid = results[0].questionId;
          if (walkthroughId === null && typeof qid === 'string' && qid.includes(':')) {
            walkthroughId = qid.slice(0, qid.indexOf(':'));
          }
        }
      }
    }

    const meta = walkthroughId ? lessonMeta(walkthroughId) : null;
    if (walkthroughId) {
      const per = beatStats.get(walkthroughId) ?? new Map();
      for (const x of predictions) {
        const s = per.get(x.beatId) ?? { answered: 0, correct: 0 };
        s.answered += 1;
        if (x.correct) s.correct += 1;
        per.set(x.beatId, s);
      }
      beatStats.set(walkthroughId, per);
    }
    const named = first.stageDescription?.match(NAME_PREFIX)
      ? first.stageDescription.replace(NAME_PREFIX, '').trim()
      : null;
    attempts.push({
      stageId: first.stageId,
      who: named || `#${tagOf(first.learnerKey)}`,
      lesson: meta?.title ?? first.stageName,
      walkthroughId,
      beats: stepCount(meta, presetsRun, reached),
      predictions: { answered, correct },
      hints,
      practice,
      easy,
      lastAt,
    });
  }
  attempts.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));

  const lessons: LessonRow[] = [];
  const ids = [...new Set(attempts.map((a) => a.walkthroughId).filter((x): x is string => !!x))];
  for (const id of ids) {
    const mine = attempts.filter((a) => a.walkthroughId === id);
    const meta = lessonMeta(id);
    const answered = mine.reduce((n, a) => n + a.predictions.answered, 0);
    const correct = mine.reduce((n, a) => n + a.predictions.correct, 0);
    const withPractice = mine.filter((a) => a.practice);
    const pTotal = withPractice.reduce((n, a) => n + a.practice!.total, 0);
    const pCorrect = withPractice.reduce((n, a) => n + a.practice!.correct, 0);
    const rated = mine.flatMap((a) => (a.easy === null ? [] : [a.easy]));
    const hardBeats = [...(beatStats.get(id) ?? [])]
      .map(([beatId, s]) => ({
        beatId,
        label: meta?.beatLabels?.[beatId],
        answered: s.answered,
        rate: s.correct / s.answered,
      }))
      .filter((b) => b.answered >= HARD_BEAT_MIN_ANSWERS && b.rate < HARD_BEAT_MAX_RATE)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3);
    lessons.push({
      walkthroughId: id,
      title: meta?.title ?? id,
      attempts: mine.length,
      predictionRate: answered > 0 ? correct / answered : null,
      hintsPerAttempt: mine.reduce((n, a) => n + a.hints, 0) / mine.length,
      practiceRate: pTotal > 0 ? pCorrect / pTotal : null,
      easyAverage: rated.length > 0 ? rated.reduce((n, x) => n + x, 0) / rated.length : null,
      easyCount: rated.length,
      hardBeats,
    });
  }
  lessons.sort((a, b) => b.attempts - a.attempts || a.walkthroughId.localeCompare(b.walkthroughId));

  return { generatedAt: now(), truncated, attempts, lessons };
}

/**
 * The newest `PROGRESS_ROW_LIMIT` learning records of live courses, oldest first. One extra row is
 * asked for, so `truncated` says whether older records were left out.
 */
export async function loadProgressRecords(
  db: Queryable,
): Promise<{ records: RawRecord[]; truncated: boolean }> {
  const res = await db.query<{
    stage_id: string;
    learner_key: string;
    kind: string;
    created_at: string;
    payload: unknown;
    stage_name: string;
    stage_description: string | null;
  }>(
    `SELECT s.stage_id, s.learner_key, s.kind, r.created_at, r.data->'payload' AS payload,
            d.name AS stage_name, d.description AS stage_description
       FROM runtime_records r
       JOIN runtime_sessions s ON s.id = r.session_id
       JOIN document_stages d ON d.id = s.stage_id
       JOIN stage_meta m ON m.stage_id = d.id AND m.deleted_at IS NULL
      WHERE s.kind IN ('tutorLearning', 'quizAttempt')
      ORDER BY r.created_at DESC, r.seq DESC
      LIMIT $1`,
    [PROGRESS_ROW_LIMIT + 1],
  );
  const truncated = res.rows.length > PROGRESS_ROW_LIMIT;
  const records = res.rows
    .slice(0, PROGRESS_ROW_LIMIT)
    .map((row) => ({
      stageId: row.stage_id,
      learnerKey: row.learner_key,
      kind: row.kind,
      createdAt: row.created_at,
      payload: row.payload,
      stageName: row.stage_name,
      stageDescription: row.stage_description,
    }))
    .reverse();
  return { records, truncated };
}
