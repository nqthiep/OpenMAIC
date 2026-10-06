/**
 * Visualizer `graph` in a real sandboxed iframe (card 2-V3): HTML built with `buildWalkthroughHtml`
 * and hand-written frames (no catalog entry needed). Checks frame jumps, node/edge DOM, highlight
 * kinds (shell kinds and group-N), aria-label, arrowheads, wt-flash, 0 requests, no console error.
 * Run with `TUTOR_BROWSER=1`; a missing Chromium is then a hard failure.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chromium,
  expect as pw,
  type Browser,
  type FrameLocator,
  type Page,
} from '@playwright/test';
import { buildWalkthroughHtml } from '@/lib/tutor/build/build-html';
import { RUNTIME_GRAPH } from '@/lib/tutor/build/generated/runtime-graph';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const nodes = [{ id: 'A', label: 'A (d=0)' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
const edges = [
  { from: 'A', to: 'B', weight: 3, directed: true },
  { from: 'B', to: 'A', weight: 4, directed: true },
  { from: 'B', to: 'C', weight: 5, label: '3/5' },
  { from: 'D', to: 'D', directed: true },
];
const frames: Frame<unknown>[] = [
  { state: { nodes, edges }, meta: { index: 0, explanation: 'Đồ thị ban đầu' } },
  {
    state: { nodes, edges },
    meta: {
      index: 1,
      explanation: 'Tô sáng',
      highlights: {
        A: 'active',
        B: 'group-3',
        'A-B': 'result',
        'C-B': 'compare', // cạnh vô hướng: khớp cả chiều ngược
        'B-A': 'bogus', // kind lạ bị bỏ
      },
    },
  },
  {
    // có toạ độ, bớt node và cạnh
    state: {
      nodes: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 10, y: 5 },
      ],
      edges: [{ from: 'A', to: 'B' }],
    },
    meta: { index: 2, explanation: 'Có toạ độ', highlights: { B: 'group-0' } },
  },
];

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'graph-fixture',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'cp',
  visualizer: 'graph',
  locale: 'vi-VN',
  presetId: 'p',
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'p', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 1,
};
const data: WalkthroughData = {
  title: 'Graph',
  locale: 'vi-VN',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: [], py: [] }, map: { cpp: {}, py: {} } },
  labels: {},
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_GRAPH,
  shell: renderShell({
    title: 'Graph',
    labels: {},
    customInput: false,
    lang: 'vi-VN',
    panels: ['pseudo'],
  }),
});

describe.skipIf(!REQUIRED)('graph visualizer (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;
  let requests: string[];
  let errors: string[];

  const post = (message: object) =>
    page.evaluate(
      (m) => (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(m, '*'),
      message,
    );
  const goTo = async (frame: number) => {
    await post({ type: 'SET_WIDGET_STATE', state: { frame } });
    await pw(widget.locator('#wt-root')).toHaveAttribute('data-frame-index', String(frame));
  };
  const shape = (id: string) => widget.locator(`.wtg-node[data-id="${id}"] ellipse`);

  beforeAll(async () => {
    try {
      browser = await chromium.launch();
    } catch (e) {
      throw new Error(`TUTOR_BROWSER=1 but Chromium is unavailable: ${String(e)}`);
    }
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
      (document.getElementById('f') as HTMLIFrameElement).srcdoc = h;
    }, html);
    widget = page.frameLocator('#f');
    await pw(widget.locator('.wtg')).toBeVisible();
  });
  afterAll(async () => {
    await page?.close();
    await browser?.close();
    expect({ requests, errors }).toEqual({ requests: [], errors: [] });
  });

  it('draws nodes with their label, edges with weight/label text, arrowheads only on directed edges', async () => {
    await goTo(0);
    await pw(widget.locator('.wtg-node')).toHaveCount(4);
    await pw(widget.locator('.wtg-node[data-id="A"] text')).toHaveText('A (d=0)');
    await pw(widget.locator('.wtg-edge')).toHaveCount(4);
    await pw(widget.locator('.wtg-elabel')).toHaveText(['3', '4', '5 3/5', '']);
    const shown = await widget
      .locator('.wtg-head')
      .evaluateAll((els) => els.map((e) => e.getAttribute('display') !== 'none'));
    expect(shown).toEqual([true, true, false, true]);
    const label = await widget.locator('svg.wtg').getAttribute('aria-label');
    expect(label).toBe('A (d=0), B, C, D; A (d=0)→B 3, B→A (d=0) 4, B–C 5 3/5, D→D');
  });

  it('keeps every node inside the viewBox and gives antiparallel edges different paths', async () => {
    const inside = await widget.locator('.wtg-node').evaluateAll((els) => {
      const svg = (els[0] as SVGGElement).ownerSVGElement!;
      const s = svg.getBoundingClientRect();
      return els.every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= s.left && r.right <= s.right && r.top >= s.top && r.bottom <= s.bottom;
      });
    });
    expect(inside).toBe(true);
    const d = await widget
      .locator('.wtg-line')
      .evaluateAll((els) => els.map((e) => e.getAttribute('d')));
    expect(d[0]).not.toBe(d[1]);
  });

  it('applies highlight kinds to nodes and edges with distinct, visible strokes', async () => {
    await goTo(1);
    await pw(shape('A')).toHaveClass(/wt-hl-active/);
    await pw(shape('B')).toHaveClass(/wt-hl-group-3/);
    await pw(shape('C')).not.toHaveClass(/wt-hl-/);
    const lines = widget.locator('.wtg-line');
    await pw(lines.nth(0)).toHaveClass(/wt-hl-result/); // "A-B", đúng chiều
    await pw(lines.nth(1)).not.toHaveClass(/wt-hl-/); // "B-A" kind lạ
    await pw(lines.nth(2)).toHaveClass(/wt-hl-compare/); // "C-B" khớp cạnh vô hướng B–C
    await pw(widget.locator('.wtg-head').nth(0)).toHaveClass(/wt-hl-result/);
    const look = (loc: ReturnType<typeof shape>) =>
      loc.evaluate((el) => {
        const c = getComputedStyle(el);
        return `${c.stroke}|${c.strokeWidth}|${c.strokeDasharray}`;
      });
    const [active, group, plain] = [
      await look(shape('A')),
      await look(shape('B')),
      await look(shape('C')),
    ];
    expect(new Set([active, group, plain]).size).toBe(3);
    // group-3 has its own dash pattern (not colour alone)
    expect(group.split('|')[2]).not.toBe('none');
    // the path itself stays unfilled even though the kind class sets a fill
    await pw(lines.nth(0)).toHaveCSS('fill', 'none');
    await pw(lines.nth(0)).toHaveCSS('stroke-width', '5px');
    const label = await widget.locator('svg.wtg').getAttribute('aria-label');
    expect(label).toBe(
      'A (d=0) (active), B (group-3), C, D; A (d=0)→B 3 (result), B→A (d=0) 4, B–C 5 3/5 (compare), D→D',
    );
  });

  it('removes nodes/edges that left the state and uses given coordinates', async () => {
    await goTo(2);
    await pw(widget.locator('.wtg-node')).toHaveCount(2);
    await pw(widget.locator('.wtg-edge')).toHaveCount(1);
    await pw(shape('B')).toHaveClass(/wt-hl-group-0/);
    const [a, b] = await Promise.all(
      ['A', 'B'].map((id) =>
        widget.locator(`.wtg-node[data-id="${id}"]`).evaluate((el) => el.getAttribute('transform')),
      ),
    );
    // A at the top-left, B right/below (data: 0,0 and 10,5)
    const xy = (t: string | null) =>
      t!
        .match(/translate\(([\d.-]+) ([\d.-]+)\)/)!
        .slice(1)
        .map(Number);
    expect(xy(b)[0]).toBeGreaterThan(xy(a)[0]);
    expect(xy(b)[1]).toBeGreaterThan(xy(a)[1]);
    await goTo(0); // and back: nodes are recreated
    await pw(widget.locator('.wtg-node')).toHaveCount(4);
  });

  it('wt-flash is visible on a node shape found by data-id', async () => {
    await post({ type: 'HIGHLIGHT_ELEMENT', target: '.wtg-node[data-id="C"] ellipse' });
    await pw(shape('C')).toHaveClass(/wt-flash/);
    await pw(shape('C')).toHaveCSS('stroke-width', '3px');
  });
});
