/**
 * Visualizer `tree` in a real sandboxed iframe: HTML built with buildWalkthroughHtml from hand-written
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
import { RUNTIME_TREE } from '@/lib/tutor/build/generated/runtime-tree';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const NODES = [
  { id: 'r', label: 'root' },
  { id: 'a', label: 'A', parent: 'r', edgeLabel: 'a', note: 'fail→r' },
  { id: 'b', label: 'B', parent: 'r', edgeLabel: 'b' },
  { id: 'c', label: 'C', parent: 'a' },
  { id: 'x', label: 'X' },
];
const frame = (
  index: number,
  nodes: unknown,
  highlights: Record<string, string> = {},
  pointers: Record<string, string> = {},
): Frame<unknown> => ({
  state: { nodes },
  meta: { index, explanation: `frame ${index}`, highlights, pointers },
});
const frames: Frame<unknown>[] = [
  frame(0, NODES),
  frame(1, NODES, { a: 'active', b: 'group-1', x: 'muted' }, { cur: 'a', prev: 'r' }),
  frame(2, NODES.slice(0, 3), { r: 'result' }), // nodes disappear
  frame(3, []), // empty forest
];

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'tree-test',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'cp',
  visualizer: 'tree',
  locale: 'en-US',
  presetId: 'p',
  panel: 'cpp',
  presets: [{ id: 'p', label: 'P', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 1,
};
const data: WalkthroughData = {
  title: 'Tree',
  locale: 'en-US',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: ['x'], py: ['x'] }, map: { cpp: {}, py: {} } },
  labels: {},
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_TREE,
  shell: renderShell({
    title: 'Tree',
    labels: {},
    customInput: false,
    lang: 'en-US',
    panels: ['pseudo', 'cpp', 'py'],
  }),
});

describe.skipIf(!REQUIRED)('tree visualizer (browser)', () => {
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

  // fresh page per test
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

  it('draws the forest: nodes, links, edge labels, note, aria-label', async () => {
    await load();
    await pw(widget.locator('svg.wtt circle.wtt-node')).toHaveCount(5);
    await pw(widget.locator('g:not([display="none"]) > path.wtt-link')).toHaveCount(3); // roots have no link
    await pw(widget.locator('g[data-node="a"] .wtt-note')).toHaveText('fail→r');
    await pw(widget.locator('.wtt-edge', { hasText: 'b' })).toHaveCount(1);
    await pw(widget.locator('svg.wtt')).toHaveAttribute(
      'aria-label',
      'root (gốc); A (con của root, cạnh a, fail→r); B (con của root, cạnh b); C (con của A); X (gốc)',
    );
    const boxes = await widget.locator('circle.wtt-node').evaluateAll((els) =>
      els.map((e) => {
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width };
      }),
    );
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.w - 0.5);
      }
    }
  });

  it('jumps frames: highlights, pointers, removal of nodes, empty forest', async () => {
    await load();
    await goTo(1);
    await pw(widget.locator('#wt-explanation')).toHaveText('frame 1');
    await pw(widget.locator('g[data-node="a"] circle')).toHaveClass(/wt-hl-active/);
    await pw(widget.locator('g[data-node="b"] circle')).toHaveClass(/wtt-g1/);
    await pw(widget.locator('g[data-node="x"] circle')).toHaveClass(/wt-hl-muted/);
    await pw(widget.locator('g[data-pointer="cur"] text')).toHaveText('cur ↓');
    await pw(widget.locator('g[data-pointer]')).toHaveCount(2);
    expect(await widget.locator('svg.wtt').getAttribute('aria-label')).toContain(
      'A (con của root, active, cur,',
    );
    await goTo(2);
    await pw(widget.locator('circle.wtt-node')).toHaveCount(3);
    await pw(widget.locator('g[data-pointer]')).toHaveCount(0);
    await pw(widget.locator('g[data-node="r"] circle')).toHaveClass(/wt-hl-result/);
    await goTo(3);
    await pw(widget.locator('circle.wtt-node')).toHaveCount(0);
    await goTo(0);
    await pw(widget.locator('circle.wtt-node')).toHaveCount(5);
    await pw(widget.locator('g[data-node="a"] circle')).not.toHaveClass(/wt-hl-/);
  });

  it('keeps its own ltr geometry and node labels stay inside the SVG', async () => {
    await load();
    await pw(widget.locator('svg.wtt')).toHaveCSS('direction', 'ltr');
    const outside = await widget.locator('svg.wtt').evaluate((svg) => {
      const s = svg.getBoundingClientRect();
      return [...svg.querySelectorAll('circle,text')]
        .filter((el) => el.textContent !== '' || el.tagName === 'circle')
        .filter((el) => {
          const b = el.getBoundingClientRect();
          return b.left < s.left - 0.5 || b.right > s.right + 0.5 || b.top < s.top - 0.5;
        })
        .map((el) => el.outerHTML);
    });
    expect(outside).toEqual([]);
  });
});
