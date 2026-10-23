'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/hooks/use-i18n';

const INTENTS = ['i1', 'i2', 'i3'] as const;
const FEATURES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const;
const TRUST = ['t1', 't2', 't3', 't4'] as const;

/**
 * The guest home as plain text, for what reads the server's HTML without running scripts: search
 * engines that do not render, link previews, readers. The home waits for the account session before
 * it shows anything, so the server's HTML would otherwise be an empty bar. Screen-reader-only: a
 * signed-in learner sees the bar while the session loads, and the guest page replaces this text with
 * the same words, laid out. Keep the keys in step with `guest-home.tsx`.
 */
export function HomeSeoContent() {
  const { t } = useI18n();
  return (
    <div className="sr-only">
      <h1>{t('home.slogan').replace(' · ', '. ')}</h1>
      <p>{t('home.guest.lead')}</p>
      <p>{t('home.guest.description')}</p>
      <h2>{t('home.guest.intents.title')}</h2>
      <p>{t('home.guest.intents.subtitle')}</p>
      {INTENTS.map((key) => (
        <section key={key}>
          <h3>{t(`home.guest.intents.${key}.title`)}</h3>
          <p>{t(`home.guest.intents.${key}.body`)}</p>
        </section>
      ))}
      <h2>{t('home.guest.features.title')}</h2>
      {FEATURES.map((key) => (
        <section key={key}>
          <h3>{t(`home.guest.features.${key}.title`)}</h3>
          <p>{t(`home.guest.features.${key}.body`)}</p>
        </section>
      ))}
      <h2>{t('home.guest.trust.title')}</h2>
      {TRUST.map((key) => (
        <section key={key}>
          <h3>{t(`home.guest.trust.${key}.title`)}</h3>
          <p>{t(`home.guest.trust.${key}.body`)}</p>
        </section>
      ))}
      <nav>
        <Link href="/catalog">{t('home.guest.browseCatalog')}</Link>
        <Link href="/terms">{t('home.guest.footerTerms')}</Link>
        <Link href="/privacy">{t('home.guest.footerPrivacy')}</Link>
      </nav>
    </div>
  );
}
