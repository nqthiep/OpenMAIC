import type { Page } from '@playwright/test';
import { createSettingsStorage } from './test-data/settings';
import { seedServerDocument, setCurrentScene } from './server-seed';

/** Scene rows of a seeded classroom; `stageId`/`order`/timestamps are filled in. */
export type SeedScene = { id: string; type: string; title: string } & Record<string, unknown>;

/**
 * Seeds a classroom (stage + scenes) on the server, through the same embedded
 * persistence endpoint the app writes to (see `server-seed.ts`). Call before
 * `goto('/classroom/<stageId>')`.
 */
export async function seedClassroom(
  page: Page,
  stageId: string,
  scenes: readonly SeedScene[],
  settings: Record<string, unknown> = {},
) {
  await page.addInitScript(
    (s) => {
      localStorage.setItem('maic:account:settings-storage', s);
      localStorage.setItem('locale', 'en-US');
    },
    createSettingsStorage({ sidebarCollapsed: false, ttsEnabled: false, ...settings }),
  );
  // Visiting the home page first gives the page its owner cookie; the seed then belongs to this browser.
  await page.goto('/', { waitUntil: 'networkidle' });
  const now = Date.now();
  await seedServerDocument(page, {
    stage: {
      id: stageId,
      name: 'Tutor widget e2e',
      description: '',
      language: 'en-US',
      style: 'professional',
      createdAt: now,
      updatedAt: now,
    },
    scenes: scenes.map((scene, order) => ({
      ...scene,
      stageId,
      order,
      createdAt: now,
      updatedAt: now,
    })),
  });
  await setCurrentScene(page, stageId, scenes[0].id);
}
