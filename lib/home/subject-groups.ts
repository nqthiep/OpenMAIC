import type { FolderRecord } from '@/lib/types/folder';

export interface SubjectGroup<T> {
  /** The folder that stands for the subject; absent for courses that are not filed. */
  readonly folder?: FolderRecord;
  readonly courses: readonly T[];
}

/** The chosen folder id when that folder still exists, else undefined (a deleted folder files nothing). */
export function knownFolderId(
  folders: readonly FolderRecord[],
  id: string | null | undefined,
): string | undefined {
  return id && folders.some((f) => f.id === id) ? id : undefined;
}

/**
 * The learner's courses grouped by subject. A course has no subject field, so a subject is a
 * folder. Folders follow their own order and are left out when empty; courses with no folder, or
 * whose folder is gone, come last. Courses keep the order they came in.
 */
export function groupBySubject<T extends { folderId?: string }>(
  courses: readonly T[],
  folders: readonly FolderRecord[],
): SubjectGroup<T>[] {
  const known = new Set(folders.map((f) => f.id));
  const groups = [...folders]
    .sort((a, b) => a.order - b.order)
    .map((folder) => ({ folder, courses: courses.filter((c) => c.folderId === folder.id) }))
    .filter((g) => g.courses.length > 0);
  const unfiled = courses.filter((c) => c.folderId === undefined || !known.has(c.folderId));
  return unfiled.length > 0 ? [...groups, { courses: unfiled }] : groups;
}
