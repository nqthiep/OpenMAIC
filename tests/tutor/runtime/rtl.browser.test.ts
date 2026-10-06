/**
 * RTL locale: the bars visualizer keeps its own left-to-right geometry, so the threshold label
 * (text-anchor:end at the right edge) is not pushed out of the viewBox. Also checks the SVG
 * aria-label announces highlights/pointers and that wt-flash is visible on SVG children.
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
import type { InteractiveContent } from '@openmaic/dsl';
import { walkthroughProvider } from '@/lib/widgets';

const REQUIRED = process.env.TUTOR_BROWSER === '1';

const html = (
  walkthroughProvider.build({ id: 'bs-answer-mini', presetId: 'classic' }, { locale: 'ar-SA' })
    .content as InteractiveContent
).html as string;

describe.skipIf(!REQUIRED)('walkthrough runtime, RTL locale (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;

  beforeAll(async () => {
    try {
      browser = await chromium.launch();
    } catch (e) {
      throw new Error(`TUTOR_BROWSER=1 but Chromium is unavailable: ${String(e)}`);
    }
    page = await browser.newPage();
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
  });
  afterAll(async () => {
    await page?.close();
    await browser?.close();
  });

  const goTo = (frame: number) =>
    page.evaluate(
      (f) =>
        (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
          { type: 'SET_WIDGET_STATE', state: { frame: f } },
          '*',
        ),
      frame,
    );

  it('is a right-to-left document but the visualizer SVG stays ltr', async () => {
    await pw(widget.locator('#wt-root')).toHaveAttribute('dir', 'rtl');
    await pw(widget.locator('.wta')).toHaveCSS('direction', 'ltr');
  });

  it('keeps the threshold label inside the viewBox', async () => {
    const label = widget.locator('.wta-thr text');
    await pw(label).toBeVisible();
    const fits = await label.evaluate((el) => {
      const t = el.getBoundingClientRect();
      const svg = (el as SVGTextElement).ownerSVGElement!.getBoundingClientRect();
      return { left: t.left - svg.left, right: svg.right - t.right, text: el.textContent };
    });
    expect(fits.text).toMatch(/=\s*\d/);
    expect(fits.left).toBeGreaterThanOrEqual(0); // not clipped on the left
    expect(fits.right).toBeGreaterThanOrEqual(0); // nor on the right (text-anchor:end under rtl)
  });

  it('aria-label announces highlights and pointers', async () => {
    let label = '';
    for (let f = 1; f < 12 && !/\(/.test(label); f++) {
      await goTo(f);
      await pw(widget.locator('#wt-root')).toHaveAttribute('data-frame-index', String(f));
      label = (await widget.locator('svg.wta').getAttribute('aria-label')) ?? '';
    }
    expect(label).toMatch(/\d+ \((?:active|compare|result|visited|muted|[a-z]+)[^)]*\)/);
  });

  it('wt-flash is visible on SVG children', async () => {
    await page.evaluate(() =>
      (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
        { type: 'HIGHLIGHT_ELEMENT', target: '.wta-bar' },
        '*',
      ),
    );
    const bar = widget.locator('.wta-bar').first();
    await pw(bar).toHaveClass(/wt-flash/);
    await pw(bar).toHaveCSS('stroke-width', '3px');
    expect(await bar.evaluate((el) => getComputedStyle(el).filter)).toContain('drop-shadow');
  });
});
