import {
  DEFAULT_MAX_FRAMES,
  DEFAULT_MAX_STEPS,
  type Emit,
  type Frame,
  type StepSource,
} from './types';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function assertPlain(value: unknown, path: string, allowUndefined: boolean): void {
  if (value === undefined) {
    if (allowUndefined) return;
    throw new TypeError(`emit: undefined at ${path}`);
  }
  switch (typeof value) {
    case 'function':
    case 'symbol':
    case 'bigint':
      throw new TypeError(`emit: ${typeof value} at ${path}`);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`emit: non-finite number at ${path}`);
      return;
    case 'object':
      if (value === null) return;
      if (value instanceof Map || value instanceof Set) {
        throw new TypeError(`emit: ${value instanceof Map ? 'Map' : 'Set'} at ${path}`);
      }
      for (const key of Object.keys(value)) {
        assertPlain((value as Record<string, unknown>)[key], `${path}.${key}`, allowUndefined);
      }
      return;
    default:
      return;
  }
}

export function generateSteps<S, I>(
  input: I,
  run: (input: Readonly<I>, emit: Emit<S>, tick: () => void) => void,
  options?: { readonly maxFrames?: number; readonly maxSteps?: number },
): readonly Frame<S>[] {
  const maxFrames = options?.maxFrames ?? DEFAULT_MAX_FRAMES;
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  if (maxFrames > DEFAULT_MAX_FRAMES) {
    throw new RangeError(`maxFrames ${maxFrames} exceeds ${DEFAULT_MAX_FRAMES}`);
  }

  const frames: Frame<S>[] = [];
  let steps = 0;

  const emit: Emit<S> = (state, meta) => {
    if (frames.length >= maxFrames) {
      throw new RangeError(`frame limit ${maxFrames} exceeded`);
    }
    assertPlain(state, 'state', false);
    assertPlain(meta, 'meta', true);
    const frameMeta = deepFreeze({ ...structuredClone(meta), index: frames.length });
    frames.push(Object.freeze({ state: deepFreeze(structuredClone(state)), meta: frameMeta }));
  };

  const tick = (): void => {
    steps += 1;
    if (steps > maxSteps) {
      throw new RangeError(`step limit ${maxSteps} exceeded`);
    }
  };

  run(deepFreeze(structuredClone(input)), emit, tick);
  return Object.freeze(frames);
}

export function steps<I, S>(
  entry: StepSource<I, S>,
  input: I,
  opts: { locale: string },
): readonly Frame<S>[] {
  return generateSteps<S, I>(input, (i, e, t) => entry.run(i, e, t, { locale: opts.locale }), {
    maxFrames: entry.maxFrames,
    maxSteps: entry.maxSteps,
  });
}
