'use client';

import { useOmniRouteMode } from './omniroute-mode';
import { OmniRoutePanel } from './omniroute-panel';
import { ServerCredentialCard } from './server-credential-card';

/**
 * KHAITAM's administrator cards for the service selected in Model Services: the shared server
 * credential every learner's request uses (stored in the database, see lib/server/provider-store),
 * and OmniRoute's own three-step panel on its page. Each hides itself for an account that may not
 * manage providers, so this renders nothing for everyone else. `ownsPage` tells the caller the
 * generic provider form should stay hidden because the OmniRoute panel replaces it.
 */
export function useOmniRoutePageOwned(tab: string, providerId: string): boolean {
  const mode = useOmniRouteMode();
  return tab === 'providers' && providerId === 'omniroute' && mode !== 'generic';
}

export function AdminServiceCards({ tab, providerId }: { tab: string; providerId: string }) {
  return (
    <>
      {tab === 'providers' && providerId === 'omniroute' && <OmniRoutePanel />}
      <ServerCredentialCard section={tab} providerIds={{ [tab]: providerId }} />
    </>
  );
}
