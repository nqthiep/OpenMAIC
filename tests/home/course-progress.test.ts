import { describe, expect, it } from 'vitest';
import {
  pickRemoteContinue,
  summarizeProgress,
  type ProgressLike,
} from '@/lib/home/course-progress';

const row = (courseId: string, sceneIndex: number, extra: Partial<ProgressLike> = {}) => ({
  courseId,
  sceneIndex,
  sceneCount: 5,
  quizScore: null,
  doneAt: null,
  updatedAt: '2026-10-18T10:00:00.000Z',
  ...extra,
});

const catalog = new Map([
  ['a', { title: 'Course A', sceneCount: 5 }],
  ['b', { title: 'Course B' }],
  ['c', { title: 'c' }],
]);

describe('summarizeProgress', () => {
  it('uses the catalog scene count when the course grew, and never shows a position past the end', () => {
    expect(summarizeProgress(row('a', 3), 8)).toMatchObject({ current: 3, total: 8, done: false });
    expect(summarizeProgress(row('a', 5), 3)).toMatchObject({ current: 3, total: 3 });
  });

  it('keeps the done mark and the quiz score', () => {
    expect(
      summarizeProgress(row('a', 1, { doneAt: '2026-10-17T00:00:00.000Z', quizScore: 80 })),
    ).toMatchObject({ done: true, quizScore: 80, current: 1 });
  });
});

describe('pickRemoteContinue', () => {
  it('offers the course studied last that has scenes ahead', () => {
    const picked = pickRemoteContinue(
      [
        row('a', 2, { updatedAt: '2026-10-18T09:00:00.000Z' }),
        row('b', 3, { updatedAt: '2026-10-18T11:00:00.000Z' }),
      ],
      new Set(),
      catalog,
    );
    expect(picked).toMatchObject({ courseId: 'b', title: 'Course B', current: 3, total: 5 });
  });

  it('skips finished courses, library courses, unlisted courses and courses with no name', () => {
    const rows = [
      row('a', 5, { updatedAt: '2026-10-18T12:00:00.000Z' }), // on the last scene
      row('b', 2, { updatedAt: '2026-10-18T11:00:00.000Z' }), // in the library
      row('gone', 2, { updatedAt: '2026-10-18T10:30:00.000Z' }), // not in the catalog
      row('c', 2, { updatedAt: '2026-10-18T10:00:00.000Z' }), // title is the id
    ];
    expect(pickRemoteContinue(rows, new Set(['b']), catalog)).toBeUndefined();
  });
});
