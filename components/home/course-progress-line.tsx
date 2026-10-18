'use client';

import { CheckCircle2 } from 'lucide-react';
import { summarizeProgress, type ProgressLike } from '@/lib/home/course-progress';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** "Cảnh 3 / 5" or a done mark, then the score of the last quiz when there is one. */
export function CourseProgressLine({
  row,
  sceneCount,
  className,
}: {
  row: ProgressLike;
  /** The course's scene count as the catalog gives it; the row's own count is used without it. */
  sceneCount?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const progress = summarizeProgress(row, sceneCount);

  return (
    <span
      className={cn(
        'flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground',
        className,
      )}
    >
      {progress.done ? (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          {t('courseProgress.done')}
        </span>
      ) : (
        <span className="tabular-nums">
          {t('home.continue.progress', { current: progress.current, total: progress.total })}
        </span>
      )}
      {progress.quizScore !== null ? (
        <span className="tabular-nums">
          {t('courseProgress.quizScore', { score: progress.quizScore })}
        </span>
      ) : null}
    </span>
  );
}
