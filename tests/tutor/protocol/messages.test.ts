import { describe, it, expect } from 'vitest';
import {
  parseInbound,
  planSetWidgetState,
  makeContinue,
  makeReady,
  makeState,
  parseLearnerContinue,
  parseWidgetEvent,
  type SetWidgetStateMessage,
} from '@/lib/tutor/protocol/messages';

const presets = [
  { id: 'a', total: 9 },
  { id: 'b', total: 4 },
];

function set(state: unknown, content?: unknown) {
  return parseInbound({ type: 'SET_WIDGET_STATE', state, content }) as SetWidgetStateMessage;
}

describe('parseInbound', () => {
  it('accepts valid SET_WIDGET_STATE', () => {
    const m = parseInbound({
      type: 'SET_WIDGET_STATE',
      state: {
        preset: 'a',
        frame: 5,
        panel: 'cpp',
        speed: 1,
        playing: true,
        restart: false,
        predict: { beatId: 'mid' },
      },
      content: 'hi',
    });
    expect(m).toEqual({
      type: 'SET_WIDGET_STATE',
      state: {
        preset: 'a',
        frame: 5,
        panel: 'cpp',
        speed: 1,
        playing: true,
        restart: false,
        predict: { beatId: 'mid' },
      },
      content: 'hi',
    });
  });

  it('accepts valid HIGHLIGHT_ELEMENT and rejects long target', () => {
    expect(parseInbound({ type: 'HIGHLIGHT_ELEMENT', target: '#x' })).toEqual({
      type: 'HIGHLIGHT_ELEMENT',
      target: '#x',
    });
    expect(parseInbound({ type: 'HIGHLIGHT_ELEMENT', target: 'a'.repeat(201) })).toBeNull();
  });

  it('drops badly typed fields', () => {
    for (const bad of [1.5, NaN, '3']) {
      expect(set({ frame: bad }).state.frame).toBeUndefined();
    }
    const s = set({
      panel: 'java',
      speed: Infinity,
      playing: 'yes',
      restart: 1,
      predict: {},
    }).state;
    expect(s).toEqual({});
    expect(set({ preset: 'a' }, 5).content).toBeUndefined();
  });

  it('returns null for odd input without throwing', () => {
    for (const v of [
      null,
      undefined,
      [],
      5,
      'x',
      true,
      { type: 'NOPE' },
      { type: 'ANNOTATE_ELEMENT' },
    ]) {
      expect(parseInbound(v)).toBeNull();
    }
  });
});

describe('planSetWidgetState', () => {
  it('orders ops preset, frame, panel, speed, playing', () => {
    const ops = planSetWidgetState(
      set({ playing: true, restart: true, speed: 1, panel: 'py', frame: 2, preset: 'a' }),
      presets,
      'b',
    );
    expect(ops!.map((o) => o.op)).toEqual(['preset', 'frame', 'panel', 'speed', 'playing']);
    expect(ops![4]).toEqual({ op: 'playing', playing: true, restart: true });
  });

  it('returns null for unknown preset', () => {
    expect(planSetWidgetState(set({ preset: 'zzz', frame: 1 }), presets, 'a')).toBeNull();
  });

  it('clamps frame by the new preset total', () => {
    const ops = planSetWidgetState(set({ preset: 'b', frame: 100 }), presets, 'a');
    expect(ops).toContainEqual({ op: 'frame', frame: 3 });
    const neg = planSetWidgetState(set({ frame: -4 }), presets, 'a');
    expect(neg).toEqual([{ op: 'frame', frame: 0 }]);
  });

  it('resets frame to 0 when preset changes without frame', () => {
    expect(planSetWidgetState(set({ preset: 'b' }), presets, 'a')).toEqual([
      { op: 'preset', preset: 'b' },
      { op: 'frame', frame: 0 },
    ]);
  });

  it('clamps speed to [0.25, 2]', () => {
    expect(planSetWidgetState(set({ speed: 10 }), presets, 'a')).toEqual([
      { op: 'speed', speed: 2 },
    ]);
    expect(planSetWidgetState(set({ speed: 0 }), presets, 'a')).toEqual([
      { op: 'speed', speed: 0.25 },
    ]);
  });

  it('playing without restart carries restart false', () => {
    expect(planSetWidgetState(set({ playing: true }), presets, 'a')).toEqual([
      { op: 'playing', playing: true, restart: false },
    ]);
  });
});

describe('widget-ready / widget-state', () => {
  it('builds and parses widget-ready', () => {
    const m = makeReady({ walkthroughId: 'bs', entryRev: 3, presets });
    expect(m).toMatchObject({ __maicInteractive: true, kind: 'widget-ready', v: 1 });
    expect(parseWidgetEvent(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('builds and parses widget-state', () => {
    const m = makeState({
      walkthroughId: 'bs',
      preset: 'a',
      frame: 7,
      prediction: { beatId: 'mid', correct: true },
    });
    expect(m).toMatchObject({ __maicInteractive: true, kind: 'widget-state', v: 1 });
    expect(parseWidgetEvent(m)).toEqual(m);
  });

  it('drops oversized input (UTF-8 bytes) and keeps small input', () => {
    const base = { walkthroughId: 'bs', preset: 'student', frame: 1 };
    expect(parseWidgetEvent(makeState({ ...base, input: { v: [1, 2] } }))).toHaveProperty('input');
    const big = parseWidgetEvent(makeState({ ...base, input: { s: 'é'.repeat(1100) } }));
    expect(big).not.toHaveProperty('input');
  });

  it('rejects bad frames and odd values without throwing', () => {
    const ok = makeState({ walkthroughId: 'bs', preset: 'a', frame: 1 });
    for (const frame of [-1, 1.5, NaN, '1']) {
      expect(parseWidgetEvent({ ...ok, frame })).toBeNull();
    }
    for (const v of [null, [], 3, 'x', { kind: 'runtime-error' }, { ...ok, v: 2 }]) {
      expect(parseWidgetEvent(v)).toBeNull();
    }
  });
});

describe('learner-continue', () => {
  it('builds and parses the learner-continue message', () => {
    const m = makeContinue({ walkthroughId: 'bs' });
    expect(m).toEqual({
      __maicInteractive: true,
      kind: 'learner-continue',
      v: 1,
      walkthroughId: 'bs',
    });
    expect(parseLearnerContinue(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('keeps only its own fields', () => {
    expect(parseLearnerContinue({ ...makeContinue({ walkthroughId: 'bs' }), frame: 3 })).toEqual(
      makeContinue({ walkthroughId: 'bs' }),
    );
  });

  it('rejects other shapes without throwing', () => {
    const ok = makeContinue({ walkthroughId: 'bs' });
    const bad = [
      null,
      [],
      'learner-continue',
      { ...ok, __maicInteractive: false },
      { ...ok, v: 2 },
      { ...ok, kind: 'widget-state' },
      { ...ok, walkthroughId: 7 },
      { __maicInteractive: true, kind: 'learner-continue', v: 1 },
    ];
    for (const v of bad) expect(parseLearnerContinue(v)).toBeNull();
  });

  it('is not a widget event, so the host state path never records it', () => {
    expect(parseWidgetEvent(makeContinue({ walkthroughId: 'bs' }))).toBeNull();
  });
});
