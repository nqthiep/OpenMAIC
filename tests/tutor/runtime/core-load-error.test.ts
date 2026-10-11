// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { startWalkthroughRuntime } from '@/lib/tutor/runtime/core';

const FALLBACK = 'Không tải được nội dung bài học.';

/** Boots the runtime on the given JSON blocks and returns what the explanation shows. */
function boot(configJson: string, dataJson: string): string | null {
  document.body.innerHTML = `
    <script type="application/json" id="widget-config">${configJson}</script>
    <script type="application/json" id="walkthrough-data">${dataJson}</script>
    <div id="wt-root"><p id="wt-explanation"></p><div id="wt-visualizer"></div></div>`;
  startWalkthroughRuntime({ type: 't', mount() {}, render() {} });
  return document.getElementById('wt-explanation')!.textContent;
}

describe('runtime core: load error text (jsdom)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('takes the loadError label from the data block when the config is unreadable', () => {
    const data = JSON.stringify({ sets: {}, labels: { loadError: 'Lỗi tải bài.' } });
    expect(boot('not json', data)).toBe('Lỗi tải bài.');
  });

  it('falls back to the Vietnamese text when the data block is unreadable too', () => {
    expect(boot('not json', '{')).toBe(FALLBACK);
  });
});
