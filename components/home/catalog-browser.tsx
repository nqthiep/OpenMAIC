'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List, Search, SearchX, X } from 'lucide-react';
import { CourseCard } from '@/components/home/course-card';
import { CourseProgressLine } from '@/components/home/course-progress-line';
import { CourseRow, CourseRows } from '@/components/home/course-row';
import { GLASS, Reveal } from '@/components/home/site-shell';
import type { CatalogEntry, ProgressRow } from '@/components/learning/learning-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CATALOG_CONTENT,
  CATALOG_KINDS,
  CATALOG_LENGTHS,
  CATALOG_SORTS,
  CATALOG_STATUSES,
  continueCourses,
  DEFAULT_VIEW,
  filterCourses,
  FILTER_THRESHOLD,
  isFiltered,
  LIST_PAGE_SIZE,
  MEDIUM_MAX,
  PAGE_SIZE,
  parseView,
  SHORT_MAX,
  sortCourses,
  viewSearch,
  withoutFilters,
  type CatalogLayout,
  type CatalogSort,
  type CatalogView,
} from '@/lib/home/catalog-filter';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pressed
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-brand-100 bg-white/70 text-foreground hover:bg-brand-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/**
 * The catalog's course list. With a dozen courses or fewer it is the plain grid. With more it
 * adds a search box (accent-insensitive), filters (status, kind, content, length), a sort order,
 * a grid or a compact list, a row of the courses the learner is in the middle of, and "show more"
 * in place of one endless grid. What the learner chose lives in the address
 * (`?q=&status=&kind=&has=&len=&sort=&layout=`), so a reload, a shared link and the back arrow
 * from a course all return to the same list.
 */
