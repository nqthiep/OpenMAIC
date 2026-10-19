'use client';

import Link from 'next/link';
import { ArrowRight, ListChecks, MousePointerClick } from 'lucide-react';
import { CourseProgressLine } from '@/components/home/course-progress-line';
import { GLASS } from '@/components/home/site-shell';
import type { CatalogEntry, ProgressRow } from '@/components/learning/learning-api';
import { useTagLine } from '@/components/learning/tag-names';
import { isNew } from '@/lib/home/catalog-filter';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const KIND_TEXT: Record<CatalogEntry['kind'], string> = {
  preview: 'text-violet-700 dark:text-violet-300',
  shared: 'text-emerald-700 dark:text-emerald-300',
  class: 'text-sky-700 dark:text-sky-300',
};

/**
 * One course as a line of the compact list: the title, then what kind it is, how long, what it
 * holds, when it changed and how far the learner got, all on one wrapping line of small text.
 * Many courses fit one screen this way, which a grid of covers cannot do.
 */
export function CourseRow({
  entry,
  href,
  progress,
  now,
}: {
  entry: CatalogEntry;
  href: string;
  progress?: ProgressRow;
  /** The time to judge "new" against, in milliseconds; without it no course is marked new. */
  now?: number;
}) {
  const { t, locale } = useI18n();
  const tagLine = useTagLine(entry.tags);

  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="line-clamp-1 break-words text-sm font-medium">{entry.title}</span>
          {now !== undefined && isNew(entry.updatedAt, now) ? (
            <span className="shrink-0 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
              {t('catalog.new')}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className={cn('font-medium', KIND_TEXT[entry.kind])}>
            {t(`catalog.kind.${entry.kind}`)}
          </span>
          {tagLine ? <span>{tagLine}</span> : null}
          {entry.sceneCount ? (
            <span>{t('catalog.sceneCount', { count: entry.sceneCount })}</span>
          ) : null}
          {entry.hasQuiz ? (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" aria-hidden="true" />
              {t('catalog.content.quiz')}
            </span>
          ) : null}
          {entry.hasInteractive ? (
            <span className="inline-flex items-center gap-1">
              <MousePointerClick className="size-3.5" aria-hidden="true" />
              {t('catalog.content.interactive')}
            </span>
          ) : null}
          {entry.updatedAt ? (
            <span>
              {t('catalog.updatedOn', {
                date: new Date(entry.updatedAt).toLocaleDateString(locale),
              })}
            </span>
          ) : null}
          {progress ? <CourseProgressLine row={progress} sceneCount={entry.sceneCount} /> : null}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
        {t('catalog.open')}
        <ArrowRight
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

/** The frame of the compact list: one card with a rule between the rows. */
export function CourseRows({ children }: { children: React.ReactNode }) {
  return (
    <ul className={cn('flex flex-col divide-y divide-border overflow-hidden rounded-2xl', GLASS)}>
      {children}
    </ul>
  );
}
