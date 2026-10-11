// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuizView } from '@/components/scene-renderers/quiz-view';
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
      { label: 'Ba', value: 'C' },
    ],
    answer: ['B'],
    points: 1,
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.setItem('locale', 'vi-VN');
  modelSettingsClient.adopt(modelSettingsViewFor({}));
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
  vi.restoreAllMocks();
});

const radios = () => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const checked = () => radios().map((r) => r.getAttribute('aria-checked'));

async function pressKey(target: HTMLElement, key: string) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

async function renderFirstQuestion() {
  await act(async () => {
    root.render(
      createElement(
        I18nProvider,
        null,
        createElement(QuizView, { questions, sceneId: 'scene-1', stageId: 'stage-1' }),
      ),
    );
  });
  const start = [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Bắt đầu làm',
  );
  await act(async () => start!.click());
  await vi.waitFor(() => expect(radios()).toHaveLength(3), { timeout: 3000 });
}

describe('single-choice quiz: arrow keys in the radio group', () => {
  it('only one option is in the Tab order while none is chosen', async () => {
    await renderFirstQuestion();
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });

  it('down and right move the focus to the next option and choose it', async () => {
    await renderFirstQuestion();
    radios()[0].focus();

    await pressKey(radios()[0], 'ArrowDown');
    expect(document.activeElement).toBe(radios()[1]);
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(radios().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);

    await pressKey(radios()[1], 'ArrowRight');
    expect(document.activeElement).toBe(radios()[2]);
    expect(checked()).toEqual(['false', 'false', 'true']);
  });

  it('up and left go back, and the group wraps at both ends', async () => {
    await renderFirstQuestion();
    radios()[0].focus();

    await pressKey(radios()[0], 'ArrowUp');
    expect(document.activeElement).toBe(radios()[2]);
    expect(checked()).toEqual(['false', 'false', 'true']);

    await pressKey(radios()[2], 'ArrowRight');
    expect(document.activeElement).toBe(radios()[0]);
    expect(checked()).toEqual(['true', 'false', 'false']);

    await pressKey(radios()[0], 'ArrowLeft');
    expect(document.activeElement).toBe(radios()[2]);
  });

  it('other keys leave the choice alone', async () => {
    await renderFirstQuestion();
    radios()[0].focus();
    await pressKey(radios()[0], 'a');
    await pressKey(radios()[0], 'Enter');
    expect(checked()).toEqual(['false', 'false', 'false']);
  });
});
