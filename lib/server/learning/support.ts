/**
 * The support inbox: one thread per question between an account and the staff. A learner opens a
 * thread, or staff open one to reach a learner; both sides reply in it. A thread "waits" for staff
 * while it is open and its last message came from the learner, and is "unread" for the learner
 * when staff wrote after the learner last opened it.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';

export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 4000;
/** Unanswered threads one learner may hold at once, so the inbox cannot be flooded. */
export const SUPPORT_OPEN_LIMIT = 5;
/** Request body cap for support writes: the longest body in UTF-8 plus the JSON around it. */
export const SUPPORT_REQUEST_BYTES = 32 * 1024;

export type SupportState = 'open' | 'closed';

export interface SupportThreadView {
  id: string;
  accountId: string;
  username: string;
  subject: string;
  state: SupportState;
  createdAt: string;
  lastMessageAt: string;
  lastFromStaff: boolean;
  /** Open, and the last message is the learner's: staff should answer. */
  waiting: boolean;
  /** Staff wrote after the learner last opened the thread. */
  unread: boolean;
}

export interface SupportMessageView {
  id: number;
  authorName: string;
  fromStaff: boolean;
  body: string;
  createdAt: string;
}

interface ThreadRow {
  id: string;
  account_id: string;
  username: string;
  subject: string;
  state: SupportState;
  created_at: Date | string;
  last_message_at: Date | string;
  last_from_staff: boolean;
  learner_read_at: Date | string | null;
}

const THREAD_COLUMNS = `t.id, t.account_id, a.username, t.subject, t.state, t.created_at,
  t.last_message_at, t.last_from_staff, t.learner_read_at`;

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function toThread(row: ThreadRow): SupportThreadView {
  const lastMessageAt = new Date(row.last_message_at);
  return {
    id: row.id,
    accountId: row.account_id,
    username: row.username,
    subject: row.subject,
    state: row.state,
    createdAt: toIso(row.created_at),
    lastMessageAt: lastMessageAt.toISOString(),
    lastFromStaff: row.last_from_staff,
    waiting: row.state === 'open' && !row.last_from_staff,
    unread:
      row.last_from_staff &&
      (row.learner_read_at === null || new Date(row.learner_read_at) < lastMessageAt),
  };
}

/** Opens a thread with its first message, in one statement. */
export async function openSupportThread(
  db: AccountQueryable,
  input: {
    id: string;
    accountId: string;
    subject: string;
    body: string;
    authorId: string;
    fromStaff: boolean;
    now: Date;
  },
): Promise<void> {
  await db.query(
    `WITH thread AS (
       INSERT INTO support_threads (id, account_id, subject, state, created_at, last_message_at, last_from_staff, learner_read_at)
       VALUES ($1::text, $2::text, $3::text, 'open', $6::timestamptz, $6::timestamptz, $5::boolean,
               CASE WHEN $5::boolean THEN NULL ELSE $6::timestamptz END)
       RETURNING id
     )
     INSERT INTO support_messages (thread_id, author_id, from_staff, body, created_at)
     SELECT id, $4::text, $5::boolean, $7::text, $6::timestamptz FROM thread`,
    [
      input.id,
      input.accountId,
      input.subject,
      input.authorId,
      input.fromStaff,
      input.now.toISOString(),
      input.body,
    ],
  );
}

/** Threads of this account still waiting for a staff answer. */
export async function countWaitingSupportThreadsOf(
  db: AccountQueryable,
  accountId: string,
): Promise<number> {
  const result = await db.query(
    `SELECT count(*)::int AS n FROM support_threads WHERE account_id = $1::text AND state = 'open' AND NOT last_from_staff`,
    [accountId],
  );
  return (result.rows[0] as { n: number }).n;
}

/**
 * Threads, newest activity first. With `accountId`, only that account's threads (the learner's
 * own view); without it, every account's (the staff view), waiting ones first.
 */
