import { buildOpsHealth, chartMonths } from '@/lib/admin/ops-health';
import { apiSuccess } from '@/lib/server/api-response';
import { currentMonth } from '@/lib/server/authz/viewer';
import { authorize, learningRoute } from '@/lib/server/learning/http';
import {
  listAllClasses,
  readDashboardCounts,
  readOpsHealthFacts,
} from '@/lib/server/learning/store';
import { countOpenReports } from '@/lib/server/learning/community';
import { countPendingShareUpdates } from '@/lib/server/learning/course-snapshot';
import { countWaitingSupportThreads } from '@/lib/server/learning/support';
import { readUsageRecords } from '@/lib/server/usage-storage';

export const runtime = 'nodejs';

/**
 * The operations overview: what needs a person (waiting requests, quota, expiring memberships,
 * activity) and the state of accounts, review queues, classes and AI usage for its diagrams.
 */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'dashboard.view');
    if (refusal) return refusal;
    const [counts, facts, classes, records, supportWaiting, openReports] = await Promise.all([
      readDashboardCounts(ctx.db, ctx.now),
      readOpsHealthFacts(ctx.db, ctx.now, currentMonth(ctx.now)),
      listAllClasses(ctx.db),
      readUsageRecords({ months: chartMonths(ctx.now) }),
      countWaitingSupportThreads(ctx.db),
      countOpenReports(ctx.db),
    ]);
    // Updates of shared courses wait in the same review queue as new share requests.
    const pendingUpdates = await countPendingShareUpdates(ctx.db);
    const health = buildOpsHealth(
      { ...counts, pendingShares: counts.pendingShares + pendingUpdates },
      facts,
      classes,
      records,
      ctx.now,
    );
    return apiSuccess({
      health: { ...health, counts: { ...health.counts, supportWaiting, openReports } },
    });
  });
}
