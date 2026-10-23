'use client';

import { useEffect, useState } from 'react';
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  loadSharedSession,
  peekSharedSession,
  type AccountSession,
} from '@/components/account/account-api';
import { createLogger } from '@/lib/logger';
import type { Capabilities } from '@/lib/server/authz/capabilities';

const log = createLogger('Capabilities');

/**
 * The visitor's session. Undefined until the server answers; null when the check failed, so the
 * page can still show with nothing gated open. Refreshes after sign-in and sign-out.
 */
export function useAccountSession(): AccountSession | null | undefined {
  const [session, setSession] = useState<AccountSession | null | undefined>(peekSharedSession);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    loadSharedSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((error: unknown) => {
        log.warn('Session check failed', error instanceof Error ? error.name : 'unknown error');
        if (active) setSession(null);
      });
    const onChanged = () => setGeneration((value) => value + 1);
    window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onChanged);
    return () => {
      active = false;
      window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, onChanged);
    };
  }, [generation]);

  return session;
}

/** What the visitor may do. Undefined until the server has answered, so nothing gated shows early. */
export function useCapabilities(): Capabilities | undefined {
  return useAccountSession()?.capabilities;
}
