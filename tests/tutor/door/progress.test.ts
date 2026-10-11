import { describe, expect, it } from 'vitest';

import { createAccessToken } from '@/lib/server/access-token';
import {
  TEACHER_CODE_MIN_LENGTH,
  hasTeacherAccess,
  teacherCode,
  teacherCodeMatches,
} from '@/lib/server/teacher-gate';
import { summarize, type RawRecord } from '@/lib/tutor/door/progress';
import { beatsFromConfig } from '@/lib/tutor/use-learning-log';

const meta = (id: string) =>
  id === 'binary-search' ? { title: 'Tìm kiếm nhị phân', beatCount: 6 } : null;
let t = 0;
const at = () => new Date(Date.UTC(2026, 9, 10, 8, 0, t++)).toISOString();

function rec(
  stageId: string,
  learnerKey: string,
  kind: 'tutorLearning' | 'quizAttempt',
  payload: unknown,
  description: string | null = null,
): RawRecord {
  return {
    stageId,
    learnerKey,
    kind,
    createdAt: at(),
    payload,
    stageName: 'Tìm kiếm nhị phân',
    stageDescription: description,
  };
}
const beat = (id: string) => ({
  type: 'beat',
  beatId: id,
  walkthroughId: 'binary-search',
  preset: 'p',
});
const pred = (beatId: string, correct: boolean, skipped = false) => ({
  type: 'prediction',
  sceneId: 's',
  beatId,
  correct,
  skipped,
});

describe('summarize', () => {
  const name = 'Học sinh: Minh';
  const rows: RawRecord[] = [
    rec('st1', 'L1', 'tutorLearning', beat('start'), name),
    rec('st1', 'L1', 'tutorLearning', beat('mid'), name),
    rec('st1', 'L1', 'tutorLearning', beat('mid'), name),
    rec('st1', 'L1', 'tutorLearning', pred('mid', true), name),
    rec('st1', 'L1', 'tutorLearning', pred('mid', false, true), name),
    rec(
      'st1',
      'L1',
      'tutorLearning',
      { type: 'hint', sceneId: 's', beatId: 'mid', level: 1 },
      name,
    ),
    rec('st1', 'L1', 'quizAttempt', { phase: 'draft', answers: {} }, name),
    rec(
      'st1',
      'L1',
      'quizAttempt',
      {
        phase: 'submitted',
        answers: {},
        results: [
          { questionId: 'binary-search:p:mid:1', status: 'correct' },
          { questionId: 'binary-search:p:mid:2', status: 'incorrect' },
        ],
      },
      name,
    ),
    // a second learner on another stage, anonymous, who misses `mid` three times
    ...[1, 2, 3].map((i) => rec(`st${i + 1}`, `L${i + 1}`, 'tutorLearning', beat('mid'))),
    ...[1, 2, 3].map((i) => rec(`st${i + 1}`, `L${i + 1}`, 'tutorLearning', pred('mid', false))),
  ];
  const report = summarize(rows, meta, () => 'now');

  it('counts beats, answered predictions (skips excluded), hints and practice per attempt', () => {
    const minh = report.attempts.find((a) => a.who === 'Minh')!;
    expect(minh).toMatchObject({
      lesson: 'Tìm kiếm nhị phân',
      walkthroughId: 'binary-search',
      beats: { reached: 2, total: 6 },
      predictions: { answered: 1, correct: 1 },
      hints: 1,
      practice: { correct: 1, total: 2 },
    });
  });

  it('tags anonymous learners instead of showing their key', () => {
    const anon = report.attempts.filter((a) => a.who !== 'Minh');
    expect(anon).toHaveLength(3);
    for (const a of anon) expect(a.who).toMatch(/^#[0-9a-f]{12}$/);
    expect(new Set(anon.map((a) => a.who)).size).toBe(3);
  });

  it('rolls attempts up per lesson and lists the beats most learners miss', () => {
    expect(report.lessons).toHaveLength(1);
    const l = report.lessons[0];
    expect(l).toMatchObject({ walkthroughId: 'binary-search', attempts: 4 });
    expect(l.predictionRate).toBeCloseTo(1 / 4);
    expect(l.practiceRate).toBeCloseTo(1 / 2);
    expect(l.hardBeats).toEqual([{ beatId: 'mid', answered: 4, rate: 0.25 }]);
  });

  it('takes the walkthrough of a practice-only attempt from its question ids', () => {
    const only = summarize(
      [
        rec('st9', 'L9', 'quizAttempt', {
          phase: 'reviewed',
          answers: {},
          results: [{ questionId: 'binary-search:p:mid:1', status: 'correct' }],
        }),
      ],
      meta,
    );
    expect(only.attempts[0]).toMatchObject({
      walkthroughId: 'binary-search',
      practice: { correct: 1, total: 1 },
      beats: { reached: 0, total: 6 },
    });
  });

  it('ignores malformed payloads', () => {
    const r = summarize(
      [rec('x', 'k', 'tutorLearning', 'oops'), rec('x', 'k', 'quizAttempt', null)],
      meta,
    );
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]).toMatchObject({ hints: 0, practice: null });
  });
});

describe('teacher gate', () => {
  const code = 'a-long-teacher-code';

  it('is off unless the code is long enough', () => {
    expect(teacherCode({})).toBeNull();
    expect(teacherCode({ TUTOR_TEACHER_CODE: 'x'.repeat(TEACHER_CODE_MIN_LENGTH - 1) })).toBeNull();
    expect(teacherCode({ TUTOR_TEACHER_CODE: code })).toBe(code);
  });

  it('matches only the exact code', () => {
    expect(teacherCodeMatches(code, code)).toBe(true);
    expect(teacherCodeMatches(`${code}x`, code)).toBe(false);
    expect(teacherCodeMatches('', code)).toBe(false);
  });

  it('accepts a cookie signed with the teacher code and nothing else', () => {
    expect(hasTeacherAccess(createAccessToken(code), code)).toBe(true);
    expect(hasTeacherAccess(createAccessToken('the-site-access-code'), code)).toBe(false);
    expect(hasTeacherAccess(undefined, code)).toBe(false);
    expect(hasTeacherAccess('garbage', code)).toBe(false);
  });
});

describe('beatsFromConfig', () => {
  const config = {
    walkthroughId: 'binary-search',
    entryRev: 3,
    presetId: 'a',
    beats: [{ id: 'start', occurrence: 1, frame: 0 }],
    beatsByPreset: {
      a: [{ id: 'start', occurrence: 1, frame: 0 }],
      b: [{ id: 'mid', occurrence: 1, frame: 2 }],
    },
  };

  it('reads the beats of any preset the page lists', () => {
    expect(beatsFromConfig(config, 'b')).toMatchObject({
      walkthroughId: 'binary-search',
      entryRev: 3,
      beats: [{ id: 'mid', frame: 2 }],
    });
  });

  it('falls back to `beats` for the built preset on a page without `beatsByPreset`', () => {
    const old = { ...config, beatsByPreset: undefined };
    expect(beatsFromConfig(old, 'a')?.beats).toHaveLength(1);
    expect(beatsFromConfig(old, 'b')).toBeUndefined();
  });

  it('knows nothing about a scene that is not a walkthrough page', () => {
    expect(beatsFromConfig(undefined, 'a')).toBeUndefined();
    expect(beatsFromConfig({ ...config, walkthroughId: 7 }, 'a')).toBeUndefined();
  });
});
