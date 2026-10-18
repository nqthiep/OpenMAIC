'use client';

import { BadgeCheck, CirclePause, TriangleAlert, type LucideIcon } from 'lucide-react';
import { LockedNotice } from '@/components/capability/locked-notice';
import { ContactAdminButton } from '@/components/support/support-inbox';
import { RenewButton } from '@/components/home/renew-button';
import { nextMonthStart, type MembershipNoticeKind } from '@/lib/home/learner-status';
import type { MembershipStatus } from '@/lib/home/use-membership-status';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** When the monthly allowance starts again, written for the reader's locale (the server counts by UTC month). */
function allowanceResetDate(locale: string): string {
  return nextMonthStart(new Date()).toLocaleDateString(locale, { timeZone: 'UTC' });
}

const TONE: Record<MembershipNoticeKind, { icon: LucideIcon; box: string }> = {
  none: { icon: BadgeCheck, box: '' },
  // The strip sits on the blue band of the home: the calm state is glass, the warnings are solid
  // so they stay readable and stand out.
  ok: { icon: BadgeCheck, box: 'border-white/25 bg-white/15 text-white' },
  expiring: {
    icon: TriangleAlert,
    box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-200',
  },
  quotaNear: {
    icon: TriangleAlert,
    box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-200',
  },
  quotaOut: {
    icon: TriangleAlert,
    box: 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/70 dark:text-red-200',
  },
  expired: {
    icon: CirclePause,
    box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-200',
  },
  suspended: {
    icon: CirclePause,
    box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-200',
  },
};

/**
 * One line above the composer about the membership: until when, how much of this month's AI
 * allowance is used, and a warning when the end date is near, the allowance is almost gone or
 * used up, or the membership has ended or is paused. Renders nothing for someone without a
 * membership, because the locked composer already says what to do.
 */
export function StatusStrip({ status }: { status: MembershipStatus }) {
  const { t, locale } = useI18n();
  const { membership, usage, notice } = status;
  if (notice.kind === 'none' || !membership) return null;

  const { icon: Icon, box } = TONE[notice.kind];
  const date = new Date(membership.expiresAt).toLocaleDateString(locale);
  const days = notice.daysLeft ?? 0;
  const message =
    notice.kind === 'ok'
      ? t('home.status.ok', { date, days })
      : notice.kind === 'expiring'
        ? t('home.status.expiring', { date, days })
        : notice.kind === 'quotaNear'
          ? t('home.status.quotaNear', { percent: notice.percentUsed ?? 0 })
          : notice.kind === 'quotaOut'
            ? t('home.status.quotaOut')
            : notice.kind === 'expired'
              ? t('home.status.expired', { date })
              : t('home.status.suspended');

  // The warnings that tell the learner to ask an administrator get a button to do it here.
  const contactSubject =
    notice.kind === 'expiring' || notice.kind === 'expired'
      ? t('support.subjects.renew')
      : notice.kind === 'suspended'
        ? t('support.subjects.resume')
        : notice.kind === 'quotaOut'
          ? t('support.subjects.quota')
          : undefined;

  const showMeter = notice.percentUsed !== undefined && usage?.active && usage.quota !== undefined;
  const limit = (usage?.quota ?? 0) + (usage?.bonus ?? 0);

  return (
    <div
      role={notice.kind === 'ok' ? undefined : 'status'}
      className={cn(
        'flex w-full items-center gap-4 rounded-2xl border px-5 py-3 text-sm backdrop-blur-md',
        box,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 leading-relaxed">{message}</p>
      {notice.kind === 'expiring' && <RenewButton />}
      {contactSubject !== undefined && <ContactAdminButton subject={contactSubject} />}
      {showMeter && (
        <div className="flex w-52 shrink-0 flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium">
            <span>{t('home.quota.label')}</span>
            <span className="tabular-nums">{notice.percentUsed}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={notice.percentUsed}
            aria-label={t('home.quota.used', {
              used: (usage?.used ?? 0).toLocaleString(locale),
              quota: limit.toLocaleString(locale),
            })}
            className={cn(
              'h-2 w-full overflow-hidden rounded-full',
              notice.kind === 'ok' ? 'bg-white/25' : 'bg-black/10 dark:bg-white/15',
            )}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                notice.kind === 'quotaOut'
                  ? 'bg-red-500'
                  : notice.kind === 'ok'
                    ? 'bg-brand-yellow'
                    : 'bg-amber-500',
              )}
              style={{ width: `${notice.percentUsed}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Shown in place of the composer when this month's AI allowance is used up. */
export function QuotaLock() {
  const { t, locale } = useI18n();
  return (
    <LockedNotice
      reason={t('home.locked.quota')}
      hint={t('home.locked.quotaReset', { date: allowanceResetDate(locale) })}
    />
  );
}