export function CatalogBrowser({
  courses,
  progress,
  href,
}: {
  /** The courses of the grid, already without the class courses. */
  courses: readonly CatalogEntry[];
  progress: ReadonlyMap<string, ProgressRow>;
  /** Where a course opens; `viewQuery` is the list's own query, for the back arrow to return to. */
  href: (courseId: string, viewQuery: string) => string;
}) {
  const { t } = useI18n();
  // Mounted only after the catalog loaded in the browser, so reading the address here cannot
  // differ between the server's page and the client's.
  const [view, setView] = useState<CatalogView>(() =>
    parseView(typeof window === 'undefined' ? '' : window.location.search),
  );
  // How many pages of the list are shown; "show more" adds one.
  const [pages, setPages] = useState(1);
  const showTools = courses.length > FILTER_THRESHOLD;
  const active = showTools ? view : DEFAULT_VIEW;
  const narrowed = isFiltered(active);
  const viewQuery = viewSearch(active);
  const compact = active.layout === 'list';
  const pageSize = compact ? LIST_PAGE_SIZE : PAGE_SIZE;
  const shown = pages * pageSize;

  const update = (patch: Partial<CatalogView>) => {
    setView((current) => ({ ...current, ...patch }));
    setPages(1);
  };
  const clearFilters = () => {
    setView(withoutFilters);
    setPages(1);
  };

  useEffect(() => {
    if (!showTools) return;
    const next = viewSearch(view, window.location.search);
    const { pathname, hash } = window.location;
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${next ? `?${next}` : ''}${hash}`,
    );
  }, [view, showTools]);

  // Colours follow the course's place in the whole list, so they do not change while filtering.
  const place = useMemo(() => new Map(courses.map((c, index) => [c.courseId, index])), [courses]);
  const list = useMemo(
    () => sortCourses(filterCourses(courses, active, progress), active.sort, progress),
    [courses, active, progress],
  );
  const resume = useMemo(
    () => (showTools && !narrowed ? continueCourses(courses, progress) : []),
    [courses, progress, showTools, narrowed],
  );
  const kinds = CATALOG_KINDS.filter((kind) => courses.some((c) => c.kind === kind));
  // Without stored course documents the server sends neither a length nor what a course holds.
  const knowsContent = courses.some((c) => c.hasQuiz !== undefined);
  const knowsLength = courses.some((c) => c.sceneCount !== undefined);

  if (courses.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {showTools ? (
        <div role="search" className={cn('flex flex-col gap-4 rounded-2xl p-4 md:p-5', GLASS)}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                aria-label={t('catalog.search.label')}
                placeholder={t('catalog.search.placeholder')}
                className="h-9 bg-white/70 pl-9 pr-9 dark:bg-slate-900/50"
                value={view.q}
                onChange={(event) => update({ q: event.target.value })}
              />
              {view.q !== '' ? (
                <button
                  type="button"
                  aria-label={t('catalog.search.clear')}
                  className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => update({ q: '' })}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <Select
              value={view.sort}
              onValueChange={(sort) => update({ sort: sort as CatalogSort })}
            >
              <SelectTrigger
                aria-label={t('catalog.sort.label')}
                className="w-44 cursor-pointer bg-white/70 dark:bg-slate-900/50"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATALOG_SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {t(`catalog.sort.${sort}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div
              role="group"
              aria-label={t('catalog.layout.label')}
              className="inline-flex overflow-hidden rounded-md border border-input bg-white/70 dark:bg-slate-900/50"
            >
              {(['grid', 'list'] as CatalogLayout[]).map((layout) => (
                <button
                  key={layout}
                  type="button"
                  aria-pressed={view.layout === layout}
                  aria-label={t(`catalog.layout.${layout}`)}
                  title={t(`catalog.layout.${layout}`)}
                  onClick={() => update({ layout })}
                  className={cn(
                    'grid size-9 cursor-pointer place-items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    view.layout === layout
                      ? 'bg-brand-600 text-white'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {layout === 'grid' ? (
                    <LayoutGrid className="size-4" aria-hidden="true" />
                  ) : (
                    <List className="size-4" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ChipGroup label={t('catalog.filter.status')}>
              {CATALOG_STATUSES.map((status) => (
                <Chip
                  key={status}
                  pressed={view.status.includes(status)}
                  onClick={() => update({ status: toggle(view.status, status) })}
                >
                  {t(`catalog.status.${status}`)}
                </Chip>
              ))}
            </ChipGroup>
            {kinds.length > 1 ? (
              <ChipGroup label={t('catalog.filter.kind')}>
                {kinds.map((kind) => (
                  <Chip
                    key={kind}
                    pressed={view.kind.includes(kind)}
                    onClick={() => update({ kind: toggle(view.kind, kind) })}
                  >
                    {t(`catalog.kind.${kind}`)}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
            {knowsContent ? (
              <ChipGroup label={t('catalog.filter.content')}>
                {CATALOG_CONTENT.map((content) => (
                  <Chip
                    key={content}
                    pressed={view.has.includes(content)}
                    onClick={() => update({ has: toggle(view.has, content) })}
                  >
                    {t(`catalog.content.${content}`)}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
            {knowsLength ? (
              <ChipGroup label={t('catalog.filter.length')}>
                {CATALOG_LENGTHS.map((len) => (
                  <Chip
                    key={len}
                    pressed={view.len.includes(len)}
                    onClick={() => update({ len: toggle(view.len, len) })}
                  >
                    {t(`catalog.length.${len}`, {
                      short: SHORT_MAX,
                      from: SHORT_MAX + 1,
                      to: MEDIUM_MAX,
                    })}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
            {narrowed ? (
              <Button variant="ghost" size="sm" className="cursor-pointer" onClick={clearFilters}>
                {t('catalog.clearFilters')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {resume.length > 0 ? (
        <section aria-labelledby="catalog-continue" className="flex flex-col gap-3">
          <h2 id="catalog-continue" className="text-sm font-semibold">
            {t('catalog.continue')}
          </h2>
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {resume.map((entry) => (
              <li key={entry.courseId}>
                <Link
                  href={href(entry.courseId, viewQuery)}
                  className={cn(
                    'flex h-full flex-col gap-1 rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    GLASS,
                  )}
                >
                  <span className="line-clamp-2 break-words text-sm font-medium">
                    {entry.title}
                  </span>
                  {progress.get(entry.courseId) ? (
                    <CourseProgressLine
                      row={progress.get(entry.courseId)!}
                      sceneCount={entry.sceneCount}
                    />
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {showTools ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t('catalog.results', { count: list.length })}
        </p>
      ) : null}

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-white/40 px-6 py-12 text-center dark:bg-white/[0.02]">
          <SearchX className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t('catalog.noMatch')}</p>
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={clearFilters}>
            {t('catalog.clearFilters')}
          </Button>
        </div>
      ) : compact ? (
        <CourseRows>
          {list.slice(0, shown).map((entry) => (
            <li key={entry.courseId}>
              <CourseRow
                entry={entry}
                href={href(entry.courseId, viewQuery)}
                progress={progress.get(entry.courseId)}
              />
            </li>
          ))}
        </CourseRows>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, shown).map((entry, index) => (
            <Reveal key={entry.courseId} delay={(index % 3) * 0.06}>
              <CourseCard
                entry={entry}
                index={place.get(entry.courseId) ?? 0}
                href={href(entry.courseId, viewQuery)}
                progress={progress.get(entry.courseId)}
              />
            </Reveal>
          ))}
        </div>
      )}

      {list.length > shown ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => setPages((count) => count + 1)}
          >
            {t('catalog.showMore', { count: Math.min(pageSize, list.length - shown) })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
