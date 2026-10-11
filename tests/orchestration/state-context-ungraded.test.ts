/**
 * A short answer the AI grader did not score is 'ungraded' (or, in older records,
 * status 'incorrect' with `correct: null`). The tutor reads the verdict line, so it
 * must not be told the student answered wrong.
 */
import { describe, expect, it } from 'vitest';

import { buildStateContext } from '@/lib/orchestration/summarizers/state-context';
import type { StatelessChatRequest } from '@/lib/types/chat';

function storeStateWithResult(result: {
  status: 'correct' | 'incorrect' | 'ungraded';
  correct: boolean | null;
}): StatelessChatRequest['storeState'] {
  return {
    stage: { id: 'stage-1', name: 'Course' },
    scenes: [
      {
        id: 'scene-1',
        type: 'quiz',
        title: 'Quiz',
        content: {
          type: 'quiz',
          questions: [{ id: 'q1', type: 'short_answer', question: 'Explain X', points: 2 }],
        },
      },
    ],
    currentSceneId: 'scene-1',
    mode: 'autonomous',
    whiteboardOpen: false,
    quizResults: {
      sceneId: 'scene-1',
      answers: { q1: 'my answer' },
      results: [{ questionId: 'q1', ...result, earned: 0 }],
    },
  } as unknown as StatelessChatRequest['storeState'];
}

describe('buildStateContext quiz verdict', () => {
  it('does not present an ungraded answer as wrong', () => {
    const context = buildStateContext(storeStateWithResult({ status: 'ungraded', correct: null }));

    expect(context).toContain('Verdict: UNGRADED (grader error, not wrong');
    expect(context).not.toContain('INCORRECT');
  });

  it('treats a stored grader fallback, status incorrect with null correct, the same way', () => {
    const context = buildStateContext(storeStateWithResult({ status: 'incorrect', correct: null }));

    expect(context).toContain('Verdict: UNGRADED (grader error, not wrong');
    expect(context).not.toContain('INCORRECT');
  });

  it('still reports a graded wrong answer as INCORRECT', () => {
    const context = buildStateContext(
      storeStateWithResult({ status: 'incorrect', correct: false }),
    );

    expect(context).toContain('Verdict: INCORRECT');
  });
});
