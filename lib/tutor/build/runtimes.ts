import { RUNTIME_ARRAY } from './generated/runtime-array';

/** Bảng runtime theo visualizer (D6). Visualizer mới: sinh file rồi thêm một dòng vào đây. */
const RUNTIMES: Record<string, string> = {
  array: RUNTIME_ARRAY,
};

/** Trả JS runtime của visualizer, hoặc null nếu chưa có. */
export function getRuntimeJs(visualizer: string): string | null {
  return Object.hasOwn(RUNTIMES, visualizer) ? RUNTIMES[visualizer] : null;
}
