import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { seedClassroom, type SeedScene } from '../fixtures/seed-scenes';
import { ClassroomPage } from '../pages/classroom.page';

const STAGE_ID = 'e2e-walkthrough-widget';
const WT_TITLE = 'Interactive Scene scene-wt';
const FILLERS = ['scene-f1', 'scene-f2', 'scene-f3'];

// The walkthrough scene is built by the real provider (binary-search, preset mid-hit).
const built = JSON.parse(
  execFileSync('node_modules/.bin/tsx', ['e2e/fixtures/build-walkthrough-scene.ts'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }),
) as { content: Record<string, unknown> };

const SCENES: SeedScene[] = [
  {
    id: 'scene-wt',
    type: 'interactive',
    title: 'Binary search',
    content: built.content,
    // The host-side request under test: jump to frame 3 of preset mid-hit.
    actions: [
      {
        id: 'wt-set-frame-3',
        type: 'widget_setState',
        state: { preset: 'mid-hit', frame: 3, playing: false },
      },
    ],
  },
  // More interactive scenes than the iframe pool holds (IFRAME_POOL_CAP = 3), so visiting
  // all of them evicts the walkthrough iframe.
  ...FILLERS.map((id) => ({
    id,
    type: 'interactive',
    title: id,
    content: {
      type: 'interactive',
      url: '',
      html: `<!DOCTYPE html><html><body><h1 id="filler">${id}</h1></body></html>`,
    },
  })),
];

type Hold = { held: () => number; release: () => void };
const hold = (page: Page) =>
  page.evaluate(() => (window as unknown as { __wtHold: Hold }).__wtHold.held());

test('walkthrough: state requested before ready is applied, survives iframe rebuild, no egress', async ({
  page,
}) => {
  // Hold back `widget-ready` from the walkthrough iframe so the host's SET_WIDGET_STATE is
  // issued while the iframe is not ready yet; `release()` then delivers it to the host.
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    let holding = true;
    const queue: MessageEvent[] = [];
    window.addEventListener(
      'message',
      (e) => {
        if (!holding || e.data?.__maicInteractive !== true || e.data.kind !== 'widget-ready')
          return;
        e.stopImmediatePropagation();
        queue.push(e);
      },
      true,
    );
    (window as unknown as { __wtHold: Hold }).__wtHold = {
      held: () => queue.length,
      release: () => {
        holding = false;
        for (const e of queue.splice(0)) {
          window.dispatchEvent(
            new MessageEvent('message', { data: e.data, source: e.source, origin: e.origin }),
          );
        }
      },
    };
  });

  // Every network request issued from a non-main frame (all widgets are srcdoc iframes).
  const iframeRequests: string[] = [];
  page.on('request', (r) => {
    if (r.frame() !== page.mainFrame() && /^(https?|wss?):/.test(r.url())) {
      iframeRequests.push(r.url());
    }
  });

  await seedClassroom(page, STAGE_ID, SCENES, { autoPlayLecture: false });
  const classroom = new ClassroomPage(page);
  await classroom.goto(STAGE_ID);
  await classroom.waitForLoaded();

  const iframe = page.locator(`iframe[title="${WT_TITLE}"]`);
  const root = page.frameLocator(`iframe[title="${WT_TITLE}"]`).locator('#wt-root');
  await expect(iframe).toBeVisible({ timeout: 15_000 });
  await expect(root).toHaveAttribute('data-frame-index', '0');
  await expect.poll(() => hold(page)).toBeGreaterThan(0); // iframe reported ready; host has not seen it

  // Play the scene: the engine sends SET_WIDGET_STATE {preset, frame: 3} while not ready.
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  // The engine holds the 'Pause' label for the 300 ms action delay; poll per frame so it is not missed.
  await page.waitForFunction(() => !!document.querySelector('button[aria-label="Pause"]'), null, {
    polling: 'raf',
  });
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible(); // action done
  await expect(root).toHaveAttribute('data-frame-index', '0'); // held: nothing applied yet

  await page.evaluate(() => (window as unknown as { __wtHold: Hold }).__wtHold.release());
  await expect(root).toHaveAttribute('data-frame-index', '3');
  await expect(root).toHaveAttribute('data-preset', 'mid-hit');

  // Visit the other interactive scenes: the pool (cap 3) evicts the walkthrough iframe.
  for (const [i, id] of FILLERS.entries()) {
    await classroom.clickScene(i + 1);
    await expect(page.locator(`iframe[title="Interactive Scene ${id}"]`)).toBeVisible();
  }
  await expect(iframe).toHaveCount(0);

  // Back to the walkthrough: a brand-new iframe, which must return to the desired frame.
  await classroom.clickScene(0);
  await expect(iframe).toBeVisible();
  await expect(root).toHaveAttribute('data-frame-index', '3');

  expect(iframeRequests).toEqual([]);
});
