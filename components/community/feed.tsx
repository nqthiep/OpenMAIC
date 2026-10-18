'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  MessageCircleQuestion,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { EmptyPane, QuestionThread } from '@/components/community/community';
import { useFailureToast } from '@/components/support/support-inbox';
import { GLASS } from '@/components/home/site-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  fetchCommunityScopes,
  fetchQuestions,
  type CommunityScope,
  type QuestionRow,
  type QuestionSort,
} from '@/components/learning/learning-api';
import {
  DEFAULT_FEED,
  FEED_SORTS,
  FEED_VIEWS,
  applyFeedState,
  foldText,
  groupByDay,
  isFiltered,
  parseFeedState,
  relativeTime,
  uniqueById,
  type FeedState,
} from '@/lib/community/feed-state';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

/** Questions per page, and the most a refresh after a change asks for at once. */
const PAGE = 25;
const RELOAD_MAX = 100;
const SEARCH_DELAY_MS = 250;

interface FeedData {
  /** The filters these rows answer; rows of another key are stale while the next ones load. */
  key: string;
  rows: QuestionRow[];
  hasMore: boolean;
  /** How many rows the server has handed out, repeats included: where the next page starts. */
  offset: number;
  /** When they were fetched, for the day groups and relative times. */
  at: number;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pl-2.5 pr-1 text-xs">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('community.feed.removeFilter', { name: label })}
        className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-muted"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  );
}

