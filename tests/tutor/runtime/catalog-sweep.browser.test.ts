/**
 * Every walkthrough of every subject pack in a real sandboxed iframe (ADR 0015 follow-up): each preset boots,
 * the frames named below render (the explanation on screen is the frame's own, the visualizer drew something),
 * and the page makes no outside request and logs no error.
 *
 * Math entries are walked frame by frame in vi-VN and at the ends in en-US; the larger informatics entries are
 * sampled. `TUTOR_SWEEP_FULL=1` walks every frame of every preset in both locales.
 * Run with `TUTOR_BROWSER=1`; a missing Chromium is then a hard failure.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { steps } from '@/lib/tutor/engine/generate';
import { walkthroughProvider } from '@/lib/widgets';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

const REQUIRED = process.env.TUTOR_BROWSER === '1';
const FULL = process.env.TUTOR_SWEEP_FULL === '1';
const LOCALES = ['vi-VN', 'en-US'] as const;
const PARALLEL = 4;

/** the frames to visit: all of them, or the ends, the thirds and a stride */
function framesToVisit(total: number, all: boolean): number[] {
  if (all || total <= 12) return Array.from({ length: total }, (_, i) => i);
  const picks = new Set<number>([0, Math.floor(total / 3), Math.floor((2 * total) / 3), total - 1]);
  for (let i = 0; i < total; i += 9) picks.add(i);
  return [...picks].sort((a, b) => a - b);
}

interface Job {
  entry: AnyWalkthroughEntry;
  subject: string;
  presetId: string;
  locale: (typeof LOCALES)[number];
  frames: number[];
  expected: string[];
}

function jobs(): Job[] {
  const out: Job[] = [];
  for (const pack of SUBJECT_PACKS) {
    for (const entry of pack.walkthroughs) {
      for (const preset of entry.presets) {
        for (const locale of LOCALES) {
          const frames = steps(entry, preset.input, { locale });
          const math = pack.id === 'math';
          const all = FULL || (math && locale === 'vi-VN');
          const picks = framesToVisit(frames.length, all);
          // en-US of a big informatics entry is covered by its ends only
          const wanted = locale === 'en-US' && !FULL ? [0, frames.length - 1] : picks;
          out.push({
            entry,
            subject: pack.id,
            presetId: preset.id,
            locale,
            frames: [...new Set(wanted)].filter((i) => i >= 0 && i < frames.length),
            expected: frames.map((f) => f.meta.explanation),
          });
        }
      }
    }
  }
  return out;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe.skipIf(!REQUIRED)('catalog sweep in a real browser', () => {
  let browser: Browser;
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

  async function visit(job: Job): Promise<string[]> {
    const problems: string[] = [];
    const tag = `${job.subject}/${job.entry.id}/${job.presetId}/${job.locale}`;
    const built = walkthroughProvider.build(
      { id: job.entry.id, presetId: job.presetId },
      { locale: job.locale },
    );
    const html = (built.content as { html: string }).html;
    const page = await browser.newPage({ viewport: { width: 760, height: 760 } });
    const requests: string[] = [];
    page.on('request', (r) => {
      if (!/^(about|data):/.test(r.url())) requests.push(r.url());
    });
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`${tag}: console ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`${tag}: pageerror ${String(e)}`));
    try {
      await page.setContent(
        '<!doctype html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-forms allow-popups" style="width:760px;height:760px;border:0"></iframe>',
      );
      await page.evaluate((h) => {
        const w = window as unknown as { msgs: { kind?: string }[] };
        w.msgs = [];
        window.addEventListener('message', (e) => w.msgs.push(e.data));
        (document.getElementById('f') as HTMLIFrameElement).srcdoc = h;
      }, html);
      await page.waitForFunction(
        () =>
          (window as unknown as { msgs: { kind?: string }[] }).msgs.some(
            (m) => m.kind === 'widget-ready',
          ),
        null,
        { timeout: 20_000 },
      );
      const frame = page.frames().find((f) => f !== page.mainFrame())!;
      const total = Number(await frame.locator('#wt-root').getAttribute('data-total-frames'));
      if (total !== job.expected.length)
        problems.push(`${tag}: ${total} frames on screen, ${job.expected.length} expected`);
      for (const k of job.frames) {
        await page.evaluate(
          ([n, preset]) =>
            (document.getElementById('f') as HTMLIFrameElement).contentWindow!.postMessage(
              { type: 'SET_WIDGET_STATE', state: { preset, frame: n, playing: false } },
              '*',
            ),
          [k, job.presetId] as const,
        );
        await frame.waitForFunction(
          (n) => document.getElementById('wt-root')?.getAttribute('data-frame-index') === String(n),
          k,
          { timeout: 10_000 },
        );
        const seen = await frame.evaluate(() => ({
          text: document.getElementById('wt-explanation')?.textContent ?? '',
          nodes: document.querySelectorAll('#wt-visualizer *').length,
          svg: document.querySelectorAll('#wt-visualizer svg *').length,
        }));
        if (norm(seen.text) !== norm(job.expected[k]))
          problems.push(`${tag} frame ${k}: the explanation on screen differs from the frame's`);
        if (seen.nodes === 0) problems.push(`${tag} frame ${k}: the visualizer is empty`);
        if (job.entry.visualizer === 'geometry' && seen.svg < 3)
          problems.push(`${tag} frame ${k}: the figure has ${seen.svg} svg elements`);
      }
    } catch (e) {
      problems.push(`${tag}: ${String(e).split('\n')[0]}`);
    } finally {
      await page.close();
    }
    if (requests.length) problems.push(`${tag}: outside requests ${requests.join(', ')}`);
    return problems;
  }

  it('every preset of every walkthrough renders its frames with no error and no outside request', async () => {
    const all = jobs();
    expect(all.length).toBeGreaterThan(200);
    // the sweep is real: hundreds of preset pages and thousands of frames (544 and 2437 when written)
    expect(all.reduce((n, j) => n + j.frames.length, 0)).toBeGreaterThan(2000);
    const problems: string[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: PARALLEL }, async () => {
        while (next < all.length) {
          const job = all[next++];
          problems.push(...(await visit(job)));
        }
      }),
    );
    expect(problems).toEqual([]);
  }, 900_000);
});
