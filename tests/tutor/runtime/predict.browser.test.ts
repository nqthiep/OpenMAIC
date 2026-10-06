/**
 * Predict mode of the walkthrough runtime, checked in Chromium (task 1c-04).
 * Run with `TUTOR_BROWSER=1`; missing Chromium is then a hard failure.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
  walkthroughProvider.build({ id: 'binary-search', presetId: 'absent' }, { locale: 'vi-VN' })
    .content as InteractiveContent
).html as string;
const data = JSON.parse(
  html.match(/<script type="application\/json" id="walkthrough-data">([\s\S]*?)<\/script>/)![1],
) as WalkthroughData;
const beat = data.sets.absent.beats.find((b) => b.answer !== undefined)!;
const text = data.beatText[beat.id];
const WRONG = (beat.answer! + 1) % text.options!.length;

interface Msg {
  kind?: string;
  frame?: number;
  prediction?: { beatId: string; correct: boolean; skipped?: boolean };
}

describe.skipIf(!REQUIRED)('runtime predict mode (browser)', () => {
  let browser: Browser;
  let page: Page;
  let widget: FrameLocator;

  const messages = () => page.evaluate(() => (window as unknown as { msgs: Msg[] }).msgs);
  const predictions = async () => (await messages()).filter((m) => m.prediction);
  const send = (state: object) =>
    page.evaluate(
      (s) =>
        (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
          { type: 'SET_WIDGET_STATE', state: s },
          '*',
        ),
      state,
    );
  const ask = () =>
    send({ preset: 'absent', frame: beat.frame, playing: false, predict: { beatId: beat.id } });

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

  // Fresh page per test: each one starts from a just-loaded widget.
  async function load() {
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
      (window as unknown as { msgs: Msg[] }).msgs.some((m) => m.kind === 'widget-ready'),
    );
  }

  it('shows the question and options on predict, hides them on frame change', async () => {
    await load();
    await pw(widget.locator('#wt-predict button')).toHaveCount(0);
    await ask();
    await pw(widget.locator('#wt-predict .wt-predict-ask')).toHaveText(text.ask!);
    const opts = widget.locator('#wt-predict button[data-option]');
    expect(await opts.allTextContents()).toEqual(text.options);
    await pw(widget.locator('#wt-predict button[data-predict-skip]')).toHaveText(data.labels.skip);
    expect(await predictions()).toHaveLength(0); // asking alone sends no prediction

    // moving on before an answer clears the panel and reports it skipped (the engine stops waiting)
    await send({ frame: 0 });
    await pw(widget.locator('#wt-predict button')).toHaveCount(0);
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(1));
    expect((await predictions())[0]).toMatchObject({
      frame: 0,
      prediction: { beatId: beat.id, correct: false, skipped: true },
    });
    await page.close();
  });

  it('is a labelled polite live region', async () => {
    await load();
    const region = widget.locator('#wt-predict');
    await pw(region).toHaveAttribute('role', 'region');
    await pw(region).toHaveAttribute('aria-live', 'polite');
    await pw(region).toHaveAttribute('aria-label', data.labels.predict);
    await page.close();
  });

  it('moves focus to the first option, then to the result after an answer', async () => {
    await load();
    await ask();
    await pw(widget.locator('#wt-predict button[data-option]').first()).toBeFocused();
    await widget.locator(`#wt-predict button[data-option="${WRONG}"]`).click();
    const result = widget.locator('#wt-predict p[role=status]');
    await pw(result).toHaveAttribute('tabindex', '-1');
    await pw(result).toBeFocused();
    await page.close();
  });

  it('moves focus to the result paragraph after skip', async () => {
    await load();
    await ask();
    await widget.locator('#wt-predict button[data-predict-skip]').click();
    const result = widget.locator('#wt-predict p[role=status]');
    await pw(result).toHaveText(data.labels.skip);
    await pw(result).toBeFocused();
    await page.close();
  });

  it('a question that cannot be shown is reported skipped at once', async () => {
    await load();
    await send({ predict: { beatId: 'no-such-beat' } });
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(1));
    expect((await predictions())[0].prediction).toEqual({
      beatId: 'no-such-beat',
      correct: false,
      skipped: true,
    });
    await pw(widget.locator('#wt-predict button')).toHaveCount(0);

    // unknown preset: the whole message is dropped, the question still counts as skipped
    await send({ preset: 'nope', predict: { beatId: beat.id } });
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(2));
    expect((await predictions())[1].prediction).toEqual({
      beatId: beat.id,
      correct: false,
      skipped: true,
    });
    await page.close();
  });

  it('predict with playing:true holds playback until the question is answered', async () => {
    await load();
    await send({
      preset: 'absent',
      frame: beat.frame,
      speed: 2,
      playing: true,
      predict: { beatId: beat.id },
    });
    const root = widget.locator('#wt-root');
    await pw(widget.locator('#wt-predict button[data-option]').first()).toBeVisible();
    await pw(root).toHaveAttribute('data-playing', 'false');
    await page.waitForTimeout(1500); // > 2 ticks at speed 2
    await pw(root).toHaveAttribute('data-frame-index', String(beat.frame));
    await pw(widget.locator('#wt-predict button[data-option]').first()).toBeVisible();
    expect(await predictions()).toHaveLength(0);

    await widget.locator(`#wt-predict button[data-option="${beat.answer}"]`).click();
    await pw(root).toHaveAttribute('data-playing', 'true');
    await pw(root).not.toHaveAttribute('data-frame-index', String(beat.frame), { timeout: 3000 });
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(1));
    await page.close();
  });

  it('wrong answer: reveals incorrect + the right option, sends one prediction', async () => {
    await load();
    await ask();
    await widget.locator(`#wt-predict button[data-option="${WRONG}"]`).click();
    await pw(widget.locator('#wt-predict [role=status]')).toHaveText(data.labels.incorrect);
    await pw(widget.locator(`#wt-predict button[data-option="${beat.answer}"]`)).toHaveClass(
      /wt-on/,
    );
    await pw(widget.locator('#wt-predict button[data-option]').first()).toBeDisabled();
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(1));
    expect(await predictions()).toEqual([
      expect.objectContaining({
        frame: beat.frame,
        prediction: { beatId: beat.id, correct: false },
      }),
    ]);
    // later state messages never carry the prediction again
    await send({ frame: 0 });
    await vi.waitFor(async () =>
      expect((await messages()).some((m) => m.frame === 0 && !m.prediction)).toBe(true),
    );
    expect(await predictions()).toHaveLength(1);
    await page.close();
  });

  it('correct answer by keyboard', async () => {
    await load();
    await ask();
    await widget.locator(`#wt-predict button[data-option="${beat.answer}"]`).focus();
    await page.keyboard.press('Enter');
    await pw(widget.locator('#wt-predict [role=status]')).toHaveText(data.labels.correct);
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(1));
    const p = await predictions();
    expect(p).toHaveLength(1);
    expect(p[0].prediction).toEqual({ beatId: beat.id, correct: true });
    await page.close();
  });

  it('skip: clears the panel and sends skipped once', async () => {
    await load();
    await ask();
    await widget.locator('#wt-predict button[data-predict-skip]').click();
    await pw(widget.locator('#wt-predict button')).toHaveCount(0);
    await vi.waitFor(async () => expect(await predictions()).toHaveLength(1));
    const p = await predictions();
    expect(p).toHaveLength(1);
    expect(p[0].prediction).toEqual({ beatId: beat.id, correct: false, skipped: true });
    await page.close();
  });

  it('re-announces widget-ready when the host asks to replay', async () => {
    await load();
    const ready = async () => (await messages()).filter((m) => m.kind === 'widget-ready').length;
    expect(await ready()).toBe(1);
    await page.evaluate(() =>
      (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
        { __maicErrorReplayRequest: true },
        '*',
      ),
    );
    await page.waitForFunction(
      () =>
        (window as unknown as { msgs: Msg[] }).msgs.filter((m) => m.kind === 'widget-ready')
          .length === 2,
    );
    await page.close();
  });
});
