import { RUNTIME_ARRAY } from './generated/runtime-array';
import { RUNTIME_GEOMETRY } from './generated/runtime-geometry';
import { RUNTIME_GRAPH } from './generated/runtime-graph';
import { RUNTIME_GRID } from './generated/runtime-grid';
import { RUNTIME_TREE } from './generated/runtime-tree';

/** Bảng runtime theo visualizer (D6). Visualizer mới: sinh file rồi thêm một dòng vào đây. */
const RUNTIMES: Record<string, string> = {
  array: RUNTIME_ARRAY,
  geometry: RUNTIME_GEOMETRY,
  graph: RUNTIME_GRAPH,
  grid: RUNTIME_GRID,
  tree: RUNTIME_TREE,
};

/** Trả JS runtime của visualizer, hoặc null nếu chưa có. */
export function getRuntimeJs(visualizer: string): string | null {
  return Object.hasOwn(RUNTIMES, visualizer) ? RUNTIMES[visualizer] : null;
}
