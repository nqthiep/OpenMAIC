'use client';

import Link from 'next/link';
import { useBrand } from '@/lib/brand/brand-context';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** The links every page carries at its foot: the two legal texts and a way to write to us. */
export function LegalLinks({ className }: { className?: string }) {
  const { t } = useI18n();
  const { contactEmail } = useBrand();
  const link = 'transition-colors hover:text-foreground hover:underline underline-offset-4';
  return (
    <nav
      aria-label={t('home.guest.footerLegal')}
      className={cn('flex flex-wrap items-center justify-center gap-x-5 gap-y-1', className)}
    >
      <Link href="/terms" className={link}>
        {t('home.guest.footerTerms')}
      </Link>
      <Link href="/privacy" className={link}>
        {t('home.guest.footerPrivacy')}
      </Link>
      <a href={`mailto:${contactEmail}`} className={link}>
        {t('home.guest.footerContact')}
      </a>
    </nav>
  );
}
