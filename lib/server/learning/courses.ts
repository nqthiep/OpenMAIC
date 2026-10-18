import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';
import {
  CLASSROOMS_DIR,
  isValidClassroomId,
  readClassroomAccess,
} from '@/lib/server/classroom-storage';
import { getStageAccessDb, type StageAccessQueryable } from '@/lib/server/stage-access';

const log = createLogger('CourseList');

export interface CourseListRow {
  courseId: string;
  title: string;
  /** `acct:<id>` or `anon:<uuid>`; null for a classroom file with no recorded owner. */
  ownerId: string | null;
  updatedAt: string | null;
}

/**
 * Every course staff can open at `/classroom/<id>`: live server documents (not deleted) and stored
 * classroom files, the two sources the classroom page reads. A source that is missing (no server
 * persistence, no classrooms folder) contributes nothing.
 */
export async function listAllCourses(
  deps: { db?: StageAccessQueryable; dir?: string } = {},
): Promise<CourseListRow[]> {
  const rows = new Map<string, CourseListRow>();

  try {
    const db = deps.db ?? (await getStageAccessDb());
    const result = await db.query<{
      id: string;
      name: string | null;
      owner_id: string;
      updated_at: number | string | null;
    }>(
      `SELECT d.id, d.name, m.owner_id, d.updated_at
         FROM document_stages d
         JOIN stage_meta m ON m.stage_id = d.id
        WHERE m.deleted_at IS NULL`,
    );
    for (const row of result.rows) {
      rows.set(row.id, {
        courseId: row.id,
        title: row.name || row.id,
        ownerId: row.owner_id,
        updatedAt: row.updated_at === null ? null : new Date(Number(row.updated_at)).toISOString(),
      });
    }
  } catch (error) {
    log.warn('Course documents unavailable', error instanceof Error ? error.message : error);
  }

  const dir = deps.dir ?? CLASSROOMS_DIR;
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // ponytail: parses each classroom file for its title; fine for tens of files, index titles if it grows.
  for (const name of names) {
    if (!name.endsWith('.json') || name.endsWith('.access.json')) continue;
    const id = name.slice(0, -'.json'.length);
    if (rows.has(id) || !isValidClassroomId(id)) continue;
    try {
      const file = path.join(dir, name);
      const [content, stat, access] = await Promise.all([
        fs.readFile(file, 'utf-8'),
        fs.stat(file),
        readClassroomAccess(id, dir),
      ]);
      const data = JSON.parse(content) as { stage?: { name?: string } };
      rows.set(id, {
        courseId: id,
        title: data.stage?.name || id,
        ownerId: access?.ownerId ?? null,
        updatedAt: stat.mtime.toISOString(),
      });
    } catch (error) {
      log.warn('Unreadable classroom file', name, error instanceof Error ? error.message : error);
    }
  }

  return [...rows.values()];
}
