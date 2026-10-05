/**
 * Catalog types (INTERFACES §5 + ADR 0006 decision 7).
 * Type-only module: no runtime code, safe to import from server and iframe bundles.
 */
import type { Emit, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';

/** 'vi-VN', 'en-US', …; fallback 'en-US'. */
export type Locale = string;
/** Static strings per locale. */
export type Messages = Readonly<Record<Locale, string>>;
/** Like Messages, but allows '{var}' filled from frame.meta.vars. */
export type MessageTemplate = Messages;
/** Pseudo line (1-based) → implementation lines. */
export type LineMap = Readonly<Record<number, readonly number[]>>;

export interface BeatDef {
  readonly id: string;
  readonly label: Messages;
  readonly narration: MessageTemplate;
  readonly ask?: {
    readonly text: Messages;
    readonly predict?: {
      kind: 'choice' | 'pointer';
      options?: readonly Messages[];
      answerFrom: 'next-frame';
    };
  };
  /** light → medium → close to the solution */
  readonly hints?: readonly [Messages, Messages, Messages];
  readonly misconceptions?: readonly Messages[];
  /** every preset must contain this beat */
  readonly required?: boolean;
}

export interface ProblemSpec {
  readonly statement: Messages;
  readonly constraints: readonly Messages[];
  readonly subtasks: readonly {
    id: string;
    limit: Messages;
    idea: Messages;
    complexity: string;
  }[];
  readonly homework?: readonly { judge: string; problemId: string }[];
}

export interface WalkthroughEntry<I = unknown, S = unknown> {
  readonly id: string;
  readonly entryRev: number;
  readonly subject: string;
  readonly visualizer: string;
  readonly curriculumTopics: readonly string[];
  readonly title: Messages;
  readonly code: {
    readonly pseudo: readonly string[];
    readonly impl: { readonly cpp: readonly string[]; readonly py: readonly string[] };
    readonly map: { readonly cpp: LineMap; readonly py: LineMap };
  };
  readonly inputSpec: InputSpec;
  /** Cross-field constraints; pure, runs after parseInput on every input path. Empty = valid. */
  readonly check?: (input: Readonly<I>) => readonly string[];
  readonly customInput?: boolean;
  readonly presets: readonly { id: string; label: Messages; input: I }[];
  readonly beatDefs: readonly BeatDef[];
  readonly problem?: ProblemSpec;
  readonly pitfalls?: readonly { text: Messages; lang?: 'cpp' | 'py'; beat?: string }[];
  readonly maxFrames: number;
  readonly maxSteps?: number;
  readonly maxBytes: number;
  run(input: Readonly<I>, emit: Emit<S>, tick: () => void, ctx: RunContext): void;
}
