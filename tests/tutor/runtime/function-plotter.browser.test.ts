/**
 * Visualizer `functionPlotter` in a real sandboxed iframe (task 3B-V2): hand-written frames, frame jumps,
 * highlight kinds, curves clipped at the frame edge and broken at undefined points, marks, vertical lines,
 * tick labels, aria-label, 0 requests, no console errors.
 * The HTML is built from RUNTIME_FUNCTION_PLOTTER directly, so it does not depend on `runtimes.ts` registration.
 * Run with `TUTOR_BROWSER=1`; a missing Chromium is then a hard failure.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  chromium,
  expect as pw,
  type Browser,
  type FrameLocator,
  type Page,
} from '@playwright/test';
import { buildWalkthroughHtml } from '@/lib/tutor/build/build-html';
import { RUNTIME_FUNCTION_PLOTTER } from '@/lib/tutor/build/generated/runtime-function-plotter';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const parabola = Array.from({ length: 41 }, (_, i) => [i / 4 - 5, (i / 4 - 5) ** 2]);

const frames: Frame<unknown>[] = [
  {
    state: {
      bounds: { xmin: -5, xmax: 5, ymin: -2, ymax: 10 },
      curves: [{ id: 'f', points: parabola }],
      marks: [{ id: 'min', x: 0, y: 0, label: 'cực tiểu' }],
    },
    meta: { index: 0, explanation: 'y = x² trong khung [-5,5]×[-2,10]' },
  },
  {
    state: {
      bounds: { xmin: -5, xmax: 5, ymin: -2, ymax: 10 },
      curves: [
        { id: 'f', points: parabola },
        // 1/x style: undefined at 0, then a jump: two separate branches
        {
          id: 'g',
          points: [
            [-4, -0.25],
            [-1, -1],
            [-0.5, -2],
            [0, NaN],
            [0.5, 2],
            [1, 1],
            [4, 0.25],
          ],
        },
      ],
      marks: [
        { id: 'min', x: 0, y: 0, label: 'averyverylonglabel' },
        { id: 'out', x: 9, y: 9, label: 'ngoài' }, // outside the frame: not drawn
      ],
      vlines: [
        { id: 'asym', x: 0, label: 'x = 0' },
        { id: 'far', x: 50 }, // outside the frame: not drawn
      ],
    },
    meta: {
      index: 1,
      explanation: 'hai đường, một điểm đánh dấu, một tiệm cận đứng',
      highlights: { f: 'group-2', g: 'compare', min: 'result', asym: 'active', zzz: 'bogus' },
    },
  },
  {
    state: {
      bounds: { xmin: 3, xmax: 3, ymin: 0, ymax: 1 },
      curves: [
        {
          id: 'h',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    },
    meta: { index: 2, explanation: 'khung suy biến dùng khung mặc định' },
  },
];

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'plotter-test',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'math',
  visualizer: 'functionPlotter',
  locale: 'vi-VN',
  presetId: 'p',
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'p', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 1,
};
const data: WalkthroughData = {
  title: 'Plotter',
  locale: 'vi-VN',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: ['x'], py: ['x'] }, map: { cpp: {}, py: {} } },
  labels: {},
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_FUNCTION_PLOTTER,
  shell: renderShell({
    title: data.title,
    labels: data.labels,
    customInput: false,
    lang: 'vi-VN',
    panels: ['pseudo'],
  }),
});

describe.skipIf(!REQUIRED)('functionPlotter visualizer (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;
  let requests: string[];
  let errors: string[];

  const show = async (frame: number) => {
    await page.evaluate(
      (f) =>
        (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
          { type: 'SET_WIDGET_STATE', state: { frame: f, playing: false } },
          '*',
        ),
      frame,
    );
    await pw(widget.locator('#wt-root')).toHaveAttribute('data-frame-index', String(frame));
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

  async function load() {
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
    await page.setContent('<!doctype html><body><iframe id="f" sandbox="allow-scripts"></iframe>');
    await page.evaluate((h) => {
      const w = window as unknown as { msgs: unknown[] };
      w.msgs = [];
      window.addEventListener('message', (e) => w.msgs.push(e.data));
      (document.getElementById('f') as HTMLIFrameElement).srcdoc = h;
    }, html);
    widget = page.frameLocator('#f');
    await page.waitForFunction(() =>
      (window as unknown as { msgs: { kind?: string }[] }).msgs.some(
        (m) => m.kind === 'widget-ready',
      ),
    );
  }

  afterEach(async () => {
    const seen = { requests, errors };
    await page?.close();
    expect(seen).toEqual({ requests: [], errors: [] });
  });

  it('draws the first frame: one curve, one mark, tick labels, the axes cross at zero, aria-label', async () => {
    await load();
    await pw(widget.locator('.wtp-curve')).toHaveCount(1); // the parabola is one polyline (it is inside the frame x-wise)
    await pw(widget.locator('.wtp-mark')).toHaveCount(1);
    await pw(widget.locator('.wtp-axis')).toHaveCount(2);
    await pw(widget.locator('.wtp')).toHaveAttribute('role', 'img');
    await pw(widget.locator('.wtp')).toHaveAttribute(
      'aria-label',
      'curves: f (41 points); marks: min (0, 0)',
    );
    const ticks = await widget.locator('.wtp-tick').allTextContents();
    expect(ticks).toContain('-4');
    expect(ticks).toContain('0');
    expect(ticks.some((t) => /\d\.\d{3,}/.test(t))).toBe(false); // no floating-point noise
    const geo = await widget.locator('.wtp').evaluate((svg) => {
      const curve = svg.querySelector('.wtp-curve')!;
      const ys = (curve.getAttribute('points') ?? '')
        .split(' ')
        .map((p) => Number(p.split(',')[1]));
      const axes = [...svg.querySelectorAll('.wtp-axis')].map((a) => ({
        x1: Number(a.getAttribute('x1')),
        x2: Number(a.getAttribute('x2')),
        y1: Number(a.getAttribute('y1')),
        y2: Number(a.getAttribute('y2')),
      }));
      return { top: Math.min(...ys), axes };
    });
    // the parabola reaches y = 10 only at the top edge of the plot box: clipped there, never above it
    expect(geo.top).toBeGreaterThanOrEqual(14 - 0.01);
    // x-axis is horizontal, y-axis vertical
    expect(geo.axes[0].y1).toBe(geo.axes[0].y2);
    expect(geo.axes[1].x1).toBe(geo.axes[1].x2);
  });

  it('frame 1: kinds, a curve split in two at the undefined point, out-of-frame marks and lines skipped', async () => {
    await load();
    await show(1);
    // f is one polyline, g is two (it breaks at the NaN point)
    await pw(widget.locator('.wtp-curve')).toHaveCount(3);
    await pw(widget.locator('.wtp-curve').first()).toHaveClass(/wtp-g2/);
    await pw(widget.locator('.wtp-curve').nth(1)).toHaveClass(/wt-hl-compare/);
    await pw(widget.locator('.wtp-curve').nth(2)).toHaveClass(/wt-hl-compare/);
    await pw(widget.locator('.wtp-mark')).toHaveCount(1); // 'out' is outside the frame
    await pw(widget.locator('.wtp-mark')).toHaveClass(/wt-hl-result/);
    await pw(widget.locator('.wtp-vline')).toHaveCount(1); // 'far' is outside the frame
    await pw(widget.locator('.wtp-vline')).toHaveClass(/wt-hl-active/);
    const texts = await widget.locator('.wtp text:not(.wtp-tick)').allTextContents();
    expect(texts).toEqual(['x = 0', 'averyve…']);
    await pw(widget.locator('.wtp')).toHaveAttribute(
      'aria-label',
      'curves: f (group-2) (41 points), g (compare) (7 points); marks: min (result) (0, 0); vertical lines: asym (active) (x = 0)',
    );
    // the two curves use different stroke patterns, not colour alone
    const dashes = await widget
      .locator('.wtp-curve')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).strokeDasharray));
    expect(new Set(dashes).size).toBeGreaterThanOrEqual(2);
  });

  it('a degenerate frame uses the default box; going back redraws the first frame', async () => {
    await load();
    await show(2);
    await pw(widget.locator('.wtp-curve')).toHaveCount(1);
    await show(0);
    await pw(widget.locator('.wtp-vline')).toHaveCount(0);
    await pw(widget.locator('.wtp-mark')).toHaveCount(1);
    expect(await widget.locator('.wtp').count()).toBe(1);
  });

  it('never injects data as markup: only textContent', async () => {
    await load();
    await show(1);
    const tags = await widget.locator('#wt-visualizer').evaluate((el) => {
      return [...new Set([...el.querySelectorAll('*')].map((n) => n.tagName.toLowerCase()))].sort();
    });
    expect(tags).toEqual(['style', 'svg', 'g', 'line', 'polyline', 'circle', 'text'].sort());
  });
});
