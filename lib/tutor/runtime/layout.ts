/**
 * DOM tĩnh của shell (ARCHITECTURE §6): tra phần tử theo id, đặt `data-*` của `#wt-root`.
 * Hợp đồng với `lib/tutor/build/shell.ts`: dòng code nằm trong `#wt-code .wt-code-lines`,
 * tab code là `<button id="wt-tab-<panel>">`. Id nào không có trong DOM thì bỏ qua phần đó.
 * Runtime chạy trong iframe: không Node API.
 */
import type { Panel } from '@/lib/tutor/protocol/widget-data';

export const PANELS: readonly Panel[] = ['pseudo', 'cpp', 'py'];

export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Số frame hiển thị 1-based (`3 / 12`); `state.frame` trong message vẫn 0-based. */
export function formatCounter(index: number, total: number): string {
  return `${index + 1} / ${total}`;
}

export interface Refs {
  root: HTMLElement;
  explanation: HTMLElement;
  visualizer: HTMLElement;
  vars: HTMLElement | null;
  aux: HTMLElement | null;
  beats: HTMLElement | null;
  codeLines: HTMLElement | null;
  caption: HTMLElement | null;
  prev: HTMLElement | null;
  play: HTMLElement | null;
  next: HTMLElement | null;
  reset: HTMLElement | null;
  speed: HTMLInputElement | null;
  slider: HTMLInputElement | null;
  counter: HTMLElement | null;
  preset: HTMLSelectElement | null;
  /** Chỉ có tab mà shell đã dựng. */
  tabs: Partial<Record<Panel, HTMLElement>>;
}

/** `null` khi thiếu `#wt-root`, `#wt-explanation` hoặc `#wt-visualizer` (không có gì để chạy). */
export function findRefs(doc: Document): Refs | null {
  const $ = (id: string) => doc.getElementById(id);
  const root = $('wt-root');
  const explanation = $('wt-explanation');
  const visualizer = $('wt-visualizer');
  if (!root || !explanation || !visualizer) return null;

  const tabs: Partial<Record<Panel, HTMLElement>> = {};
  for (const p of PANELS) {
    const tab = $(`wt-tab-${p}`);
    if (tab) tabs[p] = tab;
  }

  const code = $('wt-code');
  let codeLines = code?.querySelector<HTMLElement>('.wt-code-lines') ?? null;
  if (code && !codeLines) {
    codeLines = doc.createElement('div');
    codeLines.className = 'wt-code-lines';
    code.appendChild(codeLines);
  }

  return {
    root,
    explanation,
    visualizer,
    vars: $('wt-vars'),
    aux: $('wt-aux'),
    beats: $('wt-beats'),
    codeLines,
    caption: $('wt-caption'),
    prev: $('wt-prev'),
    play: $('wt-play'),
    next: $('wt-next'),
    reset: $('wt-reset'),
    speed: $('wt-speed') as HTMLInputElement | null,
    slider: $('wt-frame-slider') as HTMLInputElement | null,
    counter: $('wt-frame-counter'),
    preset: $('wt-preset') as HTMLSelectElement | null,
    tabs,
  };
}

export function setRootState(
  root: HTMLElement,
  s: { index: number; total: number; playing: boolean; preset: string },
): void {
  root.setAttribute('data-frame-index', String(s.index));
  root.setAttribute('data-total-frames', String(s.total));
  root.setAttribute('data-playing', String(s.playing));
  root.setAttribute('data-preset', s.preset);
}
