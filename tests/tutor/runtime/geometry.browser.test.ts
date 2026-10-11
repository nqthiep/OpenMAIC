/**
 * Visualizer `geometry` in a real sandboxed iframe (task 3B-V1): hand-written frames, frame jumps,
 * highlight kinds (shell kinds + group-0..5), lines clipped to the frame, angles, aria-label, 0 requests,
 * no console errors.
 * The HTML is built from RUNTIME_GEOMETRY directly, so it does not depend on `runtimes.ts` registration.
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
import { RUNTIME_GEOMETRY } from '@/lib/tutor/build/generated/runtime-geometry';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const frames: Frame<unknown>[] = [
  {
    state: {
      bounds: { xmin: 0, xmax: 10, ymin: 0, ymax: 6 },
      points: [
        { id: 'A', x: 1, y: 1 },
        { id: 'B', x: 9, y: 1 },
        { id: 'C', x: 4, y: 5, label: 'averyverylonglabel' },
      ],
      segments: [
        { id: 'AB', from: 'A', to: 'B' },
        { id: 'AC', from: 'A', to: 'C', dashed: true },
        { id: 'XX', from: 'A', to: 'nope' }, // unknown endpoint: skipped
      ],
    },
    meta: { index: 0, explanation: 'tam giác ABC' },
  },
  {
    state: {
      bounds: { xmin: 0, xmax: 10, ymin: 0, ymax: 6 },
      points: [
        { id: 'A', x: 1, y: 1 },
        { id: 'B', x: 9, y: 1 },
        { id: 'C', x: 4, y: 5 },
        { id: 'O', x: 5, y: 3 },
      ],
      segments: [{ id: 'AB', from: 'A', to: 'B' }],
      lines: [
        { id: 'l1', through: ['A', 'C'] },
        { id: 'l2', through: ['A', 'A'] }, // p = q: skipped
      ],
      circles: [
        { id: 'c1', center: 'O', r: 2 },
        { id: 'c2', center: 'O', r: -1 }, // not positive: skipped
      ],
      angles: [
        { id: 'a1', at: 'A', from: 'B', to: 'C', label: 'α' },
        { id: 'a2', at: 'A', from: 'B', to: 'B' }, // collinear: skipped
      ],
    },
    meta: {
      index: 1,
      explanation: 'thêm đường thẳng, đường tròn, góc',
      highlights: {
        AB: 'active',
        C: 'result',
        c1: 'group-3',
        l1: 'compare',
        a1: 'group-0',
        c2: 'bogus',
      },
    },
  },
  {
    state: { bounds: { xmin: 5, xmax: 5, ymin: 0, ymax: 1 }, points: [{ id: 'P', x: 5, y: 5 }] },
    meta: { index: 2, explanation: 'khung suy biến dùng khung mặc định' },
  },
  {
    // ADR 0015: polygons, a sampled curve, an arrow, hidden anchors with a centred label
    state: {
      bounds: { xmin: 0, xmax: 10, ymin: 0, ymax: 6 },
      points: [
        { id: 'a', x: 1, y: 1, hidden: true },
        { id: 'b', x: 5, y: 1, hidden: true },
        { id: 'c', x: 5, y: 5, hidden: true },
        { id: 'd', x: 1, y: 5, hidden: true },
        { id: 'n', x: 3, y: 3, hidden: true, at: 'center', label: '42' },
        { id: 'o', x: 7, y: 1 },
        { id: 'p', x: 9, y: 4 },
      ],
      polygons: [
        { id: 'sq', pts: ['a', 'b', 'c', 'd'] },
        { id: 'bad', pts: ['a', 'b', 'zz'] }, // unknown vertex: skipped
        { id: 'two', pts: ['a', 'b'] }, // not a polygon: skipped
        {
          id: 'inline',
          xy: [
            [6, 3],
            [9, 3],
            [9, 5],
          ],
        }, // its own vertices, no points needed
        {
          id: 'badxy',
          xy: [
            [6, 3],
            [9, 3],
            ['x', 5],
          ],
        }, // a bad vertex: skipped
      ],
      polylines: [
        {
          id: 'f',
          xy: [
            [6, 1],
            [7, 2],
            [8, 2.5],
            [9, 5],
          ],
        },
        { id: 'short', xy: [[1, 1]] }, // one point: skipped
      ],
      segments: [{ id: 'op', from: 'o', to: 'p', arrow: true }],
    },
    meta: { index: 3, explanation: 'đa giác, đường cong, mũi tên', highlights: { sq: 'group-1' } },
  },
];

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'geometry-test',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'math',
  visualizer: 'geometry',
  locale: 'vi-VN',
  presetId: 'p',
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'p', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 2,
};
const data: WalkthroughData = {
  title: 'Geometry',
  locale: 'vi-VN',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: ['x'], py: ['x'] }, map: { cpp: {}, py: {} } },
  labels: {},
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_GEOMETRY,
  shell: renderShell({
    title: data.title,
    labels: data.labels,
    customInput: false,
    lang: 'vi-VN',
    panels: ['pseudo'],
  }),
});

describe.skipIf(!REQUIRED)('geometry visualizer (browser)', () => {
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

  it('draws the first frame: 3 points, 2 segments (one dashed), labels clipped, aria-label', async () => {
    await load();
    await pw(widget.locator('.wtx-pt')).toHaveCount(3);
    await pw(widget.locator('.wtx-seg')).toHaveCount(2); // the segment with an unknown endpoint is skipped
    await pw(widget.locator('.wtx-dashed')).toHaveCount(1);
    await pw(widget.locator('.wtx')).toHaveAttribute('role', 'img');
    await pw(widget.locator('.wtx')).toHaveAttribute(
      'aria-label',
      'points: A (1, 1), B (9, 1), C (4, 5); segments: AB, AC',
    );
    const labels = await widget.locator('.wtx text').allTextContents();
    expect(labels).toEqual(['A', 'B', 'averyvery…']);
  });

  it('frame 3: filled polygons, a curve, an arrow head; hidden anchors draw no dot but keep their centred label', async () => {
    await load();
    await show(3);
    await pw(widget.locator('.wtx-poly')).toHaveCount(2);
    await pw(widget.locator('.wtx-poly').first()).toHaveClass(/wtx-g1/);
    await pw(widget.locator('polyline.wtx-curve')).toHaveCount(1);
    await pw(widget.locator('.wtx-arrowhead')).toHaveCount(1);
    await pw(widget.locator('.wtx-seg')).toHaveCount(1);
    await pw(widget.locator('.wtx-pt')).toHaveCount(2); // only o and p have a dot
    await pw(widget.locator('.wtx text.wtx-center')).toHaveText('42');
    expect(
      await widget.locator('polyline.wtx-curve').evaluate((e) => getComputedStyle(e).fill),
    ).toBe('none');
    await pw(widget.locator('.wtx')).toHaveAttribute(
      'aria-label',
      'points: o (7, 1), p (9, 4); segments: op; polygons: sq (group-1), inline; polylines: f',
    );
  });

  it('frame 1: highlight kinds, lines reach the frame edge, circle radius in world units, one angle', async () => {
    await load();
    await show(1);
    await pw(widget.locator('.wtx-seg').first()).toHaveClass(/wt-hl-active/);
    await pw(widget.locator('.wtx-pt').nth(2)).toHaveClass(/wt-hl-result/);
    await pw(widget.locator('.wtx-circle')).toHaveCount(1);
    await pw(widget.locator('.wtx-circle')).toHaveClass(/wtx-g3/);
    await pw(widget.locator('.wtx-line')).toHaveCount(1); // p = q line skipped
    await pw(widget.locator('.wtx-line')).toHaveClass(/wt-hl-compare/);
    // highlighted lines and circle outlines are not filled (the shell's wt-hl-* sets a fill); points are
    expect(await widget.locator('.wtx-line').evaluate((e) => getComputedStyle(e).fill)).toBe(
      'none',
    );
    expect(
      await widget
        .locator('.wtx-seg')
        .first()
        .evaluate((e) => getComputedStyle(e).fill),
    ).toBe('none');
    expect(
      await widget
        .locator('.wtx-pt')
        .nth(2)
        .evaluate((e) => getComputedStyle(e).fill),
    ).not.toBe('none');
    await pw(widget.locator('.wtx-arc')).toHaveCount(1); // collinear angle skipped
    await pw(widget.locator('.wtx-arc')).toHaveClass(/wtx-g0/);
    await pw(widget.locator('.wtx-angle')).toHaveText('α');
    const geo = await widget.locator('.wtx').evaluate((svg) => {
      const vb = (svg as SVGSVGElement).viewBox.baseVal;
      const line = svg.querySelector('.wtx-line')!;
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => Number(line.getAttribute(k)));
      const c = svg.querySelector('.wtx-circle')!;
      const pts = [...svg.querySelectorAll('.wtx-pt')].map((p) => ({
        x: Number(p.getAttribute('cx')),
        y: Number(p.getAttribute('cy')),
      }));
      return { w: vb.width, h: vb.height, x1, y1, x2, y2, r: Number(c.getAttribute('r')), pts };
    });
    // the line spans the whole frame (ends on the plot box edges, inside the viewBox)
    expect(Math.hypot(geo.x2 - geo.x1, geo.y2 - geo.y1)).toBeGreaterThan(200);
    expect(Math.min(geo.x1, geo.x2)).toBeGreaterThanOrEqual(0);
    expect(Math.max(geo.x1, geo.x2)).toBeLessThanOrEqual(geo.w);
    // r = 2 world units = 2 × (distance A→B on screen) / 8 world units
    const ab = geo.pts[1].x - geo.pts[0].x;
    expect(geo.r).toBeCloseTo((2 * ab) / 8, 0);
    // AB is horizontal in world space, so horizontal on screen; y flips (C above A on screen)
    expect(geo.pts[1].y).toBeCloseTo(geo.pts[0].y, 0);
    expect(geo.pts[2].y).toBeLessThan(geo.pts[0].y);
  });

  it('a degenerate frame uses the default box; going back removes everything again', async () => {
    await load();
    await show(2);
    await pw(widget.locator('.wtx-pt')).toHaveCount(1);
    await show(0);
    await pw(widget.locator('.wtx-circle')).toHaveCount(0);
    await pw(widget.locator('.wtx-line')).toHaveCount(0);
    await pw(widget.locator('.wtx-pt')).toHaveCount(3);
    expect(await widget.locator('.wtx').count()).toBe(1);
  });

  it('never injects data as markup: only textContent', async () => {
    await load();
    await show(1);
    const tags = await widget.locator('#wt-visualizer').evaluate((el) => {
      return [...new Set([...el.querySelectorAll('*')].map((n) => n.tagName.toLowerCase()))].sort();
    });
    expect(tags).toEqual(['style', 'svg', 'g', 'circle', 'line', 'path', 'text'].sort());
  });
});
