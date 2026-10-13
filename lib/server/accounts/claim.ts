/**
 * P4.4: merge anonymous data into the account on sign-in/register.
 *
 * Small scope. Anonymous visitors can no longer spend (AI generation), but
 * they can still own stage shells, folders, and data created before
 * access-control; that old data stays under `anon:<uuid>` owners. When a
 * visitor signs in or registers, this module moves their anonymous rows to
 * the account owner (`acct:<id>`) in one transaction.
 *
 * Conflict rules (recorded in scrum/DECISIONS-04.md):
 * - On an id collision the account's row wins; the anonymous duplicate is
 *   left untouched under the abandoned source owner.
 * - On a unique-name collision (folders, skills) the anonymous item is
 *   renamed with a numeric suffix, never merged and never skipped.
 * - A queued or running session blocks the whole claim (`SESSIONS_ACTIVE`):
 *   a running session's writes are bound to the source owner, so moving it
 *   mid-run would break them. Nothing moves and the anonymous cookie stays.
 *
 * Session children (entries, events, urls, materials) are keyed by
 * `session_id` and move with the session automatically. Owner event rows are
 * renumbered onto the target's sequence, following the mergeOwner pattern.
 */
import { createLogger } from '@/lib/logger';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { readAnonymousOwnerId } from '@/lib/server/agent-runtime/owner';

import { accountOwnerId } from './service';

const log = createLogger('AccountClaim');

export interface ClaimCounts {
  stages: number;
  folders: number;
  sessions: number;
  skills: number;
  materials: number;
  sessionEvents: number;
}

export interface AnonymousClaimResult {
  moved: ClaimCounts;
  /** Anonymous folders renamed because the account already used the name. */
  renamedFolders: number;
  /** Anonymous skills renamed because the account already used the name. */
  renamedSkills: number;
  /** Rows left under the source because the account already owned the id. */
  idCollisions: ClaimCounts;
  /** Set when the claim refused to run; nothing moved. */
  skipped: 'SESSIONS_ACTIVE' | null;
}

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

interface ClaimClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

export interface ClaimPool {
  connect(): Promise<ClaimClient & { release(): void }>;
}

const zeroCounts = (): ClaimCounts => ({
  stages: 0,
  folders: 0,
  sessions: 0,
  skills: 0,
  materials: 0,
  sessionEvents: 0,
});

const emptyResult = (skipped: AnonymousClaimResult['skipped'] = null): AnonymousClaimResult => ({
  moved: zeroCounts(),
  renamedFolders: 0,
  renamedSkills: 0,
  idCollisions: zeroCounts(),
  skipped,
});