/** Opens a searchable list of the courses that have questions, with their scenes underneath. */
function ScopePicker({
  scopes,
  courseId,
  sceneId,
  onPick,
}: {
  scopes: CommunityScope[] | null;
  courseId: string | null;
  sceneId: string | null;
  onPick: (courseId: string | null, sceneId: string | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const course = scopes?.find((c) => c.courseId === courseId);
  const scene = course?.scenes.find((s) => s.sceneId === sceneId);
  const label = course
    ? scene
      ? `${course.title} › ${scene.title}`
      : course.title
    : (courseId ?? t('community.feed.scope.all'));
  const pick = (nextCourse: string | null, nextScene: string | null) => {
    onPick(nextCourse, nextScene);
    setOpen(false);
  };
  const openCount = (unsolved: number) =>
    unsolved > 0 ? (
      <span className="shrink-0 text-xs text-muted-foreground">
        {t('community.feed.scope.unsolved', { count: unsolved })}
      </span>
    ) : null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${t('community.feed.scope.label')}: ${label}`}
          className="w-full justify-start gap-2 font-normal"
        >
          <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command
          // Match without accents, on the course and scene titles, not on the item ids.
          filter={(_value, query, keywords) => {
            const wanted = foldText(query.trim());
            return !wanted || (keywords ?? []).some((k) => foldText(k).includes(wanted)) ? 1 : 0;
          }}
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('community.feed.scope.search')}
          />
          <CommandList>
            <CommandEmpty>{t('community.feed.scope.empty')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                keywords={[t('community.feed.scope.all')]}
                data-checked={courseId === null}
                onSelect={() => pick(null, null)}
              >
                <span className="min-w-0 flex-1 truncate">{t('community.feed.scope.all')}</span>
              </CommandItem>
            </CommandGroup>
            {scopes === null ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : (
              <CommandGroup heading={t('community.feed.scope.courses')}>
                {scopes.map((c) => (
                  <Fragment key={c.courseId}>
                    <CommandItem
                      value={`c:${c.courseId}`}
                      keywords={[c.title]}
                      data-checked={c.courseId === courseId && sceneId === null}
                      onSelect={() => pick(c.courseId, null)}
                    >
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      {openCount(c.unsolved)}
                    </CommandItem>
                    {/* Scenes show under the chosen course, and under every match while searching. */}
                    {c.courseId === courseId || search.trim() !== ''
                      ? c.scenes.map((s) => (
                          <CommandItem
                            key={s.sceneId}
                            value={`s:${c.courseId}:${s.sceneId}`}
                            keywords={[s.title, c.title]}
                            data-checked={c.courseId === courseId && s.sceneId === sceneId}
                            onSelect={() => pick(c.courseId, s.sceneId)}
                            className="pl-6 text-muted-foreground"
                          >
                            <span className="min-w-0 flex-1 truncate">{s.title}</span>
                            {openCount(s.unsolved)}
                          </CommandItem>
                        ))
                      : null}
                  </Fragment>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: QuestionSort;
  onChange: (sort: QuestionSort) => void;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={`${t('community.feed.sort.label')}: ${t(`community.feed.sort.${value}`)}`}
          className="gap-1 text-muted-foreground"
        >
          <ArrowUpDown aria-hidden="true" />
          {t(`community.feed.sort.${value}`)}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as QuestionSort)}
        >
          {FEED_SORTS.map((sort) => (
            <DropdownMenuRadioItem key={sort} value={sort}>
              {t(`community.feed.sort.${sort}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FeedRow({
  question,
  selected,
  at,
  time,
  hideCourse,
  hideScene,
  onSelect,
  onScope,
}: {
  question: QuestionRow;
  selected: boolean;
  at: number;
  time: string;
  hideCourse: boolean;
  hideScene: boolean;
  onSelect: (id: string) => void;
  onScope: (courseId: string, sceneId: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const solved = question.bestAnswerId !== null;
  // Only the AI has answered: a member can still add to it.
  const aiOnly = !solved && question.answerCount > 0 && question.humanAnswers === 0;
  const chip =
    'relative z-10 max-w-[10rem] cursor-pointer truncate rounded-full border px-2 py-px hover:bg-background';
  return (
    <li
      className={cn(
        'relative rounded-xl border px-3 py-2 text-sm transition-colors hover:bg-muted',
        selected ? 'border-primary bg-muted' : 'border-transparent',
        question.hidden && 'opacity-60',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(question.id)}
        aria-current={selected ? 'true' : undefined}
        className="flex w-full cursor-pointer items-start gap-2 text-left font-medium outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        <span className="min-w-0 flex-1">{question.title}</span>
        {solved ? (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-emerald-600"
            aria-label={t('community.solved')}
          />
        ) : null}
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {!hideCourse ? (
          <button type="button" className={chip} onClick={() => onScope(question.courseId, null)}>
            {question.courseTitle}
          </button>
        ) : null}
        {!hideScene && question.sceneTitle ? (
          <>
            {!hideCourse ? <ChevronRight className="size-3 shrink-0" aria-hidden="true" /> : null}
            <button
              type="button"
              className={chip}
              onClick={() => onScope(question.courseId, question.sceneId)}
            >
              {question.sceneTitle}
            </button>
          </>
        ) : null}
        <span>{t('community.answerCount', { count: question.answerCount })}</span>
        <span>{relativeTime(time, new Date(at), locale)}</span>
        {aiOnly ? (
          <Badge variant="outline" className="gap-1 text-violet-700 dark:text-violet-300">
            <Sparkles aria-hidden="true" />
            {t('community.feed.aiOnly')}
          </Badge>
        ) : null}
        {question.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
      </div>
    </li>
  );
}

/**
 * The community's questions: a list that narrows by course and scene, view, search and sort, and
 * the thread of the chosen question beside it. The filters live in the address bar
 * (`?course=&scene=&view=&sort=&q=&question=`), so a link opens the same list.
 */
export function CommunityFeed() {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [feed, setFeed] = useState<FeedState>(() =>
    typeof window === 'undefined' ? DEFAULT_FEED : parseFeedState(window.location.search),
  );
  const [searchInput, setSearchInput] = useState(feed.q);
  const [data, setData] = useState<FeedData | null>(null);
  const [scopes, setScopes] = useState<CommunityScope[] | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('question'),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const key = JSON.stringify(feed);

  const update = useCallback((patch: Partial<FeedState>) => {
    setFeed((current) => ({ ...current, ...patch }));
    if (patch.q !== undefined) setSearchInput(patch.q);
  }, []);

  const fetchPage = useCallback(
    (offset: number, limit: number) =>
      fetchQuestions({
        courseId: feed.courseId ?? undefined,
        sceneId: feed.sceneId ?? undefined,
        unsolved: feed.view === 'unsolved',
        mine: feed.view === 'mine',
        q: feed.q || undefined,
        sort: feed.sort,
        limit,
        offset,
      }),
    [feed],
  );

  // A new set of filters starts again from the first page.
  useEffect(() => {
    let active = true;
    fetchPage(0, PAGE)
      .then((next) => {
        if (active) {
          setData({
            key,
            rows: next.questions,
            hasMore: next.hasMore,
            offset: next.questions.length,
            at: Date.now(),
          });
        }
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [fetchPage, key, failure]);

  useEffect(() => {
    let active = true;
    fetchCommunityScopes()
      .then((next) => {
        if (active) setScopes(next.courses);
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [failure]);

  // Typing searches after a short pause; Enter searches at once.
  useEffect(() => {
    const next = searchInput.trim();
    if (next === feed.q) return;
    const timer = window.setTimeout(() => update({ q: next }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, feed.q, update]);

  // The address bar follows the filters and the open question.
  useEffect(() => {
    const url = new URL(window.location.href);
    applyFeedState(url.searchParams, feed);
    if (selected) url.searchParams.set('question', selected);
    else url.searchParams.delete('question');
    window.history.replaceState(null, '', url);
  }, [feed, selected]);

  // "/" jumps to the search box, as long as nothing else is being typed into.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // After an answer, a vote or a moderation the rows already shown are fetched again, and the
  // course counts with them.
  const reload = useCallback(async () => {
    try {
      const size = Math.min(RELOAD_MAX, Math.max(PAGE, data?.rows.length ?? 0));
      const [next, courses] = await Promise.all([fetchPage(0, size), fetchCommunityScopes()]);
      setData({
        key,
        rows: next.questions,
        hasMore: next.hasMore,
        offset: next.questions.length,
        at: Date.now(),
      });
      setScopes(courses.courses);
    } catch (error) {
      failure(error);
    }
  }, [data?.rows.length, fetchPage, key, failure]);

  const loadMore = async () => {
    if (!data || data.key !== key || moreBusy) return;
    setMoreBusy(true);
    try {
      const next = await fetchPage(data.offset, PAGE);
      setData((current) =>
        current?.key === key
          ? {
              ...current,
              rows: uniqueById([...current.rows, ...next.questions]),
              hasMore: next.hasMore,
              offset: current.offset + next.questions.length,
            }
          : current,
      );
    } catch (error) {
      failure(error);
    } finally {
      setMoreBusy(false);
    }
  };

  const course = scopes?.find((c) => c.courseId === feed.courseId);
  const scene = course?.scenes.find((s) => s.sceneId === feed.sceneId);
  const loading = data?.key !== key;
  const filtered = isFiltered(feed);
  const clearAll = () => update({ ...DEFAULT_FEED, sort: feed.sort });
  // Only the two time orders run in day order; the others would split a group into pieces.
  const byDay = feed.sort === 'active' || feed.sort === 'new';
  const groups = data
    ? byDay
      ? groupByDay(
          data.rows,
          (row) => (feed.sort === 'new' ? row.createdAt : row.lastActivityAt),
          new Date(data.at),
        )
      : [{ bucket: null, rows: data.rows }]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          'grid min-h-[32rem] max-h-[48rem] grid-cols-[22rem_1fr] grid-rows-[minmax(0,1fr)] gap-6 rounded-2xl p-6',
          GLASS,
        )}
      >
        <div className="flex min-h-0 flex-col gap-3 border-r pr-6">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: searchInput.trim() });
            }}
            className="relative"
          >
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchRef}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('community.feed.search')}
              aria-label={t('community.feed.search')}
              aria-keyshortcuts="/"
              maxLength={100}
              className="pl-8 pr-8"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => update({ q: '' })}
                aria-label={t('community.feed.clearSearch')}
                className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : (
              <kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border px-1.5 text-xs text-muted-foreground"
              >
                /
              </kbd>
            )}
          </form>
          <ScopePicker
            scopes={scopes}
            courseId={feed.courseId}
            sceneId={feed.sceneId}
            onPick={(courseId, sceneId) => update({ courseId, sceneId })}
          />
          <div className="flex gap-1" role="group" aria-label={t('community.feed.filter')}>
            {FEED_VIEWS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={feed.view === value ? 'secondary' : 'ghost'}
                aria-pressed={feed.view === value}
                onClick={() => update({ view: value })}
              >
                {t(`community.feed.${value}`)}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span aria-live="polite">
              {data && !loading
                ? t(data.hasMore ? 'community.feed.countMore' : 'community.feed.count', {
                    count: data.rows.length,
                  })
                : ''}
            </span>
            <SortMenu value={feed.sort} onChange={(sort) => update({ sort })} />
          </div>
          {filtered ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {feed.view !== 'all' ? (
                <FilterChip
                  label={t(`community.feed.${feed.view}`)}
                  onRemove={() => update({ view: 'all' })}
                />
              ) : null}
              {feed.courseId ? (
                <FilterChip
                  label={course?.title ?? feed.courseId}
                  onRemove={() => update({ courseId: null, sceneId: null })}
                />
              ) : null}
              {feed.sceneId ? (
                <FilterChip
                  label={scene?.title ?? feed.sceneId}
                  onRemove={() => update({ sceneId: null })}
                />
              ) : null}
              {feed.q ? (
                <FilterChip label={`“${feed.q}”`} onRemove={() => update({ q: '' })} />
              ) : null}
              <Button type="button" variant="link" size="xs" onClick={clearAll} className="px-1">
                {t('community.feed.clear')}
              </Button>
            </div>
          ) : null}
          <div
            className={cn('min-h-0 flex-1 overflow-y-auto', loading && data && 'opacity-60')}
            aria-busy={loading}
          >
            {data === null ? (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            ) : data.rows.length === 0 ? (
              <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
                <p>{t(filtered ? 'community.feed.noMatch' : 'community.empty')}</p>
                {filtered ? (
                  <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                    {t('community.feed.clear')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {groups.map((group) => (
                  <section key={group.bucket ?? 'all'} className="flex flex-col gap-1">
                    {group.bucket ? (
                      <h3 className="px-3 pt-1 text-xs font-medium text-muted-foreground">
                        {t(`community.feed.group.${group.bucket}`)}
                      </h3>
                    ) : null}
                    <ul className="flex flex-col gap-1.5">
                      {group.rows.map((question) => (
                        <FeedRow
                          key={question.id}
                          question={question}
                          selected={selected === question.id}
                          at={data.at}
                          time={feed.sort === 'new' ? question.createdAt : question.lastActivityAt}
                          hideCourse={feed.courseId === question.courseId}
                          hideScene={feed.sceneId !== null && feed.sceneId === question.sceneId}
                          onSelect={setSelected}
                          onScope={(courseId, sceneId) => update({ courseId, sceneId })}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
                {data.hasMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={moreBusy || loading}
                    onClick={() => void loadMore()}
                    className="self-center"
                  >
                    {moreBusy ? t('common.loading') : t('community.feed.loadMore')}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
          {selected ? (
            <QuestionThread key={selected} questionId={selected} onChanged={reload} showLink />
          ) : (
            <EmptyPane
              icon={MessageCircleQuestion}
              lines={[t('community.feed.pick'), t('community.feed.howToAsk')]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
