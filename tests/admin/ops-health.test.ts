import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deriveAlerts, type OpsHealth } from '@/lib/admin/ops-alerts';
import { buildOpsHealth } from '@/lib/admin/ops-health';
import { ensureAccountSchema } from '@/lib/server/accounts/store';
import { ensureLearningSchema } from '@/lib/server/learning/schema';
import { readDashboardCounts, readOpsHealthFacts } from '@/lib/server/learning/store';
import type { UsageRecord } from '@/lib/server/usage-storage';

const NOW = new Date('2026-10-12T10:00:00.000Z');
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY).toISOString();

/** The diagram-only parts of OpsHealth, which no alert reads. */
const EMPTY = {
  accounts: { learner: 0, operator: 0, admin: 0, disabled: 0 },
  accessRequests: { pending: 0, approved: 0, rejected: 0 },
  shares: { pending: 0, shared: 0 },
  previews: 0,
  classes: [],
  usageByKind: [],
};

let pg: PGlite;
const db = { query: (text: string, params?: unknown[]) => pg.query(text, params) };

function llm(ownerId: string, tokens: number, createdAt = NOW.getTime()): UsageRecord {
  return {
    id: `${ownerId}-${createdAt}-${tokens}`,
    createdAt,
    kind: 'llm',
    source: 'test',
    providerId: 'p',
    modelId: 'm',
    modelString: 'p:m',
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    ownerId,
  };
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.waitReady;
  await ensureAccountSchema(db);
  await ensureLearningSchema(db);
  // full: over quota; near: 85%; soon: expires in 2 days; old: expired; paused: suspended;
  // fresh: learner with no membership; gone: disabled; op: staff, never metered.
  for (const id of ['full', 'near', 'soon', 'old', 'paused', 'fresh', 'gone']) {
    await pg.query(`INSERT INTO accounts (id, username, password_hash) VALUES ($1, $1, 'x')`, [id]);
  }
  await pg.query(
    `INSERT INTO accounts (id, username, password_hash, role) VALUES ('op', 'op', 'x', 'operator')`,
  );
  await pg.query(`UPDATE accounts SET disabled_at = $1 WHERE id = 'gone'`, [at(-1)]);
  // Every plan began five days before NOW, so the running cycle is 7/10 to 7/11 (a plan from before
  // periods existed is read as one period from its grant to its expiry).
  const grant = `INSERT INTO memberships (account_id, status, expires_at, monthly_token_quota, granted_by, granted_at)
                 VALUES ($1, $2, $3, $4, 'op', $5)`;
  await pg.query(grant, ['full', 'active', at(30), 1000, at(-5)]);
  await pg.query(grant, ['near', 'active', at(30), 1000, at(-5)]);
  await pg.query(grant, ['soon', 'active', at(2), 1000, at(-5)]);
  await pg.query(grant, ['old', 'active', at(-3), 1000, at(-8)]);
  await pg.query(grant, ['paused', 'suspended', at(30), 1000, at(-5)]);
  // Rewards are kept per cycle, under the instant the cycle began. One under a calendar month, as
  // older rows are, belongs to no cycle and counts for nothing.
  await pg.query(
    `INSERT INTO quota_bonus (owner_id, month, tokens) VALUES ('acct:near', $1, 100)`,
    [at(-5)],
  );
  await pg.query(
    `INSERT INTO quota_bonus (owner_id, month, tokens) VALUES ('acct:full', '2026-10', 5000)`,
  );
  await pg.query(
    `INSERT INTO access_requests (account_id, state, requested_at) VALUES ('fresh', 'pending', $1)`,
    [at(-3)],
  );
}, 60_000);

afterAll(async () => {
  await pg?.close();
});

