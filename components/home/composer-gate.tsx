'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Gate } from '@/components/capability/gate';
import { AccessRequest } from '@/components/home/access-request';
import { QuotaLock } from '@/components/home/status-strip';
import type { MembershipStatus } from '@/lib/home/use-membership-status';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * The AI composer, or the lock in its place: the access request for a learner without a
 * membership, the allowance notice once the quota of the running cycle is used up. Shared by `/` and
 * `/workspace`, so a learner who types the workspace URL meets the same lock as on the home.
 */
export function ComposerGate({
  status,
  children,
}: {
  status: MembershipStatus;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Gate
      capability="generate"
      locked={
        <div className="flex w-full flex-col items-center gap-3">
          <AccessRequest kind={status.notice.kind} />
          {/* The free previews need no membership; say where they are. */}
          <Link
            href="/catalog"
            className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-brand-800 shadow-md shadow-brand-800/10 transition-colors hover:bg-brand-50 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
          >
            {t('home.locked.previews')}
          </Link>
        </div>
      }
      blocked={
        status.notice.kind === 'quotaOut' ? (
          <QuotaLock resetAt={status.usage?.cycleEnd} />
        ) : undefined
      }
    >
      {children}
    </Gate>
  );
}
