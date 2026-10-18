'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, GraduationCap, Users } from 'lucide-react';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { fetchCatalog, fetchMyClasses, type ClassRow } from '@/components/learning/learning-api';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/**
 * The classes the learner belongs to, each with the courses attached to it. Renders nothing when
 * the learner has no class or the lists cannot be read, so a page without classes stays quiet.
 * A course attached by id has no title unless it was also shared; the catalog then returns the id
 * as its title, and the chip says "Course n" instead.
 */
export function MyClasses({
  courseHref = (courseId: string) => `/classroom/${courseId}`,
}: {
  /** Where a course chip opens; the catalog passes a URL whose back arrow returns to it. */
  courseHref?: (courseId: string) => string;
} = {}) {
  const { t } = useI18n();
  const [data, setData] = useState<{
    classes: ClassRow[];
    titles: Map<string, string>;
  } | null>(null);

  useEffect(() => {
    let current = true;
    Promise.all([fetchMyClasses(), fetchCatalog()])
      .then(([classes, catalog]) => {
        if (current) {
          setData({ classes, titles: new Map(catalog.courses.map((c) => [c.courseId, c.title])) });
        }
      })
      .catch(() => {
        // The home works without the class list; /catalog shows the same classes.
      });
    return () => {
      current = false;
    };
  }, []);

  if (!data || data.classes.length === 0) return null;

  return (
    <section className="mt-8 flex w-full flex-col gap-3" aria-label={t('home.classes.mine')}>
      <SectionTitle>{t('home.classes.mine')}</SectionTitle>
      <p className="text-sm text-muted-foreground">{t('home.myClasses.hint')}</p>
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
            </div>
            {row.courseIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('home.myClasses.noCourses')}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {row.courseIds.map((courseId, index) => {
                  const title = data.titles.get(courseId);
                  return (
                    <li key={courseId}>
                      <Link
                        href={courseHref(courseId)}
                        className="inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100 dark:border-white/10 dark:bg-white/5 dark:text-brand-100 dark:hover:bg-white/10"
                      >
                        <BookOpen
                          className="size-3.5 shrink-0 text-brand-600 dark:text-brand-300"
                          aria-hidden="true"
                        />
                        {title && title !== courseId
                          ? title
                          : t('home.myClasses.untitled', { number: index + 1 })}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
