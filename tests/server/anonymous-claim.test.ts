// P4.4: anonymous data merges into the account on sign-in/register.
// Conflict rules: on an id collision the account's row wins; on a name
// collision the anonymous item is renamed with a numeric suffix.

import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureAgentSessionSchema } from '@openmaic/storage/agent-session/pg';
import { ensureDocumentSchema } from '@openmaic/storage/document/pg';
import { ensureUserSkillSchema } from '@openmaic/storage/skill/pg';
import { ensureStageMetaSchema } from '@/lib/persistence/stage-meta';
import { ensureOwnerMaterialSchema } from '@/lib/persistence/owner-materials';
import { claimAnonymousOwnerData, type ClaimPool } from '@/lib/server/accounts/claim';
import { accountOwnerId } from '@/lib/server/accounts/service';

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const SOURCE = 'anon:11111111-2222-4333-8444-555555555555';
const ACCOUNT_ID = 'account-1';
const TARGET = accountOwnerId(ACCOUNT_ID);

function poolFor(db: PGlite): ClaimPool {
  return {
    connect: async () => ({
      query: (text: string, params?: unknown[]) =>
        db.query(text, params) as unknown as Promise<{ rows: never[]; rowCount: number | null }>,
      release: () => {},
    }),
  };
}

async function seed(db: PGlite) {
  await db.waitReady;
  await ensureAgentSessionSchema(db);
  await ensureDocumentSchema(db);
  await ensureUserSkillSchema(db);
  await ensureStageMetaSchema(db);
  await ensureOwnerMaterialSchema(db);
}

async function ownerOf(
  db: PGlite,
  table: string,
  idColumn: string,
  id: string,
): Promise<string | null> {
  const rows = await db.query<{ owner_id: string }>(
    `SELECT owner_id FROM ${table} WHERE ${idColumn} = $1`,
    [id],
  );
  return (rows.rows[0]?.owner_id as string) ?? null;
}

