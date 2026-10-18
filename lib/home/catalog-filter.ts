/**
 * What the catalog shows when it holds many courses: search, filters, sort, and the address that
 * keeps them. Pure functions; the component reads the rows and the address, these decide.
 */

export type CatalogStatus = 'new' | 'learning' | 'done';
export type CatalogKind = 'preview' | 'shared';
export type CatalogSort = 'title' | 'updated' | 'recent' | 'short';
/** What a course must contain. */
export type CatalogContent = 'quiz' | 'interactive';
export type CatalogLength = 'short' | 'medium' | 'long';
export type CatalogLayout = 'grid' | 'list';

export interface CatalogCourse {
  readonly courseId: string;
  readonly title: string;
  readonly kind: 'preview' | 'shared' | 'class';
  readonly sceneCount?: number;
  /** When readers last got new content (ISO time). */
  readonly updatedAt?: string;
  readonly hasQuiz?: boolean;
  readonly hasInteractive?: boolean;
}

export interface CatalogProgress {
  readonly doneAt: string | null;
  readonly updatedAt: string;
}

export interface CatalogView {
  /** What the learner typed in the search box. */
  readonly q: string;
  /** Empty means all. */
  readonly status: readonly CatalogStatus[];
  readonly kind: readonly CatalogKind[];
  /** The course must have every one of these. */
  readonly has: readonly CatalogContent[];
  /** Empty means any length. */
  readonly len: readonly CatalogLength[];
  readonly sort: CatalogSort;
  readonly layout: CatalogLayout;
}

export const DEFAULT_VIEW: CatalogView = {
  q: '',
  status: [],
  kind: [],
  has: [],
  len: [],
  sort: 'title',
  layout: 'grid',
};

/** A course of up to this many scenes is short; up to `MEDIUM_MAX` is medium; more is long. */
export const SHORT_MAX = 5;
export const MEDIUM_MAX = 15;

/** Below this many courses the catalog stays a plain grid: a search box would be noise. */
export const FILTER_THRESHOLD = 12;

/** Courses shown at first, and added by each press of "Show more". */
export const PAGE_SIZE = 24;
/** The compact list shows more at a time: a row is a fraction of a card's height. */
export const LIST_PAGE_SIZE = 60;

export const CATALOG_STATUSES: readonly CatalogStatus[] = ['new', 'learning', 'done'];
export const CATALOG_KINDS: readonly CatalogKind[] = ['preview', 'shared'];
export const CATALOG_CONTENT: readonly CatalogContent[] = ['quiz', 'interactive'];
export const CATALOG_LENGTHS: readonly CatalogLength[] = ['short', 'medium', 'long'];
export const CATALOG_SORTS: readonly CatalogSort[] = ['title', 'updated', 'recent', 'short'];
const KEYS = ['q', 'status', 'kind', 'has', 'len', 'sort', 'layout'] as const;

/** Lower case without accents, so "dao ham" finds "Đạo hàm". `đ` has no decomposition, so it is mapped. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().trim();
}

export function statusOf(progress: CatalogProgress | undefined): CatalogStatus {
  if (!progress) return 'new';
  return progress.doneAt !== null ? 'done' : 'learning';
}

/** The length class of a course, or nothing when its scene count is not known. */
export function lengthOf(sceneCount: number | undefined): CatalogLength | undefined {
  if (sceneCount === undefined) return undefined;
  if (sceneCount <= SHORT_MAX) return 'short';
  return sceneCount <= MEDIUM_MAX ? 'medium' : 'long';
}

/** Every word typed must appear in the title, in any order. */
function matches(title: string, words: readonly string[]): boolean {
  const folded = foldText(title);
  return words.every((word) => folded.includes(word));
}

export function filterCourses<T extends CatalogCourse>(
  courses: readonly T[],
  view: CatalogView,
  progress: ReadonlyMap<string, CatalogProgress>,
): T[] {
  const words = foldText(view.q).split(/\s+/).filter(Boolean);
  return courses.filter(
    (course) =>
      matches(course.title, words) &&
      (view.kind.length === 0 || view.kind.includes(course.kind as CatalogKind)) &&
      (view.status.length === 0 || view.status.includes(statusOf(progress.get(course.courseId)))) &&
      view.has.every(
        (need) => (need === 'quiz' ? course.hasQuiz : course.hasInteractive) === true,
      ) &&
      (view.len.length === 0 || view.len.some((len) => len === lengthOf(course.sceneCount))),
  );
}

