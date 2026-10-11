/**
 * Visualizer `grid` in a real sandboxed iframe (task 2-V4): hand-written frames, frame jumps,
 * highlight kinds (shell kinds + group-0..5), dependency arrows, aria-label, 0 requests, no console errors.
 * The HTML is built from RUNTIME_GRID directly, so it does not depend on `runtimes.ts` registration.
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
import { RUNTIME_GRID } from '@/lib/tutor/build/generated/runtime-grid';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const big = Array.from({ length: 16 }, (_, r) =>
  Array.from({ length: 13 }, (_, c) => (r === c ? r * 100 : r > c ? null : 'x'.repeat(10))),
);

const frames: Frame<unknown>[] = [
  {
    state: {
      rows: 3,
      cols: 4,
      cells: [
        [0, 0, 0, 0],
        [0, 1, 1, 1],
        [0, 1, 2, null],
      ],
      rowLabels: ['', 'a', 'b'],
      colLabels: ['', 'x', 'y', 'averyveryverylongcolumnlabel'],
    },
    meta: { index: 0, explanation: 'bảng LCS rỗng' },
  },
  {
    state: {
      rows: 3,
      cols: 4,
      cells: [
        [0, 0, 0, 0],
        [0, 1, 1, 1],
        [0, 1, 2, 7],
      ],
      rowLabels: ['', 'a', 'b'],
      colLabels: ['', 'x', 'y', 'z'],
      arrows: [
        { from: '1,1', to: '2,2' },
        { from: '2,2', to: '2,3' },
        { from: '9,9', to: '0,0' }, // ngoài lưới: bỏ qua
      ],
    },
    meta: {
      index: 1,
      explanation: 'điền ô (2,3)',
      highlights: {
        '2,3': 'active',
        '1,1': 'group-2',
        '0,0': 'visited',
        '2,2': 'group-5',
        '1,2': 'bogus',
      },
    },
  },
  { state: { rows: 16, cols: 13, cells: big }, meta: { index: 2, explanation: '16×13' } },
  { state: { rows: 1, cols: 1, cells: [[42]] }, meta: { index: 3, explanation: '1×1' } },
];

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'grid-test',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'cp',
  visualizer: 'grid',
  locale: 'vi-VN',
  presetId: 'p',
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'p', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 2,
};
const data: WalkthroughData = {
  title: 'Grid',
  locale: 'vi-VN',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: ['x'], py: ['x'] }, map: { cpp: {}, py: {} } },
  labels: {},
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_GRID,
  shell: renderShell({
    title: data.title,
    labels: data.labels,
    customInput: false,
    lang: 'vi-VN',
    panels: ['pseudo'],
  }),
});

describe.skipIf(!REQUIRED)('grid visualizer (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;
  let requests: string[];
  let errors: string[];

  const goTo = (frame: number) =>
    page.evaluate(
      (f) =>
        (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
          { type: 'SET_WIDGET_STATE', state: { frame: f, playing: false } },
          '*',
        ),
      frame,
    );
  const show = async (frame: number) => {
    await goTo(frame);
    await pw(widget.locator('#wt-root')).toHaveAttribute('data-frame-index', String(frame));
  };
  const cell = (r: number, c: number) => widget.locator('.wtg-cell').nth(r * cellCols + c);
  let cellCols = 4;

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
    cellCols = 4;
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

  it('draws the first frame: 12 cells, labels clipped, no arrows, aria-label reads the table', async () => {
    await load();
    await pw(widget.locator('.wtg-cell')).toHaveCount(12);
    await pw(widget.locator('.wtg-arrow')).toHaveCount(0);
    await pw(widget.locator('.wtg')).toHaveAttribute('role', 'img');
    await pw(widget.locator('.wtg')).toHaveAttribute(
      'aria-label',
      '0: 0, 0, 0, 0; a: 0, 1, 1, 1; b: 0, 1, 2, -',
    );
    const rowLabels = await widget.locator('.wtg-rowlab').allTextContents();
    expect(rowLabels).toEqual(['', 'a', 'b']); // an empty label is an empty text node
    const colLabels = await widget.locator('.wtg-lab:not(.wtg-rowlab)').allTextContents();
    expect(colLabels.at(-1)!.length).toBeLessThanOrEqual(8);
    expect(colLabels.at(-1)).toMatch(/…$/);
    await pw(cell(2, 2)).toBeVisible();
    expect(await widget.locator('.wtg text:not(.wtg-lab)').allTextContents()).toContain('2');
  });

  it('jumps to a frame: highlight kinds, groups with their own stroke, arrows with a head, aria-label', async () => {
    await load();
    await show(1);
    await pw(cell(2, 3)).toHaveClass(/wt-hl-active/);
    await pw(cell(0, 0)).toHaveClass(/wt-hl-visited/);
    await pw(cell(1, 1)).toHaveClass(/wtg-g2/);
    await pw(cell(2, 2)).toHaveClass(/wtg-g5/);
    await pw(cell(1, 2)).toHaveAttribute('class', 'wtg-cell'); // unknown kind: plain cell
    await pw(widget.locator('.wtg-arrow')).toHaveCount(2);
    await pw(widget.locator('.wtg')).toHaveAttribute(
      'aria-label',
      /^0: 0 \(visited\), 0, 0, 0; a: 0, 1 \(group-2\), 1, 1; b: 0, 1, 2 \(group-5\), 7 \(active\); arrows: 1,1→2,2, 2,2→2,3$/,
    );
    // group strokes differ from each other (not colour alone: dash and width too)
    const look = (r: number, c: number) =>
      cell(r, c).evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.stroke, s.strokeWidth, s.strokeDasharray].join('|');
      });
    const [g2, g5, act] = [await look(1, 1), await look(2, 2), await look(2, 3)];
    expect(new Set([g2, g5, act]).size).toBe(3);
    // arrow head marker resolves inside the iframe
    expect(await widget.locator('#wtg-head').count()).toBe(1);
    await pw(widget.locator('#wt-explanation')).toHaveText('điền ô (2,3)');
    // back to frame 0: highlights and arrows are removed again
    await show(0);
    await pw(widget.locator('.wtg-arrow')).toHaveCount(0);
    await pw(cell(2, 3)).toHaveAttribute('class', 'wtg-cell');
  });

  it('16×13 table (dp-bitmask size) fits inside the viewBox; 1×1 and back reuse the SVG', async () => {
    await load();
    await show(2);
    cellCols = 13;
    await pw(widget.locator('.wtg-cell')).toHaveCount(16 * 13);
    const fit = await widget.locator('.wtg').evaluate((svg) => {
      const vb = (svg as SVGSVGElement).viewBox.baseVal;
      const box = (svg as SVGSVGElement).getBBox();
      return { w: vb.width, h: vb.height, right: box.x + box.width, bottom: box.y + box.height };
    });
    expect(fit.right).toBeLessThanOrEqual(fit.w + 1);
    expect(fit.bottom).toBeLessThanOrEqual(fit.h + 1);
    await show(3);
    cellCols = 1;
    await pw(widget.locator('.wtg-cell')).toHaveCount(1);
    expect(await widget.locator('.wtg').count()).toBe(1);
    await pw(widget.locator('.wtg text').first()).toHaveText('42');
  });

  it('never injects data as markup: only textContent', async () => {
    await load();
    const tags = await widget.locator('#wt-visualizer').evaluate((el) => {
      return [...new Set([...el.querySelectorAll('*')].map((n) => n.tagName.toLowerCase()))].sort();
    });
    expect(tags).toEqual(['style', 'svg', 'defs', 'marker', 'path', 'g', 'rect', 'text'].sort());
  });
});
