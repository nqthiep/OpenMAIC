// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLearnerContinue } from '@/lib/tutor/protocol/messages';
import { startWalkthroughRuntime } from '@/lib/tutor/runtime/core';

const config = {
  walkthroughId: 'wt-1',
  presetId: 'p',
  entryRev: 1,
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'P' }],
};
const data = {
  sets: {
    p: {
      frames: [0, 1, 2, 3, 4].map((i) => ({ state: {}, meta: { index: i } })),
      beats: [
        { id: 'early', occurrence: 1, frame: 1, answer: 1 },
        { id: 'last', occurrence: 1, frame: 4, answer: 1 },
      ],
    },
  },
  beatText: {
    early: { label: 'E', ask: 'Which?', options: ['x', 'y'] },
    last: { label: 'L', ask: 'Which?', options: ['x', 'y'] },
  },
  labels: { skip: 'Skip', correct: 'Yes', incorrect: 'No' },
};

describe('walkthrough runtime: learner-continue (jsdom)', () => {
  let sent: unknown[];
  let listeners: [string, EventListenerOrEventListenerObject][];

  const continues = () => sent.filter((m) => parseLearnerContinue(m) !== null);
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
    vi.spyOn(window, 'postMessage').mockImplementation(((m: unknown) => {
      sent.push(m);
    }) as typeof window.postMessage);
    document.body.innerHTML = `
      <script type="application/json" id="widget-config">${JSON.stringify(config)}</script>
      <script type="application/json" id="walkthrough-data">${JSON.stringify(data)}</script>
      <div id="wt-root"><p id="wt-explanation"></p><div id="wt-visualizer"></div>
        <div id="wt-beats"></div><div id="wt-predict"></div>
        <button id="wt-play"></button><button id="wt-next"></button>
        <input id="wt-frame-slider" type="range"></div>`;
    startWalkthroughRuntime({ type: 't', mount() {}, render() {} });
  });
  afterEach(() => {
    for (const [t, l] of listeners) window.removeEventListener(t, l);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('Tiếp on the last frame moves nothing, clears the question and reports the move-on', () => {
    send({ frame: 4, predict: { beatId: 'last' } });
    expect(document.querySelectorAll('#wt-predict [data-option]')).toHaveLength(2);
    click('#wt-next');
    expect(root().getAttribute('data-frame-index')).toBe('4');
    expect(document.querySelector('#wt-predict')!.childElementCount).toBe(0);
    expect(continues()).toEqual([
      { __maicInteractive: true, kind: 'learner-continue', v: 1, walkthroughId: 'wt-1' },
    ]);
  });

  it('Tiếp before the last frame moves on and reports the move-on once', () => {
    send({ frame: 1, predict: { beatId: 'early' } });
    click('#wt-next');
    expect(root().getAttribute('data-frame-index')).toBe('2');
    expect(continues()).toHaveLength(1);
  });

  it('Phát starts playback and reports the move-on; a Phát that pauses reports nothing', () => {
    send({ frame: 1, predict: { beatId: 'early' } });
    click('#wt-play');
    expect(root().getAttribute('data-playing')).toBe('true');
    expect(continues()).toHaveLength(1);
    click('#wt-play');
    expect(root().getAttribute('data-playing')).toBe('false');
    expect(continues()).toHaveLength(1);
  });
});
