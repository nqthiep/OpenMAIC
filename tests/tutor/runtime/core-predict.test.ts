// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWalkthroughRuntime } from '@/lib/tutor/runtime/core';

type Sent = { kind?: string; frame?: number; preset?: string; prediction?: object };

const config = {
  walkthroughId: 'w',
  presetId: 'p',
  entryRev: 1,
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'P' }],
};
const data = {
  sets: {
    p: {
      frames: [0, 1, 2, 3, 4].map((i) => ({ state: {}, meta: { index: i } })),
      beats: [{ id: 'b', occurrence: 1, frame: 1, answer: 1 }],
    },
  },
  beatText: { b: { label: 'B', ask: 'Which?', options: ['x', 'y'] } },
  labels: { skip: 'Skip', correct: 'Yes', incorrect: 'No' },
};

describe('runtime core: state reports and predict (jsdom)', () => {
  let sent: Sent[];
  let listeners: [string, EventListenerOrEventListenerObject][];

  const states = () => sent.filter((m) => m.kind === 'widget-state');
  const send = (state: object) =>
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'SET_WIDGET_STATE', state }, source: window }),
    );
  const root = () => document.getElementById('wt-root')!;
  const click = (sel: string) => document.querySelector<HTMLElement>(sel)!.click();

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    listeners = [];
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation(((t: string, l: never, o?: never) => {
      listeners.push([t, l]);
      add(t, l, o);
    }) as typeof window.addEventListener);
    vi.spyOn(window, 'postMessage').mockImplementation(((m: Sent) => {
      sent.push(m);
    }) as typeof window.postMessage);
    document.body.innerHTML = `
      <script type="application/json" id="widget-config">${JSON.stringify(config)}</script>
      <script type="application/json" id="walkthrough-data">${JSON.stringify(data)}</script>
      <div id="wt-root"><p id="wt-explanation"></p><div id="wt-visualizer"></div>
        <div id="wt-beats"></div><div id="wt-predict"></div>
        <button id="wt-play"></button><button id="wt-next"></button></div>`;
    startWalkthroughRuntime({ type: 't', mount() {}, render() {} });
  });
  afterEach(() => {
    for (const [t, l] of listeners) window.removeEventListener(t, l);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reports the current state right after widget-ready, and again when a message does not move the frame', () => {
    expect(sent.map((m) => m.kind)).toEqual(['widget-ready', 'widget-state']);
    expect(states()[0]).toMatchObject({ preset: 'p', frame: 0 });
    send({ frame: 0 }); // already there
    expect(states()).toHaveLength(2);
    send({ speed: 2 }); // no frame at all
    expect(states()).toHaveLength(3);
    expect(states()[2]).toMatchObject({ preset: 'p', frame: 0 });
  });

  it('predict for a beat that cannot be asked posts one skipped prediction at once', () => {
    send({ predict: { beatId: 'nope' } });
    const withPrediction = states().filter((m) => m.prediction);
    expect(withPrediction).toEqual([
      expect.objectContaining({ prediction: { beatId: 'nope', correct: false, skipped: true } }),
    ]);
    expect(states()).toHaveLength(2); // boot + that one: no extra plain state
  });

  it('predict together with an unknown preset (message dropped) still posts skipped', () => {
    send({ preset: 'zzz', frame: 1, predict: { beatId: 'b' } });
    expect(states().filter((m) => m.prediction)).toEqual([
      expect.objectContaining({ prediction: { beatId: 'b', correct: false, skipped: true } }),
    ]);
    expect(root().getAttribute('data-preset')).toBe('p');
  });

  it('predict + playing:true keeps the question open, then resumes after the answer', () => {
    send({ frame: 1, playing: true, predict: { beatId: 'b' } });
    expect(document.querySelectorAll('#wt-predict [data-option]')).toHaveLength(2);
    expect(root().getAttribute('data-playing')).toBe('false');
    vi.advanceTimersByTime(10_000);
    expect(root().getAttribute('data-frame-index')).toBe('1');
    expect(document.querySelectorAll('#wt-predict [data-option]')).toHaveLength(2);
    expect(states().filter((m) => m.prediction)).toHaveLength(0);

    click('#wt-predict [data-option="1"]');
    expect(states().filter((m) => m.prediction)).toEqual([
      expect.objectContaining({ frame: 1, prediction: { beatId: 'b', correct: true } }),
    ]);
    expect(root().getAttribute('data-playing')).toBe('true');
    vi.advanceTimersByTime(1300);
    expect(root().getAttribute('data-frame-index')).toBe('2');
    expect(document.querySelector('#wt-predict')!.childElementCount).toBe(0); // result cleared on move
    expect(states().filter((m) => m.prediction)).toHaveLength(1); // moving on never re-sends
  });

  it('skip posts skipped once, keeps a result paragraph and resumes playing', () => {
    send({ frame: 1, playing: true, predict: { beatId: 'b' } });
    click('#wt-predict [data-predict-skip]');
    expect(states().filter((m) => m.prediction)).toHaveLength(1);
    expect(document.querySelector('#wt-predict [role=status]')!.textContent).toBe('Skip');
    expect(document.querySelectorAll('#wt-predict button')).toHaveLength(0);
    expect(root().getAttribute('data-playing')).toBe('true');
  });

  it('a question cleared by moving on before an answer posts skipped with the new frame', () => {
    send({ frame: 1, playing: false, predict: { beatId: 'b' } });
    click('#wt-next');
    expect(root().getAttribute('data-frame-index')).toBe('2');
    expect(document.querySelector('#wt-predict')!.childElementCount).toBe(0);
    expect(states().filter((m) => m.prediction)).toEqual([
      expect.objectContaining({
        frame: 2,
        prediction: { beatId: 'b', correct: false, skipped: true },
      }),
    ]);
  });
});
