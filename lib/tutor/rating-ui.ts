/**
 * Quyết định thuần cho khối "Bài giảng này dễ hiểu không?" ở màn hoàn thành khoá (task 1c-14b).
 * Phần ghi bản ghi nằm ở `appendTutorLearning` (`lib/tutor/learning-log.ts`).
 */
import { MAX_RATING } from '@/lib/tutor/learning-log';
import { isWalkthroughScene } from '@/lib/widgets/policy';

/** Các điểm hiện thành nút: 1..MAX_RATING. */
export const RATING_VALUES: readonly number[] = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/** Chỉ hỏi khi khoá có ít nhất một scene walkthrough. */
export function shouldShowRating(scenes: readonly unknown[]): boolean {
  return scenes.some(isWalkthroughScene);
}

/**
 * Điểm cần ghi khi bấm `pressed`; `undefined` nếu lần xem này đã chọn rồi (bấm lặp bị chặn) hoặc
 * `pressed` không thuộc `RATING_VALUES`.
 */
export function acceptRating(chosen: number | null, pressed: number): number | undefined {
  return chosen === null && RATING_VALUES.includes(pressed) ? pressed : undefined;
}
