import { accountOwnerId } from '@/lib/server/accounts/service';
import type { ClassRow, DashboardCounts, OpsHealthFacts } from '@/lib/server/learning/store';
import type { UsageRecord } from '@/lib/server/usage-storage';
import { CLASSES_SHOWN, QUOTA_SHOWN, type OpsHealth, type UsageKindName } from './ops-alerts';

/** Days in the request chart. */
export const CHART_DAYS = 14;

/** UTC months (`YYYY-MM`) the last CHART_DAYS days touch, which are the usage files to read. */
export function chartMonths(now: Date): string[] {
  const first = new Date(now.getTime() - (CHART_DAYS - 1) * 86_400_000);
  return [...new Set([first.toISOString().slice(0, 7), now.toISOString().slice(0, 7)])];
}

/**
 * The page's view of the deployment from the database facts and the usage records of
 * `chartMonths(now)`. Quota use counts LLM tokens the way `requireSpender` does, so a learner
 * listed at 100% is exactly one the server answers `QUOTA_EXCEEDED`.
 */
export function buildOpsHealth(
  counts: DashboardCounts,
  facts: OpsHealthFacts,
  classes: readonly ClassRow[],
  records: readonly UsageRecord[],
  now: Date,
): OpsHealth {
  const month = now.toISOString().slice(0, 7);
  const days = Array.from({ length: CHART_DAYS }, (_, i) =>
    new Date(now.getTime() - (CHART_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
  const perDay = new Map(days.map((day) => [day, 0]));
  const tokens = new Map<string, number>();
  const byKind: Record<UsageKindName, number> = { llm: 0, image: 0, video: 0, tts: 0, asr: 0 };
  for (const record of records) {
    const day = new Date(record.createdAt).toISOString().slice(0, 10);
    const n = perDay.get(day);
    if (n !== undefined) {
      perDay.set(day, n + 1);
      byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    }
    if (record.kind === 'llm' && record.ownerId && day.startsWith(month)) {
      const used = record.inputTokens + record.outputTokens + record.reasoningTokens;
      tokens.set(record.ownerId, (tokens.get(record.ownerId) ?? 0) + used);
    }
  }

  const quota = facts.metered
    .map((m) => {
      const owner = accountOwnerId(m.accountId);
      return {
        username: m.username,
        used: tokens.get(owner) ?? 0,
        limit: m.monthlyQuota + (facts.bonusByOwner.get(owner) ?? 0),
      };
    })
    .filter((r) => r.used >= r.limit * QUOTA_SHOWN)
    .sort((a, b) => b.used / Math.max(b.limit, 1) - a.used / Math.max(a.limit, 1));

  return {
    counts,
    memberships: facts.memberships,
    accounts: facts.accounts,
    accessRequests: facts.accessRequests,
    shares: facts.shares,
    previews: facts.previews,
    classes: [...classes]
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, CLASSES_SHOWN)
      .map((c) => ({ name: c.name, members: c.memberCount, courses: c.courseIds.length })),
    usageByKind: (Object.keys(byKind) as UsageKindName[])
      .map((kind) => ({ kind, requests: byKind[kind] }))
      .sort((a, b) => b.requests - a.requests),
    oldestPendingAccessRequest: facts.oldestPendingAccessRequest,
    oldestPendingShare: facts.oldestPendingShare,
    expiring: facts.expiring.map(({ username, expiresAt }) => ({ username, expiresAt })),
    quota,
    dailyRequests: days.map((day) => ({ day, requests: perDay.get(day) ?? 0 })),
  };
}
