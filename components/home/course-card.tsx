'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { CourseProgressLine } from '@/components/home/course-progress-line';
import { GLASS, THUMBNAILS } from '@/components/home/site-shell';
import type { CatalogEntry, ProgressRow } from '@/components/learning/learning-api';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const KIND_BADGE: Record<CatalogEntry['kind'], string> = {
  preview: 'text-violet-700',
  shared: 'text-emerald-700',
  class: 'text-sky-700',
};

/** One course as the visitor-facing pages show it: a coloured cover, what kind it is, and a way in. */
export function CourseCard({
  entry,
  index,
  href = `/classroom/${encodeURIComponent(entry.courseId)}`,
  progress,
}: {
  entry: CatalogEntry;
  index: number;
  /** Where the signed-in learner stopped; replaces the scene count. */
  progress?: ProgressRow;
  /** Where the card opens; the catalog passes a URL whose back arrow returns to it. */
  href?: string;
}) {
  const { t } = useI18n();

  return (
    <Link
      href={href}
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-2xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        GLASS,
      )}
    >
      <div
        className={cn(
          'relative aspect-[16/9] bg-gradient-to-br',
          THUMBNAILS[index % THUMBNAILS.length],
        )}
      >
        <BookOpen className="absolute bottom-3 right-4 size-14 text-white/25" aria-hidden="true" />
        <span
          className={cn(
            'absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium',
            KIND_BADGE[entry.kind],
          )}
        >
          {t(`catalog.kind.${entry.kind}`)}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-between gap-3 p-4">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 break-words text-sm font-medium">{entry.title}</span>
          {progress ? (
            <CourseProgressLine row={progress} sceneCount={entry.sceneCount} />
          ) : entry.sceneCount ? (
            <span className="text-xs text-muted-foreground">
              {t('catalog.sceneCount', { count: entry.sceneCount })}
            </span>
          ) : null}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
          {t('catalog.open')}
          <ArrowRight
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </div>
    </Link>
  );
}
