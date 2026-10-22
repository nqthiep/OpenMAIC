/**
 * Loads the provider settings when the server starts and keeps them current. Node only: it needs
 * the database pool, so `instrumentation.ts` imports it dynamically.
 *
 * Loading happens before the server serves a request (bounded by a timeout), so the window in
 * which a request meets `ProviderConfigNotReady` is only a database that is down at boot. While
 * nothing is loaded the timer retries quickly; once loaded it checks the tables' fingerprint every
 * `REFRESH_INTERVAL_MS`, which is how a change saved through another instance reaches this one.
 * A failed refresh keeps the snapshot that is already loaded.
 */
import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { createLogger } from '@/lib/logger';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

import {
  isProviderSnapshotLoaded,
  refreshProviderSnapshot,
  refreshProviderSnapshotIfChanged,
} from './snapshot';

const log = createLogger('ProviderSnapshot');

const BOOT_TIMEOUT_MS = 8_000;
const REFRESH_INTERVAL_MS = 20_000;
const RETRY_INTERVAL_MS = 3_000;

async function database() {
  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  return pool as unknown as import('@/lib/server/accounts/store').AccountQueryable;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** One load. Returns whether the snapshot is now loaded. Never throws. */
async function tryLoad(): Promise<boolean> {
  try {
    const db = await database();
    if (isProviderSnapshotLoaded()) await refreshProviderSnapshotIfChanged(db);
    else await refreshProviderSnapshot(db);
    return true;
  } catch (error) {
    log.error(
      `Could not load the AI provider settings: ${error instanceof Error ? error.message : String(error)}`,
    );
    return isProviderSnapshotLoaded();
  }
}

/**
 * Loads the settings and starts the refresh timer. Returns a function that stops the timer.
 * Without a database there is nothing to load, and this does nothing.
 */
export async function startProviderSnapshot(): Promise<() => void> {
  if (!isServerPersistenceConfigured()) return () => {};

  await withTimeout(tryLoad(), BOOT_TIMEOUT_MS).catch((error: unknown) => {
    log.error(
      `AI provider settings did not load within ${BOOT_TIMEOUT_MS} ms (${error instanceof Error ? error.message : String(error)}); retrying in the background.`,
    );
  });

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(
      () => {
        void tryLoad().finally(schedule);
      },
      isProviderSnapshotLoaded() ? REFRESH_INTERVAL_MS : RETRY_INTERVAL_MS,
    );
    timer.unref();
  };
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
