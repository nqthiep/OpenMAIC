/**
 * Weekly challenges. Staff post a problem with a hidden reference solution, the open and close
 * times, how long voting lasts and the tokens for the top three. Members submit one solution each
 * while it is open (entries stay hidden from others), then vote while voting runs. When voting
 * ends the challenge is settled once, on the first read: the top three by votes (then AI score,
 * then the earliest entry) get their rank, their tokens and a badge.
 */
import type { AccountQueryable } from '@/lib/server/accounts/store';
import { accountOwnerId } from '@/lib/server/accounts/service';
import { creditBonusTokens } from '@/lib/server/learning/store';

export const CHALLENGE_TITLE_MAX = 160;
export const CHALLENGE_TEXT_MAX = 8000;
export const ENTRY_BODY_MAX = 8000;
/** Longest submission or voting window staff may set. */
export const CHALLENGE_DAYS_MAX = 30;
/** Most tokens staff may promise to one place. Rewards stay small; the monthly cap still applies. */
export const CHALLENGE_REWARD_MAX = 100_000;
export const CHALLENGE_BADGE = 'challenge-top3';
/** Leaderboard points: one for taking part, and these on top for the first three places. */
const PLACE_POINTS = [3, 2, 1] as const;

export type ChallengePhase = 'upcoming' | 'open' | 'voting' | 'finished';

export interface ChallengeView {
  id: string;
  title: string;
  statement: string;
  /** Shown once voting starts, and to staff. Empty otherwise. */
  referenceSolution: string;
  opensAt: string;
  closesAt: string;
  votingEndsAt: string;
  rewards: [number, number, number];
  hidden: boolean;
  phase: ChallengePhase;
  entryCount: number;
  settled: boolean;
}

export interface EntryView {
  id: number;
  accountId: string;
  username: string;
  body: string;
  /** Public once voting starts; the author and staff see it earlier. */
  aiScore: number | null;
  /** The author and staff only. */
  aiFeedback: string | null;
  votes: number;
  voted: boolean;
  hidden: boolean;
  rank: number | null;
  reward: number;
  createdAt: string;
  updatedAt: string;
}

