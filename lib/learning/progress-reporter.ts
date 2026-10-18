/**
 * Sends the learner's position in a course to the server, a moment after it stops changing, and
 * the score of a quiz as soon as it is graded. One report is in flight at a time, so an older
 * position never lands after a newer one. A failed report is dropped (the next move sends the
 * position again), except that a quiz score waits for the next one.
 */
import type { ProgressReport } from '@/components/learning/learning-api';

export type Position = Omit<ProgressReport, 'quizScore'>;

export const REPORT_DELAY_MS = 1500;

export function createProgressReporter(
  send: (report: ProgressReport) => Promise<unknown>,
  delayMs: number = REPORT_DELAY_MS,
) {
  let position: Position | null = null;
  let sent: Position | null = null;
  let quizScore: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<unknown> = Promise.resolve();

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!position || (quizScore === undefined && sent && same(sent, position))) return;
    const report: ProgressReport = {
      ...position,
      ...(quizScore === undefined ? {} : { quizScore }),
    };
    sent = position;
    quizScore = undefined;
    chain = chain
      .then(() => send(report))
      .catch(() => {
        sent = null;
        quizScore ??= report.quizScore;
      });
  };

  return {
    /** The learner is on this scene now. */
    moveTo(next: Position) {
      if (position && same(position, next)) return;
      position = next;
      clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    /** A quiz in the course was graded. Ignored when the learner is in another course. */
    quiz(courseId: string, score: number) {
      if (position?.courseId !== courseId) return;
      quizScore = Math.max(0, Math.min(100, Math.round(score)));
      flush();
    },
    flush,
  };
}

function same(a: Position, b: Position): boolean {
  return (
    a.courseId === b.courseId &&
    a.sceneId === b.sceneId &&
    a.sceneIndex === b.sceneIndex &&
    a.sceneCount === b.sceneCount
  );
}

export type ProgressReporter = ReturnType<typeof createProgressReporter>;
