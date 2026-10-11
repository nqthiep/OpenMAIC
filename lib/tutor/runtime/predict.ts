/**
 * Câu hỏi dự đoán (INTERFACES §1 điều 6): logic thuần, không DOM. Chỉ kind `choice`;
 * `answer` là chỉ số đáp án do provider tính lúc dựng và lưu ở `sets[p].beats[i].answer`.
 */
import type { BeatRef, WalkthroughData } from '@/lib/tutor/protocol/widget-data';
import { isRecord } from './layout';

export interface PredictQuestion {
  beatId: string;
  ask: string;
  options: string[];
  answer: number;
}

export interface Prediction {
  beatId: string;
  correct: boolean;
  skipped?: boolean;
}

/**
 * The question for the beat being asked: same `beatId`, preferring the occurrence at frame `index`,
 * then the nearest earlier one, then the first. Options are shown in the beat's `order` (absent means
 * the original order); `answer` is the shown position. `null` when it cannot be asked: no beat, a
 * missing or bad `answer`, no `options`, or an `order` that is not a permutation of `options`.
 */
export function resolvePredict(
  beatId: string,
  beats: readonly BeatRef[],
  index: number,
  beatText: WalkthroughData['beatText'] | undefined,
): PredictQuestion | null {
  const same = beats.filter((b) => b.id === beatId);
  const ref =
    same.find((b) => b.frame === index) ??
    same.filter((b) => b.frame < index).reduce<BeatRef | undefined>((_, b) => b, undefined) ??
    same[0];
  const text = isRecord(beatText) ? beatText[beatId] : undefined;
  const source = isRecord(text) && Array.isArray(text.options) ? text.options.map(String) : [];
  const answer = ref?.answer;
  const order: unknown = ref?.order ?? source.map((_, k) => k);
  if (
    !ref ||
    source.length === 0 ||
    typeof answer !== 'number' ||
    !Number.isInteger(answer) ||
    answer < 0 ||
    answer >= source.length ||
    !isPermutation(order, source.length)
  ) {
    return null;
  }
  return {
    beatId,
    ask: isRecord(text) && typeof text.ask === 'string' ? text.ask : '',
    options: order.map((j) => source[j]),
    answer,
  };
}

function isPermutation(order: unknown, n: number): order is number[] {
  return (
    Array.isArray(order) &&
    order.length === n &&
    new Set(order).size === n &&
    order.every((j) => Number.isInteger(j) && j >= 0 && j < n)
  );
}

/** `chosen` = chỉ số đã chọn; `null` = "Bỏ qua" (`correct: false, skipped: true`). */
export function buildPrediction(q: PredictQuestion, chosen: number | null): Prediction {
  if (chosen === null) return { beatId: q.beatId, correct: false, skipped: true };
  return { beatId: q.beatId, correct: chosen === q.answer };
}
