import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { seedClassroom, type SeedScene } from '../fixtures/seed-scenes';
import { ClassroomPage } from '../pages/classroom.page';

const STAGE_ID = 'e2e-clip-slides';

// The scenes are built by the real clip provider from the clip assets that ship in public/clips.
const built = JSON.parse(
  execFileSync('node_modules/.bin/tsx', ['e2e/fixtures/build-clip-scenes.ts'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }),
) as { clipId: string; scenes: SeedScene[] };

test(`clip ${built.clipId}: every chapter slide shows a video that loads from public/clips and has a length`, async ({
  page,
}) => {
  expect(built.scenes.length).toBeGreaterThanOrEqual(2);
  await seedClassroom(page, STAGE_ID, built.scenes);
  const classroom = new ClassroomPage(page);
  await classroom.goto(STAGE_ID);
  await classroom.waitForLoaded();
  await expect(classroom.sidebarScenes).toHaveCount(built.scenes.length);

  for (let i = 0; i < built.scenes.length; i++) {
    await classroom.clickScene(i);
    const video = page.locator('video').first();
    await expect(video).toBeAttached({ timeout: 15_000 });
    const src = await video.evaluate((v: HTMLVideoElement) => v.currentSrc || v.src);
    expect(new URL(src).pathname, `chapter ${i}`).toMatch(/^\/clips\/[^/]+\/[^/]+\.mp4$/);
    // the browser can decode it and it is as long as the chapter plan says (8 to 25 s)
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);
    const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
    expect(duration, `chapter ${i}`).toBeGreaterThan(7);
    expect(duration, `chapter ${i}`).toBeLessThan(26);
    // the static file honours a Range request
    const res = await page.request.get(new URL(src).pathname, { headers: { Range: 'bytes=0-99' } });
    expect([200, 206]).toContain(res.status());
  }
});
