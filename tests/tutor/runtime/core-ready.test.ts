// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { startWalkthroughRuntime } from '@/lib/tutor/runtime/core';

describe('runtime core: widget-ready', () => {
  it('announces on boot and again on __maicErrorReplayRequest from the parent', () => {
    document.body.innerHTML = `
      <script type="application/json" id="widget-config">${JSON.stringify({
        walkthroughId: 'w',
        presetId: 'p',
        entryRev: 1,
        panel: 'pseudo',
        presets: [{ id: 'p', label: 'P' }],
      })}</script>
      <script type="application/json" id="walkthrough-data">${JSON.stringify({
        sets: { p: { frames: [{ state: {}, meta: { index: 0 } }], beats: [] } },
      })}</script>
      <div id="wt-root"><p id="wt-explanation"></p><div id="wt-visualizer"></div></div>`;
    const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {}); // parent === window in jsdom
    startWalkthroughRuntime({ type: 't', mount() {}, render() {} });
    const ready = () =>
      post.mock.calls.filter(([m]) => (m as { kind?: string }).kind === 'widget-ready');
    expect(ready()).toHaveLength(1);

    window.dispatchEvent(
      new MessageEvent('message', { data: { __maicErrorReplayRequest: true }, source: window }),
    );
    expect(ready()).toHaveLength(2);
    expect(ready()[1][0]).toMatchObject({ walkthroughId: 'w', presets: [{ id: 'p', total: 1 }] });

    // not from the parent: ignored
    window.dispatchEvent(
      new MessageEvent('message', { data: { __maicErrorReplayRequest: true }, source: null }),
    );
    expect(ready()).toHaveLength(2);
  });
});
