'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  fetchAccessRequest,
  LearningRequestError,
  sendAccessRequest,
  type AccessRequestView,
} from '@/components/learning/learning-api';
import { useCapabilities } from '@/lib/capabilities/use-capabilities';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Lets a member whose membership ends soon ask for a renewal before it lapses. Shows the request
 * on record instead when one is pending or was refused recently. Renders nothing when the server
 * does not allow a request (staff, suspended, or not yet in the renewal window).
 */
export function RenewButton() {
  const { t, locale } = useI18n();
  const allowed = useCapabilities()?.requestAccess === true;
  const [known, setKnown] = useState<{
    request: AccessRequestView | null;
    retryAt: string | null;
  }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    fetchAccessRequest()
      .then((next) => {
        if (current) setKnown(next);
      })
      .catch(() => {
        if (current) setKnown({ request: null, retryAt: null });
      });
    return () => {
      current = false;
    };
  }, [allowed]);

  if (!allowed || !known) return null;
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const { request, retryAt } = known;
  if (request?.state === 'pending') {
    return (
      <span className="shrink-0 text-xs">
        {t('home.renew.pending', { date: day(request.requestedAt) })}
      </span>
    );
  }
  if (request?.state === 'rejected' && retryAt !== null && new Date(retryAt) > new Date()) {
    return (
      <span className="shrink-0 text-xs">
        {t('home.renew.rejected', { date: day(retryAt) })}
        {request.reason ? ` ${t('home.access.refusalReason', { reason: request.reason })}` : ''}
      </span>
    );
  }

  const send = async () => {
    setBusy(true);
    try {
      const sent = await sendAccessRequest();
      setKnown({ request: sent.request, retryAt: null });
    } catch (error) {
      const key =
        error instanceof LearningRequestError && error.errorCode
          ? `learning.errors.${error.errorCode}`
          : 'learning.errors.generic';
      const text = t(key);
      toast.error(text === key ? t('learning.errors.generic') : text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={send} className="shrink-0">
      {t('home.access.renewButton')}
    </Button>
  );
}
