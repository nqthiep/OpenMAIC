// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionEngine, PREDICT_WAIT_MS, type PredictTimer } from '@/lib/action/engine';
import { useWidgetRuntimeState } from '@/lib/store/widget-runtime-state';
import { makeContinue } from '@/lib/tutor/protocol/messages';
import type { Action } from '@/lib/types/action';

const SCENE = 'scene-1';
const PRESET = 'p0';
const WALKTHROUGH = 'wt-1';

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

/** The scene is the tutor's walkthrough, or a regular classroom scene. */
function stageStore(walkthrough: boolean) {
  const kind = walkthrough ? 'walkthrough' : 'simulation';
  const scene = {
    id: SCENE,
    content: { type: 'interactive', widgetConfig: { kind, walkthroughId: WALKTHROUGH } },
  };
  return { getState: () => ({ currentSceneId: SCENE, scenes: [scene] }) };
}

function setup(walkthrough = false) {
  const messages: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const t = fakeTimer();
  const engine = new ActionEngine(
    stageStore(walkthrough) as never,
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

/** The widget reports where the learner is, as it does after every frame change. */
function reportFrame(frame: number) {
  useWidgetRuntimeState.getState().recordState(SCENE, { preset: PRESET, frame } as never);
}

/** A frame of this page, as the walkthrough iframe is. */
function pageFrame(): Window {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  return frame.contentWindow!;
}

/** The learner pressed Tiếp or Phát in the walkthrough that `source` shows. */
function learnerContinue(source: MessageEventSource | null, walkthroughId = WALKTHROUGH) {
  window.dispatchEvent(
    new MessageEvent('message', { data: makeContinue({ walkthroughId }), source }),
  );
}

describe('ActionEngine prediction wait', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useWidgetRuntimeState.setState({ byScene: {} });
    useWidgetRuntimeState.getState().markReady(SCENE, [{ id: PRESET, total: 5 }]);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  describe('regular classroom', () => {
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

    it('a move-on from the question also ends the wait', async () => {
      const { engine, pending } = setup();
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2); // the widget shows the question at its own frame
      reportFrame(3); // the learner moved on
      await flush();
      expect(r.done).toBe(true);
      expect(pending.size).toBe(0);
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

    it('dispose ends the wait and clears its timer', async () => {
      const { engine, pending } = setup();
      const r = run(engine, predictAction());
      await flush(300);
      expect(pending.size).toBe(1);
      engine.dispose();
      await flush();
      expect(r.done).toBe(true);
      expect(pending.size).toBe(0);
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

    it('a learner move-on does not end a regular classroom question', async () => {
      const { engine } = setup();
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2);
      learnerContinue(pageFrame());
      await flush();
      expect(r.done).toBe(false);
    });
  });

  describe('walkthrough', () => {
    it('waits for the learner with no timer at all', async () => {
      const { engine, pending, fireAll } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      expect(pending.size).toBe(0);
      fireAll();
      await flush(PREDICT_WAIT_MS);
      expect(r.done).toBe(false);
    });

    it('an answer or a skip keeps the question until the learner moves on', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      answer('mid', false);
      await flush();
      expect(r.done).toBe(false);
      useWidgetRuntimeState.getState().recordState(SCENE, {
        preset: PRESET,
        frame: 2,
        prediction: { beatId: 'mid', correct: false, skipped: true },
      } as never);
      await flush();
      expect(r.done).toBe(false);
      reportFrame(3); // the learner moves on
      await flush();
      expect(r.done).toBe(true);
    });

    it('a reload after the answer ends the wait, since the question is gone with the iframe', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      answer('mid');
      await flush();
      expect(r.done).toBe(false);
      useWidgetRuntimeState.getState().resetIframe(SCENE);
      await flush();
      expect(r.done).toBe(true);
    });

    it('moving to another frame after the question was shown ends the wait at once', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2);
      await flush();
      expect(r.done).toBe(false);
      reportFrame(3);
      await flush();
      expect(r.done).toBe(true);
    });

    it('ends when the iframe reloads, since the question is gone with it', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2);
      await flush();
      expect(r.done).toBe(false);
      useWidgetRuntimeState.getState().resetIframe(SCENE);
      await flush();
      expect(r.done).toBe(true);
    });

    it('counts a reply that lands during the 300 ms pause', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      reportFrame(2); // the reply arrives before the engine's delay is over
      await flush(300);
      expect(r.done).toBe(false);
      reportFrame(4);
      await flush();
      expect(r.done).toBe(true);
    });

    it('ignores a frame report that comes before the question is shown', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(0); // e.g. the iframe's first report, sent before it applied the question
      await flush();
      expect(r.done).toBe(false);
      reportFrame(2);
      await flush();
      expect(r.done).toBe(false);
      reportFrame(3);
      await flush();
      expect(r.done).toBe(true);
    });

    it('without a widget to show it (chat), a walkthrough question keeps the timer', async () => {
      const t = fakeTimer();
      const engine = new ActionEngine(stageStore(true) as never, null, null, t.timer);
      const r = run(engine, predictAction());
      await flush(300);
      expect([...t.pending.values()].map((p) => p.ms)).toEqual([PREDICT_WAIT_MS]);
      t.fireAll();
      await flush();
      expect(r.done).toBe(true);
    });

    it('a question without a frame keeps the timer', async () => {
      const { engine, pending, fireAll } = setup(true);
      const r = run(engine, {
        id: 's3',
        type: 'widget_setState',
        state: { predict: { beatId: 'mid' } },
      });
      await flush(300);
      expect([...pending.values()].map((t) => t.ms)).toEqual([PREDICT_WAIT_MS]);
      fireAll();
      await flush();
      expect(r.done).toBe(true);
    });

    it('dispose ends a pending wait', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      engine.dispose();
      await flush();
      expect(r.done).toBe(true);
    });

    it('Tiếp or Phát ends the wait even when no frame moves (the last frame)', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2); // the question is on screen; the learner presses Tiếp on the last frame
      await flush();
      expect(r.done).toBe(false);
      learnerContinue(pageFrame());
      await flush();
      expect(r.done).toBe(true);
    });

    it('a move-on counts only once the widget has shown a framed question', async () => {
      const { engine } = setup(true);
      const frame = pageFrame();
      const r = run(engine, predictAction());
      await flush(300);
      learnerContinue(frame);
      await flush();
      expect(r.done).toBe(false);
      reportFrame(2);
      learnerContinue(frame);
      await flush();
      expect(r.done).toBe(true);
    });

    it('ignores a move-on that does not come from a frame of this page', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2);
      learnerContinue(window);
      await flush();
      expect(r.done).toBe(false);
    });

    it('ignores a move-on from another walkthrough', async () => {
      const { engine } = setup(true);
      const r = run(engine, predictAction());
      await flush(300);
      reportFrame(2);
      learnerContinue(pageFrame(), 'wt-other');
      await flush();
      expect(r.done).toBe(false);
    });

    it('a move-on ends a question without a frame, and clears its timer', async () => {
      const { engine, pending } = setup(true);
      const r = run(engine, {
        id: 's3',
        type: 'widget_setState',
        state: { predict: { beatId: 'mid' } },
      });
      await flush(300);
      expect(pending.size).toBe(1);
      learnerContinue(pageFrame());
      await flush();
      expect(r.done).toBe(true);
      expect(pending.size).toBe(0);
    });
  });
});
