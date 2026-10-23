'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  Compass,
  DoorOpen,
  Download,
  Eye,
  GraduationCap,
  HeartHandshake,
  ListChecks,
  Mic,
  Play,
  Presentation,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Users,
} from 'lucide-react';
import { AccountDialog } from '@/components/account/account-dialog';
import { BRAND_GRADIENT, BrandArch, BrandDecor, Slogan } from '@/components/home/brand-band';
import { CourseCard } from '@/components/home/course-card';
import { GLASS, Reveal, SectionHeading, SiteShell } from '@/components/home/site-shell';
import { fetchCatalog, type CatalogEntry } from '@/components/learning/learning-api';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const PREVIEW_LIMIT = 6;

const NAV = [
  { id: 'story', key: 'story' },
  { id: 'features', key: 'features' },
  { id: 'how', key: 'how' },
  { id: 'previews', key: 'previews' },
  { id: 'membership', key: 'membership' },
] as const;

const FEATURES = [
  { key: 'f1', icon: Users },
  { key: 'f2', icon: Presentation },
  { key: 'f3', icon: ListChecks },
  { key: 'f4', icon: Mic },
  { key: 'f5', icon: GraduationCap },
  { key: 'f6', icon: Download },
] as const;

/** What a hesitant visitor wants to know first. Each line states something the service really does. */
const TRUST = [
  { key: 't1', icon: Compass },
  { key: 't2', icon: ShieldCheck },
  { key: 't3', icon: Eye },
  { key: 't4', icon: DoorOpen },
] as const;

const PERKS = ['p1', 'p2', 'p3', 'p4'] as const;

/**
 * The four tints of the brand board's icon tiles: steel blue, gold, teal and peach. A grid of six
 * cycles through them so no two neighbours, across or down, share one. Whole class names, because
 * Tailwind reads them from the source. The gold and peach tiles take navy icons.
 */
const TINTS = {
  steel: {
    card: 'from-brand-50 border-brand-100 dark:from-brand-600/15',
    tile: 'bg-brand-600 text-white shadow-brand-600/30',
  },
  gold: {
    card: 'from-brand-yellow/20 border-brand-yellow/40 dark:from-brand-yellow/10',
    tile: 'bg-brand-yellow text-brand-900 shadow-brand-yellow/40',
  },
  teal: {
    card: 'from-brand-teal/10 border-brand-teal/25 dark:from-brand-teal/15',
    tile: 'bg-brand-teal text-white shadow-brand-teal/30',
  },
  peach: {
    card: 'from-brand-peach/30 border-brand-peach/60 dark:from-brand-peach/10',
    tile: 'bg-brand-peach text-brand-900 shadow-brand-peach/50',
  },
} as const;
const FEATURE_TINTS = [TINTS.steel, TINTS.gold, TINTS.teal, TINTS.peach, TINTS.steel, TINTS.gold];

/** The three values of the brand board, with the ring color of each icon. */
const VALUES = [
  { key: 'v1', icon: Sunrise, ring: 'border-brand-yellow/60 text-brand-yellow' },
  { key: 'v2', icon: BrainCircuit, ring: 'border-brand-mint/50 text-brand-mint' },
  { key: 'v3', icon: HeartHandshake, ring: 'border-brand-mint/50 text-brand-mint' },
] as const;

/** The brand's character: a trait, and what it is not. */
const TRAITS = [
  { key: 'k1', dot: 'bg-brand-yellow' },
  { key: 'k2', dot: 'bg-brand-teal dark:bg-brand-mint' },
  { key: 'k3', dot: 'bg-brand-teal dark:bg-brand-mint' },
] as const;

