/**
 * Walkthrough runtime in a real sandboxed iframe (task 1b-14): handshake, SET_WIDGET_STATE,
 * HIGHLIGHT_ELEMENT, panel tabs, controls, keyboard, no network, no console errors.
 * Predict mode lives in predict.browser.test.ts. Run with `TUTOR_BROWSER=1`; a missing
 * Chromium is then a hard failure.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  chromium,
  expect as pw,
  type Browser,
  type FrameLocator,
  type Page,
} from '@playwright/test';
import type { InteractiveContent } from '@openmaic/dsl';
import type { WalkthroughData } from '@/lib/tutor/protocol/widget-data';
import { walkthroughProvider } from '@/lib/widgets';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const html = (
  walkthroughProvider.build({ id: 'binary-search', presetId: 'mid-hit' }, { locale: 'vi-VN' })
    .content as InteractiveContent
).html as string;
const data = JSON.parse(
  html.match(/<script type="application\/json" id="walkthrough-data">([\s\S]*?)<\/script>/)![1],
) as WalkthroughData;
const config = JSON.parse(
  html.match(/<script type="application\/json" id="widget-config">([\s\S]*?)<\/script>/)![1],
) as {
  walkthroughId: string;
  entryRev: number;
  presets: { id: string; total: number }[];
};
const totalOf = (id: string) => data.sets[id].frames.length;

interface Msg {
  __maicInteractive?: boolean;
  kind?: string;
  v?: number;
  walkthroughId?: string;
  preset?: string;
  frame?: number;
  sentByOther?: boolean;
  [k: string]: unknown;
}

// Second iframe: forwards what the host tells it to the widget frame, so the widget sees a
// message whose `event.source` is a sibling window, not its parent.
const OTHER_SRCDOC = `<script>
addEventListener('message', function (e) {
  parent.frames[0].postMessage(e.data, '*');
  parent.postMessage({ sentByOther: true }, '*');
});
</script>`;

describe.skipIf(!REQUIRED)('walkthrough runtime (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;
  let requests: string[];
  let errors: string[];

  const msgs = () => page.evaluate(() => (window as unknown as { msgs: Msg[] }).msgs);
  const states = async () => (await msgs()).filter((m) => m.kind === 'widget-state');
  const root = () => widget.locator('#wt-root');
  const send = (state: object, extra: object = {}) =>
    page.evaluate(
      ([s, x]) =>
        (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
          { type: 'SET_WIDGET_STATE', state: s, ...(x as object) },
          '*',
        ),
      [state, extra] as const,
    );
  const post = (message: object) =>
    page.evaluate(
      (m) => (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(m, '*'),
      message,
    );
  /** The runtime handles messages in order: once it answers a replay request, earlier ones are done. */
  const flush = async () => {
    const readyCount = async () => (await msgs()).filter((m) => m.kind === 'widget-ready').length;
    const before = await readyCount();
    await post({ __maicErrorReplayRequest: true });
    await vi.waitFor(async () => expect(await readyCount()).toBe(before + 1));
  };

  beforeAll(async () => {
    try {
      browser = await chromium.launch();
    } catch (e) {
      throw new Error(`TUTOR_BROWSER=1 but Chromium is unavailable: ${String(e)}`);
    }
  });
  afterAll(async () => {
    await browser?.close();
  });

  // Fresh page per test; every test also has to end with no outside request and no console error.
  async function load(widgetHtml = html, withOther = false) {
    requests = [];
    errors = [];
    page = await browser.newPage();
    page.on('request', (r) => {
      if (!/^(about|data):/.test(r.url())) requests.push(r.url());
    });
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setContent(
      '<!doctype html><body><iframe id="f" sandbox="allow-scripts allow-forms allow-popups"></iframe>' +
        (withOther ? '<iframe id="o" sandbox="allow-scripts"></iframe>' : ''),
    );
    await page.evaluate(
      ([h, other]) => {
        const w = window as unknown as { msgs: unknown[] };
        w.msgs = [];
        window.addEventListener('message', (e) => w.msgs.push(e.data));
        (document.getElementById('f') as HTMLIFrameElement).srcdoc = h;
        if (other) (document.getElementById('o') as HTMLIFrameElement).srcdoc = other;
      },
      [widgetHtml, withOther ? OTHER_SRCDOC : ''] as const,
    );
    widget = page.frameLocator('#f');
    await page.waitForFunction(() =>
      (window as unknown as { msgs: Msg[] }).msgs.some((m) => m.kind === 'widget-ready'),
    );
  }

  afterEach(async () => {
    const seen = { requests, errors };
    await page?.close();
    expect(seen).toEqual({ requests: [], errors: [] });
  });

  it('announces widget-ready with every preset and total, and boots on the config preset', async () => {
    await load();
    const ready = (await msgs()).filter((m) => m.kind === 'widget-ready');
    expect(ready).toEqual([
      {
        __maicInteractive: true,
        kind: 'widget-ready',
        v: 1,
        walkthroughId: 'binary-search',
        entryRev: config.entryRev,
        presets: config.presets.map((p) => ({ id: p.id, total: p.total })),
      },
    ]);
    expect(config.presets.map((p) => p.total)).toEqual(config.presets.map((p) => totalOf(p.id)));
    await pw(root()).toHaveAttribute('data-preset', 'mid-hit');
    await pw(root()).toHaveAttribute('data-frame-index', '0');
    await pw(root()).toHaveAttribute('data-total-frames', String(totalOf('mid-hit')));
    await pw(widget.locator('#wt-frame-counter')).toHaveText(`1 / ${totalOf('mid-hit')}`);
    expect(await widget.locator('#wt-preset option').count()).toBe(config.presets.length);
    expect(await states()).toHaveLength(0); // booting reports no state
  });

  it('SET_WIDGET_STATE applies preset and frame, then reports one matching widget-state', async () => {
    await load();
    await send({ preset: 'absent', frame: 3 });
    await pw(root()).toHaveAttribute('data-frame-index', '3');
    await pw(root()).toHaveAttribute('data-preset', 'absent');
    await pw(root()).toHaveAttribute('data-total-frames', String(totalOf('absent')));
    await pw(widget.locator('#wt-preset')).toHaveValue('absent');
    await pw(widget.locator('#wt-explanation')).toHaveText(
      String(data.sets.absent.frames[3].meta.explanation),
    );
    await vi.waitFor(async () => expect(await states()).toHaveLength(1));
    expect(await states()).toEqual([
      {
        __maicInteractive: true,
        kind: 'widget-state',
        v: 1,
        walkthroughId: 'binary-search',
        preset: 'absent',
        frame: 3,
      },
    ]);
  });

  it('SET_WIDGET_STATE content goes to the caption', async () => {
    await load();
    await send({ frame: 1 }, { content: 'Nhìn lo và hi' });
    await pw(widget.locator('#wt-caption')).toHaveText('Nhìn lo và hi');
  });

  it('clamps frame to the new preset total, and to 0 below range', async () => {
    await load();
    await send({ frame: 999 });
    await pw(root()).toHaveAttribute('data-frame-index', String(totalOf('mid-hit') - 1));
    await send({ preset: 'first', frame: 999 });
    await pw(root()).toHaveAttribute('data-preset', 'first');
    await pw(root()).toHaveAttribute('data-frame-index', String(totalOf('first') - 1));
    await send({ frame: -5 });
    await pw(root()).toHaveAttribute('data-frame-index', '0');
    await vi.waitFor(async () =>
      expect((await states()).map((m) => [m.preset, m.frame])).toEqual([
        ['mid-hit', totalOf('mid-hit') - 1],
        ['first', totalOf('first') - 1],
        ['first', 0],
      ]),
    );
  });

  it('ignores the whole message for an unknown preset', async () => {
    await load();
    await send({ frame: 2 });
    await pw(root()).toHaveAttribute('data-frame-index', '2');
    await vi.waitFor(async () => expect(await states()).toHaveLength(1));

    await send({ preset: 'does-not-exist', frame: 1, panel: 'py' }, { content: 'nope' });
    await flush();
    await pw(root()).toHaveAttribute('data-preset', 'mid-hit');
    await pw(root()).toHaveAttribute('data-frame-index', '2');
    await pw(widget.locator('#wt-tab-py')).toHaveAttribute('aria-pressed', 'false');
    await pw(widget.locator('#wt-caption')).toHaveText('');
    expect(await states()).toHaveLength(1);
  });

  it('ignores messages from a window that is not the parent', async () => {
    await load(html, true);
    await page.waitForFunction(() => document.getElementById('o') !== null);
    await page.evaluate(() =>
      (document.getElementById('o') as HTMLIFrameElement).contentWindow!.postMessage(
        { type: 'SET_WIDGET_STATE', state: { preset: 'absent', frame: 3 }, content: 'spoof' },
        '*',
      ),
    );
    await vi.waitFor(async () =>
      expect((await msgs()).some((m) => m.sentByOther === true)).toBe(true),
    );
    await flush();
    await pw(root()).toHaveAttribute('data-preset', 'mid-hit');
    await pw(root()).toHaveAttribute('data-frame-index', '0');
    await pw(widget.locator('#wt-caption')).toHaveText('');
    expect(await states()).toHaveLength(0);

    // the same message from the real parent is accepted
    await send({ preset: 'absent', frame: 3 });
    await pw(root()).toHaveAttribute('data-frame-index', '3');
  });

  describe('HIGHLIGHT_ELEMENT', () => {
    it('adds wt-flash for ~1.5 s and sets the caption', async () => {
      await load();
      await post({ type: 'HIGHLIGHT_ELEMENT', target: '#wt-play', content: 'Bấm vào đây' });
      await pw(widget.locator('#wt-play')).toHaveClass(/wt-flash/);
      await pw(widget.locator('#wt-caption')).toHaveText('Bấm vào đây');
      await pw(widget.locator('#wt-play')).not.toHaveClass(/wt-flash/, { timeout: 4000 });
    });

    it('ignores a bad selector, a missing element and an over-long target', async () => {
      await load();
      await post({ type: 'HIGHLIGHT_ELEMENT', target: '###[' });
      await post({ type: 'HIGHLIGHT_ELEMENT', target: '#nope' });
      await post({ type: 'HIGHLIGHT_ELEMENT', target: `#wt-play${' '.repeat(300)}` });
      await flush();
      expect(await widget.locator('.wt-flash').count()).toBe(0);
    });
  });

  describe('code panel tabs', () => {
    const lines = () => widget.locator('#wt-code .wt-code-lines [data-line]');

    it('switches by click and by SET_WIDGET_STATE', async () => {
      await load();
      await pw(widget.locator('#wt-tab-pseudo')).toHaveAttribute('aria-pressed', 'true');
      await pw(lines()).toHaveCount(data.code.pseudo.length);
      expect((await lines().first().textContent())?.trim()).toBe(data.code.pseudo[0].trim());

      await widget.locator('#wt-tab-cpp').click();
      await pw(widget.locator('#wt-tab-cpp')).toHaveAttribute('aria-pressed', 'true');
      await pw(widget.locator('#wt-tab-pseudo')).toHaveAttribute('aria-pressed', 'false');
      await pw(lines()).toHaveCount(data.code.impl!.cpp.length);
      expect((await lines().first().textContent())?.trim()).toBe(data.code.impl!.cpp[0].trim());

      await send({ panel: 'py' });
      await pw(widget.locator('#wt-tab-py')).toHaveAttribute('aria-pressed', 'true');
      await pw(widget.locator('#wt-tab-cpp')).toHaveAttribute('aria-pressed', 'false');
      await pw(lines()).toHaveCount(data.code.impl!.py.length);

      // exactly one tab is pressed
      expect(await widget.locator('#wt-code .wt-tabs [aria-pressed=true]').count()).toBe(1);
    });

    it('marks the code line of the current frame in the pseudo panel', async () => {
      await load();
      await send({ frame: 2 });
      const line = data.sets['mid-hit'].frames[2].meta.codeLine as number;
      await pw(widget.locator(`#wt-code [data-line="${line}"]`)).toHaveClass(/wt-on/);
      await pw(widget.locator('#wt-code .wt-code-lines .wt-on')).toHaveCount(1);
    });

    it('falls back to pseudo when the requested tab is absent', async () => {
      const noCpp = html.replace(/<button id="wt-tab-cpp"[^>]*>[^<]*<\/button>/, '');
      expect(noCpp).not.toBe(html);
      await load(noCpp);
      await pw(widget.locator('#wt-tab-cpp')).toHaveCount(0);
      await widget.locator('#wt-tab-py').click();
      await pw(widget.locator('#wt-tab-py')).toHaveAttribute('aria-pressed', 'true');

      await send({ panel: 'cpp' });
      await pw(widget.locator('#wt-tab-pseudo')).toHaveAttribute('aria-pressed', 'true');
      await pw(widget.locator('#wt-tab-py')).toHaveAttribute('aria-pressed', 'false');
      await pw(lines()).toHaveCount(data.code.pseudo.length);
    });
  });

  describe('controls', () => {
    it('slider jumps to a frame and reports it', async () => {
      await load();
      const slider = widget.locator('#wt-frame-slider');
      await pw(slider).toHaveAttribute('max', String(totalOf('mid-hit') - 1));
      await slider.fill('2');
      await pw(root()).toHaveAttribute('data-frame-index', '2');
      await pw(widget.locator('#wt-frame-counter')).toHaveText(`3 / ${totalOf('mid-hit')}`);
      await pw(slider).toHaveAttribute('aria-valuetext', `3 / ${totalOf('mid-hit')}`);
      await vi.waitFor(async () =>
        expect((await states()).map((m) => [m.preset, m.frame])).toEqual([['mid-hit', 2]]),
      );
    });

    it('beat buttons jump to the beat frame and mark it current', async () => {
      await load();
      const beats = data.sets['mid-hit'].beats;
      const mid = beats.find((b) => b.frame > 0)!;
      const buttons = widget.locator('#wt-beats button[data-beat]');
      await pw(buttons).toHaveCount(beats.length);
      await pw(buttons.first()).toHaveClass(/wt-on/);

      await widget.locator(`#wt-beats button[data-beat="${mid.id}"]`).click();
      await pw(root()).toHaveAttribute('data-frame-index', String(mid.frame));
      await pw(widget.locator(`#wt-beats button[data-beat="${mid.id}"]`)).toHaveClass(/wt-on/);
      await pw(widget.locator('#wt-beats .wt-on')).toHaveCount(1);
    });

    it('preset select switches preset and restarts at frame 0', async () => {
      await load();
      await send({ frame: 2 });
      await pw(root()).toHaveAttribute('data-frame-index', '2');
      await widget.locator('#wt-preset').selectOption('first');
      await pw(root()).toHaveAttribute('data-preset', 'first');
      await pw(root()).toHaveAttribute('data-frame-index', '0');
      await pw(root()).toHaveAttribute('data-total-frames', String(totalOf('first')));
      await pw(widget.locator('#wt-beats button[data-beat]')).toHaveCount(
        data.sets.first.beats.length,
      );
      await vi.waitFor(async () =>
        expect((await states()).map((m) => [m.preset, m.frame])).toEqual([
          ['mid-hit', 2],
          ['first', 0],
        ]),
      );
    });

    it('play advances frames and pauses; play at the end replays from 0', async () => {
      await load();
      const play = widget.locator('#wt-play');
      await pw(play).toHaveText(data.labels.play);
      await widget.locator('#wt-speed').fill('2');

      await play.click();
      await pw(root()).toHaveAttribute('data-playing', 'true');
      await pw(play).toHaveText(data.labels.pause);
      await pw(root()).not.toHaveAttribute('data-frame-index', '0', { timeout: 3000 });
      await play.click();
      await pw(root()).toHaveAttribute('data-playing', 'false');
      await pw(play).toHaveText(data.labels.play);
      const stopped = await root().getAttribute('data-frame-index');
      await page.waitForTimeout(900); // longer than one tick at speed 2
      await pw(root()).toHaveAttribute('data-frame-index', stopped!);

      // run to the end: playing stops on the last frame
      await play.click();
      await pw(root()).toHaveAttribute('data-frame-index', String(totalOf('mid-hit') - 1), {
        timeout: 5000,
      });
      await pw(root()).toHaveAttribute('data-playing', 'false');
      await play.click(); // at the end the toggle restarts from 0
      await pw(root()).toHaveAttribute('data-playing', 'true');
      await play.click();
    });

    it('prev, next and reset step and clamp, reporting each move', async () => {
      await load();
      await widget.locator('#wt-prev').click(); // clamped at 0: no move, no report
      await pw(root()).toHaveAttribute('data-frame-index', '0');
      await widget.locator('#wt-next').click();
      await widget.locator('#wt-next').click();
      await pw(root()).toHaveAttribute('data-frame-index', '2');
      await widget.locator('#wt-reset').click();
      await pw(root()).toHaveAttribute('data-frame-index', '0');
      await vi.waitFor(async () => expect((await states()).map((m) => m.frame)).toEqual([1, 2, 0]));
    });
  });

  describe('keyboard', () => {
    it('tab order reaches prev, play, next in turn', async () => {
      await load();
      await widget.locator('#wt-prev').focus();
      await pw(widget.locator('#wt-prev')).toBeFocused();
      await page.keyboard.press('Tab');
      await pw(widget.locator('#wt-play')).toBeFocused();
      await page.keyboard.press('Tab');
      await pw(widget.locator('#wt-next')).toBeFocused();
    });

    it('next and prev work with Enter and Space', async () => {
      await load();
      await widget.locator('#wt-next').focus();
      await page.keyboard.press('Enter');
      await pw(root()).toHaveAttribute('data-frame-index', '1');
      await page.keyboard.press('Space');
      await pw(root()).toHaveAttribute('data-frame-index', '2');
      await widget.locator('#wt-prev').focus();
      await page.keyboard.press('Enter');
      await pw(root()).toHaveAttribute('data-frame-index', '1');
      await page.keyboard.press('Space');
      await pw(root()).toHaveAttribute('data-frame-index', '0');
    });

    it('play toggles with Space and Enter', async () => {
      await load();
      await widget.locator('#wt-play').focus();
      await page.keyboard.press('Space');
      await pw(root()).toHaveAttribute('data-playing', 'true');
      await page.keyboard.press('Enter');
      await pw(root()).toHaveAttribute('data-playing', 'false');
      await pw(widget.locator('#wt-play')).toHaveText(data.labels.play);
    });
  });
});
