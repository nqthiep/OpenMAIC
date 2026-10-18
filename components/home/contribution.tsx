'use client';

import { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { fetchContribution, type Contribution } from '@/components/learning/learning-api';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** How many of the learner's shared courses the block lists. */
const SHARES_SHOWN = 5;

/**
 * What the learner has given and earned by sharing courses: how many are shared or waiting,
 * how many members read them, the reward tokens of this month, the badges, and how far the next
 * badge is. Renders nothing for a learner who has shared nothing and earned nothing, and when
 * the figures cannot be read.
 */
export function ContributionBlock() {
  const { t, locale } = useI18n();
  const signedIn = useAccountSession()?.authenticated === true;
  const [data, setData] = useState<Contribution | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    fetchContribution()
      .then((next) => {
        if (current) setData(next);
      })
      .catch(() => {
        // The home works without it; nothing is shown.
      });
    return () => {
      current = false;
    };
  }, [signedIn]);

  if (!data) return null;
  const { shares, readers, bonus, badges, next } = data;
  if (shares.length === 0 && badges.length === 0 && bonus.tokens === 0) return null;

  const shared = shares.filter((share) => share.state === 'shared').length;
  const pending = shares.filter((share) => share.state === 'pending').length;
  const number = (value: number) => value.toLocaleString(locale);
  // A badge code with no label of its own shows as the code, so a new threshold never shows a bare key.
  const badgeName = (code: string) => {
    const key = `home.contribution.badge.${code}`;
    const text = t(key);
    return text === key ? code : text;
  };
  const stats = [
    { label: t('home.contribution.shared'), value: number(shared) },
    ...(pending > 0 ? [{ label: t('home.contribution.pending'), value: number(pending) }] : []),
    { label: t('home.contribution.readers'), value: number(readers) },
    {
      label: t('home.contribution.bonus'),
      value: t('home.contribution.bonusValue', {
        tokens: number(bonus.tokens),
        cap: number(bonus.cap),
      }),
    },
  ];

  return (
    <section className="mt-8 flex w-full flex-col gap-3" aria-label={t('home.contribution.title')}>
      <SectionTitle>{t('home.contribution.title')}</SectionTitle>
      <div className={cn(GLASS, 'flex flex-col gap-5 rounded-3xl p-5')}>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={cn(
                'flex flex-col gap-1 rounded-2xl p-4',
                index === stats.length - 1
                  ? 'bg-brand-yellow/20 dark:bg-brand-yellow/15'
                  : 'bg-brand-50 dark:bg-white/5',
              )}
            >
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="text-xl font-bold tabular-nums text-brand-800 dark:text-white">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
        {(badges.length > 0 || next) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {badges.length > 0 && (
              <span className="text-muted-foreground">{t('home.contribution.badges')}</span>
            )}
            {badges.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-medium text-amber-900 dark:text-amber-200"
              >
                <Award className="size-3.5" aria-hidden="true" />
                {badgeName(code)}
              </span>
            ))}
            {next && (
              <span className="text-muted-foreground">
                {t('home.contribution.next', {
                  count: number(next.readersNeeded),
                  badge: badgeName(next.code),
                })}
              </span>
            )}
          </div>
        )}
        {shares.length > 0 && (
          <ul className="flex flex-col divide-y divide-border/50 text-xs">
            {shares.slice(0, SHARES_SHOWN).map((share) => (
              <li key={share.courseId} className="flex items-center justify-between gap-3 py-1.5">
                <span className="truncate text-foreground">{share.title}</span>
                {share.state === 'rejected' ? (
                  <span className="min-w-0 shrink text-right text-red-600 dark:text-red-400">
                    {share.reason
                      ? t('home.contribution.rejectedWithReason', { reason: share.reason })
                      : t('home.contribution.rejected')}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground">
                    {share.state === 'pending'
                      ? t('home.contribution.pending')
                      : t('home.contribution.readersOf', { count: number(share.readers) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
