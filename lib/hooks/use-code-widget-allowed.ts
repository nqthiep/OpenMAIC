'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Module-level cache: the probe runs once per page, shared by every consumer.
let cached: boolean | undefined;
let inflight = false;
const listeners = new Set<() => void>();

let pending: Promise<void> | undefined;

function probe(): Promise<void> {
  if (cached !== undefined) return Promise.resolve();
  if (inflight && pending) return pending;
  inflight = true;
  pending = fetch('/api/widgets/policy')
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => {
      if (typeof body?.codeWidgetAllowed !== 'boolean') return;
      cached = body.codeWidgetAllowed;
      listeners.forEach((notify) => notify());
    })
    .catch(() => {
      // A failed probe stays `undefined` (= blocked) and a later mount retries.
    })
    .finally(() => {
      inflight = false;
    });
  return pending;
}

/** Non-hook form for export code: resolves `true` only when the server said so. */
export async function resolveCodeWidgetAllowed(): Promise<boolean> {
  await probe();
  return cached === true;
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/**
 * Whether this deployment allows the student-code widget.
 * `undefined` = not answered yet or probe failed; callers must treat it as blocked.
 */
export function useCodeWidgetAllowed(): boolean | undefined {
  useEffect(() => {
    void probe();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => undefined,
  );
}
