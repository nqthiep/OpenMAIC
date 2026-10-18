'use client';

import { useEffect, useState } from 'react';
import { sessionChanged } from '@/components/account/account-api';
import { LockedNotice } from '@/components/capability/locked-notice';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchAccessRequest,
  LearningRequestError,
  sendAccessRequest,
  type AccessRequestView,
} from '@/components/learning/learning-api';
import { useCapabilities } from '@/lib/capabilities/use-capabilities';
import type { MembershipNoticeKind } from '@/lib/home/learner-status';
import { useI18n } from '@/lib/hooks/use-i18n';

/** Same limit as the server (`ACCESS_REQUEST_NOTE_MAX`); the server checks it again. */
const NOTE_MAX = 280;
/** How often a waiting request is looked at again. */
const PENDING_POLL_MS = 30_000;

interface Known {
  readonly request: AccessRequestView | null;
  readonly retryAt: string | null;
}

/**
 * Shown in place of the composer to a learner who has no active membership: why it is locked,
 * and the way to ask for access. After the question is sent it says so; after a rejection it says
 * when the learner may ask again; when an administrator paused the membership it only says that.
 */
export function AccessRequest({
  kind,
  reason: reasonText,
}: {
  kind: MembershipNoticeKind;
  /** What the membership unlocks here; the home says it is AI course creation. */
  reason?: string;
}) {
  const { t, locale } = useI18n();
  const allowed = useCapabilities()?.requestAccess === true && kind !== 'suspended';
  const [known, setKnown] = useState<Known | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    fetchAccessRequest()
      .then((next) => {
        if (current) setKnown(next);
      })
      .catch(() => {
        // Without the state the learner can still ask; the server refuses a repeat.
        if (current) setKnown({ request: null, retryAt: null });
      });
    return () => {
      current = false;
    };
  }, [allowed]);

  // While the request waits, look again every half minute and whenever the tab comes back, so an
  // approval unlocks the composer without a reload and a refusal shows its reason.
  const pending = known?.request?.state === 'pending';
  useEffect(() => {
    if (!pending) return;
    let current = true;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      fetchAccessRequest()
        .then((next) => {
          if (!current || next.request?.state === 'pending') return;
          setKnown(next);
          // Approved: the session now carries the membership, so every gate asks again.
          if (next.request?.state === 'approved') sessionChanged();
        })
        .catch(() => {
          // The next tick or focus tries again.
        });
    };
    const timer = window.setInterval(check, PENDING_POLL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [pending]);

  const reason = reasonText ?? t('home.locked.membership');
  if (kind === 'suspended')
    return <LockedNotice reason={reason} hint={t('home.access.suspended')} />;
  if (!allowed) return <LockedNotice reason={reason} />;
  if (known === null) return <LockedNotice reason={reason} hint="" />;

  const day = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const { request, retryAt } = known;
  if (request?.state === 'pending') {
    return (
      <LockedNotice
        reason={reason}
        hint={t('home.access.pending', { date: day(request.requestedAt) })}
      />
    );
  }
  // The reason staff gave for the last refusal, kept visible until the learner asks again.
  const refusal =
    request?.state === 'rejected' && request.reason
      ? ` ${t('home.access.refusalReason', { reason: request.reason })}`
      : '';
  const waiting =
    request?.state === 'rejected' && retryAt !== null && new Date(retryAt) > new Date();
  if (waiting) {
    return (
      <LockedNotice
        reason={reason}
        hint={t('home.access.rejected', { date: day(retryAt) }) + refusal}
      />
    );
  }

  const renew = kind === 'expired';
  const send = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const sent = await sendAccessRequest(note.trim() === '' ? undefined : note.trim());
      setKnown({ request: sent.request, retryAt: null });
    } catch (error) {
      const key =
        error instanceof LearningRequestError && error.errorCode
          ? `learning.errors.${error.errorCode}`
          : 'learning.errors.generic';
      const text = t(key);
      setFailure(text === key ? t('learning.errors.generic') : text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <LockedNotice
        reason={reason}
        hint={(renew ? t('home.access.promptRenew') : t('home.access.prompt')) + refusal}
        quietContact
      />
      <div className="flex flex-col gap-3 rounded-3xl border border-brand-100 bg-white p-4 shadow-lg shadow-brand-800/[0.06] dark:border-white/10 dark:bg-slate-900">
        <Textarea
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          placeholder={t('home.access.notePlaceholder')}
          aria-label={t('home.access.notePlaceholder')}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="min-w-0 flex-1 text-xs text-destructive">
            {failure}
          </p>
          <Button
            size="lg"
            disabled={busy}
            onClick={send}
            className="cursor-pointer px-5 font-semibold"
          >
            {renew ? t('home.access.renewButton') : t('home.access.button')}
          </Button>
        </div>
      </div>
    </div>
  );
}