describe('claimAnonymousOwnerData', () => {
  let db: PGlite | undefined;

  afterEach(async () => {
    await db?.close();
  });

  it('moves stages, folders, sessions, skills and materials to the account owner', async () => {
    db = new PGlite();
    await seed(db);
    await db.query(
      `INSERT INTO document_stages (id, owner_id, name, created_at, updated_at, data)
       VALUES ('stage-1', $1, 'My stage', 1, 1, '{}')`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO stage_meta (stage_id, owner_id, is_public) VALUES ('stage-1', $1, false)`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO document_folders (owner_id, id, name, normalized_name, created_at, updated_at)
       VALUES ($1, 'folder-1', 'Unit 1', 'unit 1', 1, 1)`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO agent_sessions (id, owner_id, prompt, stage_id, status)
       VALUES ('session-1', $1, 'hello', 'stage-x', 'succeeded')`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO agent_owner_session_events (owner_id, id, ts, session_id, type, data)
       VALUES ($1, 1, 1000, 'session-1', 'session_created', '{}')`,
      [SOURCE],
    );
    await db.query(`INSERT INTO agent_owner_session_event_counters (owner_id, n) VALUES ($1, 1)`, [
      SOURCE,
    ]);
    await db.query(
      `INSERT INTO agent_user_skill (id, owner_id, name, title, description, content)
       VALUES ('skill-1', $1, 'my-quiz', 'Quiz', 'desc', 'content')`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO owner_material (id, owner_id, kind, bytes, oss_key, created_at)
       VALUES ('mat-1', $1, 'source', 10, 'oss-key-1', 1)`,
      [SOURCE],
    );

    const result = await claimAnonymousOwnerData(poolFor(db), SOURCE, ACCOUNT_ID);

    expect(result.skipped).toBeNull();
    expect(result.moved).toMatchObject({
      stages: 1,
      folders: 1,
      sessions: 1,
      skills: 1,
      materials: 1,
      sessionEvents: 1,
    });
    expect(await ownerOf(db, 'document_stages', 'id', 'stage-1')).toBe(TARGET);
    expect(await ownerOf(db, 'stage_meta', 'stage_id', 'stage-1')).toBe(TARGET);
    expect(await ownerOf(db, 'document_folders', 'id', 'folder-1')).toBe(TARGET);
    expect(await ownerOf(db, 'agent_sessions', 'id', 'session-1')).toBe(TARGET);
    expect(await ownerOf(db, 'agent_user_skill', 'id', 'skill-1')).toBe(TARGET);
    expect(await ownerOf(db, 'owner_material', 'id', 'mat-1')).toBe(TARGET);
    // The event was renumbered onto the target owner, above the high-water mark.
    const events = await db.query<{ owner_id: string; id: number; session_id: string }>(
      'SELECT owner_id, id, session_id FROM agent_owner_session_events',
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0]).toMatchObject({ owner_id: TARGET, session_id: 'session-1' });
    expect(events.rows[0]?.id).toBeGreaterThan(1);
    // Nothing stays under the source.
    const leftover = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM agent_sessions WHERE owner_id = $1`,
      [SOURCE],
    );
    expect(leftover.rows[0]?.n).toBe(0);
  });

  it('lets the account row win on an id collision', async () => {
    // document_folders has a per-owner primary key (owner_id, id), so the same
    // folder id can exist under both owners. document_stages uses a global id
    // primary key, where an id collision cannot happen.
    db = new PGlite();
    await seed(db);
    for (const owner of [SOURCE, TARGET]) {
      await db.query(
        `INSERT INTO document_folders (owner_id, id, name, normalized_name, created_at, updated_at)
         VALUES ($1, 'folder-9', $2, $3, 1, 1)`,
        [
          owner,
          owner === TARGET ? 'Account folder' : 'Anonymous folder',
          owner === TARGET ? 'account folder' : 'anonymous folder',
        ],
      );
    }

    const result = await claimAnonymousOwnerData(poolFor(db), SOURCE, ACCOUNT_ID);

    expect(result.idCollisions.folders).toBe(1);
    expect(result.moved.folders).toBe(0);
    const name = await db.query<{ name: string }>(
      'SELECT name FROM document_folders WHERE id = $1 AND owner_id = $2',
      ['folder-9', TARGET],
    );
    expect(name.rows[0]?.name).toBe('Account folder');
    // The anonymous duplicate is left untouched under the abandoned source.
    const anonRows = await db.query<{ name: string }>(
      'SELECT name FROM document_folders WHERE id = $1 AND owner_id = $2',
      ['folder-9', SOURCE],
    );
    expect(anonRows.rows[0]).toMatchObject({ name: 'Anonymous folder' });
  });

  it('renames folders and skills on a name collision instead of merging', async () => {
    db = new PGlite();
    await seed(db);
    await db.query(
      `INSERT INTO document_folders (owner_id, id, name, normalized_name, created_at, updated_at)
       VALUES ($1, 'folder-a', 'Unit 1', 'unit 1', 1, 1)`,
      [TARGET],
    );
    await db.query(
      `INSERT INTO document_folders (owner_id, id, name, normalized_name, created_at, updated_at)
       VALUES ($1, 'folder-b', 'Unit 1', 'unit 1', 1, 1)`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO agent_user_skill (id, owner_id, name, title, description, content)
       VALUES ('skill-a', $1, 'my-quiz', 'Quiz', 'desc', 'content')`,
      [TARGET],
    );
    await db.query(
      `INSERT INTO agent_user_skill (id, owner_id, name, title, description, content)
       VALUES ('skill-b', $1, 'my-quiz', 'Quiz', 'desc', 'content')`,
      [SOURCE],
    );

    const result = await claimAnonymousOwnerData(poolFor(db), SOURCE, ACCOUNT_ID);

    expect(result.renamedFolders).toBe(1);
    expect(result.renamedSkills).toBe(1);
    const folder = await db.query<{ name: string }>(
      'SELECT name FROM document_folders WHERE id = $1 AND owner_id = $2',
      ['folder-b', TARGET],
    );
    expect(folder.rows[0]?.name).toBe('Unit 1 (2)');
    const skill = await db.query<{ name: string }>(
      'SELECT name FROM agent_user_skill WHERE id = $1 AND owner_id = $2',
      ['skill-b', TARGET],
    );
    expect(skill.rows[0]?.name).toBe('my-quiz-2');
    // The account's originals are untouched.
    const origFolder = await db.query<{ name: string }>(
      'SELECT name FROM document_folders WHERE id = $1 AND owner_id = $2',
      ['folder-a', TARGET],
    );
    expect(origFolder.rows[0]?.name).toBe('Unit 1');
  });

  it('skips the whole claim when a session is still active', async () => {
    db = new PGlite();
    await seed(db);
    await db.query(
      `INSERT INTO agent_sessions (id, owner_id, prompt, stage_id, status)
       VALUES ('session-live', $1, 'hello', 'stage-x', 'running')`,
      [SOURCE],
    );
    await db.query(
      `INSERT INTO document_stages (id, owner_id, name, created_at, updated_at, data)
       VALUES ('stage-1', $1, 'My stage', 1, 1, '{}')`,
      [SOURCE],
    );

    const result = await claimAnonymousOwnerData(poolFor(db), SOURCE, ACCOUNT_ID);

    expect(result.skipped).toBe('SESSIONS_ACTIVE');
    expect(await ownerOf(db, 'document_stages', 'id', 'stage-1')).toBe(SOURCE);
    expect(await ownerOf(db, 'agent_sessions', 'id', 'session-live')).toBe(SOURCE);
  });

  it('is a no-op when the source is not an anonymous owner', async () => {
    db = new PGlite();
    await seed(db);

    const result = await claimAnonymousOwnerData(poolFor(db), TARGET, ACCOUNT_ID);

    expect(result.moved).toMatchObject({
      stages: 0,
      folders: 0,
      sessions: 0,
      skills: 0,
      materials: 0,
      sessionEvents: 0,
    });
    expect(result.skipped).toBeNull();
  });
});
