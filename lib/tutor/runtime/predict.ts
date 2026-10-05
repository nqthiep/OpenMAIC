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
 * Beat đang hỏi: cùng `beatId`, ưu tiên beat nằm đúng frame `index`, rồi beat gần nhất trước nó,
 * rồi beat đầu tiên (beat lặp có nhiều lần xuất hiện). `null` khi không hỏi được: không có beat,
 * thiếu/sai `answer`, hoặc thiếu `options`.
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
  const options = isRecord(text) && Array.isArray(text.options) ? text.options.map(String) : [];
  const answer = ref?.answer;
  if (
    !ref ||
    options.length === 0 ||
    typeof answer !== 'number' ||
    !Number.isInteger(answer) ||
    answer < 0 ||
    answer >= options.length
  ) {
    return null;
  }
  return {
    beatId,
    ask: isRecord(text) && typeof text.ask === 'string' ? text.ask : '',
    options,
    answer,
  };
}

/** `chosen` = chỉ số đã chọn; `null` = "Bỏ qua" (`correct: false, skipped: true`). */
export function buildPrediction(q: PredictQuestion, chosen: number | null): Prediction {
  if (chosen === null) return { beatId: q.beatId, correct: false, skipped: true };
  return { beatId: q.beatId, correct: chosen === q.answer };
}
