import { describe, expect, it } from 'vitest';
import { generateSteps, steps } from '@/lib/tutor/engine/generate';
import { DEFAULT_MAX_FRAMES, type Emit, type StepSource } from '@/lib/tutor/engine/types';

interface In {
  list: number[];
}
interface St {
  list: number[];
}

const run = (input: Readonly<In>, emit: Emit<St>, tick: () => void) => {
  for (const n of input.list) {
    tick();
    emit({ list: [n] }, { explanation: `n=${n}` });
  }
};

describe('generateSteps', () => {
  it('is deterministic', () => {
    const a = generateSteps({ list: [1, 2, 3] }, run);
    const b = generateSteps({ list: [1, 2, 3] }, run);
    expect(a).toEqual(b);
  });

  it('freezes input deeply', () => {
    let seen: Readonly<In> | undefined;
    generateSteps({ list: [1] }, (i: Readonly<In>) => {
      seen = i;
    });
    expect(Object.isFrozen(seen)).toBe(true);
    expect(Object.isFrozen(seen!.list)).toBe(true);
    expect(() => (seen!.list as number[]).push(2)).toThrow(TypeError);
  });

  it('does not alias state passed to emit', () => {
    const state: St = { list: [1] };
    const frames = generateSteps<St, null>(null, (_i, emit) => {
      emit(state, { explanation: 'x' });
      state.list.push(2);
    });
    expect(frames[0].state.list).toEqual([1]);
    expect(Object.isFrozen(frames[0].state)).toBe(true);
    expect(Object.isFrozen(frames)).toBe(true);
  });

  it('throws RangeError over maxFrames', () => {
    expect(() => generateSteps({ list: [1, 2, 3] }, run, { maxFrames: 2 })).toThrow(RangeError);
  });

  it('throws RangeError when options.maxFrames exceeds default', () => {
    expect(() => generateSteps({ list: [] }, run, { maxFrames: DEFAULT_MAX_FRAMES + 1 })).toThrow(
      RangeError,
    );
  });

  it('infinite loop with tick only ends in RangeError', () => {
    expect(() =>
      generateSteps(null, (_i, _e, tick) => {
        for (;;) tick();
      }),
    ).toThrow(RangeError);
  });

  it('round-trips through JSON and has contiguous index', () => {
    const frames = generateSteps({ list: [1, 2, 3] }, run);
    expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
    expect(frames.map((f) => f.meta.index)).toEqual([0, 1, 2]);
  });

  it('rejects function / undefined / Map / Set / NaN in state', () => {
    const bad = (s: unknown) =>
      generateSteps<unknown, null>(null, (_i, emit) => emit(s, { explanation: '' }));
    expect(() => bad({ f: () => 1 })).toThrow(TypeError);
    expect(() => bad({ u: undefined })).toThrow(TypeError);
    expect(() => bad(undefined)).toThrow(TypeError);
    expect(() => bad({ m: new Map() })).toThrow(TypeError);
    expect(() => bad({ s: new Set() })).toThrow(TypeError);
    expect(() => bad({ n: Infinity })).toThrow(TypeError);
    expect(() => bad({ n: NaN })).toThrow(TypeError);
  });
});

describe('steps', () => {
  it('passes locale to run', () => {
    const entry: StepSource<null, { l: string }> = {
      maxFrames: 5,
      run: (_i, emit, _t, ctx) => emit({ l: ctx.locale }, { explanation: ctx.locale }),
    };
    const frames = steps(entry, null, { locale: 'vi' });
    expect(frames[0].state.l).toBe('vi');
    expect(frames[0].meta.explanation).toBe('vi');
  });
});
