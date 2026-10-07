/**
 * Widget provider contracts (INTERFACES §5, ADR 0013 decision 1).
 * Type-only module: no runtime code.
 */
import type { Action, InteractiveContent, Scene, SlideContent } from '@openmaic/dsl';
import type { AnyClipEntry } from '@/lib/clips/types';
import type { Locale, WalkthroughEntry } from '@/lib/tutor/catalog/types';

/**
 * Heterogeneous catalog entries: `WalkthroughEntry.run` is contravariant in its input,
 * so entries with different `I`/`S` only fit one array under the widened type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- widening for contravariant `run`; each entry stays typed at its definition
export type AnyWalkthroughEntry = WalkthroughEntry<any, any>;

export interface WidgetRuntimeState {
  readonly preset: string;
  readonly frame: number;
  readonly input?: unknown;
}

export interface BuildRequest {
  readonly id: string;
  readonly presetId?: string;
  readonly input?: unknown;
  readonly panel?: 'pseudo' | 'cpp' | 'py';
}

export interface BuildResult {
  readonly content: InteractiveContent | SlideContent[];
  readonly actions: Action[][];
  /**
   * Walkthrough: `{statement, constraints, subtasks, pitfalls: {text, lang?}[], hints: string[],
   * homework}`; `hints` = light (first) hint of each distinct narrated beat. Text is localized.
   */
  readonly lessonKit?: unknown;
}

export interface WidgetContext {
  readonly locale: Locale;
  readonly languageDirective?: string;
}

export interface WidgetProvider {
  /** 'walkthrough' | 'clip' */
  readonly id: string;
  /** By `widgetConfig.kind` / name 'clip:'. */
  claimsScene(scene: Scene): boolean;
  build(req: BuildRequest, ctx: WidgetContext): BuildResult;
  actions(scene: Scene, ctx: WidgetContext): Action[];
  /** Text comes from the catalog; stale `entryRev` → static digest. */
  describe(scene: Scene, runtime?: WidgetRuntimeState): string;
  /** `entryRev`/`contentHash`/`framesHash` differ from the current catalog, or the scene's preset is gone (ADR 0013 decision 6). */
  isStale?(scene: Scene): boolean;
}

export interface SubjectPack {
  readonly id: string;
  readonly skillId: string;
  readonly walkthroughs: readonly AnyWalkthroughEntry[];
  readonly clips?: readonly AnyClipEntry[];
}
