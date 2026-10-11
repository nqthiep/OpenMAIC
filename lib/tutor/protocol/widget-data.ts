/**
 * Hợp đồng dữ liệu widget walkthrough: chỉ kiểu và hằng (không logic).
 * Nguồn: DATA-MODEL §3, ARCHITECTURE §6 và §8.
 */

// [Unverified] lib/tutor/engine/types.ts chưa có ở thời điểm viết (task 1a-01):
// khai báo kiểu Frame tối thiểu cục bộ; thay bằng `import type { Frame }` khi file đó có.
export interface Frame<S> {
  readonly state: S;
  readonly meta: {
    readonly index: number;
    readonly explanation?: string;
    readonly codeLine?: number;
    readonly [key: string]: unknown;
  };
}

export type Panel = 'pseudo' | 'cpp' | 'py';

export interface BeatRef {
  id: string;
  occurrence: number;
  frame: number;
  /** Shown position of the correct option (after `order`); set by the provider, only in `sets[p].beats`. */
  answer?: number;
  /** Only in `sets[p].beats`: shown position k displays the original option `order[k]`. Absent = original order. */
  order?: number[];
}

export interface PresetInfo {
  id: string;
  label: string;
  total: number;
  framesHash: string;
}

/** Khối JSON nhẹ `#widget-config` (đi vào widgetConfig và prompt). */
export interface WalkthroughWidgetConfig {
  type: 'simulation';
  kind: 'walkthrough';
  walkthroughId: string;
  entryRev: number;
  contentHash: string;
  subject: string;
  visualizer: string;
  locale: string;
  presetId: string;
  panel: Panel;
  presets: PresetInfo[];
  /** Beat của `presetId`. */
  beats: BeatRef[];
  /** Beat của mọi preset (không có `answer`); trang dựng trước khi có trường này chỉ biết `beats`. */
  beatsByPreset?: Record<string, BeatRef[]>;
  runtimeVersion: number;
  /** Chỉ từ lát 1d (ADR 0013 §9). */
  llmInput?: unknown;
}

/** Khối JSON đầy đủ `#walkthrough-data` (chỉ runtime đọc). */
export interface WalkthroughData {
  title: string;
  locale: string;
  sets: Record<string, { frames: Frame<unknown>[]; beats: BeatRef[] }>;
  beatText: Record<string, { label: string; ask?: string; options?: string[] }>;
  code: {
    pseudo: string[];
    impl: { cpp: string[]; py: string[] };
    map: {
      cpp: Record<string, number[]>;
      py: Record<string, number[]>;
    };
  };
  labels: Record<string, string>;
  /** Công thức dựng sẵn trên server: `tex` của mỗi `\\( tex \\)` → HTML KaTeX; chỉ có khi entry có công thức. */
  math?: Record<string, string>;
}

/** Id DOM tĩnh do builder sinh (ARCHITECTURE §6). */
export const WT_IDS = [
  'wt-root',
  'wt-title',
  'wt-explanation',
  'wt-beats',
  'wt-visualizer',
  'wt-vars',
  'wt-aux',
  'wt-code',
  'wt-tab-pseudo',
  'wt-tab-cpp',
  'wt-tab-py',
  'wt-predict',
  'wt-exercise',
  'wt-caption',
  'wt-controls',
  'wt-prev',
  'wt-play',
  'wt-next',
  'wt-reset',
  'wt-speed',
  'wt-frame-slider',
  'wt-frame-counter',
  'wt-preset',
  'wt-input',
  'wt-apply',
  'wt-input-error',
] as const;

/** Trần id tương tác của Element Inventory (scene-generator.ts MAX_IDS). */
export const MAX_INTERACTIVE_IDS = 60;

export interface VisualizerRenderer {
  type: string;
  mount(el: HTMLElement, config: unknown): void;
  render(frame: Frame<unknown>, prev?: Frame<unknown>): void;
  destroy?(): void;
}
