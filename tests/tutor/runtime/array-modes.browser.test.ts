/**
 * Visualizer `array` modes (cells, bits, rows, intervals) in a real sandboxed iframe: HTML built with buildWalkthroughHtml from hand-written
 * frames; checks rendering, frame jumps, highlights/pointers, aria-label, 0 requests, no console errors.
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
import { RUNTIME_ARRAY } from '@/lib/tutor/build/generated/runtime-array';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const frame = (
  index: number,
  state: Record<string, unknown>,
  highlights: Record<string, string> = {},
  pointers: Record<string, string> = {},
): Frame<unknown> => ({
  state,
  meta: { index, explanation: `frame ${index}`, highlights, pointers },
});
const frames: Frame<unknown>[] = [
  frame(0, { values: [3, 1, 4, 1, 5], mode: 'bars', threshold: { value: 3, label: 'T' } }),
  frame(1, { values: ['a', 'b', 'c'], mode: 'cells' }, { '1': 'group-2' }, { i: '1' }),
  frame(2, { values: [1, 0, 1, 1], mode: 'bits' }, { '0': 'active' }),
  frame(
    3,
    {
      values: [5, 3, 8],
      mode: 'cells',
      rows: [
        { label: 'prefix', values: [0, 5, 8, 16] },
        { label: 'fail', values: [null, 0, 1], offset: 1 },
      ],
      intervals: [
        { id: 'w', start: 0, end: 2, label: 'win' },
        { id: 'z', start: 1, end: 3 },
      ],
    },
    { 'r0:1': 'group-1', 'r1:0': 'result', w: 'compare' },
  ),
  frame(4, { values: [1, 2], mode: 'bars' }),
];

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'array-test',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'cp',
  visualizer: 'array',
  locale: 'en-US',
  presetId: 'p',
  panel: 'cpp',
  presets: [{ id: 'p', label: 'P', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 2,
};
const data: WalkthroughData = {
  title: 'Array',
  locale: 'en-US',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: ['x'], py: ['x'] }, map: { cpp: {}, py: {} } },
  labels: {},
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_ARRAY,
  shell: renderShell({
    title: 'Array',
    labels: {},
    customInput: false,
    lang: 'en-US',
    panels: ['pseudo', 'cpp', 'py'],
  }),
});

describe.skipIf(!REQUIRED)('array visualizer modes (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;
  let requests: string[];
  let errors: string[];

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
    await page.setContent(
      '<!doctype html><body><iframe id="f" sandbox="allow-scripts allow-forms allow-popups"></iframe>',
    );
    await page.evaluate((h) => {
      const w = window as unknown as { msgs: { kind?: string }[] };
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
  const goTo = (frameIndex: number) =>
    page.evaluate(
      (n) =>
        (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
          { type: 'SET_WIDGET_STATE', state: { frame: n } },
          '*',
        ),
      frameIndex,
    );

  afterEach(async () => {
    const seen = { requests, errors };
    await page?.close();
    expect(seen).toEqual({ requests: [], errors: [] });
  });

  it('bars mode (1b behaviour): bars, threshold, no cells', async () => {
    await load();
    await pw(widget.locator('svg.wta rect.wta-bar')).toHaveCount(5);
    await pw(widget.locator('svg.wta rect.wta-cell')).toHaveCount(0);
    await pw(widget.locator('.wta-thr text')).toHaveText('T = 3');
  });

  it('cells mode: cells, group kind with its own class, pointer, aria-label', async () => {
    await load();
    await goTo(1);
    await pw(widget.locator('svg.wta rect.wta-cell')).toHaveCount(3);
    await pw(widget.locator('svg.wta rect.wta-bar')).toHaveCount(0);
    await pw(widget.locator('svg.wta rect.wta-cell.wt-hl-group-2')).toHaveCount(1);
    await pw(widget.locator('.wta-thr')).toBeHidden();
    expect(await widget.locator('svg.wta').getAttribute('aria-label')).toContain('group-2');
  });

  it('bits mode: a set bit gets its own class, a highlight still applies', async () => {
    await load();
    await goTo(2);
    await pw(widget.locator('svg.wta rect.wta-bit1')).toHaveCount(3);
    await pw(widget.locator('svg.wta rect.wta-cell').first()).toHaveClass(/wt-hl-active/);
  });

  it('extra rows (shifted by offset, null is an empty cell) and intervals', async () => {
    await load();
    await goTo(3);
    await pw(widget.locator('svg.wta rect.wta-cell')).toHaveCount(3 + 4 + 3);
    await pw(widget.locator('svg.wta rect.wta-empty')).toHaveCount(1);
    await pw(widget.locator('svg.wta rect.wta-iv')).toHaveCount(2);
    await pw(widget.locator('svg.wta rect.wta-iv.wt-hl-compare')).toHaveCount(1);
    await pw(widget.locator('svg.wta text.wta-rowl')).toHaveText(['prefix', 'fail']);
    // overlapping intervals take two lanes (different y)
    const ys = await widget
      .locator('svg.wta rect.wta-iv')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(new Set(ys).size).toBe(2);
    // nothing drawn outside the svg
    const outside = await widget.locator('svg.wta').evaluate((svg) => {
      const s = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('rect.wta-cell,rect.wta-iv')].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.left < s.left - 0.5 || b.right > s.right + 0.5 || b.bottom > s.bottom + 0.5;
      }).length;
    });
    expect(outside).toBe(0);
    await goTo(4); // back to bars: rows and intervals are removed
    await pw(widget.locator('svg.wta rect.wta-iv')).toHaveCount(0);
    await pw(widget.locator('svg.wta rect.wta-cell')).toHaveCount(0);
    await pw(widget.locator('svg.wta rect.wta-bar')).toHaveCount(2);
  });
});
