'use client';

import { Lock } from 'lucide-react';
import { ContactAdminButton } from '@/components/support/support-inbox';
import { useI18n } from '@/lib/hooks/use-i18n';

/** The reason a feature is locked, and what to do next (by default, ask an administrator). Shown in place of a control the visitor may not use. */
export function LockedNotice({ reason, hint }: { reason: string; hint?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex w-full flex-col items-center gap-2 rounded-3xl border border-brand-100 bg-white px-6 py-8 text-center shadow-xl shadow-brand-800/10 dark:border-white/10 dark:bg-slate-900">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-yellow/25 text-amber-600 dark:text-brand-yellow">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <p className="text-base font-bold text-brand-800 dark:text-white">{reason}</p>
      <p className="text-sm text-muted-foreground">{hint ?? t('home.locked.contactAdmin')}</p>
      <ContactAdminButton className="mt-2" />
    </div>
  );
}
