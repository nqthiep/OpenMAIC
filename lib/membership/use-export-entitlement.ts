'use client';

import { useEffect, useState } from 'react';
import { fetchAccountSession } from '@/components/account/account-api';

/**
 * Whether this visitor may export a course. With accounts off, everyone may. With accounts on,
 * only an active member may. Export runs in the browser, so this gate is in the interface:
 * a copy that was already exported is outside the server's reach.
 */
export type ExportEntitlement = 'loading' | 'open' | 'members-only';

export function useExportEntitlement(): ExportEntitlement {
  const [entitlement, setEntitlement] = useState<ExportEntitlement>('loading');

  useEffect(() => {
    let active = true;
    fetchAccountSession()
      .then((session) => {
        if (!active) return;
        if (!session.enabled) setEntitlement('open');
        else setEntitlement(session.membership?.active === true ? 'open' : 'members-only');
      })
      .catch(() => {
        if (active) setEntitlement('members-only');
      });
    return () => {
      active = false;
    };
  }, []);

  return entitlement;
}