export function sortCourses<T extends CatalogCourse>(
  courses: readonly T[],
  sort: CatalogSort,
  progress: ReadonlyMap<string, CatalogProgress>,
): T[] {
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title);
  const studiedAt = (course: T) => Date.parse(progress.get(course.courseId)?.updatedAt ?? '') || 0;
  const copy = [...courses];
  if (sort === 'updated') {
    // A course with no known update goes last, in A to Z order.
    const changedAt = (course: T) => Date.parse(course.updatedAt ?? '') || 0;
    return copy.sort((a, b) => changedAt(b) - changedAt(a) || byTitle(a, b));
  }
  if (sort === 'recent') {
    // Courses never studied keep their A to Z order after the studied ones.
    return copy.sort((a, b) => studiedAt(b) - studiedAt(a) || byTitle(a, b));
  }
  if (sort === 'short') {
    // A course whose length is unknown goes last.
    const length = (course: T) => course.sceneCount ?? Number.POSITIVE_INFINITY;
    return copy.sort((a, b) => length(a) - length(b) || byTitle(a, b));
  }
  return copy.sort(byTitle);
}

/** The courses the learner started and has not finished, most recently studied first. */
export function continueCourses<T extends CatalogCourse>(
  courses: readonly T[],
  progress: ReadonlyMap<string, CatalogProgress>,
  limit = 4,
): T[] {
  return sortCourses(
    courses.filter((course) => statusOf(progress.get(course.courseId)) === 'learning'),
    'recent',
    progress,
  ).slice(0, limit);
}

/** Whether the search box or a filter narrows the list (the sort order and the layout do not). */
export function isFiltered(view: CatalogView): boolean {
  return (
    view.q.trim() !== '' ||
    view.status.length > 0 ||
    view.kind.length > 0 ||
    view.has.length > 0 ||
    view.len.length > 0
  );
}

/** The view with its search and filters cleared, keeping the sort order and the layout. */
export function withoutFilters(view: CatalogView): CatalogView {
  return { ...view, q: '', status: [], kind: [], has: [], len: [] };
}

function listOf<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  return allowed.filter((value) => (raw ?? '').split(',').includes(value));
}

/** Reads the view from an address query; anything unknown is ignored. */
export function parseView(search: string): CatalogView {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: listOf(params.get('status'), CATALOG_STATUSES),
    kind: listOf(params.get('kind'), CATALOG_KINDS),
    has: listOf(params.get('has'), CATALOG_CONTENT),
    len: listOf(params.get('len'), CATALOG_LENGTHS),
    sort: CATALOG_SORTS.find((value) => value === sort) ?? DEFAULT_VIEW.sort,
    layout: params.get('layout') === 'list' ? 'list' : 'grid',
  };
}

/**
 * Writes the view into an address query. Parameters that are not the view's (for example `join`)
 * are kept, and the view's own are left out when they have their default value.
 */
export function viewSearch(view: CatalogView, current = ''): string {
  const params = new URLSearchParams(current);
  for (const key of KEYS) params.delete(key);
  if (view.q.trim() !== '') params.set('q', view.q);
  if (view.status.length > 0) params.set('status', view.status.join(','));
  if (view.kind.length > 0) params.set('kind', view.kind.join(','));
  if (view.has.length > 0) params.set('has', view.has.join(','));
  if (view.len.length > 0) params.set('len', view.len.join(','));
  if (view.sort !== DEFAULT_VIEW.sort) params.set('sort', view.sort);
  if (view.layout !== DEFAULT_VIEW.layout) params.set('layout', view.layout);
  return params.toString();
}

/**
 * The view part of a query that came from a link (the classroom's back arrow carries one), as a
 * clean query string. Only the view's own parameters survive, so a link cannot add others.
 */
export function cleanViewSearch(search: string): string {
  return viewSearch(parseView(search));
}
