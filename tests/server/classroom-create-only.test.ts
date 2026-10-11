import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StorageModule = typeof import('@/lib/server/classroom-storage');

/** A stage with only the fields the storage layer reads. */
function stage(id: string, name: string) {
  return { id, name, createdAt: 0, updatedAt: 0 } as unknown as Parameters<
    StorageModule['persistClassroom']
  >[0]['stage'];
}

describe('classroom storage: create-only writes', () => {
  let root: string;
  let storage: StorageModule;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'classroom-create-only-'));
    // CLASSROOMS_DIR is computed from process.cwd() when the module loads.
    vi.resetModules();
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    storage = await import('@/lib/server/classroom-storage');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('writes a new classroom and refuses to replace it through createOnly', async () => {
    await storage.persistClassroom(
      { id: 'room-1', stage: stage('room-1', 'first'), scenes: [] },
      'http://localhost',
      { createOnly: true },
    );

    const error = await storage
      .persistClassroom(
        { id: 'room-1', stage: stage('room-1', 'second'), scenes: [] },
        'http://localhost',
        { createOnly: true },
      )
      .catch((caught: unknown) => caught);

    expect(storage.isAlreadyExistsError(error)).toBe(true);
    const onDisk = JSON.parse(
      await fs.readFile(storage.resolveClassroomFilePath('room-1'), 'utf-8'),
    );
    expect(onDisk.stage.name).toBe('first');
  });

  it('lets exactly one of two concurrent creators succeed', async () => {
    const attempts = await Promise.allSettled([
      storage.persistClassroom(
        { id: 'race', stage: stage('race', 'a'), scenes: [] },
        'http://localhost',
        { createOnly: true },
      ),
      storage.persistClassroom(
        { id: 'race', stage: stage('race', 'b'), scenes: [] },
        'http://localhost',
        { createOnly: true },
      ),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(storage.isAlreadyExistsError(rejected[0]!.reason)).toBe(true);
  });

  it('leaves no staging file behind when the classroom already exists', async () => {
    await storage.persistClassroom(
      { id: 'taken', stage: stage('taken', 'original'), scenes: [] },
      'http://localhost',
      { createOnly: true },
    );
    await storage
      .persistClassroom(
        { id: 'taken', stage: stage('taken', 'attempt'), scenes: [] },
        'http://localhost',
        { createOnly: true },
      )
      .catch(() => undefined);

    const entries = await fs.readdir(path.dirname(storage.resolveClassroomFilePath('taken')));
    expect(entries).toEqual(['taken.json']);
  });

  it('leaves no staging files behind after a create-only write', async () => {
    await storage.persistClassroom(
      { id: 'clean', stage: stage('clean', 'only'), scenes: [] },
      'http://localhost',
      { createOnly: true },
    );

    const entries = await fs.readdir(path.dirname(storage.resolveClassroomFilePath('clean')));
    expect(entries).toEqual(['clean.json']);
  });

  it('keeps the default overwrite behaviour that generation retries rely on', async () => {
    await storage.persistClassroom(
      { id: 'retry', stage: stage('retry', 'first'), scenes: [] },
      'http://localhost',
    );
    await storage.persistClassroom(
      { id: 'retry', stage: stage('retry', 'second'), scenes: [] },
      'http://localhost',
    );

    const onDisk = JSON.parse(
      await fs.readFile(storage.resolveClassroomFilePath('retry'), 'utf-8'),
    );
    expect(onDisk.stage.name).toBe('second');
  });
});
