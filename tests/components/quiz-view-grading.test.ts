// @vitest-environment jsdom
/**
 * Quiz short-answer grading. A grade request has a 30 s deadline. A grade that
 * fails, answers 503 or times out is provisional: half credit rounded down, not counted as
 * wrong. The grading phase can retry or cancel back to the answers. Answer
 * controls expose radio, checked and label semantics.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuizView, provisionalShortAnswerResult } from '@/components/scene-renderers/quiz-view';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import i18n from '@/lib/i18n/config';
import { modelSettingsClient } from '@/lib/model-settings/client';
import type { QuizQuestion } from '@/lib/types/stage';

import { modelSettingsViewFor } from '../helpers/model-settings-view';

vi.mock('@/lib/quiz/runtime', () => {
  class QuizRetryProgressedError extends Error {}
  return {
    QuizRetryProgressedError,
    loadQuizAttemptState: vi.fn(async () => ({ attemptId: 'attempt-1', state: undefined })),
    createQuizAttemptWriter: () => ({
      recordPhase: vi.fn(async () => undefined),
      scheduleDraft: vi.fn(),
      flushDraft: vi.fn(async () => undefined),
      cancelDraft: vi.fn(),
    }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const questions: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'single',
    question: 'Số nguyên tố nhỏ nhất là?',
    options: [
      { label: 'Một', value: 'A' },
      { label: 'Hai', value: 'B' },
    ],
    answer: ['B'],
    points: 1,
  },
  {
    id: 'q2',
    type: 'short_answer',
    question: 'Giải thích ngắn về số nguyên tố.',
    commentPrompt: 'Chấm theo độ đầy đủ.',
    points: 3,
  },
];

const ANSWER_TEXT = 'Số chỉ chia hết cho 1 và chính nó.';

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.setItem('locale', 'vi-VN');
  modelSettingsClient.adopt(modelSettingsViewFor({ asr: { registryId: 'openai-whisper' } }));
  await i18n.changeLanguage('vi-VN');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  modelSettingsClient.adopt(null);
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function buttonWithText(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button "${text}"`);
  return found;
}

async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}

function typeInto(textarea: HTMLTextAreaElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  setValue.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function renderQuiz() {
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(QuizView, { questions, sceneId: 'scene-1', stageId: 'stage-1' }),
      ),
    );
  });
  await vi.waitFor(() => expect(buttonWithText('Bắt đầu làm')).toBeDefined(), { timeout: 3000 });
}

/** Answers both questions and presses submit; the grading phase starts. */
async function answerAndSubmit() {
  await renderQuiz();
  await click(buttonWithText('Bắt đầu làm'));
  await vi.waitFor(() => expect(container.querySelector('[role="radiogroup"]')).not.toBeNull(), {
    timeout: 3000,
  });
  await click(container.querySelectorAll('[role="radio"]')[1]);
  typeInto(container.querySelector('textarea')!, ANSWER_TEXT);
  await vi.waitFor(() => expect(buttonWithText('Nộp bài').disabled).toBe(false));
  await click(buttonWithText('Nộp bài'));
}

describe('provisionalShortAnswerResult', () => {
  const shortAnswer = (points: number): QuizQuestion => ({
    id: 'q',
    type: 'short_answer',
    question: 'Câu hỏi',
    points,
  });

  it('rounds half credit down and marks the result provisional', () => {
    expect(provisionalShortAnswerResult(shortAnswer(1), 'vi-VN')).toMatchObject({
      correct: null,
      status: 'ungraded',
      earned: 0,
    });
    expect(provisionalShortAnswerResult(shortAnswer(3), 'vi-VN').earned).toBe(1);
  });

  it('gives Vietnamese feedback for vi-VN with no Chinese or English text', () => {
    const { aiComment } = provisionalShortAnswerResult(shortAnswer(3), 'vi-VN');

    expect(aiComment).toBe(
      'Dịch vụ chấm AI tạm thời không khả dụng. Đây là điểm tạm tính, chưa chấm bằng AI.',
    );
    expect(aiComment).not.toMatch(/[㐀-鿿]/);
    expect(aiComment).not.toMatch(/\b(service|unavailable|base|score|given)\b/i);
  });
});

describe('QuizView short-answer grading', () => {
  it('a grade that fails is provisional: not counted as wrong, not shown in red', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    await answerAndSubmit();

    await vi.waitFor(() => expect(container.textContent).toContain('chưa chấm bằng AI'), {
      timeout: 5000,
    });
    expect(container.querySelector('.text-4xl')?.textContent).toBe('2');
    expect(container.textContent).toContain('/ 4');
    expect(container.textContent).toContain('1 đúng');
    expect(container.textContent).toContain('0 sai');
    expect(container.querySelectorAll('.border-red-200')).toHaveLength(0);
  });

  it('a grade answered 503 is provisional: ungraded, not counted as right or wrong', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              errorCode: 'GRADING_UNAVAILABLE',
              error: 'Dịch vụ chấm điểm tạm thời không khả dụng, vui lòng thử lại sau.',
            }),
            { status: 503 },
          ),
      ),
    );

    await answerAndSubmit();

    await vi.waitFor(() => expect(container.textContent).toContain('chưa chấm bằng AI'), {
      timeout: 5000,
    });
    expect(container.querySelector('.text-4xl')?.textContent).toBe('2');
    expect(container.textContent).toContain('1 đúng');
    expect(container.textContent).toContain('0 sai');
    expect(container.querySelectorAll('.border-red-200')).toHaveLength(0);
  });

  it('the grade request carries a 30 second deadline', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ score: 3, comment: 'Đủ ý.' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await answerAndSubmit();

    await vi.waitFor(() => expect(container.textContent).toContain('Đủ ý.'), { timeout: 5000 });
    expect(timeout).toHaveBeenCalledWith(30_000);
  });

  it('the grading phase retries the request, or cancels back to the answers', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await answerAndSubmit();
    await vi.waitFor(() => expect(buttonWithText('Thử lại')).toBeDefined(), { timeout: 5000 });

    await click(buttonWithText('Thử lại'));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await click(buttonWithText('Hủy'));
    await vi.waitFor(() => expect(container.querySelector('textarea')).not.toBeNull(), {
      timeout: 5000,
    });
    expect(signals[1].aborted).toBe(true);
    expect(container.querySelector('textarea')!.value).toBe(ANSWER_TEXT);
  });

  it('answer controls expose radio, checked and label semantics', async () => {
    await renderQuiz();
    await click(buttonWithText('Bắt đầu làm'));
    await vi.waitFor(() => expect(container.querySelector('[role="radiogroup"]')).not.toBeNull(), {
      timeout: 3000,
    });

    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Số nguyên tố nhỏ nhất là?');
    const radios = group.querySelectorAll('[role="radio"]');
    expect(radios).toHaveLength(2);
    expect(radios[0].getAttribute('aria-checked')).toBe('false');
    await click(radios[0]);
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios[1].getAttribute('aria-checked')).toBe('false');

    expect(container.querySelector('textarea')!.getAttribute('aria-label')).toBe(
      'Nhập câu trả lời của bạn ở đây…',
    );
    expect(container.querySelector('button[aria-label="Nhập bằng giọng nói"]')).not.toBeNull();
  });
});
