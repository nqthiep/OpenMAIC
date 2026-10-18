'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, GraduationCap, LogOut, Users } from 'lucide-react';
import { toast } from 'sonner';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CourseProgressLine } from '@/components/home/course-progress-line';
import {
  fetchCatalog,
  fetchMyClasses,
  fetchProgress,
  leaveClass,
  type ClassRow,
  type ProgressRow,
} from '@/components/learning/learning-api';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/**
 * The classes the learner belongs to. A class is a set of courses a teacher picked, so each card
 * says so, lists the courses in order with an "open" button, and lets the learner leave. Renders
 * nothing when the learner has no class or the lists cannot be read, so a page without classes
 * stays quiet. A course attached by id and never shared has no title; the chip then says
 * "Course n".
 */
export function MyClasses({
  courseHref = (courseId: string) => `/classroom/${courseId}`,
}: {
  /** Where a course opens; the catalog passes a URL whose back arrow returns to it. */
  courseHref?: (courseId: string) => string;
} = {}) {
  const { t } = useI18n();
  const [data, setData] = useState<{
    classes: ClassRow[];
    titles: Map<string, string>;
    sceneCounts: Map<string, number>;
    progress: Map<string, ProgressRow>;
  } | null>(null);
  // The class the learner asked to leave, waiting for confirmation.
  const [leaving, setLeaving] = useState<ClassRow | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([fetchMyClasses(), fetchCatalog()])
      .then(async ([classes, catalog]) => {
        // Progress is a nicety: the rows show without it.
        const courseIds = [...new Set(classes.flatMap((row) => row.courseIds))];
        const progress = courseIds.length > 0 ? await fetchProgress(courseIds).catch(() => []) : [];
        if (current) {
          setData({
            classes,
            titles: new Map(catalog.courses.map((c) => [c.courseId, c.title])),
            sceneCounts: new Map(
              catalog.courses.flatMap((c) => (c.sceneCount ? [[c.courseId, c.sceneCount]] : [])),
            ),
            progress: new Map(progress.map((row) => [row.courseId, row])),
          });
        }
      })
      .catch(() => {
        // The home works without the class list; /catalog shows the same classes.
      });
    return () => {
      current = false;
    };
  }, []);

  const confirmLeave = async () => {
    const row = leaving;
    setLeaving(null);
    if (!row) return;
    try {
      await leaveClass(row.id);
      setData((prev) =>
        prev ? { ...prev, classes: prev.classes.filter((c) => c.id !== row.id) } : prev,
      );
      toast.success(t('home.myClasses.left', { name: row.name }));
    } catch {
      toast.error(t('learning.errors.generic'));
    }
  };

  if (!data || data.classes.length === 0) return null;

  return (
    <section className="mt-8 flex w-full flex-col gap-3" aria-label={t('home.classes.mine')}>
      <SectionTitle>{t('home.classes.mine')}</SectionTitle>
      <p className="text-sm text-muted-foreground">{t('home.myClasses.hint')}</p>
      <p className="text-xs text-muted-foreground">{t('home.myClasses.progressVisible')}</p>
      <ul className="flex flex-col gap-3">
        {data.classes.map((row) => (
          <li key={row.id} className={cn(GLASS, 'flex flex-col gap-4 rounded-3xl p-5')}>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/25">
                <GraduationCap className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-base font-bold text-brand-800 dark:text-white">
                {row.name}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 dark:bg-white/10 dark:text-brand-100">
                <Users className="size-3.5" aria-hidden="true" />
                {t('home.myClasses.members', { count: row.memberCount })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 cursor-pointer text-muted-foreground"
                onClick={() => setLeaving(row)}
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                {t('home.myClasses.leave')}
              </Button>
            </div>
            {row.courseIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('home.myClasses.noCourses')}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('home.myClasses.assigned', { count: row.courseIds.length })}
                </p>
                <ol className="flex flex-col gap-2">
                  {row.courseIds.map((courseId, index) => {
                    const title = data.titles.get(courseId);
                    const progress = data.progress.get(courseId);
                    return (
                      <li key={courseId}>
                        <Link
                          href={courseHref(courseId)}
                          className="group flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 transition-colors hover:bg-brand-100 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-xs font-bold text-brand-700 dark:bg-white/10 dark:text-brand-100">
                            {index + 1}
                          </span>
                          <BookOpen
                            className="size-4 shrink-0 text-brand-600 dark:text-brand-300"
                            aria-hidden="true"
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-sm font-medium text-brand-800 dark:text-brand-100">
                              {title && title !== courseId
                                ? title
                                : t('home.myClasses.untitled', { number: index + 1 })}
                            </span>
                            {progress ? (
                              <CourseProgressLine
                                row={progress}
                                sceneCount={data.sceneCounts.get(courseId)}
                              />
                            ) : null}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 dark:text-brand-200">
                            {t('home.myClasses.open')}
                            <ArrowRight
                              className="size-4 transition-transform group-hover:translate-x-0.5"
                              aria-hidden="true"
                            />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </li>
        ))}
      </ul>
      <AlertDialog open={leaving !== null} onOpenChange={(open) => !open && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('home.myClasses.leaveTitle', { name: leaving?.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('home.myClasses.leaveBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button className="cursor-pointer" onClick={() => void confirmLeave()}>
              {t('home.myClasses.leave')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
