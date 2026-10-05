/**
 * Dòng code cần tô theo frame (ARCHITECTURE §6). Thuần, không DOM.
 * `map` là `walkthrough-data.code.map`: dòng pseudocode (1-based, khoá chuỗi do JSON) → dòng cài đặt.
 */
import type { Panel } from '@/lib/tutor/protocol/widget-data';

export type CodeMap = Readonly<
  Partial<Record<'cpp' | 'py', Readonly<Record<string, readonly number[]>>>>
>;

/** `pseudo` → `[pseudoLine]`; `cpp`/`py` → `map[panel][pseudoLine]` hoặc `[]` nếu thiếu. */
export function codeLinesFor(panel: Panel, pseudoLine: number | undefined, map: CodeMap): number[] {
  if (pseudoLine === undefined || !Number.isInteger(pseudoLine)) return [];
  if (panel === 'pseudo') return [pseudoLine];
  return [...(map[panel]?.[String(pseudoLine)] ?? [])];
}
