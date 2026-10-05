import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionEngine, PREDICT_WAIT_MS, type PredictTimer } from '@/lib/action/engine';
import { useWidgetRuntimeState } from '@/lib/store/widget-runtime-state';
import type { Action } from '@/lib/types/action';

const SCENE = 'scene-1';
const PRESET = 'p0';

const predictAction = (beatId = 'mid'): Action => ({
  id: 'set-1',
  type: 'widget_setState',
  state: { preset: PRESET, frame: 2, predict: { beatId } },
});

/** Records timers instead of running them, so the test decides when "20 s" has passed. */
function fakeTimer() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const timer: PredictTimer = {
    set: (fn, ms) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clear: (h) => void pending.delete(h as number),
  };
  return { timer, pending, fireAll: () => [...pending.values()].forEach((t) => t.fn()) };
}

function setup() {
  const messages: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const t = fakeTimer();
  const stageStore = { getState: () => ({ currentSceneId: SCENE }) };
  const engine = new ActionEngine(
    stageStore as never,
    null,
    (type, payload) => messages.push({ type, payload }),
    t.timer,
  );
  return { engine, messages, ...t };
}

/** Starts `execute` and reports whether it has settled, without awaiting it. */
function run(
  engine: ActionEngine,
  action: Action,
  options?: { silent?: boolean; signal?: AbortSignal },
) {
  const r = { done: false };
  void engine.execute(action, options).then(() => (r.done = true));
  return r;
}

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function answer(beatId: string, correct = true) {
  useWidgetRuntimeState.getState().recordState(SCENE, {
    preset: PRESET,
    frame: 2,
    prediction: { beatId, correct },
  } as never);
}

describe('ActionEngine prediction wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWidgetRuntimeState.setState({ byScene: {} });
    useWidgetRuntimeState.getState().markReady(SCENE, [{ id: PRESET, total: 5 }]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the state, then waits until the beat is answered', async () => {
    const { engine, messages, pending } = setup();
    const r = run(engine, predictAction());
    await flush(300);
    expect(messages).toHaveLength(1);
    expect(messages[0].payload.state).toMatchObject({ predict: { beatId: 'mid' } });
    expect(r.done).toBe(false);
    expect([...pending.values()].map((t) => t.ms)).toEqual([PREDICT_WAIT_MS]);
    expect(PREDICT_WAIT_MS).toBe(20_000);

    answer('mid');
    await flush();
    expect(r.done).toBe(true);
    expect(pending.size).toBe(0); // timer cleared
  });

  it('a skipped answer (prediction still sent) also ends the wait', async () => {
    const { engine } = setup();
    const r = run(engine, predictAction());
    await flush(300);
    answer('mid', false);
    await flush();
    expect(r.done).toBe(true);
  });

  it('a prediction for another beat does not end the wait', async () => {
    const { engine } = setup();
    const r = run(engine, predictAction('mid'));
    await flush(300);
    answer('other');
    await flush();
    expect(r.done).toBe(false);
  });

  it('carries on when the 20 s timer fires', async () => {
    const { engine, fireAll } = setup();
    const r = run(engine, predictAction());
    await flush(300);
    expect(r.done).toBe(false);
    fireAll();
    await flush();
    expect(r.done).toBe(true);
  });

  it('ignores an older answer to the same beat (replay) and waits for a new one', async () => {
    answer('mid');
    const { engine } = setup();
    const r = run(engine, predictAction());
    await flush(300);
    expect(r.done).toBe(false);
    answer('mid');
    await flush();
    expect(r.done).toBe(true);
  });

  it('stops waiting when the signal aborts', async () => {
    const { engine } = setup();
    const ctrl = new AbortController();
    const r = run(engine, predictAction(), { signal: ctrl.signal });
    await flush(300);
    ctrl.abort();
    await flush();
    expect(r.done).toBe(true);
  });

  it('silent mode neither sends nor waits', async () => {
    const { engine, messages, pending } = setup();
    const r = run(engine, predictAction(), { silent: true });
    await flush();
    expect(r.done).toBe(true);
    expect(messages).toHaveLength(0);
    expect(pending.size).toBe(0);
  });

  it('a setState without predict does not wait', async () => {
    const { engine, pending } = setup();
    const r = run(engine, { id: 's2', type: 'widget_setState', state: { frame: 1 } });
    await flush(300);
    expect(r.done).toBe(true);
    expect(pending.size).toBe(0);
  });
});
