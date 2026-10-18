import { describe, expect, it } from 'vitest';
import {
  cleanViewSearch,
  continueCourses,
  DEFAULT_VIEW,
  filterCourses,
  foldText,
  isFiltered,
  lengthOf,
  parseView,
  sortCourses,
  statusOf,
  withoutFilters,
  viewSearch,
  type CatalogCourse,
  type CatalogProgress,
  type CatalogView,
} from '@/lib/home/catalog-filter';

const course = (
  courseId: string,
  title: string,
  kind: CatalogCourse['kind'] = 'shared',
  sceneCount?: number,
): CatalogCourse => ({ courseId, title, kind, sceneCount });

const courses: CatalogCourse[] = [
  { ...course('a', 'Đạo hàm cơ bản', 'preview', 10), hasQuiz: true, hasInteractive: false },
  {
    ...course('b', 'Phân số', 'shared', 5),
    hasQuiz: false,
    hasInteractive: true,
    updatedAt: '2026-10-14T00:00:00Z',
  },
  course('c', 'Tích phân', 'shared'),
  {
    ...course('d', 'Hàm số bậc hai', 'shared', 20),
    hasQuiz: true,
    hasInteractive: true,
    updatedAt: '2026-10-16T00:00:00Z',
  },
];

const progress = new Map<string, CatalogProgress>([
  ['a', { doneAt: null, updatedAt: '2026-10-10T00:00:00Z' }],
  ['b', { doneAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' }],
  ['d', { doneAt: null, updatedAt: '2026-10-12T00:00:00Z' }],
]);

const view = (patch: Partial<CatalogView>): CatalogView => ({ ...DEFAULT_VIEW, ...patch });
const ids = (list: readonly CatalogCourse[]) => list.map((c) => c.courseId);

describe('foldText', () => {
  it('drops accents, including the Vietnamese d with a stroke', () => {
    expect(foldText('  Đạo HÀM  ')).toBe('dao ham');
    expect(foldText('Phân số')).toBe('phan so');
  });
});

describe('statusOf', () => {
  it('is new without a row, learning with an open row, done with doneAt', () => {
    expect(statusOf(undefined)).toBe('new');
    expect(statusOf(progress.get('a'))).toBe('learning');
    expect(statusOf(progress.get('b'))).toBe('done');
  });
});

describe('filterCourses', () => {
  it('finds a title typed without accents, any word order', () => {
    expect(ids(filterCourses(courses, view({ q: 'dao ham' }), progress))).toEqual(['a']);
    expect(ids(filterCourses(courses, view({ q: 'so bac' }), progress))).toEqual(['d']);
  });

  it('keeps all when the box is empty or blank', () => {
    expect(filterCourses(courses, view({ q: '   ' }), progress)).toHaveLength(4);
  });

  it('filters by status and kind together, several values meaning "or"', () => {
    expect(ids(filterCourses(courses, view({ status: ['new'] }), progress))).toEqual(['c']);
    expect(ids(filterCourses(courses, view({ status: ['learning', 'done'] }), progress))).toEqual([
      'a',
      'b',
      'd',
    ]);
    expect(
      ids(filterCourses(courses, view({ kind: ['shared'], status: ['learning'] }), progress)),
    ).toEqual(['d']);
  });
});

describe('lengthOf', () => {
  it('classes a course by its scene count, and says nothing when the count is unknown', () => {
    expect(lengthOf(1)).toBe('short');
    expect(lengthOf(5)).toBe('short');
    expect(lengthOf(6)).toBe('medium');
    expect(lengthOf(15)).toBe('medium');
    expect(lengthOf(16)).toBe('long');
    expect(lengthOf(undefined)).toBeUndefined();
  });
});

describe('content and length filters', () => {
  it('needs every chosen kind of content, and treats an unknown flag as not having it', () => {
    expect(ids(filterCourses(courses, view({ has: ['quiz'] }), progress))).toEqual(['a', 'd']);
    expect(ids(filterCourses(courses, view({ has: ['interactive'] }), progress))).toEqual([
      'b',
      'd',
    ]);
    expect(ids(filterCourses(courses, view({ has: ['quiz', 'interactive'] }), progress))).toEqual([
      'd',
    ]);
  });

  it('filters by length class; a course of unknown length matches none of them', () => {
    expect(ids(filterCourses(courses, view({ len: ['short'] }), progress))).toEqual(['b']);
    expect(ids(filterCourses(courses, view({ len: ['medium', 'long'] }), progress))).toEqual([
      'a',
      'd',
    ]);
  });

  it('combines with the other filters', () => {
    const narrow = view({ has: ['quiz'], len: ['long'], status: ['learning'] });
    expect(ids(filterCourses(courses, narrow, progress))).toEqual(['d']);
  });
});

describe('sortCourses', () => {
  it('sorts by title, by last studied (never studied last), and by length (unknown last)', () => {
    expect(ids(sortCourses(courses, 'title', progress))).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(sortCourses(courses, 'recent', progress))).toEqual(['d', 'b', 'a', 'c']);
    expect(ids(sortCourses(courses, 'short', progress))).toEqual(['b', 'a', 'd', 'c']);
  });

  it('sorts by last update, newest first, unknown last in A to Z order', () => {
    expect(ids(sortCourses(courses, 'updated', progress))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('does not change the list it was given', () => {
    const before = ids(courses);
    sortCourses(courses, 'short', progress);
    expect(ids(courses)).toEqual(before);
  });
});

describe('continueCourses', () => {
  it('lists the unfinished ones, newest first, up to the limit', () => {
    expect(ids(continueCourses(courses, progress))).toEqual(['d', 'a']);
    expect(ids(continueCourses(courses, progress, 1))).toEqual(['d']);
  });
});

describe('the address', () => {
  it('round-trips a view and leaves out the defaults', () => {
    const wanted = view({
      q: 'đạo hàm',
      status: ['learning', 'done'],
      kind: ['preview'],
      has: ['quiz', 'interactive'],
      len: ['short', 'long'],
      sort: 'updated',
      layout: 'list',
    });
    const search = viewSearch(wanted);
    expect(parseView(search)).toEqual(wanted);
    expect(viewSearch(DEFAULT_VIEW)).toBe('');
    expect(isFiltered(DEFAULT_VIEW)).toBe(false);
    expect(isFiltered(view({ sort: 'short', layout: 'list' }))).toBe(false);
    expect(isFiltered(view({ has: ['quiz'] }))).toBe(true);
    expect(isFiltered(view({ len: ['long'] }))).toBe(true);
    expect(withoutFilters(wanted)).toEqual({ ...DEFAULT_VIEW, sort: 'updated', layout: 'list' });
    expect(isFiltered(view({ q: ' ' }))).toBe(false);
    expect(isFiltered(wanted)).toBe(true);
  });

  it('keeps parameters that are not the view (the invite code) and replaces the view ones', () => {
    expect(viewSearch(view({ q: 'x' }), 'join=ABC&q=old&sort=short')).toBe('join=ABC&q=x');
  });

  it('ignores unknown values and over-long text', () => {
    const parsed = parseView(
      `status=bogus,done&kind=class&has=quiz,video&len=huge&layout=cube&sort=zzz&q=${'a'.repeat(300)}`,
    );
    expect(parsed.has).toEqual(['quiz']);
    expect(parsed.len).toEqual([]);
    expect(parsed.layout).toBe('grid');
    expect(parsed.status).toEqual(['done']);
    expect(parsed.kind).toEqual([]);
    expect(parsed.sort).toBe('title');
    expect(parsed.q).toHaveLength(100);
  });

  it('cleans a query that came from a link down to the view parameters', () => {
    expect(cleanViewSearch('q=hh&evil=1&sort=short&redirect=//x.test')).toBe('q=hh&sort=short');
    expect(cleanViewSearch('has=quiz&len=long&layout=list&x=1')).toBe(
      'has=quiz&len=long&layout=list',
    );
    expect(cleanViewSearch('')).toBe('');
  });
});
