import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleWidgetEvent,
  walkthroughIdOf,
  walkthroughPresetsOf,
} from '@/components/scene-renderers/InteractiveIframeHost';
import {
  markReady,
  recordDesiredPayload,
  recordState,
  resetIframe,
  setDesired,
  useWidgetRuntimeState,
  type WidgetRuntimeMap,
} from '@/lib/store/widget-runtime-state';
import { makeReady, makeState, type SetWidgetStateMessage } from '@/lib/tutor/protocol/messages';
import type { Scene } from '@/lib/types/stage';

const PRESETS = [
  { id: 'mid-hit', total: 10 },
  { id: 'empty', total: 0 },
];
const DESIRED: SetWidgetStateMessage = {
  type: 'SET_WIDGET_STATE',
  state: { preset: 'mid-hit', frame: 5, playing: false },
};
const EMPTY: WidgetRuntimeMap = {};

function ready(map: WidgetRuntimeMap = EMPTY) {
  return markReady(map, 's1', PRESETS).map;
}

describe('widget-runtime-state reducers', () => {
  it('markReady returns the desired message to re-send, none when there is no desired', () => {
    expect(markReady(EMPTY, 's1', PRESETS).desired).toBeUndefined();
    const withDesired = setDesired(EMPTY, 's1', DESIRED);
    const r = markReady(withDesired, 's1', PRESETS);
    expect(r.desired).toEqual(DESIRED);
    expect(r.map.s1).toMatchObject({ ready: true, totals: { 'mid-hit': 10, empty: 0 } });
  });

  const msg = (state: SetWidgetStateMessage['state'], content?: string): SetWidgetStateMessage => ({
    type: 'SET_WIDGET_STATE',
    state,
    ...(content ? { content } : {}),
  });

  it('setDesired merges partial patches and does not mark ready', () => {
    let map = setDesired(EMPTY, 's1', msg({ preset: 'mid-hit', speed: 2 }));
    map = setDesired(map, 's1', msg({ frame: 5 }));
    map = setDesired(map, 's1', msg({ panel: 'cpp', playing: true }));
    expect(map.s1).toEqual({
      ready: false,
      desired: msg({ preset: 'mid-hit', speed: 2, frame: 5, panel: 'cpp', playing: true }),
    });
  });

  it('a new preset without frame drops the stale frame; the same preset keeps it', () => {
    let map = setDesired(EMPTY, 's1', DESIRED);
    map = setDesired(map, 's1', msg({ preset: 'mid-hit' }));
    expect(map.s1.desired?.state).toEqual({ preset: 'mid-hit', frame: 5, playing: false });
    map = setDesired(map, 's1', msg({ preset: 'empty' }));
    expect(map.s1.desired?.state).toEqual({ preset: 'empty', playing: false });
    map = setDesired(map, 's1', msg({ preset: 'mid-hit', frame: 1 }));
    expect(map.s1.desired?.state).toEqual({ preset: 'mid-hit', frame: 1, playing: false });
  });

  it('one-shot predict/restart/content are never stored, so a rebuild does not replay them', () => {
    let map = setDesired(EMPTY, 's1', msg({ preset: 'mid-hit', frame: 2 }));
    map = setDesired(
      map,
      's1',
      msg({ frame: 3, predict: { beatId: 'b1' }, restart: true }, 'câu hỏi'),
    );
    expect(map.s1.desired).toEqual(msg({ preset: 'mid-hit', frame: 3 }));
    // a message with only one-shot fields leaves the map untouched
    expect(setDesired(map, 's1', msg({ predict: { beatId: 'b2' } }, 'x'))).toBe(map);
    expect(setDesired(EMPTY, 's1', msg({ restart: true }))).toBe(EMPTY);

    const rebuilt = markReady(resetIframe(map, 's1'), 's1', PRESETS).desired;
    expect(rebuilt).toEqual(msg({ preset: 'mid-hit', frame: 3 }));
  });

  it('markReady keeps only presets in the scene widgetConfig, with the config totals', () => {
    const own = [
      { id: 'mid-hit', total: 4 },
      { id: 'other', total: 9 },
    ];
    const r = markReady(EMPTY, 's1', PRESETS, own);
    expect(r.map.s1.totals).toEqual({ 'mid-hit': 4 }); // 'empty' not in config; iframe total 10 ignored
    const st = recordState(
      r.map,
      's1',
      makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 99 }),
    );
    expect(st.s1.state).toEqual({ preset: 'mid-hit', frame: 3 });
    expect(
      recordState(r.map, 's1', makeState({ walkthroughId: 'w', preset: 'empty', frame: 1 })),
    ).toBe(r.map);
  });

  it('recordDesiredPayload records a SET_WIDGET_STATE before any iframe registered', () => {
    useWidgetRuntimeState.setState({ byScene: {} });
    recordDesiredPayload('s1', 'SET_WIDGET_STATE', { state: { preset: 'mid-hit', frame: 2 } });
    recordDesiredPayload('s1', 'HIGHLIGHT_ELEMENT', { target: '#x' });
    expect(useWidgetRuntimeState.getState().byScene.s1.desired?.state).toEqual({
      preset: 'mid-hit',
      frame: 2,
    });
    expect(useWidgetRuntimeState.getState().markReady('s1', PRESETS)?.state).toEqual({
      preset: 'mid-hit',
      frame: 2,
    });
  });

  it('recordState ignores everything before ready', () => {
    const map = setDesired(EMPTY, 's1', DESIRED);
    expect(
      recordState(map, 's1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 3 })),
    ).toBe(map);
    expect(
      recordState(EMPTY, 'nope', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 3 })),
    ).toBe(EMPTY);
  });

  it('recordState clamps frame to [0, total-1] and keeps only the last value', () => {
    let map = recordState(
      ready(),
      's1',
      makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 99 }),
    );
    expect(map.s1.state).toEqual({ preset: 'mid-hit', frame: 9 });
    map = recordState(map, 's1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 4 }));
    expect(map.s1.state).toEqual({ preset: 'mid-hit', frame: 4 });
    map = recordState(map, 's1', makeState({ walkthroughId: 'w', preset: 'empty', frame: 7 }));
    expect(map.s1.state).toEqual({ preset: 'empty', frame: 0 });
  });

  it('recordState ignores a preset the iframe never announced (including prototype keys)', () => {
    const map = ready();
    for (const preset of ['ghost', 'toString', '__proto__']) {
      expect(recordState(map, 's1', makeState({ walkthroughId: 'w', preset, frame: 1 }))).toBe(map);
    }
  });

  it('recordState rejects a bad frame', () => {
    const map = ready();
    for (const frame of [-1, 1.5, Number.NaN]) {
      const raw = { ...makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 0 }), frame };
      expect(recordState(map, 's1', raw)).toBe(map);
    }
  });

  it('keeps input only for the student preset and within 2048 bytes', () => {
    const base = { walkthroughId: 'w', frame: 3 };
    const small = { a: [1, 2, 3] };
    let map = recordState(ready(), 's1', makeState({ ...base, preset: 'student', input: small }));
    expect(map.s1.state).toEqual({ preset: 'student', frame: 3, input: small });

    // student has no total: frame is only required to be an integer >= 0
    map = recordState(
      map,
      's1',
      makeState({ ...base, preset: 'student', frame: 500, input: small }),
    );
    expect(map.s1.state?.frame).toBe(500);

    const exact = { s: 'x'.repeat(2048 - '{"s":""}'.length) };
    expect(new TextEncoder().encode(JSON.stringify(exact)).length).toBe(2048);
    map = recordState(map, 's1', makeState({ ...base, preset: 'student', input: exact }));
    expect(map.s1.state?.input).toEqual(exact);

    const big = { s: 'x'.repeat(2049 - '{"s":""}'.length) };
    map = recordState(map, 's1', makeState({ ...base, preset: 'student', input: big }));
    expect(map.s1.state).toEqual({ preset: 'student', frame: 3 });

    map = recordState(map, 's1', makeState({ ...base, preset: 'mid-hit', input: small }));
    expect(map.s1.state).toEqual({ preset: 'mid-hit', frame: 3 });
  });

  it('drops an input that cannot be serialized', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const raw = {
      ...makeState({ walkthroughId: 'w', preset: 'student', frame: 1 }),
      input: cyclic,
    };
    expect(recordState(ready(), 's1', raw).s1.state).toEqual({ preset: 'student', frame: 1 });
  });

  it('keeps the prediction', () => {
    const prediction = { beatId: 'b1', correct: true };
    const map = recordState(
      ready(),
      's1',
      makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 1, prediction }),
    );
    expect(map.s1.state).toEqual({ preset: 'mid-hit', frame: 1, prediction });
  });

  it('resetIframe clears ready and state but keeps desired, which markReady returns again', () => {
    let map = setDesired(EMPTY, 's1', DESIRED);
    map = markReady(map, 's1', PRESETS).map;
    map = recordState(map, 's1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 2 }));
    expect(map.s1.state).toBeDefined();

    const reset = resetIframe(map, 's1');
    expect(reset.s1.ready).toBe(false);
    expect(reset.s1.state).toBeUndefined();
    expect(reset.s1.desired).toEqual(DESIRED);
    expect(
      recordState(reset, 's1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 2 })),
    ).toBe(reset);
    expect(markReady(reset, 's1', PRESETS).desired).toEqual(DESIRED);
    expect(resetIframe(EMPTY, 'nope')).toBe(EMPTY);
  });

  it('does not mutate the input map and keeps scenes apart', () => {
    const before = ready();
    const snapshot = JSON.stringify(before);
    recordState(before, 's1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 2 }));
    resetIframe(before, 's1');
    setDesired(before, 's2', DESIRED);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(setDesired(before, 's2', DESIRED).s1).toBe(before.s1);
  });
});

describe('useWidgetRuntimeState store', () => {
  beforeEach(() => useWidgetRuntimeState.setState({ byScene: {} }));

  it('runs the handshake: hold desired, ready returns it, state only after ready', () => {
    const st = () => useWidgetRuntimeState.getState();
    st().setDesired('s1', DESIRED);
    st().recordState('s1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 3 }));
    expect(st().byScene.s1.state).toBeUndefined();

    expect(st().markReady('s1', PRESETS)).toEqual(DESIRED);
    st().recordState('s1', makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 3 }));
    expect(st().byScene.s1.state).toEqual({ preset: 'mid-hit', frame: 3 });

    st().resetIframe('s1');
    expect(st().byScene.s1).toEqual({ ready: false, desired: DESIRED });
  });
});

