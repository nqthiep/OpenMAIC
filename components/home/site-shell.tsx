'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Settings } from 'lucide-react';
import { AccountControl } from '@/components/account/account-control';
import { SettingsDialog } from '@/components/settings';
import { ThemeToggle } from '@/components/home/theme-toggle';
import { BrandBand } from '@/components/home/brand-band';
import { LegalLinks } from '@/components/legal/legal-links';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useBrand } from '@/lib/brand/brand-context';
import { BrandImage } from '@/components/brand/brand-image';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import {
  guestSectionLinks,
  isActiveNavLink,
  siteHomeHref,
  siteNavLinks,
} from '@/lib/home/site-nav';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** Frosted card surface shared by every panel on the visitor-facing pages. */
export const GLASS =
  'border border-brand-900/10 bg-white shadow-lg shadow-brand-900/[0.06] dark:border-brand-teal/30 dark:bg-brand-900/75 dark:shadow-black/30 dark:backdrop-blur-sm';

/** One gradient per course card, so a row of courses does not look like copies of one another. */
export const THUMBNAILS = [
  'from-brand-400 to-brand-600',
  'from-brand-600 to-brand-800',
  'from-sky-500 to-brand-700',
  'from-brand-500 to-brand-800',
  'from-cyan-500 to-brand-600',
  'from-brand-500 to-brand-700',
];

/** Fades a block in as it scrolls into view. Renders plainly when the visitor prefers less motion. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  align = 'center',
}: {
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
}) {
  return (
    <div className={cn('flex flex-col gap-2', align === 'center' && 'items-center text-center')}>
      <h2 className="text-2xl font-bold tracking-tight text-brand-800 md:text-3xl dark:text-white">
        {title}
      </h2>
      <span aria-hidden="true" className="h-1 w-12 rounded-full bg-brand-yellow" />
      {subtitle ? (
        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{subtitle}</p>
      ) : null}
    </div>
  );
}

export interface ShellNavItem {
  href: string;
  label: string;
}

const NAV_LINK =
  'whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The sticky top bar every page outside the classroom and the workspace shares. Left: the logo
 * (to the visitor's home), then the main links for their role and any links to sections of this
 * page. Right: language, theme, provider settings (staff only) and the account menu.
 */
