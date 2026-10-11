'use client';

import { useEffect, useState, ReactNode } from 'react';
import { AccessCodeModal } from '@/components/access-code-modal';
import { importLegacyModelSettings } from '@/components/model-settings-init';
import { modelSettingsClient } from '@/lib/model-settings/client';
import { reloadAgentRegistry } from '@/lib/orchestration/registry/store';

export function AccessCodeGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    authenticated: boolean;
    loading: boolean;
  }>({ enabled: false, authenticated: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/access-code/status')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setStatus({
            enabled: data.enabled,
            authenticated: data.authenticated,
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Default to requiring auth on error — safer than silently disabling
          setStatus({ enabled: true, authenticated: false, loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Children are built while the status is loading, so the server markup and
  // deployments without an access code are unaffected. While the code is
  // required they are not built: their requests would get 401, and their
  // controls would stay focusable behind the dialog. Accepting the code builds them.
  const needsAuth = !status.loading && status.enabled && !status.authenticated;

  return (
    <>
      {needsAuth && (
        <AccessCodeModal
          open={true}
          onSuccess={() => {
            setStatus((s) => ({ ...s, authenticated: true }));
            // Model settings are read on mount, which on an ACCESS_CODE-gated
            // deployment is before any access cookie exists: the middleware
            // answers 401 and nothing is known about the workspace's models
            // until a reload. Read them again now that the request will be
            // authorized, and retry the one-time import of browser settings.
            void modelSettingsClient.load();
            void importLegacyModelSettings();
            // The same for the custom agents (and their one-time import).
            void reloadAgentRegistry();
            // And for the courses this browser stored before 1.2.0: the
            // import's first run was refused before the gate passed.
            void import('@/lib/legacy-browser-import')
              .then(({ resumeLegacyBrowserImportAfterAccess }) =>
                resumeLegacyBrowserImportAfterAccess(),
              )
              .catch((error: unknown) =>
                console.warn('[legacy-browser-import] Could not load:', error),
              );
          }}
        />
      )}
      {!needsAuth && children}
    </>
  );
}
