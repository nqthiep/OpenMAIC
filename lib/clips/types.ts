/**
 * Clip catalog types (ARCHITECTURE §8b, DATA-MODEL §4). Type-only: no runtime code.
 * A clip is a pre-rendered silent Manim video split into chapters; the teacher's words are speech.
 */
import type { Locale, Messages } from '@/lib/tutor/catalog/types';
import type { InputSpec } from '@/lib/tutor/input-spec';

export interface ClipChapter {
  readonly id: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly label: Messages;
  /** the teacher's words before and after the chapter (the clip is silent) */
  readonly before: Messages;
  readonly after: Messages;
  readonly caption?: Messages;
  readonly ask?: Messages;
}

export interface ClipSheetChapter {
  readonly id: string;
  readonly shows: Messages;
  readonly formulas: readonly string[];
  readonly misconceptions: readonly Messages[];
  readonly hints: readonly [Messages, Messages, Messages];
}

export interface ClipAsset {
  readonly master?: string;
  readonly chapters: readonly { id: string; url: string; poster: string }[];
  /** URL of the clip's manifest.json (the numbers the scene drew, checked against `expectedDisplay`) */
  readonly manifest?: string;
}

export interface ClipEntry<I = unknown> {
  /** unique across all packs; the clip provider recognises slides named 'clip:<id>@…' */
  readonly id: string;
  readonly kind: 'prebuilt' | 'template';
  readonly curriculumTopics: readonly string[];
  readonly title: Messages;
  /** numbers and enums only: no free strings (no LaTeX injection path) */
  readonly inputSpec: InputSpec;
  readonly check?: (input: Readonly<I>) => readonly string[];
  readonly presets: readonly { id: string; label: Messages; input: I }[];
  readonly engine: {
    readonly name: 'manim-ce';
    readonly version: string;
    readonly templateRev: number;
  };
  readonly render: { readonly w: 1280; readonly h: 720; readonly fps: 30 };
  readonly silent: true;
  readonly chapters: readonly ClipChapter[];
  /** pure TS check of the mathematical invariants, run on every preset and edge */
  invariants(input: Readonly<I>): boolean;
  /** baked-in text depends on the locale; false means the locale is not part of the cache key */
  readonly bakedText: boolean;
  /** the app's part of the cache key (DATA-MODEL §4; templateId = id) */
  cacheKeyInput(input: Readonly<I>, locale: Locale): unknown[];
  /** null = not rendered yet */
  asset(input: Readonly<I>, locale: Locale): ClipAsset | null;
  /** source of clip-sheet.json; Q&A reads it directly */
  readonly sheet: { readonly chapters: readonly ClipSheetChapter[] };
}

/** What each clip module exports: the entry plus the numbers the scene must write to manifest.json. */
export interface ClipModule<I = unknown> {
  readonly entry: ClipEntry<I>;
  expectedDisplay(input: Readonly<I>): Record<string, number>;
}

/**
 * Heterogeneous clip entries: `invariants`/`check`/`asset` take the entry's input, so entries with
 * different `I` only fit one array under the widened type (same trick as `AnyWalkthroughEntry`).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- widening for contravariant methods; each entry stays typed at its definition
export type AnyClipEntry = ClipEntry<any>;