describe('operations health', () => {
  it('reads memberships, quota use, waiting requests and daily activity', async () => {
    const facts = await readOpsHealthFacts(db, NOW);
    expect(facts.memberships).toEqual({
      active: 2,
      expiringSoon: 1,
      expired: 1,
      suspended: 1,
      none: 1,
    });
    expect(facts.accounts).toEqual({ learner: 6, operator: 1, admin: 0, disabled: 1 });
    expect(facts.accessRequests).toEqual({ pending: 1, approved: 0, rejected: 0 });
    expect(facts.expiring.map((r) => r.username)).toEqual(['soon']);
    expect(facts.oldestPendingAccessRequest).toBe(at(-3));

    const records = [
      llm('acct:full', 1000),
      llm('acct:near', 935), // 85% of 1000 + 100 bonus
      llm('acct:soon', 100),
      llm('acct:op', 99_999),
      llm('acct:full', 5, NOW.getTime() - 20 * DAY), // before the cycle began and outside the chart
    ];
    const health = buildOpsHealth(
      await readDashboardCounts(db, NOW),
      facts,
      [
        { id: 'c1', name: 'small', memberCount: 1, courseIds: [] },
        { id: 'c2', name: 'big', memberCount: 9, courseIds: ['x', 'y'] },
      ],
      records,
      NOW,
    );
    expect(health.quota).toEqual([
      { username: 'full', used: 1000, limit: 1000 },
      { username: 'near', used: 935, limit: 1100 },
    ]);
    expect(health.dailyRequests).toHaveLength(14);
    expect(health.classes[0]).toEqual({ name: 'big', members: 9, courses: 2 });
    expect(health.usageByKind[0]).toEqual({ kind: 'llm', requests: 4 });
    expect(health.dailyRequests.at(-1)).toEqual({ day: '2026-10-12', requests: 4 });

    const alerts = deriveAlerts(health, 0, NOW);
    expect(alerts.map((a) => [a.id, a.severity])).toEqual([
      ['noProviders', 'critical'],
      ['quotaOver', 'critical'],
      ['accessRequestsOverdue', 'critical'],
      ['quotaNear', 'warning'],
      ['expiringSoon', 'warning'],
      ['expired', 'info'],
    ]);
    expect(alerts.find((a) => a.id === 'quotaOver')?.names).toEqual(['full']);
    expect(alerts.find((a) => a.id === 'accessRequestsOverdue')?.hours).toBe(72);
  });

  it('says nothing when all is well, and notices a quiet deployment', () => {
    const calm: OpsHealth = {
      counts: { activeMembers: 3, pendingShares: 0, pendingAccessRequests: 0, classes: 1 },
      memberships: { active: 3, expiringSoon: 0, expired: 0, suspended: 0, none: 0 },
      ...EMPTY,
      oldestPendingAccessRequest: null,
      oldestPendingShare: null,
      expiring: [],
      quota: [],
      dailyRequests: [5, 2, 1].map((requests, i) => ({ day: `2026-10-1${i}`, requests })),
    };
    expect(deriveAlerts(calm, 4, NOW)).toEqual([]);
    expect(deriveAlerts(calm, null, NOW)).toEqual([]);

    const quiet = {
      ...calm,
      dailyRequests: calm.dailyRequests.map((d) => ({ ...d, requests: 0 })),
    };
    expect(deriveAlerts(quiet, 4, NOW).map((a) => a.id)).toEqual(['quiet']);
  });

  it('marks a fresh access request as waiting, an old one as overdue', () => {
    const base: OpsHealth = {
      counts: { activeMembers: 0, pendingShares: 2, pendingAccessRequests: 1, classes: 0 },
      memberships: { active: 0, expiringSoon: 0, expired: 0, suspended: 0, none: 1 },
      ...EMPTY,
      oldestPendingAccessRequest: at(-1),
      oldestPendingShare: at(-4),
      expiring: [],
      quota: [],
      dailyRequests: [],
    };
    expect(deriveAlerts(base, 1, NOW).map((a) => [a.id, a.severity])).toEqual([
      ['accessRequestsPending', 'warning'],
      ['sharesOverdue', 'warning'],
    ]);
  });
});
