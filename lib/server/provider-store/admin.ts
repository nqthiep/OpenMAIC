/**
 * Shared pieces of the provider admin routes.
 */
import { createLogger } from '@/lib/logger';
import type { AccountQueryable } from '@/lib/server/accounts/store';

import { loadKeyRing, ProviderKeyError } from './crypto';
import { refreshProviderSnapshot } from './snapshot';

const log = createLogger('ProviderAdmin');

export type MasterKeyStatus = 'ok' | 'missing' | 'invalid';

/** Whether this server can encrypt and decrypt provider secrets. */
export function masterKeyStatus(): MasterKeyStatus {
  try {
    return loadKeyRing() ? 'ok' : 'missing';
  } catch (error) {
    if (error instanceof ProviderKeyError) return 'invalid';
    throw error;
  }
}

/**
 * Makes a just-saved change live on this instance. A failure is logged, not thrown: the change is
 * stored, and the refresh timer (and other instances' timers) pick it up within seconds.
 */
export async function applyChange(db: AccountQueryable): Promise<void> {
  try {
    await refreshProviderSnapshot(db);
  } catch (error) {
    log.error(
      `Saved, but could not reload the provider settings: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