export async function listSupportThreads(
  db: AccountQueryable,
  filter: { accountId?: string; state?: SupportState; limit?: number },
): Promise<SupportThreadView[]> {
  const result = await db.query(
    `SELECT ${THREAD_COLUMNS}
       FROM support_threads t JOIN accounts a ON a.id = t.account_id
      WHERE ($1::text IS NULL OR t.account_id = $1::text)
        AND ($2::text IS NULL OR t.state = $2::text)
      ORDER BY ($1::text IS NULL AND t.state = 'open' AND NOT t.last_from_staff) DESC,
               t.last_message_at DESC, t.id
      LIMIT $3::int`,
    [filter.accountId ?? null, filter.state ?? null, filter.limit ?? 100],
  );
  return (result.rows as ThreadRow[]).map(toThread);
}

export async function readSupportThread(
  db: AccountQueryable,
  threadId: string,
): Promise<{ thread: SupportThreadView; messages: SupportMessageView[] } | undefined> {
  const threads = await db.query(
    `SELECT ${THREAD_COLUMNS}
       FROM support_threads t JOIN accounts a ON a.id = t.account_id
      WHERE t.id = $1::text`,
    [threadId],
  );
  const row = threads.rows[0] as ThreadRow | undefined;
  if (!row) return undefined;
  const messages = await db.query(
    `SELECT m.id, COALESCE(a.username, '') AS author_name, m.from_staff, m.body, m.created_at
       FROM support_messages m LEFT JOIN accounts a ON a.id = m.author_id
      WHERE m.thread_id = $1::text
      ORDER BY m.id`,
    [threadId],
  );
  return {
    thread: toThread(row),
    messages: (
      messages.rows as Array<{
        id: number | string;
        author_name: string;
        from_staff: boolean;
        body: string;
        created_at: Date | string;
      }>
    ).map((message) => ({
      id: Number(message.id),
      authorName: message.author_name,
      fromStaff: message.from_staff,
      body: message.body,
      createdAt: toIso(message.created_at),
    })),
  };
}

/**
 * Adds a reply. A reply reopens a closed thread, and a learner's own reply counts as reading it.
 * Returns false when the thread does not exist.
 */
export async function replySupportThread(
  db: AccountQueryable,
  input: { threadId: string; authorId: string; fromStaff: boolean; body: string; now: Date },
): Promise<boolean> {
  const result = await db.query(
    `WITH thread AS (
       UPDATE support_threads SET
         state = 'open',
         last_message_at = $4::timestamptz,
         last_from_staff = $3::boolean,
         learner_read_at = CASE WHEN $3::boolean THEN learner_read_at ELSE $4::timestamptz END
       WHERE id = $1::text
       RETURNING id
     )
     INSERT INTO support_messages (thread_id, author_id, from_staff, body, created_at)
     SELECT id, $2::text, $3::boolean, $5::text, $4::timestamptz FROM thread
     RETURNING id`,
    [input.threadId, input.authorId, input.fromStaff, input.now.toISOString(), input.body],
  );
  return result.rows.length > 0;
}

export async function setSupportThreadState(
  db: AccountQueryable,
  threadId: string,
  state: SupportState,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE support_threads SET state = $2::text WHERE id = $1::text RETURNING id`,
    [threadId, state],
  );
  return result.rows.length > 0;
}

export async function markSupportThreadRead(
  db: AccountQueryable,
  threadId: string,
  now: Date,
): Promise<void> {
  await db.query(
    `UPDATE support_threads SET learner_read_at = $2::timestamptz WHERE id = $1::text`,
    [threadId, now.toISOString()],
  );
}

/** Open threads whose last message is the learner's. For the staff attention list. */
export async function countWaitingSupportThreads(db: AccountQueryable): Promise<number> {
  const result = await db.query(
    `SELECT count(*)::int AS n FROM support_threads WHERE state = 'open' AND NOT last_from_staff`,
  );
  return (result.rows[0] as { n: number }).n;
}

export async function findAccountIdByUsername(
  db: AccountQueryable,
  username: string,
): Promise<string | undefined> {
  const result = await db.query(`SELECT id FROM accounts WHERE username = $1::text`, [username]);
  return (result.rows[0] as { id: string } | undefined)?.id;
}