export function SiteHeader({
  nav = [],
  logoHref,
  className,
}: {
  /**
   * Links to sections of this page, after the main links on wide screens. Left out, a visitor who
   * is not signed in gets the sections of the home, on every page, so the bar does not change
   * from one page to the next.
   */
  nav?: ShellNavItem[];
  logoHref?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const brand = useBrand();
  const pathname = usePathname();
  const session = useAccountSession();
  const links = siteNavLinks(session);
  const isGuest = session?.enabled === true && !session.authenticated;
  const sections: ShellNavItem[] =
    nav.length > 0
      ? nav
      : isGuest
        ? guestSectionLinks(pathname).map((link) => ({ href: link.href, label: t(link.labelKey) }))
        : [];
  // Settings configures providers: staff only (and single-user mode). Learners never see it.
  const canOpenSettings = session?.capabilities?.viewProviders === true;
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-brand-100 bg-white/90 shadow-sm shadow-brand-800/5 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80',
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-5 md:px-8">
        <a
          href={logoHref ?? siteHomeHref(session)}
          aria-label={brand.productName}
          className="shrink-0"
        >
          <BrandImage kind="logo" alt={brand.productName} className="h-7 w-auto" />
        </a>
        <nav aria-label={t('nav.main')} className="hidden min-w-0 items-center gap-1 md:flex">
          {session === undefined ? (
            // The first answer of the server is on its way (a first load; a page reached by a link
            // starts from the last answer). Hold the links' places, so the bar does not grow.
            <span aria-hidden="true" className="flex items-center gap-2 motion-safe:animate-pulse">
              <span className="h-6 w-20 rounded-full bg-black/5 dark:bg-white/10" />
              <span className="mx-1 hidden h-4 w-px bg-border lg:block" />
              {[16, 24, 20, 20, 20].map((width, index) => (
                <span
                  key={index}
                  style={{ width: `${width * 4}px` }}
                  className="hidden h-6 rounded-full bg-black/5 lg:block dark:bg-white/10"
                />
              ))}
            </span>
          ) : null}
          {links.map((link) => {
            const active = isActiveNavLink(link.href, pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  NAV_LINK,
                  active
                    ? 'bg-brand-50 font-medium text-brand-700 dark:bg-white/10 dark:text-white'
                    : 'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
                )}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
          {sections.length > 0 ? (
            <span className="hidden items-center gap-1 lg:flex">
              {links.length > 0 ? (
                <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
              ) : null}
              {sections.map((item) => {
                const className = cn(
                  NAV_LINK,
                  'text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10',
                );
                return item.href.startsWith('#') ? (
                  <a key={item.href} href={item.href} className={className}>
                    {item.label}
                  </a>
                ) : (
                  <Link key={item.href} href={item.href} className={className}>
                    {item.label}
                  </Link>
                );
              })}
            </span>
          ) : null}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-gray-100/50 bg-white/60 px-2 py-1.5 shadow-sm backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-800/60">
          <LanguageSwitcher />
          <span className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <ThemeToggle />
          {canOpenSettings ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label={t('settings.title')}
              title={t('settings.title')}
              className="cursor-pointer rounded-full p-2 text-gray-400 transition-colors hover:bg-white hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <Settings className="size-4" aria-hidden="true" />
            </button>
          ) : null}
          <AccountControl />
        </div>
      </div>
      {canOpenSettings ? (
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      ) : null}
    </header>
  );
}

/**
 * The frame of a visitor-facing page: an optional navy band behind the first block, a sticky header
 * with the logo, optional anchor links and the language, theme and account controls, and the
 * footer. The home and the catalog both use it, so they look and behave as one product.
 */
export function SiteShell({
  nav = [],
  logoHref,
  mainClassName,
  bandClassName,
  children,
}: {
  nav?: ShellNavItem[];
  logoHref?: string;
  mainClassName?: string;
  /** Height class of the navy band behind the first block; the band is left out when absent. */
  bandClassName?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const brand = useBrand();

  return (
    <div id="top" className="relative min-h-dvh w-full overflow-x-hidden bg-background">
      {bandClassName ? <BrandBand className={cn('inset-x-0 top-14', bandClassName)} /> : null}

      <SiteHeader nav={nav} logoHref={logoHref} />

      <main
        className={cn(
          'relative mx-auto flex w-full max-w-6xl flex-col px-5 md:px-8',
          mainClassName,
        )}
      >
        {children}
      </main>

      <footer className="relative border-t border-border/40 py-8">
        <div className="mx-auto mb-6 flex w-full max-w-6xl flex-col items-center gap-2 px-5 md:px-8">
          <p className="flex w-full items-center gap-4 text-xs font-medium tracking-[0.3em] text-foreground">
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-gradient-to-r from-transparent to-border"
            />
            {brand.domain.toUpperCase()}
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-gradient-to-l from-transparent to-border"
            />
          </p>
          <p className="eyebrow text-center text-[0.6875rem] text-muted-foreground">
            {t('home.slogan')}
          </p>
          <LegalLinks className="mt-2 text-xs text-muted-foreground" />
        </div>
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 text-xs text-muted-foreground md:flex-row md:px-8">
          <span className="flex items-center gap-2">
            <BrandImage kind="mark" alt="" className="size-5" />
            {t('home.guest.footerTagline')}
          </span>
          <nav className="flex items-center gap-5">
            <Link href="/catalog" className="transition-colors hover:text-foreground">
              {t('catalog.title')}
            </Link>
            <Link href="/community" className="transition-colors hover:text-foreground">
              {t('community.title')}
            </Link>
            <a
              href="https://github.com/THU-MAIC/OpenMAIC"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {t('home.guest.footerSource')}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
