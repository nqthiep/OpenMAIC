'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

/** What `GET /api/admin/omniroute/status` answers. */
type OmniRouteStatus = { enabled: boolean };

/**
 * The "OmniRoute" area of the shared server credential card: a button that opens the OmniRoute
 * dashboard in a new tab, signed in with a one-time ticket. The card shows it only for the
 * omniroute provider, and only to an administrator, so it does not check permissions itself.
 * Renders nothing while the status is unknown or the request fails, and a dim note when OmniRoute
 * is not set up. The tab is opened before the request so the browser sees the click and does not
 * block it; the URL, the ticket inside it and any password are never shown or logged here.
 */
export function OmniRouteLink() {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/omniroute/status')
      .then(async (response): Promise<boolean | null> => {
        if (!response.ok) return null;
        const body: OmniRouteStatus | null = await response.json();
        return typeof body?.enabled === 'boolean' ? body.enabled : null;
      })
      .then((result) => {
        if (active && result !== null) setEnabled(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (enabled === null) return null;

  if (enabled === false) {
    return (
      <p className="text-xs text-muted-foreground">
        {t('admin.providers.omniroute.notConfigured')}
      </p>
    );
  }

  const open = async () => {
    // Opened before the request, still inside the click, so a popup blocker lets the tab through.
    const win = window.open('', '_blank');
    if (!win) {
      // Blocked by the browser: asking the server now would only mint a ticket nobody can use.
      toast.error(t('admin.providers.omniroute.openFailed'));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/admin/omniroute/open', { method: 'POST' });
      if (!response.ok) throw new Error(`omniroute open: HTTP ${response.status}`);
      const body: { url?: unknown } | null = await response.json();
      if (typeof body?.url !== 'string') throw new Error('omniroute open: no url in the answer');
      win.opener = null;
      win.location.href = body.url;
    } catch {
      win.close();
      toast.error(t('admin.providers.omniroute.openFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('admin.providers.omniroute.title')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('admin.providers.omniroute.description')}
        </p>
      </div>
      <Button type="button" disabled={busy} onClick={() => void open()}>
        {busy ? t('admin.providers.omniroute.opening') : t('admin.providers.omniroute.open')}
      </Button>
    </div>
  );
}
