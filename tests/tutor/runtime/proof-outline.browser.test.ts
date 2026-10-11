/**
 * Visualizer `proofOutline` in a real sandboxed iframe (task 3B-V3 + 3B-K1): hand-written frames, KaTeX
 * formulas from the server-built `math` table (inline fonts, no request), indentation by parent, highlight kinds,
 * text staying text, aria-label, 0 requests, no console errors.
 * The HTML is built from RUNTIME_PROOF_OUTLINE directly, so it does not depend on `runtimes.ts` registration.
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
import { buildMathTable, katexCss } from '@/lib/tutor/build/katex';
import { RUNTIME_PROOF_OUTLINE } from '@/lib/tutor/build/generated/runtime-proof-outline';
import { renderShell } from '@/lib/tutor/build/shell';
import type {
  Frame,
  WalkthroughData,
  WalkthroughWidgetConfig,
} from '@/lib/tutor/protocol/widget-data';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const nodes = [
  { id: 'g', kind: 'given', text: 'Cho \\(a, b > 0\\)' },
  { id: 'goal', kind: 'goal', text: 'Chứng minh \\(\\frac{a+b}{2} \\ge \\sqrt{ab}\\)' },
  {
    id: 'h1',
    kind: 'have',
    text: '\\((\\sqrt{a}-\\sqrt{b})^2 \\ge 0\\)',
    parent: 'g',
    status: 'done',
  },
  { id: 'b1', kind: 'because', text: 'bình phương luôn không âm', parent: 'h1' },
  {
    id: 'h2',
    kind: 'therefore',
    text: '\\(a + b \\ge 2\\sqrt{ab}\\)',
    parent: 'h1',
    status: 'pending',
  },
];

const frames: Frame<unknown>[] = [
  {
    state: { nodes: nodes.slice(0, 3) },
    meta: { index: 0, explanation: 'Bắt đầu với \\(a, b > 0\\)' },
  },
  {
    state: { nodes },
    meta: {
      index: 1,
      explanation: 'Đủ các bước',
      highlights: { h2: 'active', goal: 'group-2', b1: 'compare', zzz: 'bogus' },
    },
  },
  {
    state: {
      nodes: [
        { id: 'x', kind: 'have', text: '<img src=x onerror="document.title=1"> <b>bold</b>' },
        { id: 'y', kind: 'have', text: 'missing \\(\\notinthetable\\) formula', parent: 'x' },
      ],
    },
    meta: { index: 2, explanation: '<script>1</script> văn bản thuần' },
  },
];

const math = buildMathTable([frames.map((f) => [f.meta.explanation, f.state])]);

const config: WalkthroughWidgetConfig = {
  type: 'simulation',
  kind: 'walkthrough',
  walkthroughId: 'proof-test',
  entryRev: 1,
  contentHash: '0000000000000000',
  subject: 'math',
  visualizer: 'proofOutline',
  locale: 'vi-VN',
  presetId: 'p',
  panel: 'pseudo',
  presets: [{ id: 'p', label: 'p', total: frames.length, framesHash: '0000000000000000' }],
  beats: [],
  runtimeVersion: 2,
};
const data: WalkthroughData = {
  title: 'Proof',
  locale: 'vi-VN',
  sets: { p: { frames, beats: [] } },
  beatText: {},
  code: { pseudo: ['x'], impl: { cpp: ['x'], py: ['x'] }, map: { cpp: {}, py: {} } },
  labels: {
    'proof.given': 'Cho',
    'proof.goal': 'Cần chứng minh',
    'proof.have': 'Có',
    'proof.because': 'Do',
    'proof.therefore': 'Suy ra',
    'proof.done': 'Đã xong',
  },
  math,
};
const html = buildWalkthroughHtml({
  config,
  data,
  runtimeJs: RUNTIME_PROOF_OUTLINE,
  extraCss: katexCss(),
  shell: renderShell({
    title: data.title,
    labels: data.labels,
    customInput: false,
    lang: 'vi-VN',
    panels: ['pseudo'],
  }),
});

describe.skipIf(!REQUIRED)('proofOutline visualizer (browser)', () => {
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

  it('first frame: three rows, kind labels, formulas rendered by KaTeX with its font, in the explanation too', async () => {
    await load();
    await pw(widget.locator('.wtq-row')).toHaveCount(3);
    expect(await widget.locator('.wtq-kind').allTextContents()).toEqual([
      'Cho',
      'Có', // the child h1 sits right under its parent g
      'Cần chứng minh',
    ]);
    await pw(widget.locator('.wtq-row .katex').first()).toBeVisible();
    expect(await widget.locator('.wtq-row .katex').count()).toBe(3); // one formula each
    await pw(widget.locator('#wt-explanation .katex')).toHaveCount(1);
    // the inline font really loads from the data URI (no request), and a formula has a real width
    const info = await widget
      .locator('.wtq-row .katex')
      .first()
      .evaluate(async (el) => {
        await document.fonts.ready;
        return {
          font: document.fonts.check('1em KaTeX_Main'),
          italic: document.fonts.check('italic 1em KaTeX_Math'),
          width: (el as HTMLElement).getBoundingClientRect().width,
        };
      });
    expect(info.font).toBe(true);
    expect(info.italic).toBe(true);
    expect(info.width).toBeGreaterThan(10);
    await pw(widget.locator('.wtq')).toHaveAttribute('aria-label', /^Cho: Cho /);
  });

  it('frame 1: indentation follows the parent chain, status marks, highlight kinds', async () => {
    await load();
    await show(1);
    await pw(widget.locator('.wtq-row')).toHaveCount(5);
    const depths = await widget.locator('.wtq-row').evaluateAll((rows) =>
      rows.map((r) => ({
        id: r.getAttribute('data-node'),
        left: (r as HTMLElement).style.marginInlineStart,
      })),
    );
    expect(depths).toEqual([
      { id: 'g', left: '0px' },
      { id: 'h1', left: '18px' },
      { id: 'b1', left: '36px' },
      { id: 'h2', left: '36px' },
      { id: 'goal', left: '0px' },
    ]);
    await pw(widget.locator('[data-node=h2]')).toHaveClass(/wt-hl-active/);
    await pw(widget.locator('[data-node=goal]')).toHaveClass(/wtq-g2/);
    await pw(widget.locator('[data-node=b1]')).toHaveClass(/wt-hl-compare/);
    await pw(widget.locator('[data-node=h1]')).toHaveAttribute('data-status', 'done');
    await pw(widget.locator('[data-node=h2]')).toHaveAttribute('data-status', 'pending');
    // the "done" mark is drawn by CSS after the text, so it is not part of the text content
    const after = await widget
      .locator('[data-node=h1] .wtq-text')
      .evaluate((el) => getComputedStyle(el, '::after').content);
    expect(after).toContain('✓');
  });

  it('text stays text: markup in a node or in the explanation is not parsed; an unknown formula shows its source', async () => {
    await load();
    await show(2);
    await pw(widget.locator('.wtq-row')).toHaveCount(2);
    expect(await widget.locator('.wtq-text').first().textContent()).toBe(
      '<img src=x onerror="document.title=1"> <b>bold</b>',
    );
    expect(await widget.locator('#wt-explanation').textContent()).toBe(
      '<script>1</script> văn bản thuần',
    );
    expect(await widget.locator('.wtq-text').nth(1).textContent()).toBe(
      'missing \\(\\notinthetable\\) formula',
    );
    expect(
      await widget.locator('#wt-visualizer img, #wt-visualizer b, #wt-explanation script').count(),
    ).toBe(0);
    expect(await widget.locator('.katex').count()).toBe(0);
  });

  it('going back redraws the first frame; the list element is reused', async () => {
    await load();
    await show(1);
    await show(0);
    await pw(widget.locator('.wtq-row')).toHaveCount(3);
    expect(await widget.locator('.wtq').count()).toBe(1);
  });
});
