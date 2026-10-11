import type { NextRequest } from 'next/server';
import type { Pool } from 'pg';

import { type UsageKind, type UsageRecord, readUsageRecords } from '@/lib/server/usage-storage';

import { requireAdmin } from './admin-routes';
import { jsonError, jsonResponse } from './http';
import { accountUserIdOf } from './owner';
import type { AccountStatus } from './repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The report is per administrator and changes with every call: never cached. */
const NO_STORE = { 'Cache-Control': 'no-store' };

/** What some rows add up to. Token columns count LLM rows; every row counts once in `byKind`. */
export interface UsageTally {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  byKind: Partial<Record<UsageKind, number>>;
}

/** The days a request asks for: `since` inclusive and `until` exclusive, in UTC ms. */
export interface UsageWindow {
  since?: number;
  until?: number;
  fromDay: string | null;
  toDay: string | null;
}

/** Rows split by the account that owns them. A row with no account is `unattributed`. */
export function groupByAccount(records: readonly UsageRecord[]): {
  byUser: Map<string, UsageRecord[]>;
  unattributed: UsageRecord[];
} {
  const byUser = new Map<string, UsageRecord[]>();
  const unattributed: UsageRecord[] = [];
  for (const record of records) {
    const userId = record.ownerId === undefined ? undefined : accountUserIdOf(record.ownerId);
    if (userId === undefined) {
      unattributed.push(record);
      continue;
    }
    const rows = byUser.get(userId);
    if (rows) rows.push(record);
    else byUser.set(userId, [record]);
  }
  return { byUser, unattributed };
}

export function tallyOf(records: readonly UsageRecord[]): UsageTally {
  const tally: UsageTally = { requests: 0, inputTokens: 0, outputTokens: 0, byKind: {} };
  for (const record of records) {
    tally.requests += 1;
    tally.inputTokens += record.inputTokens;
    tally.outputTokens += record.outputTokens;
    tally.byKind[record.kind] = (tally.byKind[record.kind] ?? 0) + 1;
  }
  return tally;
}

function withTotal<T extends UsageTally>(tally: T): T & { totalTokens: number } {
  return { ...tally, totalTokens: tally.inputTokens + tally.outputTokens };
}

/** The start of a `YYYY-MM-DD` day in UTC, or undefined for anything that is not a real day. */
function utcDayStart(day: string): number | undefined {
  if (!DAY.test(day)) return undefined;
  const start = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(start) || new Date(start).toISOString().slice(0, 10) !== day) return undefined;
  return start;
}

/** `from` and `to` from a query, both optional and both inclusive. Undefined when a day is malformed or `from` is after `to`. */
export function usageWindow(params: URLSearchParams): UsageWindow | undefined {
  const fromDay = params.get('from') || null;
  const toDay = params.get('to') || null;
  const since = fromDay === null ? undefined : utcDayStart(fromDay);
  const toStart = toDay === null ? undefined : utcDayStart(toDay);
  if ((fromDay !== null && since === undefined) || (toDay !== null && toStart === undefined)) {
    return undefined;
  }
  if (since !== undefined && toStart !== undefined && since > toStart) return undefined;
  return {
    since,
    until: toStart === undefined ? undefined : toStart + DAY_MS,
    fromDay,
    toDay,
  };
}

export function inWindow(record: UsageRecord, window: UsageWindow): boolean {
  if (window.since !== undefined && record.createdAt < window.since) return false;
  return window.until === undefined || record.createdAt < window.until;
}

/** The `YYYY-MM` month names that overlap `[since, until)`, so only their log files are read. */
export function monthsBetween(since: number, until: number): string[] {
  const months: string[] = [];
  let year = new Date(since).getUTCFullYear();
  let month = new Date(since).getUTCMonth();
  while (Date.UTC(year, month, 1) < until) {
    months.push(`${year}-${String(month + 1).padStart(2, '0')}`);
    month += 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
  }
  return months;
}

interface NameRow extends Record<string, unknown> {
  id: string;
  username: string;
  display_name: string;
  status: AccountStatus;
}

async function accountNames(
  pool: Pool,
  userIds: readonly string[],
): Promise<Map<string, { username: string; displayName: string; status: AccountStatus }>> {
  const names = new Map<string, { username: string; displayName: string; status: AccountStatus }>();
  if (userIds.length === 0) return names;
  const result = await pool.query<NameRow>(
    'SELECT id, username, display_name, status FROM accounts_users WHERE id = ANY($1::uuid[])',
    [userIds],
  );
  for (const row of result.rows) {
    names.set(row.id, {
      username: row.username,
      displayName: row.display_name,
      status: row.status,
    });
  }
  return names;
}

/**
 * `GET /api/admin/usage?from=YYYY-MM-DD&to=YYYY-MM-DD`: the usage log grouped by
 * account, and the rows no account owns in their own group. Both days are
 * optional, inclusive, and in UTC. Only an administrator may read it.
 */
export async function handleAdminUsage(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const window = usageWindow(req.nextUrl.searchParams);
  if (window === undefined) {
    return jsonError(
      400,
      'INVALID_REQUEST',
      'from and to must be days (YYYY-MM-DD), and from must not be after to',
    );
  }
  const months =
    window.since !== undefined && window.until !== undefined
      ? monthsBetween(window.since, window.until)
      : undefined;
  const records = (await readUsageRecords({ months })).filter((record) => inWindow(record, window));
  const { byUser, unattributed } = groupByAccount(records);
  const names = await accountNames(gate.pool, [...byUser.keys()]);
  const accounts = [...byUser].map(([userId, rows]) => {
    const name = names.get(userId);
    return {
      userId,
      username: name?.username ?? null,
      displayName: name?.displayName ?? null,
      status: name?.status ?? null,
      ...withTotal(tallyOf(rows)),
    };
  });
  accounts.sort(
    (a, b) =>
      b.totalTokens - a.totalTokens ||
      b.requests - a.requests ||
      (a.username ?? '').localeCompare(b.username ?? ''),
  );
  return jsonResponse(
    {
      success: true,
      from: window.fromDay,
      to: window.toDay,
      accounts,
      unattributed: withTotal(tallyOf(unattributed)),
      totals: withTotal(tallyOf(records)),
    },
    200,
    [],
    NO_STORE,
  );
}
