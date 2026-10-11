/**
 * The teacher progress report on fabricated records: the summary is pure, and the loader is run
 * against an in-memory query stub. No database is touched.
 */
import { describe, expect, it } from 'vitest';
import type { Queryable } from '@openmaic/storage/document/pg';

import {
  PROGRESS_ROW_LIMIT,
  loadProgressRecords,
  summarize,
  type LessonMeta,
  type RawRecord,
} from '@/lib/tutor/door/progress';

const meta: LessonMeta = {
  title: 'Tìm kiếm nhị phân',
  beatCount: 7,
  beatLabels: { start: 'Bắt đầu', 'go-right': 'Sang phải' },
  presetBeats: (preset) =>
    (
      ({
        short: ['start', 'mid'],
        full: ['start', 'mid', 'go-right', 'found'],
      }) as Record<string, string[]>
    )[preset] ?? null,
};

let tick = 0;
const at = () => new Date(Date.UTC(2026, 9, 10, 8, 0, tick++)).toISOString();

function rec(
  learnerKey: string,
  kind: 'tutorLearning' | 'quizAttempt',
  payload: unknown,
  description: string | null = null,
): RawRecord {
  return {
    stageId: 'st1',
    learnerKey,
    kind,
    createdAt: at(),
    payload,
    stageName: 'Tìm kiếm nhị phân',
    stageDescription: description,
  };
}

const beat = (beatId: string, preset: string) => ({
  type: 'beat',
  sceneId: 's',
  walkthroughId: 'binary-search',
  entryRev: 1,
  preset,
  beatId,
  occurrence: 1,
  at: '2026-10-10T08:00:00.000Z',
});
const predict = (beatId: string, correct: boolean) => ({
  type: 'prediction',
  sceneId: 's',
  beatId,
  correct,
  skipped: false,
});
const rating = (easy: number) => ({ type: 'rating', stageId: 'st1', easy });