interface ChallengeRow {
  id: string;
  title: string;
  statement: string;
  reference_solution: string;
  opens_at: Date | string;
  closes_at: Date | string;
  voting_ends_at: Date | string;
  reward_1: number | string;
  reward_2: number | string;
  reward_3: number | string;
  hidden: boolean;
  settled_at: Date | string | null;
  entry_count: number | string;
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

export function phaseAt(
  times: { opensAt: string; closesAt: string; votingEndsAt: string },
  now: Date,
): ChallengePhase {
  const t = now.getTime();
  if (t < new Date(times.opensAt).getTime()) return 'upcoming';
  if (t < new Date(times.closesAt).getTime()) return 'open';
  if (t < new Date(times.votingEndsAt).getTime()) return 'voting';
  return 'finished';
}

function toChallenge(row: ChallengeRow, now: Date, staff: boolean): ChallengeView {
  const times = {
    opensAt: toIso(row.opens_at),
    closesAt: toIso(row.closes_at),
    votingEndsAt: toIso(row.voting_ends_at),
  };
  const phase = phaseAt(times, now);
  return {
    id: row.id,
    title: row.title,
    statement: row.statement,
    referenceSolution:
      staff || phase === 'voting' || phase === 'finished' ? row.reference_solution : '',
    ...times,
    rewards: [Number(row.reward_1), Number(row.reward_2), Number(row.reward_3)],
    hidden: row.hidden,
    phase,
    entryCount: Number(row.entry_count),
    settled: row.settled_at !== null,
  };
}

const CHALLENGE_COLUMNS = `c.id, c.title, c.statement, c.reference_solution, c.opens_at, c.closes_at,
  c.voting_ends_at, c.reward_1, c.reward_2, c.reward_3, c.hidden, c.settled_at,
  (SELECT count(*) FROM challenge_entries e WHERE e.challenge_id = c.id AND NOT e.hidden) AS entry_count`;

export interface ChallengeInput {
  title: string;
  statement: string;
  referenceSolution: string;
  opensAt: Date;
  submissionDays: number;
  votingDays: number;
  rewards: [number, number, number];
}

function windowOf(input: Pick<ChallengeInput, 'opensAt' | 'submissionDays' | 'votingDays'>) {
  const closes = new Date(input.opensAt.getTime() + input.submissionDays * 86_400_000);
  const votingEnds = new Date(closes.getTime() + input.votingDays * 86_400_000);
  return {
    opens: input.opensAt.toISOString(),
    closes: closes.toISOString(),
    votingEnds: votingEnds.toISOString(),
  };
}

export async function createChallenge(
  db: AccountQueryable,
  input: ChallengeInput & { id: string; actorId: string; now: Date },
): Promise<void> {
  const w = windowOf(input);
  await db.query(
    `WITH created AS (
       INSERT INTO challenges (id, title, statement, reference_solution, opens_at, closes_at, voting_ends_at,
                               reward_1, reward_2, reward_3, created_by, created_at)
       VALUES ($1::text, $2::text, $3::text, $4::text, $5::timestamptz, $6::timestamptz, $7::timestamptz,
               $8::bigint, $9::bigint, $10::bigint, $11::text, $12::timestamptz)
       RETURNING id
     )
     INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
     SELECT $11::text, id, 'challenge:create', $2::text, $12::timestamptz FROM created`,
    [
      input.id,
      input.title,
      input.statement,
      input.referenceSolution,
      w.opens,
      w.closes,
      w.votingEnds,
      ...input.rewards,
      input.actorId,
      input.now.toISOString(),
    ],
  );
}

/** Changes a challenge that is not settled yet. Returns false when it is missing or settled. */
export async function updateChallenge(
  db: AccountQueryable,
  input: ChallengeInput & { id: string; hidden: boolean; actorId: string; now: Date },
): Promise<boolean> {
  const w = windowOf(input);
  const result = await db.query(
    `WITH changed AS (
       UPDATE challenges SET title = $2::text, statement = $3::text, reference_solution = $4::text,
         opens_at = $5::timestamptz, closes_at = $6::timestamptz, voting_ends_at = $7::timestamptz,
         reward_1 = $8::bigint, reward_2 = $9::bigint, reward_3 = $10::bigint, hidden = $11::boolean
       WHERE id = $1::text AND settled_at IS NULL
       RETURNING id
     ), audit AS (
       INSERT INTO account_admin_audit (actor_id, target_id, action, reason, created_at)
       SELECT $12::text, id, 'challenge:update', $2::text, $13::timestamptz FROM changed
     )
     SELECT id FROM changed`,
    [
      input.id,
      input.title,
      input.statement,
      input.referenceSolution,
      w.opens,
      w.closes,
      w.votingEnds,
      ...input.rewards,
      input.hidden,
      input.actorId,
      input.now.toISOString(),
    ],
  );
  return result.rows.length > 0;
}

/** Challenges, newest first. Members see started, visible ones; staff see all. */
export async function listChallenges(
  db: AccountQueryable,
  input: { staff: boolean; now: Date; limit?: number },
): Promise<ChallengeView[]> {
  const result = await db.query(
    `SELECT ${CHALLENGE_COLUMNS} FROM challenges c
      WHERE $1::boolean OR (NOT c.hidden AND c.opens_at <= $2::timestamptz)
      ORDER BY c.opens_at DESC, c.id
      LIMIT $3::int`,
    [input.staff, input.now.toISOString(), input.limit ?? 50],
  );
  return (result.rows as ChallengeRow[]).map((row) => toChallenge(row, input.now, input.staff));
}

export async function readChallenge(
  db: AccountQueryable,
  input: { id: string; staff: boolean; now: Date },
): Promise<ChallengeView | undefined> {
  const result = await db.query(
    `SELECT ${CHALLENGE_COLUMNS} FROM challenges c WHERE c.id = $1::text`,
    [input.id],
  );
  const row = result.rows[0] as ChallengeRow | undefined;
  if (!row) return undefined;
  const view = toChallenge(row, input.now, input.staff);
  if (!input.staff && (view.hidden || view.phase === 'upcoming')) return undefined;
  return view;
}

/**
 * The entries a viewer may see. While a challenge is open only the viewer's own entry (staff see
 * all); from voting on, every visible entry, ranked ones first after settling, then by votes.
 */
export async function listEntries(
  db: AccountQueryable,
  input: {
    challengeId: string;
    phase: ChallengePhase;
    viewerId: string | undefined;
    staff: boolean;
  },
): Promise<EntryView[]> {
  const everyone = input.staff || input.phase === 'voting' || input.phase === 'finished';
  const result = await db.query(
    `SELECT e.id, e.account_id, a.username, e.body, e.ai_score, e.ai_feedback, e.votes, e.hidden,
            e.rank, e.reward, e.created_at, e.updated_at,
            EXISTS (SELECT 1 FROM entry_votes v WHERE v.entry_id = e.id AND v.account_id = $2::text) AS voted
       FROM challenge_entries e JOIN accounts a ON a.id = e.account_id
      WHERE e.challenge_id = $1::text
        AND ($3::boolean OR e.account_id = $2::text)
        AND ($4::boolean OR NOT e.hidden OR e.account_id = $2::text)
      ORDER BY e.rank ASC NULLS LAST, e.votes DESC, e.ai_score DESC NULLS LAST, e.created_at, e.id`,
    [input.challengeId, input.viewerId ?? null, everyone, input.staff],
  );
  return (
    result.rows as Array<{
      id: number | string;
      account_id: string;
      username: string;
      body: string;
      ai_score: number | null;
      ai_feedback: string | null;
      votes: number;
      hidden: boolean;
      rank: number | null;
      reward: number | string;
      created_at: Date | string;
      updated_at: Date | string;
      voted: boolean;
    }>
  ).map((row) => {
    const own = row.account_id === input.viewerId;
    return {
      id: Number(row.id),
      accountId: row.account_id,
      username: row.username,
      body: row.body,
      aiScore: own || input.staff || input.phase !== 'open' ? row.ai_score : null,
      aiFeedback: own || input.staff ? row.ai_feedback : null,
      votes: Number(row.votes),
      voted: row.voted,
      hidden: row.hidden,
      rank: row.rank,
      reward: Number(row.reward),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  });
}

/** Saves the viewer's entry, replacing an earlier one and its grade. Returns the entry id. */
export async function saveEntry(
  db: AccountQueryable,
  input: { challengeId: string; accountId: string; body: string; now: Date },
): Promise<number> {
  const result = await db.query(
    `INSERT INTO challenge_entries (challenge_id, account_id, body, created_at, updated_at)
     VALUES ($1::text, $2::text, $3::text, $4::timestamptz, $4::timestamptz)
     ON CONFLICT (challenge_id, account_id) DO UPDATE SET
       body = $3::text, updated_at = $4::timestamptz, ai_score = NULL, ai_feedback = NULL
     RETURNING id`,
    [input.challengeId, input.accountId, input.body, input.now.toISOString()],
  );
  return Number((result.rows[0] as { id: number | string }).id);
}

export async function saveGrade(
  db: AccountQueryable,
  input: { entryId: number; score: number; feedback: string },
): Promise<void> {
  await db.query(
    `UPDATE challenge_entries SET ai_score = $2::int, ai_feedback = $3::text WHERE id = $1::bigint`,
    [input.entryId, input.score, input.feedback],
  );
}

export async function readEntry(
  db: AccountQueryable,
  id: number,
): Promise<{ challengeId: string; accountId: string; hidden: boolean } | undefined> {
  const result = await db.query(
    `SELECT challenge_id, account_id, hidden FROM challenge_entries WHERE id = $1::bigint`,
    [id],
  );
  const row = result.rows[0] as
    | { challenge_id: string; account_id: string; hidden: boolean }
    | undefined;
  return row
    ? { challengeId: row.challenge_id, accountId: row.account_id, hidden: row.hidden }
    : undefined;
}

export async function toggleEntryVote(
  db: AccountQueryable,
  input: { entryId: number; accountId: string },
): Promise<{ votes: number; voted: boolean }> {
  const removed = await db.query(
    `DELETE FROM entry_votes WHERE entry_id = $1::bigint AND account_id = $2::text RETURNING entry_id`,
    [input.entryId, input.accountId],
  );
  const voted = removed.rows.length === 0;
  if (voted) {
    await db.query(
      `INSERT INTO entry_votes (entry_id, account_id) VALUES ($1::bigint, $2::text) ON CONFLICT DO NOTHING`,
      [input.entryId, input.accountId],
    );
  }
  const counted = await db.query(
    `UPDATE challenge_entries SET votes = (SELECT count(*) FROM entry_votes WHERE entry_id = $1::bigint)
      WHERE id = $1::bigint RETURNING votes`,
    [input.entryId],
  );
  return { votes: Number((counted.rows[0] as { votes: number }).votes), voted };
}

export async function setEntryHidden(
  db: AccountQueryable,
  id: number,
  hidden: boolean,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE challenge_entries SET hidden = $2::boolean WHERE id = $1::bigint AND rank IS NULL RETURNING id`,
    [id, hidden],
  );
  return result.rows.length > 0;
}

/**
 * Settles a finished challenge once: claims it, ranks the top three visible entries, and pays each
 * its place's tokens (within the monthly reward cap) and the badge. A second call does nothing.
 * Returns true when this call settled it.
 */
export async function settleChallenge(
  db: AccountQueryable,
  input: { id: string; now: Date },
): Promise<boolean> {
  const claimed = await db.query(
    `UPDATE challenges SET settled_at = $2::timestamptz
      WHERE id = $1::text AND settled_at IS NULL AND voting_ends_at <= $2::timestamptz
      RETURNING reward_1, reward_2, reward_3`,
    [input.id, input.now.toISOString()],
  );
  const row = claimed.rows[0] as
    | { reward_1: number | string; reward_2: number | string; reward_3: number | string }
    | undefined;
  if (!row) return false;
  const rewards = [Number(row.reward_1), Number(row.reward_2), Number(row.reward_3)];
  const top = await db.query(
    `SELECT id, account_id FROM challenge_entries
      WHERE challenge_id = $1::text AND NOT hidden
      ORDER BY votes DESC, ai_score DESC NULLS LAST, created_at, id
      LIMIT 3`,
    [input.id],
  );
  const winners = top.rows as Array<{ id: number | string; account_id: string }>;
  for (const [index, winner] of winners.entries()) {
    const credited =
      rewards[index]! > 0
        ? await creditBonusTokens(db, accountOwnerId(winner.account_id), input.now, rewards[index]!)
        : 0;
    await db.query(
      `UPDATE challenge_entries SET rank = $2::int, reward = $3::bigint WHERE id = $1::bigint`,
      [winner.id, index + 1, credited],
    );
    await db.query(
      `INSERT INTO badges (owner_id, badge_code, earned_at)
       VALUES ($1::text, $2::text, $3::timestamptz)
       ON CONFLICT (owner_id, badge_code) DO NOTHING`,
      [accountOwnerId(winner.account_id), CHALLENGE_BADGE, input.now.toISOString()],
    );
  }
  return true;
}

export interface LeaderRow {
  username: string;
  points: number;
  entries: number;
  podiums: number;
}

/** Points in the month the challenges closed: one per visible entry, plus 3, 2, 1 for places. */
export async function monthlyLeaderboard(
  db: AccountQueryable,
  input: { month: string; limit?: number },
): Promise<LeaderRow[]> {
  const result = await db.query(
    `SELECT a.username,
            count(*)::int AS entries,
            count(e.rank)::int AS podiums,
            (count(*) + COALESCE(sum(CASE e.rank WHEN 1 THEN $3::int WHEN 2 THEN $4::int WHEN 3 THEN $5::int ELSE 0 END), 0))::int AS points
       FROM challenge_entries e
       JOIN challenges c ON c.id = e.challenge_id
       JOIN accounts a ON a.id = e.account_id
      WHERE NOT e.hidden AND NOT c.hidden AND to_char(c.closes_at AT TIME ZONE 'UTC', 'YYYY-MM') = $1::text
      GROUP BY a.username
      ORDER BY points DESC, podiums DESC, a.username
      LIMIT $2::int`,
    [input.month, input.limit ?? 10, ...PLACE_POINTS],
  );
  return (result.rows as LeaderRow[]).map((row) => ({
    username: row.username,
    points: Number(row.points),
    entries: Number(row.entries),
    podiums: Number(row.podiums),
  }));
}

/** Reads a challenge from a request body, or says what is wrong with it. */
export function parseChallengeInput(
  body: Record<string, unknown>,
): { ok: true; input: ChallengeInput } | { ok: false; message: string } {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const title = text(body.title);
  const statement = text(body.statement);
  const referenceSolution = text(body.referenceSolution);
  if (title === '' || title.length > CHALLENGE_TITLE_MAX) {
    return { ok: false, message: `title must be 1 to ${CHALLENGE_TITLE_MAX} characters` };
  }
  if (statement === '' || statement.length > CHALLENGE_TEXT_MAX) {
    return { ok: false, message: `statement must be 1 to ${CHALLENGE_TEXT_MAX} characters` };
  }
  if (referenceSolution.length > CHALLENGE_TEXT_MAX) {
    return {
      ok: false,
      message: `referenceSolution must be at most ${CHALLENGE_TEXT_MAX} characters`,
    };
  }
  const opensAt = typeof body.opensAt === 'string' ? new Date(body.opensAt) : undefined;
  if (!opensAt || Number.isNaN(opensAt.getTime())) {
    return { ok: false, message: 'opensAt must be a date and time' };
  }
  const days = (value: unknown, min: number) =>
    Number.isInteger(value) && (value as number) >= min && (value as number) <= CHALLENGE_DAYS_MAX
      ? (value as number)
      : undefined;
  const submissionDays = days(body.submissionDays, 1);
  const votingDays = days(body.votingDays, 0);
  if (submissionDays === undefined || votingDays === undefined) {
    return {
      ok: false,
      message: `submissionDays must be 1 to ${CHALLENGE_DAYS_MAX} and votingDays 0 to ${CHALLENGE_DAYS_MAX}`,
    };
  }
  const rewards = Array.isArray(body.rewards) ? body.rewards : [];
  if (
    rewards.length !== 3 ||
    !rewards.every((r) => Number.isInteger(r) && r >= 0 && r <= CHALLENGE_REWARD_MAX)
  ) {
    return {
      ok: false,
      message: `rewards must be three whole numbers from 0 to ${CHALLENGE_REWARD_MAX}`,
    };
  }
  return {
    ok: true,
    input: {
      title,
      statement,
      referenceSolution,
      opensAt,
      submissionDays,
      votingDays,
      rewards: rewards as [number, number, number],
    },
  };
}
