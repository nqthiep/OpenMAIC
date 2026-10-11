import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

/**
 * Writes a JSON file only when nothing exists at `filePath`. The content is
 * staged in a temp file and hard-linked into place: link fails with EEXIST when
 * the target already exists, so two concurrent creators cannot both succeed,
 * and no reader sees a partially written file. Rejects with the EEXIST error
 * unchanged so callers can map it to a conflict.
 */
export async function writeJsonFileCreateOnly(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempFilePath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.link(tempFilePath, filePath);
  } finally {
    // Runs whether the write, the link, or neither failed, so no staging file is left behind.
    await fs.rm(tempFilePath, { force: true });
  }
}

export function isAlreadyExistsError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'EEXIST';
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

/** Allowlisted characters, capped length. Generated ids are UUIDs (36 characters). */
export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

/**
 * Resolve the on-disk JSON path for a classroom id, asserting the result stays
 * inside CLASSROOMS_DIR. The route validates ids up front, but storage must
 * not trust callers: an id carrying path separators (e.g. `..`) must never be
 * allowed to name a file outside the classrooms directory.
 */
export function resolveClassroomFilePath(id: string): string {
  const resolvedRoot = path.resolve(CLASSROOMS_DIR);
  const filePath = path.resolve(resolvedRoot, `${id}.json`);
  const rootPrefix = `${resolvedRoot}${path.sep}`;
  if (filePath !== resolvedRoot && !filePath.startsWith(rootPrefix)) {
    throw new Error(`Classroom id "${id}" resolves outside the classrooms directory`);
  }
  return filePath;
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  const filePath = resolveClassroomFilePath(id);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as PersistedClassroomData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Stores a classroom. By default an existing file with the same id is replaced,
 * which generation retries rely on. `createOnly` refuses to replace anything: it
 * rejects with EEXIST (see isAlreadyExistsError). Callers that accept ids from
 * clients must use it, because a client-chosen id can name another author's classroom.
 */
export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
  options: { createOnly?: boolean } = {},
): Promise<PersistedClassroomData & { url: string }> {
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  const filePath = resolveClassroomFilePath(data.id);
  await ensureClassroomsDir();
  if (options.createOnly) {
    await writeJsonFileCreateOnly(filePath, classroomData);
  } else {
    await writeJsonFileAtomic(filePath, classroomData);
  }

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
