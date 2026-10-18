import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAllCourses } from '@/lib/server/learning/courses';

let db: PGlite;
let dir: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE document_stages (id TEXT PRIMARY KEY, name TEXT, updated_at DOUBLE PRECISION);
    CREATE TABLE stage_meta (stage_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, deleted_at TIMESTAMPTZ);
    INSERT INTO document_stages VALUES ('doc-live', 'Live lesson', 1790000000000), ('doc-gone', 'Gone', 1);
    INSERT INTO stage_meta VALUES ('doc-live', 'acct:a1', NULL), ('doc-gone', 'acct:a1', now());
  `);
  dir = await mkdtemp(path.join(tmpdir(), 'courses-'));
  await writeFile(
    path.join(dir, 'file-course.json'),
    JSON.stringify({ stage: { name: 'File lesson' } }),
  );
  await writeFile(
    path.join(dir, 'file-course.access.json'),
    JSON.stringify({ ownerId: 'acct:b2' }),
  );
  await writeFile(path.join(dir, 'broken.json'), '{not json');
});

afterAll(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('listAllCourses', () => {
  it('lists live documents and classroom files, without deleted or unreadable ones', async () => {
    const rows = await listAllCourses({ db, dir });
    expect(rows.map((r) => [r.courseId, r.title, r.ownerId]).sort()).toEqual([
      ['doc-live', 'Live lesson', 'acct:a1'],
      ['file-course', 'File lesson', 'acct:b2'],
    ]);
    expect(rows.find((r) => r.courseId === 'doc-live')?.updatedAt).toBe(
      new Date(1790000000000).toISOString(),
    );
  });

  it('still lists files when there are no document tables', async () => {
    const empty = new PGlite();
    const rows = await listAllCourses({ db: empty, dir });
    expect(rows.map((r) => r.courseId)).toEqual(['file-course']);
    await empty.close();
  });
});
