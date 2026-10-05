import { describe, expect, it } from 'vitest';
import type { BeatRef, WalkthroughData } from '@/lib/tutor/protocol/widget-data';
import { buildPrediction, resolvePredict } from '@/lib/tutor/runtime/predict';

const text: WalkthroughData['beatText'] = {
  mid: { label: 'Mid', ask: 'Which?', options: ['lo', 'hi', 'none'] },
  plain: { label: 'Plain' },
};
const beats: BeatRef[] = [
  { id: 'mid', occurrence: 1, frame: 2, answer: 0 },
  { id: 'mid', occurrence: 2, frame: 5, answer: 1 },
  { id: 'plain', occurrence: 1, frame: 3 },
];

describe('resolvePredict', () => {
  it('picks the occurrence at the current frame', () => {
    expect(resolvePredict('mid', beats, 5, text)).toEqual({
      beatId: 'mid',
      ask: 'Which?',
      options: ['lo', 'hi', 'none'],
      answer: 1,
    });
    expect(resolvePredict('mid', beats, 2, text)?.answer).toBe(0);
  });

  it('falls back to the nearest earlier occurrence, then the first', () => {
    expect(resolvePredict('mid', beats, 4, text)?.answer).toBe(0);
    expect(resolvePredict('mid', beats, 9, text)?.answer).toBe(1);
    expect(resolvePredict('mid', beats, 0, text)?.answer).toBe(0);
  });

  it('returns null when the question cannot be graded', () => {
    expect(resolvePredict('nope', beats, 2, text)).toBeNull();
    expect(resolvePredict('plain', beats, 3, text)).toBeNull(); // no options, no answer
    expect(resolvePredict('mid', [{ ...beats[0], answer: undefined }], 2, text)).toBeNull();
    expect(resolvePredict('mid', [{ ...beats[0], answer: 3 }], 2, text)).toBeNull();
    expect(resolvePredict('mid', [{ ...beats[0], answer: 0.5 }], 2, text)).toBeNull();
    expect(resolvePredict('mid', beats, 2, undefined)).toBeNull();
  });
});

describe('buildPrediction', () => {
  const q = { beatId: 'mid', ask: '', options: ['a', 'b'], answer: 1 };
  it('compares the chosen index', () => {
    expect(buildPrediction(q, 1)).toEqual({ beatId: 'mid', correct: true });
    expect(buildPrediction(q, 0)).toEqual({ beatId: 'mid', correct: false });
  });
  it('skip is incorrect + skipped', () => {
    expect(buildPrediction(q, null)).toEqual({ beatId: 'mid', correct: false, skipped: true });
  });
});
