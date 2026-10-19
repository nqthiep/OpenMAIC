import { describe, expect, it } from 'vitest';
import {
  cleanViewSearch,
  continueCourses,
  facetCounts,
  DEFAULT_VIEW,
  filterCourses,
  foldText,
  isFiltered,
  isNew,
  lengthOf,
  parseView,
  sortAfterTyping,
  SUBJECT_FILTERS,
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
  {
    ...course('a', 'Đạo hàm cơ bản', 'preview', 10),
    hasQuiz: true,
    hasInteractive: false,
    tags: ['subject:math', 'grade:12', 'topic:math.derivative'],
  },
  {
    ...course('b', 'Phân số', 'shared', 5),
    hasQuiz: false,
    hasInteractive: true,
    updatedAt: '2026-10-14T00:00:00Z',
    tags: ['subject:math', 'grade:10'],
  },
  course('c', 'Tích phân', 'shared'),
  {
    ...course('d', 'Hàm số bậc hai', 'shared', 20),
    hasQuiz: true,
    hasInteractive: true,
    updatedAt: '2026-10-16T00:00:00Z',
    tags: ['subject:physics', 'grade:11', 'grade:12'],
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

describe('subject, grade and topic filters', () => {
  it('match a course tagged with any chosen value, and never match an untagged course', () => {
    expect(ids(filterCourses(courses, view({ subject: ['math'] }), progress))).toEqual(['a', 'b']);
    expect(ids(filterCourses(courses, view({ subject: ['math', 'physics'] }), progress))).toEqual([
      'a',
      'b',
      'd',
    ]);
    expect(ids(filterCourses(courses, view({ grade: ['12'] }), progress))).toEqual(['a', 'd']);
    expect(ids(filterCourses(courses, view({ grade: ['10', '11'] }), progress))).toEqual([
      'b',
      'd',
    ]);
    // The untagged course 'c' is in the unfiltered list only.
    expect(ids(filterCourses(courses, view({}), progress))).toContain('c');
  });

  it('combine: groups are "and", values in a group are "or"', () => {
    expect(
      ids(filterCourses(courses, view({ subject: ['math'], grade: ['12'] }), progress)),
    ).toEqual(['a']);
    const topic = view({ subject: ['math'], topic: ['math.derivative'] });
    expect(ids(filterCourses(courses, topic, progress))).toEqual(['a']);
  });
});

describe('the "not classified" subject', () => {
  it('matches the courses that have no subject tag, alone or with real subjects', () => {
    expect(ids(filterCourses(courses, view({ subject: ['none'] }), progress))).toEqual(['c']);
    expect(ids(filterCourses(courses, view({ subject: ['none', 'physics'] }), progress))).toEqual([
      'c',
      'd',
    ]);
    // A course with only a grade tag has no subject either.
    const gradeOnly = [{ ...courses[2]!, courseId: 'g', tags: ['grade:12'] }];
    expect(ids(filterCourses(gradeOnly, view({ subject: ['none'] }), progress))).toEqual(['g']);
  });

  it('is counted like a subject, is kept in the address, and has no topics', () => {
    const counts = facetCounts(courses, view({}), progress, 'subject', SUBJECT_FILTERS);
    expect(counts.get('none')).toBe(1);
    expect(parseView('subject=none').subject).toEqual(['none']);
    expect(parseView('subject=none&topic=math.limits').topic).toEqual([]);
    expect(viewSearch(view({ subject: ['none'] }))).toBe('subject=none');
  });
});

describe('isNew', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  it('is true for a change within 14 days and false for older, future or missing dates', () => {
    expect(isNew('2026-10-19T00:00:00Z', now)).toBe(true);
    expect(isNew('2026-10-05T12:00:00Z', now)).toBe(true);
    expect(isNew('2026-10-05T11:59:00Z', now)).toBe(false);
    expect(isNew('2026-10-20T00:00:00Z', now)).toBe(false);
    expect(isNew(undefined, now)).toBe(false);
    expect(isNew('not a date', now)).toBe(false);
  });
});

describe('sorting by match', () => {
  const titled = ['Chuyển động lập phương', 'Định luật áp suất', 'Áp suất chất lỏng'].map(
    (title, index) => course(`m${index}`, title),
  );

  it('puts titles that start with the search first, then word starts, then the rest', () => {
    expect(ids(sortCourses(titled, 'match', new Map(), 'ap'))).toEqual(['m2', 'm1', 'm0']);
    // A to Z would put the middle one last.
    expect(ids(sortCourses(titled, 'title', new Map(), 'ap'))).toEqual(['m2', 'm0', 'm1']);
  });

  it('starts when the learner begins to search from the default order and stops with the search', () => {
    expect(sortAfterTyping('title', '', 'a')).toBe('match');
    expect(sortAfterTyping('match', 'a', 'ab')).toBe('match');
    expect(sortAfterTyping('match', 'a', '  ')).toBe('title');
    // A sort the learner picked stays.
    expect(sortAfterTyping('short', '', 'a')).toBe('short');
    expect(sortAfterTyping('updated', 'a', '')).toBe('updated');
  });

  it('is dropped when the filters are cleared', () => {
    expect(withoutFilters(view({ q: 'ap', sort: 'match' })).sort).toBe('title');
    expect(withoutFilters(view({ q: 'ap', sort: 'updated' })).sort).toBe('updated');
  });
});

describe('facetCounts', () => {
  it('counts what each value would show with the other filters as they are', () => {
    const subjects = ['math', 'physics', 'chemistry'];
    expect([...facetCounts(courses, view({}), progress, 'subject', subjects)]).toEqual([
      ['math', 2],
      ['physics', 1],
      ['chemistry', 0],
    ]);
    // With grade 12 chosen only 'a' (math) and 'd' (physics) are left.
    expect([
      ...facetCounts(courses, view({ grade: ['12'] }), progress, 'subject', subjects),
    ]).toEqual([
      ['math', 1],
      ['physics', 1],
      ['chemistry', 0],
    ]);
    expect([
      ...facetCounts(courses, view({ subject: ['math'] }), progress, 'grade', ['10', '11', '12']),
    ]).toEqual([
      ['10', 1],
      ['11', 0],
      ['12', 1],
    ]);
  });

  it('does not let a chosen topic hide the other subjects', () => {
    const chosen = view({ subject: ['math'], topic: ['math.derivative'] });
    expect(
      facetCounts(courses, chosen, progress, 'subject', ['math', 'physics']).get('physics'),
    ).toBe(1);
    expect(
      facetCounts(courses, chosen, progress, 'topic', ['math.derivative', 'math.limits']),
    ).toEqual(
      new Map([
        ['math.derivative', 1],
        ['math.limits', 0],
      ]),
    );
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
    for (const patch of [{ subject: ['math'] }, { grade: ['12'] }, { topic: ['math.limits'] }]) {
      expect(isFiltered(view(patch as Partial<CatalogView>))).toBe(true);
    }
    expect(isFiltered(view({ q: ' ' }))).toBe(false);
    expect(isFiltered(wanted)).toBe(true);
  });

  it('keeps parameters that are not the view (the invite code) and replaces the view ones', () => {
    expect(viewSearch(view({ q: 'x' }), 'join=ABC&q=old&sort=short')).toBe('join=ABC&q=x');
  });

  it('round-trips the tag filters and keeps a topic only while its own single subject is chosen', () => {
    const tagged = view({ subject: ['math'], grade: ['11', '12'], topic: ['math.derivative'] });
    expect(parseView(viewSearch(tagged))).toEqual(tagged);
    expect(viewSearch(tagged)).toContain('subject=math');
    expect(parseView('topic=math.derivative').topic).toEqual([]);
    expect(parseView('subject=math,physics&topic=math.derivative').topic).toEqual([]);
    expect(parseView('subject=physics&topic=math.derivative').topic).toEqual([]);
    expect(parseView('subject=art&grade=9').subject).toEqual([]);
    expect(parseView('subject=art&grade=9').grade).toEqual([]);
    expect(cleanViewSearch('subject=math&grade=12&topic=math.limits,math.limits&x=1')).toBe(
      'subject=math&grade=12&topic=math.limits',
    );
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