/** Set-Cookie value clearing the anonymous cookie; attributes mirror owner.ts. */
function clearAnonymousCookieHeader(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `anonymous_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/**
 * Run the anonymous claim after a successful sign-in or registration and
 * attach its effects to the response. Never throws: the sign-in already
 * succeeded, so a failed claim only leaves the data anonymous for a later
 * sign-in to retry. The anonymous cookie is cleared only when the claim
 * actually ran; a skipped or failed claim keeps it in place.
 */
export async function claimAnonymousDataAfterSignIn(
  request: Request,
  accountId: string,
  response: Response,
): Promise<void> {
  const sourceOwnerId = readAnonymousOwnerId(request.headers);
  if (!sourceOwnerId) return;
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return;
  try {
    const { pool } = await getServerPersistenceProvider(connectionString);
    const result = await claimAnonymousOwnerData(pool, sourceOwnerId, accountId);
    if (result.skipped === null) {
      response.headers.append('Set-Cookie', clearAnonymousCookieHeader());
    }
  } catch (error) {
    log.warn('anonymous claim after sign-in failed; data stays anonymous', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** Move every row the anonymous owner holds to the account owner. */
export async function claimAnonymousOwnerData(
  pool: ClaimPool,
  sourceOwnerId: string,
  accountId: string,
): Promise<AnonymousClaimResult> {
  const targetOwnerId = accountOwnerId(accountId);
  if (!sourceOwnerId.startsWith('anon:') || sourceOwnerId === targetOwnerId) {
    return emptyResult();
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await moveAnonymousRows(client, sourceOwnerId, targetOwnerId);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

async function countRows(client: ClaimClient, text: string, params: unknown[]): Promise<number> {
  const result = await client.query(text, params);
  const value = result.rows[0]?.n;
  return typeof value === 'number' ? value : Number(value ?? 0);
}

async function moveAnonymousRows(
  client: ClaimClient,
  source: string,
  target: string,
): Promise<AnonymousClaimResult> {
  // A running session's writes are bound to the source owner; moving it
  // mid-run would break them, so the whole claim waits for a quiet moment.
  const active = await countRows(
    client,
    `SELECT count(*)::int AS n FROM agent_sessions
     WHERE owner_id = $1 AND status IN ('queued', 'running') AND deleted_at IS NULL`,
    [source],
  );
  if (active > 0) {
    log.warn('anonymous claim skipped: source has active sessions', { active });
    return emptyResult('SESSIONS_ACTIVE');
  }

  const result = emptyResult();

  // Agent sessions. Children (entries, events, urls, materials) are keyed by
  // session_id, so they follow the session row with no update of their own.
  // On an id collision the account's session wins.
  const sessions = await client.query(
    `UPDATE agent_sessions SET owner_id = $2, updated_at = now()
     WHERE owner_id = $1 AND id NOT IN (SELECT id FROM agent_sessions WHERE owner_id = $2)
     RETURNING id`,
    [source, target],
  );
  result.moved.sessions = sessions.rows.length;
  result.idCollisions.sessions = await countRows(
    client,
    `SELECT count(*)::int AS n FROM agent_sessions s1
     WHERE s1.owner_id = $1 AND EXISTS
       (SELECT 1 FROM agent_sessions s2 WHERE s2.owner_id = $2 AND s2.id = s1.id)`,
    [source, target],
  );
  result.moved.sessionEvents = await moveOwnerEvents(client, source, target);

  // Documents. stage_meta rows follow their stage (FK on document_stages);
  // both owner columns move together so the persist upsert keeps matching.
  const stages = await client.query(
    `UPDATE document_stages SET owner_id = $2
     WHERE owner_id = $1 AND id NOT IN (SELECT id FROM document_stages WHERE owner_id = $2)
     RETURNING id`,
    [source, target],
  );
  result.moved.stages = stages.rows.length;
  result.idCollisions.stages = await countRows(
    client,
    `SELECT count(*)::int AS n FROM document_stages s1
     WHERE s1.owner_id = $1 AND EXISTS
       (SELECT 1 FROM document_stages s2 WHERE s2.owner_id = $2 AND s2.id = s1.id)`,
    [source, target],
  );
  await client.query(
    `UPDATE stage_meta SET owner_id = $2
     WHERE owner_id = $1 AND stage_id NOT IN (SELECT stage_id FROM stage_meta WHERE owner_id = $2)`,
    [source, target],
  );

  result.moved.folders = await moveFolders(client, source, target, result);
  result.moved.skills = await moveSkills(client, source, target, result);

  // Library materials. The object key stays as stored; readers use oss_key.
  const materials = await client.query(
    `UPDATE owner_material SET owner_id = $2
     WHERE owner_id = $1 AND id NOT IN (SELECT id FROM owner_material WHERE owner_id = $2)
     RETURNING id`,
    [source, target],
  );
  result.moved.materials = materials.rows.length;
  result.idCollisions.materials = await countRows(
    client,
    `SELECT count(*)::int AS n FROM owner_material m1
     WHERE m1.owner_id = $1 AND EXISTS
       (SELECT 1 FROM owner_material m2 WHERE m2.owner_id = $2 AND m2.id = m1.id)`,
    [source, target],
  );

  const total =
    result.moved.stages +
    result.moved.folders +
    result.moved.sessions +
    result.moved.skills +
    result.moved.materials +
    result.moved.sessionEvents;
  log.info('anonymous claim applied', {
    account: target,
    moved: total,
    renamedFolders: result.renamedFolders,
    renamedSkills: result.renamedSkills,
  });
  return result;
}

/**
 * Owner event rows are keyed (owner_id, id) with a per-owner sequence, so
 * they are renumbered onto the target's high-water mark, following mergeOwner.
 */
async function moveOwnerEvents(
  client: ClaimClient,
  source: string,
  target: string,
): Promise<number> {
  const sourceEvents = await countRows(
    client,
    'SELECT count(*)::int AS n FROM agent_owner_session_events WHERE owner_id = $1',
    [source],
  );
  if (sourceEvents === 0) {
    await client.query('DELETE FROM agent_owner_session_event_counters WHERE owner_id = $1', [
      source,
    ]);
    return 0;
  }
  for (const owner of [source, target].sort()) {
    await client.query(
      `INSERT INTO agent_owner_session_event_counters (owner_id, n) VALUES ($1, 0)
       ON CONFLICT (owner_id) DO NOTHING`,
      [owner],
    );
    await client.query(
      'SELECT n FROM agent_owner_session_event_counters WHERE owner_id = $1 FOR UPDATE',
      [owner],
    );
  }
  await client.query(
    `WITH bounds AS (
       SELECT greatest(
         coalesce((SELECT max(n) FROM agent_owner_session_event_counters
                   WHERE owner_id IN ($1, $2)), 0),
         coalesce((SELECT max(id) FROM agent_owner_session_events
                   WHERE owner_id IN ($1, $2)), 0)
       ) AS high
     ), source_events AS MATERIALIZED (
       SELECT e.*, row_number() OVER (ORDER BY e.id, e.ts, e.session_id) AS ordinal
       FROM agent_owner_session_events e WHERE e.owner_id = $1
     )
     INSERT INTO agent_owner_session_events
       (owner_id, id, ts, session_id, type, status, attempt, data)
     SELECT $2, bounds.high + source_events.ordinal, source_events.ts,
            source_events.session_id, source_events.type, source_events.status,
            source_events.attempt, source_events.data
     FROM source_events CROSS JOIN bounds`,
    [source, target],
  );
  await client.query('DELETE FROM agent_owner_session_events WHERE owner_id = $1', [source]);
  await client.query(
    `UPDATE agent_owner_session_event_counters
     SET n = greatest(n, coalesce((SELECT max(id) FROM agent_owner_session_events
                                   WHERE owner_id = $1), 0))
     WHERE owner_id = $1`,
    [target],
  );
  await client.query('DELETE FROM agent_owner_session_event_counters WHERE owner_id = $1', [
    source,
  ]);
  return sourceEvents;
}

function normalizeFolderName(name: string): string {
  return name.toLocaleLowerCase('en-US');
}

async function moveFolders(
  client: ClaimClient,
  source: string,
  target: string,
  result: AnonymousClaimResult,
): Promise<number> {
  const folders = await client.query<{ id: string; name: string }>(
    'SELECT id, name FROM document_folders WHERE owner_id = $1 ORDER BY id',
    [source],
  );
  let moved = 0;
  for (const folder of folders.rows) {
    const idTaken = await countRows(
      client,
      'SELECT count(*)::int AS n FROM document_folders WHERE owner_id = $1 AND id = $2',
      [target, folder.id],
    );
    if (idTaken > 0) {
      // The account's folder wins; the anonymous duplicate stays behind.
      result.idCollisions.folders += 1;
      continue;
    }
    let name = folder.name;
    let attempt = 1;
    for (;;) {
      const nameTaken = await countRows(
        client,
        `SELECT count(*)::int AS n FROM document_folders
         WHERE owner_id = $1 AND normalized_name = $2`,
        [target, normalizeFolderName(name)],
      );
      if (nameTaken === 0) break;
      attempt += 1;
      name = `${folder.name} (${attempt})`;
    }
    if (name !== folder.name) result.renamedFolders += 1;
    await client.query(
      `UPDATE document_folders
       SET owner_id = $2, name = $3, normalized_name = $4, updated_at = $5
       WHERE owner_id = $1 AND id = $6`,
      [source, target, name, normalizeFolderName(name), Date.now(), folder.id],
    );
    moved += 1;
  }
  return moved;
}

const SKILL_NAME_PATTERN = /^my-[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function moveSkills(
  client: ClaimClient,
  source: string,
  target: string,
  result: AnonymousClaimResult,
): Promise<number> {
  const skills = await client.query<{ id: string; name: string }>(
    'SELECT id, name FROM agent_user_skill WHERE owner_id = $1 ORDER BY id',
    [source],
  );
  let moved = 0;
  for (const skill of skills.rows) {
    const idTaken = await countRows(
      client,
      'SELECT count(*)::int AS n FROM agent_user_skill WHERE owner_id = $1 AND id = $2',
      [target, skill.id],
    );
    if (idTaken > 0) {
      // The account's skill wins; the anonymous duplicate stays behind.
      result.idCollisions.skills += 1;
      continue;
    }
    let name = skill.name;
    let attempt = 1;
    let renamed = false;
    for (;;) {
      const nameTaken = await countRows(
        client,
        'SELECT count(*)::int AS n FROM agent_user_skill WHERE owner_id = $1 AND name = $2',
        [target, name],
      );
      if (nameTaken === 0) break;
      attempt += 1;
      const candidate = `${skill.name}-${attempt}`;
      if (candidate.length > 64 || !SKILL_NAME_PATTERN.test(candidate)) {
        // No legal free name inside the skill-name rules: leave the skill
        // behind rather than break the unique constraint or the name format.
        name = '';
        break;
      }
      name = candidate;
      renamed = true;
    }
    if (name === '') continue;
    if (renamed) result.renamedSkills += 1;
    await client.query(
      'UPDATE agent_user_skill SET owner_id = $2, name = $3 WHERE owner_id = $1 AND id = $4',
      [source, target, name, skill.id],
    );
    moved += 1;
  }
  return moved;
}
