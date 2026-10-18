/**
 * What the home and the catalog say about a learner's progress in a course they read but did not
 * write. Pure functions: the components fetch the rows, these decide what to show.
 */

export interface ProgressLike {
  readonly courseId: string;
  readonly sceneIndex: number;
  readonly sceneCount: number;
  readonly quizScore: number | null;
  readonly doneAt: string | null;
  readonly updatedAt: string;
}

export interface ProgressSummary {
  /** The scene the learner is on, never past `total`. */
  readonly current: number;
  /** The course's scene count: the catalog's when known (the course may have grown), else the row's. */
  readonly total: number;
  readonly done: boolean;
  readonly quizScore: number | null;
}

export function summarizeProgress(row: ProgressLike, catalogSceneCount?: number): ProgressSummary {
  const total = Math.max(catalogSceneCount ?? row.sceneCount, 1);
  return {
    current: Math.min(row.sceneIndex, total),
    total,
    done: row.doneAt !== null,
    quizScore: row.quizScore,
  };
}

export interface ContinueTarget {
  readonly courseId: string;
  readonly title: string;
  readonly current: number;
  readonly total: number;
  /** When the learner last moved, in milliseconds since the epoch. */
  readonly at: number;
}

/**
 * The course to offer under "Continue" among the ones the learner reads but does not own: the one
 * studied last that still has scenes ahead. Courses in `libraryIds` are the home's own business
 * (it reads their position from this device), a course the catalog no longer lists is not
 * reachable, and a course whose name is unknown (the catalog falls back to its id) is skipped
 * rather than shown as a raw id. `catalog` maps a course id to its title and scene count.
 */
export function pickRemoteContinue(
  rows: readonly ProgressLike[],
  libraryIds: ReadonlySet<string>,
  catalog: ReadonlyMap<string, { title: string; sceneCount?: number }>,
): ContinueTarget | undefined {
  let best: ContinueTarget | undefined;
  for (const row of rows) {
    const entry = catalog.get(row.courseId);
    if (!entry || libraryIds.has(row.courseId) || entry.title === row.courseId) continue;
    const { current, total } = summarizeProgress(row, entry.sceneCount);
    const at = Date.parse(row.updatedAt);
    if (current >= total || !(at > (best?.at ?? -Infinity))) continue;
    best = { courseId: row.courseId, title: entry.title, current, total, at };
  }
  return best;
}
