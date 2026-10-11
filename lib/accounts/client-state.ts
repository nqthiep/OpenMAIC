/**
 * What this browser keeps for the signed-in account. Account data lives on the
 * server. The browser's local copies are cleared when the account changes or
 * ends, so the next account cannot read them. The inventory is in
 * docs/accounts/CLIENT-STORAGE.md.
 *
 * Interface preferences stay, and so does the one-way importer's bookkeeping
 * (see clearLocalStorageKeepingImportState). Every other key is removed, so a
 * key added later is cleared by default. The device cache modules load on
 * demand: this file is part of the layout's client bundle.
 */

/** The localStorage key holding the id of the account this browser last served. */
export const LAST_ACCOUNT_KEY = 'openmaic:account:last-user';

/** Longest wait for the device cache and the session revoke. Another open tab can block either. */
const DEVICE_CLEAR_TIMEOUT_MS = 5000;
const REVOKE_TIMEOUT_MS = 5000;

/** Interface preferences kept by exact key. */
const INTERFACE_KEYS: ReadonlySet<string> = new Set([
  'theme',
  'locale',
  'recentClassroomsOpen',
  'interactiveModeEnabled',
  'openmaic:workspace:rail-width',
  'openmaic:workspace:rail-tab',
  'openmaic:workspace:nav-collapsed',
  'openmaic:workspace:chat-collapsed',
  'openmaic:workspace:classroom-collapsed',
  'openmaic:workspace:chat-width',
  LAST_ACCOUNT_KEY,
]);

/** Interface preferences kept by key family: the panel state of each workbench session. */
const INTERFACE_PREFIXES = ['workbench.panel.'];

function isInterfaceKey(key: string): boolean {
  return INTERFACE_KEYS.has(key) || INTERFACE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export interface AccountClientOptions {
  /** localStorage by default. */
  storage?: Storage;
  /** sessionStorage by default. */
  sessionStore?: Storage;
  /** Clears the device cache. Defaults to `clearLocalCache`. */
  clearDevice?: () => Promise<void>;
  /** Longest wait for `clearDevice`. */
  deviceTimeoutMs?: number;
}

/** The browser's storage, or undefined where the browser refuses access to it. */
function browserStorage(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window[name];
  } catch {
    return undefined;
  }
}

/**
 * Whether `work` settles without an error within `ms`. The work is not cancelled
 * when the limit passes; its outcome is simply not waited for.
 */
async function settlesWithin(work: () => Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const outcome = (async () => {
    try {
      await work();
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await Promise.race([outcome, limit]);
  } finally {
    clearTimeout(timer);
  }
}

async function clearDeviceCache(): Promise<void> {
  const { clearLocalCache } = await import('@/lib/device-storage/clear-local-cache');
  await clearLocalCache();
}

/**
 * `localStorage` minus the interface preferences and the importer's bookkeeping.
 * Returns false when any step failed.
 */
async function clearLocalStorage(storage: Storage | undefined): Promise<boolean> {
  if (!storage) return true;
  let complete = true;
  const kept = new Map<string, string>();
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === null || !isInterfaceKey(key)) continue;
      const value = storage.getItem(key);
      if (value !== null) kept.set(key, value);
    }
    const { clearLocalStorageKeepingImportState } =
      await import('@/lib/device-storage/clear-local-cache');
    clearLocalStorageKeepingImportState(storage);
  } catch {
    complete = false;
  } finally {
    for (const [key, value] of kept) {
      try {
        storage.setItem(key, value);
      } catch {
        complete = false;
      }
    }
  }
  return complete;
}

/**
 * Clears what this browser keeps for the account: local storage (except the
 * interface preferences and the importer's bookkeeping), session storage, and
 * the device cache. Never throws. Resolves true only when every part was cleared.
 */
export async function clearAccountClientState(
  options: AccountClientOptions = {},
): Promise<boolean> {
  const storage = options.storage ?? browserStorage('localStorage');
  const sessionStore = options.sessionStore ?? browserStorage('sessionStorage');
  let complete = await clearLocalStorage(storage);
  try {
    sessionStore?.clear();
  } catch {
    complete = false;
  }
  const device = await settlesWithin(
    options.clearDevice ?? clearDeviceCache,
    options.deviceTimeoutMs ?? DEVICE_CLEAR_TIMEOUT_MS,
  );
  return complete && device;
}

function lastAccount(storage: Storage | undefined): string | undefined {
  try {
    return storage?.getItem(LAST_ACCOUNT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function recordAccount(storage: Storage | undefined, userId: string): boolean {
  try {
    storage?.setItem(LAST_ACCOUNT_KEY, userId);
    return storage !== undefined;
  } catch {
    return false;
  }
}

function forgetAccount(storage: Storage | undefined): void {
  try {
    storage?.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    // Nothing else reads the record; the next sign-in clears again.
  }
}

/**
 * `unchanged`: this browser last served the same account. `switched`: another
 * account (or none yet) was served, its state is cleared and this one is recorded.
 * `failed`: the state could not be cleared, so the record stays as it was and
 * the next call tries again.
 */
export type AccountSwitch = 'unchanged' | 'switched' | 'failed';

/** Called once the signed-in account is known. Clears the previous account's state when it differs. */
export async function prepareAccountSwitch(
  userId: string,
  options: AccountClientOptions = {},
): Promise<AccountSwitch> {
  const storage = options.storage ?? browserStorage('localStorage');
  if (lastAccount(storage) === userId) return 'unchanged';
  const cleared = await clearAccountClientState({ ...options, storage });
  return cleared && recordAccount(storage, userId) ? 'switched' : 'failed';
}

/**
 * Ends the account on this browser: the session is revoked first, then the local
 * state is cleared and the record forgotten, then the browser leaves. A failed
 * or stuck revoke does not stop the clearing.
 */
export async function endAccountSession(
  options: AccountClientOptions & {
    revoke: () => Promise<unknown>;
    /** Longest wait for `revoke`. */
    revokeTimeoutMs?: number;
    leave: () => void;
  },
): Promise<void> {
  await settlesWithin(options.revoke, options.revokeTimeoutMs ?? REVOKE_TIMEOUT_MS);
  const storage = options.storage ?? browserStorage('localStorage');
  await clearAccountClientState({ ...options, storage });
  forgetAccount(storage);
  options.leave();
}

/** Whether a storage event from another tab means this page no longer serves `userId`'s account. */
export function accountChangedElsewhere(
  event: { key: string | null; newValue: string | null },
  userId: string,
): boolean {
  return event.key === LAST_ACCOUNT_KEY && event.newValue !== userId;
}