describe('summarize: learner labels', () => {
  it('labels each learner with a 12-digit pseudonym that never shows the key', () => {
    const rows = [
      rec('anon:alpha-0000000000000001', 'tutorLearning', beat('start', 'short')),
      rec('anon:beta-0000000000000002', 'tutorLearning', beat('start', 'short')),
    ];
    const report = summarize(
      rows,
      () => meta,
      () => 'now',
    );
    const whos = report.attempts.map((a) => a.who);

    for (const who of whos) expect(who).toMatch(/^#[0-9a-f]{12}$/);
    expect(new Set(whos).size).toBe(2);
    expect(JSON.stringify(report)).not.toContain('alpha-0000000000000001');
  });

  it('gives the same learner the same label on every report', () => {
    const rows = [rec('anon:gamma-0000000000000003', 'tutorLearning', beat('start', 'short'))];
    const first = summarize(rows, () => meta).attempts[0].who;
    const again = summarize(rows, () => meta).attempts[0].who;
    expect(first).toBe(again);
  });

  it('prefers the name in the stage description', () => {
    const rows = [
      rec('anon:delta-0000000000000004', 'tutorLearning', beat('start', 'short'), 'Học sinh: Minh'),
    ];
    expect(summarize(rows, () => meta).attempts[0].who).toBe('Minh');
  });
});

describe('summarize: steps counted over the presets a learner ran', () => {
  it('uses the planned steps of each preset run, never the whole lesson', () => {
    const rows = [
      rec('anon:a-0000000000000010', 'tutorLearning', beat('start', 'short')),
      rec('anon:a-0000000000000010', 'tutorLearning', beat('mid', 'short')),
      rec('anon:b-0000000000000011', 'tutorLearning', beat('start', 'short')),
      rec('anon:b-0000000000000011', 'tutorLearning', beat('go-right', 'full')),
      rec('anon:c-0000000000000012', 'tutorLearning', beat('start', 'mystery')),
    ];
    const byBeats = summarize(rows, () => meta).attempts.map((a) => a.beats);

    expect(byBeats).toEqual(
      expect.arrayContaining([
        { reached: 2, total: 2 },
        { reached: 2, total: 4 },
        { reached: 1, total: null },
      ]),
    );
  });

  it('falls back to the lesson beat count only for a meta without preset data', () => {
    const plain: LessonMeta = { title: meta.title, beatCount: 7 };
    const rows = [rec('anon:d-0000000000000013', 'tutorLearning', beat('start', 'short'))];
    expect(summarize(rows, () => plain).attempts[0].beats).toEqual({ reached: 1, total: 7 });
  });
});

describe('summarize: step names and difficult steps', () => {
  it('names the steps most learners miss, and leaves the name out when the lesson lost the step', () => {
    const rows = [1, 2, 3].flatMap((i) => [
      rec(`anon:e${i}-000000000000002${i}`, 'tutorLearning', beat('go-right', 'full')),
      rec(`anon:e${i}-000000000000002${i}`, 'tutorLearning', predict('go-right', false)),
      rec(`anon:e${i}-000000000000002${i}`, 'tutorLearning', predict('gone', false)),
    ]);
    const lesson = summarize(rows, () => meta).lessons[0];

    expect(lesson.hardBeats).toEqual([
      expect.objectContaining({ beatId: 'go-right', label: 'Sang phải', answered: 3, rate: 0 }),
      { beatId: 'gone', label: undefined, answered: 3, rate: 0 },
    ]);
  });
});

describe('summarize: grader failures stay out of the practice rate', () => {
  const quiz = (learnerKey: string, phase: string, results: unknown[]) =>
    rec(learnerKey, 'quizAttempt', { phase, answers: {}, results });
  const right = {
    questionId: 'binary-search:short:mid:1',
    status: 'correct',
    correct: true,
    earned: 1,
  };
  const wrong = {
    questionId: 'binary-search:short:mid:2',
    status: 'incorrect',
    correct: false,
    earned: 0,
  };
  const failed = {
    questionId: 'binary-search:short:mid:3',
    status: 'ungraded',
    correct: null,
    earned: 0,
  };

  it('counts neither the right nor the total for an ungraded result', () => {
    const rows = [quiz('anon:q1-0000000000000061', 'submitted', [right, wrong, failed])];
    const report = summarize(rows, () => meta);

    expect(report.attempts[0].practice).toEqual({ correct: 1, total: 2 });
    expect(report.lessons[0].practiceRate).toBeCloseTo(0.5);
  });

  it('treats a null `correct` from an older record as ungraded too', () => {
    const legacy = {
      questionId: 'binary-search:short:mid:4',
      status: 'incorrect',
      correct: null,
      earned: 0,
    };
    const rows = [quiz('anon:q2-0000000000000062', 'reviewed', [right, legacy])];
    expect(summarize(rows, () => meta).attempts[0].practice).toEqual({ correct: 1, total: 1 });
  });

  it('keeps the last graded score when a later review is entirely ungraded', () => {
    const rows = [
      quiz('anon:q3-0000000000000063', 'submitted', [right, wrong]),
      quiz('anon:q3-0000000000000063', 'reviewed', [failed, failed]),
    ];
    expect(summarize(rows, () => meta).attempts[0].practice).toEqual({ correct: 1, total: 2 });
  });

  it('has no practice score when nothing in the attempt was graded, and still finds the lesson', () => {
    const rows = [quiz('anon:q4-0000000000000064', 'submitted', [failed, failed])];
    const report = summarize(rows, () => meta);

    expect(report.attempts[0]).toMatchObject({ practice: null, walkthroughId: 'binary-search' });
    expect(report.lessons[0].practiceRate).toBeNull();
  });
});

describe('summarize: easy-to-follow ratings', () => {
  it('keeps each learner latest rating and averages across the learners who rated', () => {
    const rows = [
      rec('anon:f1-0000000000000031', 'tutorLearning', beat('start', 'short')),
      rec('anon:f1-0000000000000031', 'tutorLearning', rating(2)),
      rec('anon:f1-0000000000000031', 'tutorLearning', rating(5)),
      rec('anon:f2-0000000000000032', 'tutorLearning', beat('start', 'short')),
      rec('anon:f2-0000000000000032', 'tutorLearning', rating(3)),
      rec('anon:f3-0000000000000033', 'tutorLearning', beat('start', 'short')),
    ];
    const report = summarize(rows, () => meta);
    const easies = report.attempts.map((a) => a.easy).sort();

    expect(easies).toEqual([3, 5, null]);
    expect(report.lessons[0]).toMatchObject({ easyAverage: 4, easyCount: 2 });
  });

  it('ignores a rating outside 1..5', () => {
    const rows = [
      rec('anon:g-0000000000000041', 'tutorLearning', beat('start', 'short')),
      rec('anon:g-0000000000000041', 'tutorLearning', rating(9)),
    ];
    const report = summarize(rows, () => meta);
    expect(report.attempts[0].easy).toBeNull();
    expect(report.lessons[0]).toMatchObject({ easyAverage: null, easyCount: 0 });
  });
});

describe('summarize: truncation flag', () => {
  it('is false by default and passes through when the loader cut the read', () => {
    const rows = [rec('anon:h-0000000000000051', 'tutorLearning', beat('start', 'short'))];
    expect(summarize(rows, () => meta).truncated).toBe(false);
    expect(
      summarize(
        rows,
        () => meta,
        () => 'now',
        true,
      ).truncated,
    ).toBe(true);
  });
});

describe('loadProgressRecords', () => {
  function dbRow(i: number) {
    return {
      stage_id: 'st1',
      learner_key: `anon:k${i}`,
      kind: 'tutorLearning',
      created_at: new Date(Date.UTC(2026, 9, 10) + i * 1000).toISOString(),
      payload: beat('start', 'short'),
      stage_name: 'Tìm kiếm nhị phân',
      stage_description: null,
    };
  }

  /** Rows as the store returns them: newest first. */
  function fakeDb(count: number) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const rows = Array.from({ length: count }, (_, k) => dbRow(count - 1 - k));
    const db = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows };
      },
    };
    return { db: db as unknown as Queryable, calls };
  }

  it('asks for one row past the limit and reports the cut', async () => {
    const { db, calls } = fakeDb(PROGRESS_ROW_LIMIT + 1);
    const { records, truncated } = await loadProgressRecords(db);

    expect(calls[0].params).toEqual([PROGRESS_ROW_LIMIT + 1]);
    expect(truncated).toBe(true);
    expect(records).toHaveLength(PROGRESS_ROW_LIMIT);
    // the newest PROGRESS_ROW_LIMIT records, oldest first
    expect(records[0].createdAt).toBe(dbRow(1).created_at);
    expect(records.at(-1)!.createdAt).toBe(dbRow(PROGRESS_ROW_LIMIT).created_at);
    expect(records.some((r) => r.learnerKey === 'anon:k0')).toBe(false);
  });

  it('reports no cut for a short read, oldest first', async () => {
    const { db } = fakeDb(3);
    const { records, truncated } = await loadProgressRecords(db);

    expect(truncated).toBe(false);
    expect(records.map((r) => r.learnerKey)).toEqual(['anon:k0', 'anon:k1', 'anon:k2']);
  });
});