/** A decorative classroom: slide, agents talking, playback bar. It is not a screenshot and not interactive. */
function ClassroomMock() {
  const { t } = useI18n();
  const reduced = useReducedMotion();

  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-violet-500/25 via-blue-500/10 to-transparent blur-2xl" />
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl shadow-2xl shadow-violet-500/15',
          GLASS,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
          <span className="flex gap-1.5">
            <i className="size-2.5 rounded-full bg-rose-400/70" />
            <i className="size-2.5 rounded-full bg-amber-400/70" />
            <i className="size-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-2 truncate text-xs text-muted-foreground">
            {t('home.guest.mock.title')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2 py-0.5 text-[10px] font-medium text-brand-teal-ink dark:text-brand-mint">
            <span className="size-1.5 rounded-full bg-brand-teal motion-safe:animate-pulse" />
            {t('home.guest.mock.live')}
          </span>
        </div>

        <div className="grid grid-cols-[1.5fr_1fr]">
          <div className="flex flex-col gap-4 bg-gradient-to-br from-violet-50/80 to-blue-50/60 p-5 dark:from-violet-500/10 dark:to-blue-500/5">
            <div className="h-3 w-2/3 rounded bg-foreground/15" />
            <div className="flex items-center gap-4">
              <div
                className="relative size-24 shrink-0 rounded-full ring-4 ring-white/70 dark:ring-white/10"
                style={{
                  background:
                    'conic-gradient(#4272ab 0 25%, #7a9fcb 25% 50%, #9db8d6 50% 75%, #c5d5e8 75% 100%)',
                }}
              >
                <span className="absolute inset-0 grid place-items-center text-sm font-semibold text-white drop-shadow">
                  ¼
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-2 w-full rounded bg-foreground/10" />
                <div className="h-2 w-5/6 rounded bg-foreground/10" />
                <div className="h-2 w-2/3 rounded bg-foreground/10" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {['#4272ab', '#7a9fcb', '#9db8d6', '#c5d5e8'].map((colour) => (
                <div key={colour} className="h-8 rounded-lg" style={{ background: colour }} />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-l border-border/50 bg-white/40 p-3 dark:bg-white/[0.02]">
            <div className="flex items-start gap-2">
              <img
                src="/avatars/teacher-sm.png"
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
              <p className="rounded-2xl rounded-tl-sm bg-violet-500/10 px-3 py-2 text-[11px] leading-snug">
                {t('home.guest.mock.teacher')}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <img
                src="/avatars/curious.png"
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
              <p className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-[11px] leading-snug">
                {t('home.guest.mock.student')}
              </p>
            </div>
            <div className="ml-9 flex gap-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="size-1.5 rounded-full bg-muted-foreground/40 motion-safe:animate-pulse"
                  style={{ animationDelay: `${dot * 200}ms` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border/50 px-4 py-2.5">
          <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
            <Play className="size-3 fill-current" />
          </span>
          <div className="h-1 flex-1 rounded-full bg-muted">
            <div className="h-full w-2/5 rounded-full bg-primary" />
          </div>
        </div>
      </div>

      <motion.div
        className={cn(
          'absolute -bottom-8 right-6 hidden items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium md:flex',
          GLASS,
        )}
        animate={reduced ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="grid size-6 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 text-white">
          <ListChecks className="size-3.5" />
        </span>
        {t('home.guest.chip3')}
      </motion.div>
    </div>
  );
}

/**
 * The home a visitor sees before signing in: what the service is, what it does, how to start, the
 * free previews, and what membership adds. Everything gated for a signed-in account stays off it.
 */
export function GuestHome({ registrationOpen }: { registrationOpen: boolean }) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previews, setPreviews] = useState<CatalogEntry[] | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchCatalog()
      .then((catalog) => {
        if (active) {
          setPreviews(
            catalog.courses.filter((entry) => entry.kind === 'preview').slice(0, PREVIEW_LIMIT),
          );
        }
      })
      .catch(() => {
        if (active) setPreviews([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const openSignIn = (event: React.MouseEvent<HTMLElement>) => {
    returnFocusTo.current = event.currentTarget;
    setDialogOpen(true);
  };

  const steps = [
    { title: t('home.guest.step1.title'), body: t('home.guest.step1.body') },
    // The dialog has a "create account" tab only while registration is open; the step says the same.
    registrationOpen
      ? { title: t('home.guest.step2.titleOpen'), body: t('home.guest.step2.bodyOpen') }
      : { title: t('home.guest.step2.title'), body: t('home.guest.step2.body') },
    { title: t('home.guest.step3.title'), body: t('home.guest.step3.body') },
  ];

  return (
    <SiteShell
      logoHref="#top"
      nav={NAV.map((item) => ({ href: `#${item.id}`, label: t(`home.guest.nav.${item.key}`) }))}
      mainClassName="gap-24 pb-24 pt-12 md:pt-20"
      bandClassName="h-[900px] lg:h-[640px]"
    >
      <section className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-6">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-medium text-white">
              <Sparkles className="size-3.5 text-brand-yellow" aria-hidden="true" />
              {t('home.guest.kicker')}
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="pb-1 text-4xl font-bold leading-[1.15] tracking-tight text-white md:text-5xl">
              <Slogan text={t('home.slogan')} />
            </h1>
          </Reveal>
          <Reveal delay={0.08}>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
              {(['p1', 'p2', 'p3'] as const).map((key, index) => (
                <li key={key} className="flex items-center gap-3">
                  {t(`home.guest.pillars.${key}`)}
                  {index < 2 ? (
                    <span aria-hidden="true" className="size-1 rounded-full bg-brand-yellow" />
                  ) : null}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-xl text-sm text-white/75 md:text-base">
              {t('home.guest.description')}
            </p>
          </Reveal>
          <Reveal delay={0.15} className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={openSignIn}
              className="cursor-pointer bg-white px-5 font-semibold text-brand-800 shadow-lg shadow-black/10 hover:bg-brand-50"
            >
              {t('home.guest.signIn')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="cursor-pointer border-white/40 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white dark:border-white/40 dark:bg-transparent dark:hover:bg-white/10"
            >
              <Link href="/catalog">{t('home.guest.browseCatalog')}</Link>
            </Button>
          </Reveal>
          <Reveal delay={0.2} className="flex flex-wrap gap-2">
            {[
              { icon: Users, label: t('home.guest.chip1') },
              { icon: Presentation, label: t('home.guest.chip2') },
              { icon: ListChecks, label: t('home.guest.chip3') },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-white"
              >
                <Icon className="size-3.5 text-brand-yellow" aria-hidden="true" />
                {label}
              </span>
            ))}
          </Reveal>
        </div>
        <Reveal delay={0.15}>
          <ClassroomMock />
        </Reveal>
      </section>

      <section id="story" className="flex scroll-mt-24 flex-col gap-5">
        <Reveal>
          <div
            className={cn(
              'relative overflow-hidden rounded-3xl border border-brand-teal/30 p-8 text-white shadow-2xl shadow-brand-900/25 md:p-12',
              BRAND_GRADIENT,
            )}
          >
            <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="flex flex-col gap-5">
                <p className="eyebrow text-brand-mint">{t('home.guest.story.eyebrow')}</p>
                <h2 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                  <Slogan text={t('home.guest.story.title')} />
                </h2>
                <div className="flex max-w-xl flex-col gap-3 text-sm leading-relaxed text-white/80 md:text-base">
                  <p>{t('home.guest.story.body1')}</p>
                  <p>{t('home.guest.story.body2')}</p>
                </div>
                <ul className="mt-2 grid gap-6 border-t border-white/15 pt-6 sm:grid-cols-3">
                  {VALUES.map(({ key, icon: Icon, ring }) => (
                    <li key={key} className="flex flex-col items-center gap-2 text-center">
                      <span
                        className={cn(
                          'grid size-14 place-items-center rounded-full border bg-white/5',
                          ring,
                        )}
                      >
                        <Icon className="size-6" aria-hidden="true" />
                      </span>
                      <h3 className="text-sm font-semibold">
                        {t(`home.guest.story.values.${key}.title`)}
                      </h3>
                      <p className="text-xs text-white/70">
                        {t(`home.guest.story.values.${key}.body`)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden justify-center lg:flex">
                <BrandArch className="h-72 w-auto" />
              </div>
            </div>
          </div>
        </Reveal>
        <ul className="grid gap-3 lg:grid-cols-3">
          {TRAITS.map(({ key, dot }, index) => (
            <li key={key}>
              <Reveal delay={index * 0.06}>
                <div
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-5 py-3 text-sm',
                    GLASS,
                  )}
                >
                  <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', dot)} />
                  <span className="font-semibold whitespace-nowrap">
                    {t(`home.guest.story.traits.${key}.name`)}
                  </span>
                  <span className="text-muted-foreground">
                    {t(`home.guest.story.traits.${key}.hint`)}
                  </span>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section id="trust" className="flex scroll-mt-24 flex-col gap-10">
        <Reveal>
          <SectionHeading
            title={t('home.guest.trust.title')}
            subtitle={t('home.guest.trust.subtitle')}
          />
        </Reveal>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ key, icon: Icon }, index) => (
            <Reveal key={key} delay={index * 0.06}>
              <article className={cn('flex h-full flex-col gap-3 rounded-2xl p-6', GLASS)}>
                <span className="grid size-10 place-items-center rounded-xl bg-brand-teal/10 text-brand-teal-ink dark:text-brand-mint">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-base font-semibold">{t(`home.guest.trust.${key}.title`)}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`home.guest.trust.${key}.body`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="features" className="flex scroll-mt-24 flex-col gap-10">
        <Reveal>
          <SectionHeading
            title={t('home.guest.features.title')}
            subtitle={t('home.guest.features.subtitle')}
          />
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {FEATURES.map(({ key, icon: Icon }, index) => (
            <Reveal key={key} delay={(index % 3) * 0.06}>
              <article
                className={cn(
                  'group h-full rounded-3xl bg-gradient-to-br to-white p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-900/15 dark:to-transparent',
                  GLASS,
                  FEATURE_TINTS[index % FEATURE_TINTS.length].card,
                )}
              >
                <span
                  className={cn(
                    'mb-4 grid size-12 place-items-center rounded-2xl shadow-lg',
                    FEATURE_TINTS[index % FEATURE_TINTS.length].tile,
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mb-1.5 text-base font-bold text-brand-800 dark:text-white">
                  {t(`home.guest.features.${key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t(`home.guest.features.${key}.body`)}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="how" className="flex scroll-mt-24 flex-col gap-10">
        <Reveal>
          <SectionHeading title={t('home.guest.stepsTitle')} />
        </Reveal>
        <ol className="relative grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <Reveal delay={index * 0.08} className="h-full">
                <div
                  className={cn(
                    'flex h-full flex-col items-center gap-3 rounded-3xl p-6 text-center',
                    GLASS,
                  )}
                >
                  <span className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-lg shadow-brand-600/30 ring-4 ring-brand-100 dark:ring-white/10">
                    {index + 1}
                  </span>
                  <h3 className="text-base font-bold text-brand-800 dark:text-white">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section id="previews" className="flex scroll-mt-24 flex-col gap-8">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            align="left"
            title={t('home.guest.previewsTitle')}
            subtitle={t('home.guest.previewsSubtitle')}
          />
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('home.guest.browseCatalog')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Reveal>

        {previews === null ? (
          <div className="grid gap-5 md:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((slot) => (
              <div key={slot} className="h-52 rounded-2xl bg-muted/60 motion-safe:animate-pulse" />
            ))}
          </div>
        ) : previews.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-white/40 px-6 py-14 text-center dark:bg-white/[0.02]">
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30">
              <BookOpen
                className="size-6 text-violet-600 dark:text-violet-300"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm text-muted-foreground">{t('home.guest.previewsEmpty')}</p>
            <Button asChild variant="outline" size="sm" className="cursor-pointer">
              <Link href="/catalog">{t('home.guest.browseCatalog')}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-3">
            {previews.map((entry, index) => (
              <Reveal key={entry.courseId} delay={(index % 3) * 0.06}>
                <CourseCard entry={entry} index={index} />
              </Reveal>
            ))}
            <Reveal delay={(previews.length % 3) * 0.06}>
              <Link
                href="/catalog"
                className="group flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-white/40 p-6 text-center transition-colors hover:border-violet-300 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-white/[0.02] dark:hover:bg-white/5"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30">
                  <BookOpen
                    className="size-5 text-violet-600 dark:text-violet-300"
                    aria-hidden="true"
                  />
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t('home.guest.browseCatalog')}
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </Reveal>
          </div>
        )}
      </section>

      <section id="membership" className="scroll-mt-24">
        <Reveal>
          <div className="rounded-3xl bg-gradient-to-br from-brand-500/60 via-brand-yellow/40 to-transparent p-px">
            <div className="grid gap-10 rounded-[calc(1.5rem-1px)] bg-white/90 p-8 backdrop-blur-xl md:grid-cols-[1.2fr_0.8fr] md:p-10 dark:bg-slate-900/90">
              <div className="flex flex-col gap-5">
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-brand-yellow/25 px-3 py-1 text-xs font-medium text-brand-900 dark:bg-brand-yellow/15 dark:text-brand-yellow">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  {t('home.guest.nav.membership')}
                </span>
                <h2 className="text-2xl font-bold tracking-tight text-brand-800 md:text-3xl dark:text-white">
                  {t('home.guest.membershipTitle')}
                </h2>
                <p className="text-sm text-muted-foreground md:text-base">
                  {t('home.guest.membershipBody')}
                </p>
                <ul className="flex flex-col gap-3">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-3 text-sm">
                      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-brand-teal-ink dark:text-brand-mint">
                        <Check className="size-3" aria-hidden="true" />
                      </span>
                      {t(`home.guest.perks.${perk}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-center gap-6 rounded-2xl border border-violet-200/60 bg-violet-500/5 p-6 dark:border-violet-400/15">
                <div className="flex flex-col gap-2">
                  <GraduationCap
                    className="mb-1 size-7 text-violet-600 dark:text-violet-300"
                    aria-hidden="true"
                  />
                  <p className="text-sm font-medium">{t('home.locked.membership')}</p>
                  <p className="text-sm text-muted-foreground">{t('home.locked.contactAdmin')}</p>
                </div>
                <Button onClick={openSignIn} className="w-full cursor-pointer">
                  {t('home.guest.signIn')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section>
        <Reveal>
          <div
            className={cn(
              'relative overflow-hidden rounded-3xl px-8 py-16 text-center text-white shadow-2xl shadow-brand-800/25',
              BRAND_GRADIENT,
            )}
          >
            <div aria-hidden="true">
              <BrandDecor />
            </div>
            <div className="relative flex flex-col items-center gap-4">
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                {t('home.guest.cta.title')}
              </h2>
              <p className="max-w-xl text-sm text-white/85 md:text-base">
                {t('home.guest.cta.body')}
              </p>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Button
                  size="lg"
                  onClick={openSignIn}
                  className="cursor-pointer bg-white px-5 font-semibold text-brand-800 shadow-lg shadow-black/10 hover:bg-brand-50"
                >
                  {t('home.guest.signIn')}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="cursor-pointer border-white/40 bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/catalog">{t('home.guest.browseCatalog')}</Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        registrationOpen={registrationOpen}
        returnFocusTo={returnFocusTo}
      />
    </SiteShell>
  );
}
