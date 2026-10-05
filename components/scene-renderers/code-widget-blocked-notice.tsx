'use client';

import { useI18n } from '@/lib/hooks/use-i18n';

/** Static placeholder shown instead of a blocked `code` widget. No iframe, no script. */
export function CodeWidgetBlockedNotice({ compact = false }: { readonly compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 text-center bg-muted text-muted-foreground"
    >
      <p className={compact ? 'text-xs' : 'text-base font-medium'}>{t('subject.tutor.blocked')}</p>
      {!compact && <p className="text-sm">{t('subject.tutor.blockedHint')}</p>}
    </div>
  );
}
