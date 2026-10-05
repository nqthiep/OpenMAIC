import type { Page } from '@playwright/test';
import { createSettingsStorage } from './test-data/settings';

/** Scene rows as stored in IndexedDB `maic-documents`; `stageId`/`order`/timestamps are filled in. */
export type SeedScene = { id: string; type: string; title: string } & Record<string, unknown>;

/**
 * Seeds a classroom (stage + scenes) into the app's IndexedDB, same approach as
 * `interactive-iframe-keepalive-619.spec.ts`. Call before `goto('/classroom/<stageId>')`.
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
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(
    ({ stageId, scenes }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('maic-documents', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('stages', { keyPath: 'id' });
          const store = db.createObjectStore('scenes', { keyPath: ['stageId', 'id'] });
          store.createIndex('by-stage', 'stageId');
          db.createObjectStore('outlines', { keyPath: 'stageId' });
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['stages', 'scenes', 'outlines'], 'readwrite');
          const now = Date.now();
          tx.objectStore('stages').put({
            id: stageId,
            name: 'Tutor widget e2e',
            description: '',
            language: 'en-US',
            style: 'professional',
            createdAt: now,
            updatedAt: now,
            dslVersion: '0.1.0',
          });
          scenes.forEach((scene, order) =>
            tx
              .objectStore('scenes')
              .put({ ...scene, stageId, order, createdAt: now, updatedAt: now }),
          );
          tx.objectStore('outlines').put({
            stageId,
            outline: { outlines: [], createdAt: now, updatedAt: now },
          });
          localStorage.setItem(
            `maic:device:editor-current-scene:${stageId}`,
            JSON.stringify({ sceneId: scenes[0].id, updatedAt: new Date(now).toISOString() }),
          );
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      }),
    { stageId, scenes: scenes as SeedScene[] },
  );
}
