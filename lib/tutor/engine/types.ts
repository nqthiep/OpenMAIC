export type HighlightKind = 'active' | 'compare' | 'result' | 'visited' | 'muted' | (string & {});

export interface FrameMeta {
  readonly index: number;
  readonly explanation: string;
  readonly codeLine?: number; // 1-indexed, pseudocode line
  readonly highlights?: Readonly<Record<string, HighlightKind>>;
  readonly pointers?: Readonly<Record<string, number | string>>;
  readonly vars?: Readonly<Record<string, number | string>>;
  readonly aux?: readonly {
    readonly id: string;
    readonly label: string;
    readonly items: readonly (number | string)[];
  }[];
  readonly tags?: readonly string[];
}

export interface Frame<S> {
  readonly state: S;
  readonly meta: FrameMeta;
}

export const DEFAULT_MAX_FRAMES = 500;

export const DEFAULT_MAX_STEPS = 10_000;

export type Emit<S> = (state: S, meta: Omit<FrameMeta, 'index'>) => void;

export interface RunContext {
  readonly locale: string;
}

export interface StepSource<I, S> {
  run(input: Readonly<I>, emit: Emit<S>, tick: () => void, ctx: RunContext): void;
  readonly maxFrames: number;
  readonly maxSteps?: number;
}
