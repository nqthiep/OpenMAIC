import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { expect, test } from '@playwright/test';
import { seedClassroom, type SeedScene } from '../fixtures/seed-scenes';
import { ClassroomPage } from '../pages/classroom.page';

const STAGE_ID = 'e2e-clip-export';

const built = JSON.parse(
  execFileSync('node_modules/.bin/tsx', ['e2e/fixtures/build-clip-scenes.ts'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }),
) as { clipId: string; scenes: SeedScene[] };

const sha = (b: Buffer | Uint8Array) => createHash('sha256').update(b).digest('hex');

/** The src of every video element of the built scenes, with the bytes of the shipped file behind it. */
const shipped = built.scenes.map((s) => {
  const els = (s.content as { canvas: { elements: { type: string; src: string }[] } }).canvas
    .elements;
  const src = els.find((e) => e.type === 'video')!.src;
  return { src, hash: sha(readFileSync(path.join('public', src))) };
});

/** Spike S3 / Q11 in a real browser: export the classroom as a ZIP, check it holds the clip videos, import it on a fresh page. */
test(`clip ${built.clipId}: classroom ZIP export carries the videos byte for byte and the import plays them`, async ({
  page,
}) => {
  await seedClassroom(page, STAGE_ID, built.scenes);
  const classroom = new ClassroomPage(page);
  await classroom.goto(STAGE_ID);
  await classroom.waitForLoaded();
  await expect(classroom.sidebarScenes).toHaveCount(built.scenes.length);

  await page.getByRole('button', { name: 'Export PPTX' }).click();
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page.getByRole('menuitem', { name: /Export Classroom ZIP/ }).click();
  const zipPath = await (await download).path();
  const zip = await JSZip.loadAsync(readFileSync(zipPath));

  // every shipped chapter video is in the ZIP, unchanged
  const entries = await Promise.all(
    Object.values(zip.files)
      .filter((f) => !f.dir && f.name.toLowerCase().endsWith('.mp4'))
      .map(async (f) => sha(await f.async('uint8array'))),
  );
  for (const v of shipped) expect(entries, v.src).toContain(v.hash);
  const zipVideoBytes = (
    await Promise.all(
      Object.values(zip.files)
        .filter((f) => !f.dir && f.name.toLowerCase().endsWith('.mp4'))
        .map(async (f) => (await f.async('uint8array')).length),
    )
  ).reduce((a, b) => a + b, 0);
  const shippedBytes = shipped.reduce(
    (a, v) => a + readFileSync(path.join('public', v.src)).length,
    0,
  );
  expect(zipVideoBytes).toBe(shippedBytes);

  // a fresh browser profile imports the ZIP
  const fresh = await page.context().browser()!.newContext();
  const p2 = await fresh.newPage();
  await p2.goto('/', { waitUntil: 'networkidle' });
  await p2.locator('input[type="file"][accept=".zip"]').setInputFiles(zipPath);
  const stageIds = () =>
    p2.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const open = indexedDB.open('maic-documents');
          open.onerror = () => resolve([]);
          open.onsuccess = () => {
            const db = open.result;
            if (!db.objectStoreNames.contains('stages')) return resolve([]);
            const req = db.transaction('stages').objectStore('stages').getAllKeys();
            req.onsuccess = () => resolve(req.result.map(String));
            req.onerror = () => resolve([]);
          };
        }),
    );
  await expect.poll(async () => (await stageIds()).length, { timeout: 60_000 }).toBeGreaterThan(0);
  const id = (await stageIds())[0];
  await p2.goto(`/classroom/${id}`);
  await p2.getByText('Loading classroom...').waitFor({ state: 'hidden', timeout: 20_000 });
  const video = p2.locator('video').first();
  await expect(video).toBeAttached({ timeout: 15_000 });
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((v: HTMLVideoElement) => v.duration)).toBeGreaterThan(7);
  // it plays from the imported bytes, not from the server URL the clip was built with
  expect(await video.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/^blob:/);
  // the imported document keeps every chapter slide, each with its own video (now bytes of the pool, not the original URL)
  const sceneCount = await p2.evaluate(
    (stageId) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('maic-documents');
        open.onsuccess = () => {
          const req = open.result
            .transaction('scenes')
            .objectStore('scenes')
            .index('by-stage')
            .count(stageId);
          req.onsuccess = () => resolve(req.result);
        };
      }),
    id,
  );
  expect(sceneCount).toBe(built.scenes.length);
  await fresh.close();
});
