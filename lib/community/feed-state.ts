/**
 * The state of the community feed and the small pure helpers around it: what the address bar
 * keeps (`view`, `course`, `scene`, `sort`, `q`), the day groups of the list, relative times, and
 * accent-insensitive text folding for the course picker.
 */
import type { QuestionSort } from '@/components/learning/learning-api';

export const FEED_VIEWS = ['all', 'unsolved', 'mine'] as const;
export type FeedView = (typeof FEED_VIEWS)[number];

export const FEED_SORTS: readonly QuestionSort[] = ['active', 'new', 'top', 'waiting'];

export interface FeedState {
  view: FeedView;
  courseId: string | null;
  /** Only meaningful with a course: scenes are not shared between courses. */
  sceneId: string | null;
  sort: QuestionSort;
  /** Words to search for, trimmed. */
  q: string;
}

export const DEFAULT_FEED: FeedState = {
  view: 'all',
  courseId: null,
  sceneId: null,
  sort: 'active',
  q: '',
};

const ID_MAX = 200;
const SEARCH_MAX = 100;

/** The feed state in a query string; unknown or missing values fall back to the defaults. */
export function parseFeedState(search: string): FeedState {
  const params = new URLSearchParams(search);
  const view = params.get('view');
  const sort = params.get('sort');
  const courseId = params.get('course')?.slice(0, ID_MAX) || null;
  return {
    view: FEED_VIEWS.includes(view as FeedView) ? (view as FeedView) : DEFAULT_FEED.view,
    courseId,
    sceneId: courseId ? params.get('scene')?.slice(0, ID_MAX) || null : null,
    sort: FEED_SORTS.includes(sort as QuestionSort) ? (sort as QuestionSort) : DEFAULT_FEED.sort,
    q: (params.get('q') ?? '').trim().slice(0, SEARCH_MAX),
  };
}

/** Writes the state into `params`, dropping the defaults and leaving every other parameter alone. */
export function applyFeedState(params: URLSearchParams, state: FeedState): void {
  const entries: [string, string | null][] = [
    ['view', state.view === DEFAULT_FEED.view ? null : state.view],
    ['course', state.courseId],
    ['scene', state.courseId ? state.sceneId : null],
    ['sort', state.sort === DEFAULT_FEED.sort ? null : state.sort],
    ['q', state.q || null],
  ];
  for (const [key, value] of entries) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
}

/** Whether anything narrows the list (the sort does not). */
export function isFiltered(state: FeedState): boolean {
  return (
    state.view !== DEFAULT_FEED.view ||
    state.courseId !== null ||
    state.sceneId !== null ||
    state.q !== ''
  );
}

export type DayBucket = 'today' | 'week' | 'older';

/** Today, the six days before it, or older, by the viewer's calendar. */
export function dayBucket(iso: string, now: Date): DayBucket {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const time = new Date(iso).getTime();
  if (time >= startOfToday.getTime()) return 'today';
  const weekStart = new Date(startOfToday);
  weekStart.setDate(weekStart.getDate() - 6);
  return time >= weekStart.getTime() ? 'week' : 'older';
}

/**
 * Splits rows into day groups, keeping their order. The rows must already be sorted by `time`,
 * newest first, so that each group is one run.
 */
export function groupByDay<T>(
  rows: readonly T[],
  time: (row: T) => string,
  now: Date,
): { bucket: DayBucket; rows: T[] }[] {
  const groups: { bucket: DayBucket; rows: T[] }[] = [];
  for (const row of rows) {
    const bucket = dayBucket(time(row), now);
    const last = groups[groups.length - 1];
    if (last?.bucket === bucket) last.rows.push(row);
    else groups.push({ bucket, rows: [row] });
  }
  return groups;
}

/** "12 minutes ago" for the last week, then the date. */
export function relativeTime(iso: string, now: Date, locale: string): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (minutes < 60) return format.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return format.format(-days, 'day');
  return new Date(iso).toLocaleDateString(locale);
}

/** Lower case without accents, so "ham so" finds "Hàm số". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Rows with every later repeat of an id dropped. */
export function uniqueById<T extends { id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)));
}