describe('InteractiveIframeHost walkthrough wiring', () => {
  beforeEach(() => useWidgetRuntimeState.setState({ byScene: {} }));

  const scene = (content: unknown) => ({ id: 's1', content }) as unknown as Scene;

  it('walkthroughIdOf only matches interactive scenes with widgetConfig.kind === walkthrough', () => {
    const wt = { type: 'simulation', kind: 'walkthrough', walkthroughId: 'binary-search' };
    expect(walkthroughIdOf(scene({ type: 'interactive', widgetConfig: wt }))).toBe('binary-search');
    expect(
      walkthroughIdOf(scene({ type: 'interactive', widgetConfig: { type: 'simulation' } })),
    ).toBeNull();
    expect(walkthroughIdOf(scene({ type: 'interactive' }))).toBeNull();
    expect(walkthroughIdOf(scene({ type: 'slide', widgetConfig: wt }))).toBeNull();
    expect(
      walkthroughIdOf(scene({ type: 'interactive', widgetConfig: { kind: 'walkthrough' } })),
    ).toBeNull();
    expect(walkthroughIdOf(undefined)).toBeNull();
  });

  it('ready re-sends desired, state is recorded after it, a foreign walkthroughId is ignored', () => {
    const post = vi.fn();
    const st = () => useWidgetRuntimeState.getState();
    const readyMsg = makeReady({ walkthroughId: 'binary-search', entryRev: 1, presets: PRESETS });
    const stateMsg = makeState({ walkthroughId: 'binary-search', preset: 'mid-hit', frame: 99 });

    st().setDesired('s1', DESIRED);
    expect(handleWidgetEvent('s1', 'binary-search', stateMsg, post)).toBe(true);
    expect(st().byScene.s1.state).toBeUndefined();

    expect(handleWidgetEvent('s1', 'other', readyMsg, post)).toBe(false);
    expect(st().byScene.s1.ready).toBe(false);
    expect(post).not.toHaveBeenCalled();

    expect(handleWidgetEvent('s1', 'binary-search', readyMsg, post)).toBe(true);
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith('SET_WIDGET_STATE', { state: DESIRED.state });

    handleWidgetEvent('s1', 'binary-search', stateMsg, post);
    expect(st().byScene.s1.state).toEqual({ preset: 'mid-hit', frame: 9 });
  });

  it('ready clamps against the scene widgetConfig.presets, not the iframe-reported ones', () => {
    const wt = {
      type: 'simulation',
      kind: 'walkthrough',
      walkthroughId: 'w',
      presets: [{ id: 'mid-hit', total: 4 }, { id: 'bad', total: -1 }, { total: 3 }],
    };
    const sc = scene({ type: 'interactive', widgetConfig: wt });
    expect(walkthroughPresetsOf(sc)).toEqual([{ id: 'mid-hit', total: 4 }]);
    expect(walkthroughPresetsOf(scene({ type: 'interactive', widgetConfig: {} }))).toBeUndefined();
    expect(walkthroughPresetsOf(scene({ type: 'slide' }))).toBeUndefined();

    const st = () => useWidgetRuntimeState.getState();
    const readyMsg = makeReady({ walkthroughId: 'w', entryRev: 1, presets: PRESETS });
    handleWidgetEvent('s1', 'w', readyMsg, vi.fn(), walkthroughPresetsOf(sc));
    expect(st().byScene.s1.totals).toEqual({ 'mid-hit': 4 });
    handleWidgetEvent(
      's1',
      'w',
      makeState({ walkthroughId: 'w', preset: 'mid-hit', frame: 9 }),
      vi.fn(),
      walkthroughPresetsOf(sc),
    );
    expect(st().byScene.s1.state).toEqual({ preset: 'mid-hit', frame: 3 });
  });

  it('ready without a desired message sends nothing; garbage is ignored', () => {
    const post = vi.fn();
    const readyMsg = makeReady({ walkthroughId: 'w', entryRev: 1, presets: PRESETS });
    expect(handleWidgetEvent('s1', 'w', readyMsg, post)).toBe(true);
    expect(post).not.toHaveBeenCalled();
    expect(handleWidgetEvent('s1', 'w', { kind: 'widget-ready' }, post)).toBe(false);
    expect(handleWidgetEvent('s1', 'w', null, post)).toBe(false);
  });
});
