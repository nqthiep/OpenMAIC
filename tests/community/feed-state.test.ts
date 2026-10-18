import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEED,
  applyFeedState,
  dayBucket,
  foldText,
  groupByDay,
  isFiltered,
  parseFeedState,
  relativeTime,
  uniqueById,
} from '@/lib/community/feed-state';

describe('feed state in the address bar', () => {
  it('reads the defaults from an empty query and ignores bad values', () => {
    expect(parseFeedState('')).toEqual(DEFAULT_FEED);
    expect(parseFeedState('?view=nope&sort=nope&scene=s1')).toEqual(DEFAULT_FEED);
  });

  it('round-trips a full state and leaves other parameters alone', () => {
    const state = parseFeedState(
      '?tab=questions&view=unsolved&course=c1&scene=s1&sort=waiting&q=%20delta%20',
    );
    expect(state).toEqual({
      view: 'unsolved',
      courseId: 'c1',
      sceneId: 's1',
      sort: 'waiting',
      q: 'delta',
    });
    const params = new URLSearchParams('tab=questions&question=q9');
    applyFeedState(params, state);
    expect(params.toString()).toBe(
      'tab=questions&question=q9&view=unsolved&course=c1&scene=s1&sort=waiting&q=delta',
    );
    applyFeedState(params, DEFAULT_FEED);
    expect(params.toString()).toBe('tab=questions&question=q9');
  });

  it('drops a scene that has no course', () => {
    const params = new URLSearchParams();
    applyFeedState(params, { ...DEFAULT_FEED, sceneId: 's1' });
    expect(params.toString()).toBe('');
  });

  it('counts a view, course, scene or search as a filter but not the sort', () => {
    expect(isFiltered(DEFAULT_FEED)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FEED, sort: 'new' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FEED, q: 'x' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_FEED, view: 'mine' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_FEED, courseId: 'c1' })).toBe(true);
  });
});

describe('day groups and times', () => {
  const now = new Date(2026, 9, 18, 15, 0, 0);
  const at = (day: number, hour = 12) => new Date(2026, 9, day, hour, 0, 0).toISOString();

  it('buckets by the calendar day, not by 24 hours', () => {
    expect(dayBucket(at(18, 0), now)).toBe('today');
    expect(dayBucket(at(17, 23), now)).toBe('week');
    expect(dayBucket(at(12), now)).toBe('week');
    expect(dayBucket(at(11, 23), now)).toBe('older');
  });

  it('groups sorted rows into runs', () => {
    const rows = [at(18), at(17), at(12), at(1), at(1, 1)].map((time, i) => ({
      id: `q${i}`,
      time,
    }));
    const groups = groupByDay(rows, (row) => row.time, now);
    expect(groups.map((g) => [g.bucket, g.rows.length])).toEqual([
      ['today', 1],
      ['week', 2],
      ['older', 2],
    ]);
  });

  it('writes a relative time for the last week and a date after that', () => {
    const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();
    expect(relativeTime(minutesAgo(12), now, 'en-US')).toBe('12 minutes ago');
    expect(relativeTime(minutesAgo(3 * 60), now, 'en-US')).toBe('3 hours ago');
    expect(relativeTime(minutesAgo(2 * 24 * 60), now, 'en-US')).toBe('2 days ago');
    expect(relativeTime(minutesAgo(30 * 24 * 60), now, 'en-US')).toBe(
      new Date(minutesAgo(30 * 24 * 60)).toLocaleDateString('en-US'),
    );
    // A clock a little ahead of the server never gives a negative time.
    expect(relativeTime(minutesAgo(-5), now, 'en-US')).toBe('this minute');
  });
});

describe('text helpers', () => {
  it('folds accents so a search without marks finds Vietnamese titles', () => {
    expect(foldText('Hàm số bậc hai — Đồ thị')).toBe('ham so bac hai — do thi');
    expect(foldText('Đ')).toBe('d');
  });

  it('keeps the first of repeated ids', () => {
    expect(
      uniqueById([
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
        { id: 'a', n: 3 },
      ]),
    ).toEqual([
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ]);
  });
});
