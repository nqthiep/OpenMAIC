/**
 * Course reads by id (Ngọc:SEC-01), without a database.
 *
 * The `stage_meta` row is faked and each read body is a stand-in that records
 * when it runs, so a test sees whether the owner gate let the read through. A
 * draft is its owner's; another owner reads a course only while it is
 * published and not deleted. The same rules run against PostgreSQL in
 * owner-read-gate.pg.test.ts.
 */
import { PgDocumentStore } from '@openmaic/storage/document/pg';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { createOwnerBoundDocumentStore } from '@/lib/persistence/owner-bound-document-store';
import { StageAccessError } from '@/lib/persistence/stage-meta';

const AUTHOR = 'user:author';
const OTHER = 'user:other';
const STAGE = 'stage-gate';

interface MetaRow {
  stage_id: string;
  owner_id: string;
  deleted_at: Date | null;
  is_public: boolean;
}

const DRAFT: MetaRow = { stage_id: STAGE, owner_id: AUTHOR, deleted_at: null, is_public: false };
const PUBLISHED: MetaRow = { ...DRAFT, is_public: true };

/** A pool that answers the `stage_meta` row the gate reads, and a revision-1 manifest. */
function fakePool(rows: MetaRow[]) {
  const client = {
    async query(text: string, params?: unknown[]) {
      if (text.includes('FROM stage_meta WHERE stage_id = $1')) {
        return { rows: rows.filter((row) => row.stage_id === params?.[0]) };
      }
      if (text.includes('FROM document_stage_revision')) return { rows: [{ rev: 1 }] };
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client };
}

function storeAs(owner: string, rows: MetaRow[]) {
  return createOwnerBoundDocumentStore({
    pool: fakePool(rows),
    ownerId: owner,
    validateScene: validateAppScene,
    validateStage: validateAppStage,
  });
}

/**
 * A stand-in for a store read. It goes through the store's private transaction,
 * where the owner gate runs, and only then records the read and answers `value`.
 */
type GatedTransaction = { transaction(body: () => Promise<unknown>): Promise<unknown> };
function gatedRead(name: string, value: unknown, reached: string[]) {
  return function (this: GatedTransaction) {
    return this.transaction(async () => {
      reached.push(name);
      return value;
    });
  };
}

/** Replace the two document read bodies; `reached` lists the reads the gate let through. */
function stubReads(reached: string[]) {
  const doc = { stage: { id: STAGE, name: 'Course', createdAt: 1, updatedAt: 1 }, scenes: [] };
  vi.spyOn(PgDocumentStore.prototype, 'loadDocument').mockImplementation(
    gatedRead('loadDocument', doc, reached) as never,
  );
  vi.spyOn(PgDocumentStore.prototype, 'getScene').mockImplementation(
    gatedRead('getScene', { id: 'scene-1' }, reached) as never,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reads of a course by id, gated by ownership and publication', () => {
  it('lets the owner read a draft', async () => {
    const reached: string[] = [];
    stubReads(reached);

    const doc = await storeAs(AUTHOR, [DRAFT]).loadDocument(STAGE);

    expect(doc?.stage.id).toBe(STAGE);
    expect(reached).toEqual(['loadDocument']);
  });

  it('answers another owner for a draft as absent, without reaching any read body', async () => {
    const reached: string[] = [];
    stubReads(reached);
    const other = storeAs(OTHER, [DRAFT]);

    expect(await other.loadDocument(STAGE)).toBeNull();
    expect(await other.getScene(STAGE, 'scene-1')).toBeNull();
    expect(await other.readFreshnessManifest(STAGE)).toBeNull();
    expect(reached).toEqual([]);
  });

  it('lets another owner read a published course, its scene and its manifest', async () => {
    const reached: string[] = [];
    stubReads(reached);
    const other = storeAs(OTHER, [PUBLISHED]);

    expect((await other.loadDocument(STAGE))?.stage.id).toBe(STAGE);
    expect(await other.getScene(STAGE, 'scene-1')).toEqual({ id: 'scene-1' });
    expect(await other.readFreshnessManifest(STAGE)).toEqual({ rev: 1, scenes: [] });
    expect(reached).toEqual(['loadDocument', 'getScene']);
  });

  it('answers an id the database cannot bind as absent, before any query', async () => {
    const reached: string[] = [];
    stubReads(reached);
    const owner = storeAs(AUTHOR, [DRAFT]);

    expect(await owner.loadDocument('stage-gate\u0000')).toBeNull();
    expect(await owner.readFreshnessManifest('\uD800')).toBeNull();
    expect(reached).toEqual([]);
  });

  it('keeps a deleted course closed to everyone, even with its publish flag still set', async () => {
    const reached: string[] = [];
    stubReads(reached);
    const deleted = { ...PUBLISHED, deleted_at: new Date(0) };

    expect(await storeAs(OTHER, [deleted]).loadDocument(STAGE)).toBeNull();
    expect(await storeAs(AUTHOR, [deleted]).loadDocument(STAGE)).toBeNull();
    expect(reached).toEqual([]);
  });

  it('refuses another owner a write to a published course', async () => {
    const write = storeAs(OTHER, [PUBLISHED]).deleteDocument(STAGE);

    await expect(write).rejects.toBeInstanceOf(StageAccessError);
    await expect(write).rejects.toMatchObject({ refusal: 'foreign' });
  });
});
