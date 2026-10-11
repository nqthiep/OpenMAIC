// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { renderPredict, type PredictLabels } from '@/lib/tutor/runtime/panels';

const labels: PredictLabels = {
  predict: 'Predict',
  skip: 'Skip',
  correct: 'Yes',
  incorrect: 'No',
  answer: 'Right answer',
};
const question = { ask: 'Which?', options: ['x', 'y', 'z'], answer: 1 };

let el: HTMLElement;
let onPick: Mock<(chosen: number | null) => void>;

const option = (i: number) => el.querySelector<HTMLButtonElement>(`[data-option="${i}"]`)!;
const status = () => el.querySelector<HTMLElement>('[role=status]')!;

beforeEach(() => {
  el = document.createElement('div');
  document.body.replaceChildren(el);
  onPick = vi.fn<(chosen: number | null) => void>();
  renderPredict(el, question, labels, onPick);
});

describe('renderPredict', () => {
  it('skip keeps the question on screen and reveals the right option', () => {
    el.querySelector<HTMLButtonElement>('[data-predict-skip]')!.click();

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(null);
    expect(el.querySelector('.wt-predict-ask')!.textContent).toBe('Which?');
    expect(el.querySelectorAll('[data-option]')).toHaveLength(3);
    expect(option(1).classList.contains('wt-on')).toBe(true);
    expect(option(1).textContent).toContain('✓');
    expect(option(0).textContent).not.toContain('✗');
    expect(status().textContent).toBe('Skip');
    expect(el.getAttribute('data-result')).toBe('skipped');
    expect([...el.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });

  it('a wrong pick gets a red border and a cross, the right option a check mark', () => {
    option(0).click();

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(0);
    expect(option(0).getAttribute('aria-pressed')).toBe('true');
    expect(option(0).style.borderColor).toBe('var(--wt-err)');
    expect(option(0).textContent).toContain('✗');
    expect(option(1).classList.contains('wt-on')).toBe(true);
    expect(option(1).style.borderColor).toBe('');
    expect(option(1).textContent).toContain('✓');
    expect(status().textContent).toBe('No');
    expect(el.getAttribute('data-result')).toBe('incorrect');
  });

  it('the right option carries the answer label beside its check mark, a wrong pick does not', () => {
    option(0).click();

    expect(option(1).textContent).toBe('y ✓ Right answer');
    expect(option(0).textContent).toBe('x ✗');
    expect(option(0).style.borderColor).toBe('var(--wt-err)');
  });

  it('a skip shows the answer label on the right option too', () => {
    el.querySelector<HTMLButtonElement>('[data-predict-skip]')!.click();

    expect(option(1).textContent).toContain('Right answer');
    expect(option(0).textContent).not.toContain('Right answer');
  });

  it('a right pick is marked once, with no red border', () => {
    option(1).click();

    expect(option(1).getAttribute('aria-pressed')).toBe('true');
    expect(option(1).style.borderColor).toBe('');
    expect(option(1).textContent?.match(/✓/g)).toHaveLength(1);
    expect(option(1).textContent).not.toContain('✗');
    expect(status().textContent).toBe('Yes');
    expect(el.getAttribute('data-result')).toBe('correct');
  });

  it('the marks are hidden from screen readers and the buttons keep their option text', () => {
    option(0).click();

    const mark = option(0).querySelector('span')!;
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(option(0).firstChild!.textContent).toBe('x');
  });

  it('calls onPick once, then ignores later clicks', () => {
    option(1).click();
    el.querySelector<HTMLButtonElement>('[data-predict-skip]')!.click();
    option(0).click();

    expect(onPick).toHaveBeenCalledOnce();
    expect(el.getAttribute('data-result')).toBe('correct');
  });
});
