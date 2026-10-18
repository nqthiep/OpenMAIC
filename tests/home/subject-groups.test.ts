import { describe, expect, it } from 'vitest';
import { groupBySubject, knownFolderId } from '@/lib/home/subject-groups';
import type { FolderRecord } from '@/lib/utils/database';

const folder = (id: string, order: number): FolderRecord => ({
  id,
  name: id,
  order,
  createdAt: 0,
  updatedAt: 0,
});
const course = (id: string, folderId?: string) => ({ id, folderId });

describe('groupBySubject', () => {
  it('puts each course under its folder, by folder order, unfiled last', () => {
    const groups = groupBySubject(
      [course('a', 'ly'), course('b'), course('c', 'toan'), course('d', 'ly')],
      [folder('ly', 2), folder('toan', 1)],
    );
    expect(groups.map((g) => [g.folder?.id, g.courses.map((c) => c.id)])).toEqual([
      ['toan', ['c']],
      ['ly', ['a', 'd']],
      [undefined, ['b']],
    ]);
  });

  it('leaves out folders with no course and treats a deleted folder as unfiled', () => {
    const groups = groupBySubject([course('a', 'gone')], [folder('empty', 1)]);
    expect(groups).toEqual([{ courses: [course('a', 'gone')] }]);
  });

  it('returns nothing for no courses', () => {
    expect(groupBySubject([], [folder('toan', 1)])).toEqual([]);
  });
});

describe('knownFolderId', () => {
  it('keeps an id whose folder exists and drops the rest', () => {
    const folders = [folder('toan', 1)];
    expect(knownFolderId(folders, 'toan')).toBe('toan');
    expect(knownFolderId(folders, 'gone')).toBeUndefined();
    expect(knownFolderId(folders, '')).toBeUndefined();
    expect(knownFolderId(folders, undefined)).toBeUndefined();
  });
});
