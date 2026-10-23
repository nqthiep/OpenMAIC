'use client';

import { useSyncExternalStore } from 'react';

/**
 * Who owns the Settings popup's OmniRoute provider page. `loading` before the first answer,
 * `panel` while the three-step admin panel owns the page, `generic` when `/api/admin/omniroute/*`
 * answers 401/403/404 (not an administrator, or the account is not enabled for it): the panel and
 * its route changes disappear and the shared server credential card plus the personal form take
 * over. A tiny module store rather than a context because the decision is written by the panel and
 * read by three components that never render inside it.
 */
export type OmniRouteMode = 'loading' | 'panel' | 'generic';

let mode: OmniRouteMode = 'loading';
const listeners = new Set<() => void>();

/** Moves the mode and tells every mounted reader. The same value is a no-op. */
export function setOmniRouteMode(next: OmniRouteMode): void {
  if (next === mode) return;
  mode = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current mode; re-renders whenever `setOmniRouteMode` moves it. */
export function useOmniRouteMode(): OmniRouteMode {
  return useSyncExternalStore(
    subscribe,
    () => mode,
    () => mode,
  );
}
