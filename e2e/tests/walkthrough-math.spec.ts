import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { seedClassroom, type SeedScene } from '../fixtures/seed-scenes';
import { ClassroomPage } from '../pages/classroom.page';

const STAGE_ID = 'e2e-walkthrough-math';
const SCENE_TITLE = 'Interactive Scene scene-math';

// A math walkthrough built by the real provider: the figure is drawn by the `geometry` visualizer (ADR 0015).
const built = JSON.parse(
  execFileSync(
    'node_modules/.bin/tsx',
    ['e2e/fixtures/build-walkthrough-scene.ts', 'power-of-point', 'outside'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ),
) as { content: Record<string, unknown> };

const SCENES: SeedScene[] = [
  { id: 'scene-math', type: 'interactive', title: 'Power of a point', content: built.content },
];

test('math walkthrough: the figure is drawn, steps and presets work, and the iframe makes no request', async ({
  page,
}) => {
  const iframeRequests: string[] = [];
  page.on('request', (r) => {
    if (r.frame() !== page.mainFrame() && /^(https?|wss?):/.test(r.url()))
      iframeRequests.push(r.url());
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await seedClassroom(page, STAGE_ID, SCENES, { autoPlayLecture: false });
  const classroom = new ClassroomPage(page);
  await classroom.goto(STAGE_ID);
  await classroom.waitForLoaded();

  const widget = page.frameLocator(`iframe[title="${SCENE_TITLE}"]`);
  await expect(page.locator(`iframe[title="${SCENE_TITLE}"]`)).toBeVisible({ timeout: 15_000 });
  const root = widget.locator('#wt-root');
  await expect(root).toHaveAttribute('data-preset', 'outside');
  await expect(root).toHaveAttribute('data-frame-index', '0');

  // the figure: a circle, points and text in an svg
  const drawn = widget.locator('#wt-visualizer svg *');
  await expect.poll(() => drawn.count()).toBeGreaterThan(5);
  const firstText = await widget.locator('#wt-explanation').textContent();

  // step: the next frame has its own text and a figure with the secant
  await widget.locator('#wt-next').click();
  await expect(root).toHaveAttribute('data-frame-index', '1');
  await expect(widget.locator('#wt-explanation')).not.toHaveText(firstText ?? '');

  // another preset restarts at its first frame, with its own total
  await widget.locator('#wt-preset').selectOption('inside');
  await expect(root).toHaveAttribute('data-preset', 'inside');
  await expect(root).toHaveAttribute('data-frame-index', '0');
  await expect.poll(() => drawn.count()).toBeGreaterThan(5);

  expect(iframeRequests).toEqual([]);
  // the host page itself reads localStorage of the sandboxed frame (every widget does that, binary-search included): not ours
  expect(errors.filter((e) => !/localStorage.*sandboxed/.test(e))).toEqual([]);
});
