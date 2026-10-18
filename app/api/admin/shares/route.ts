import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { authorize, invalid, learningRoute } from '@/lib/server/learning/http';
import { listCourseShares, type ShareState } from '@/lib/server/learning/store';
import { listPendingSnapshots } from '@/lib/server/learning/course-snapshot';
import { readRemixSources } from '@/lib/server/learning/remix';

export const runtime = 'nodejs';

/**
 * Share records in one state: `pending` requests waiting for a decision, or `shared` courses.
 * The pending list also holds shared courses whose owner sent an updated version (`update: true`).
 * A row that came with a course package carries its summary, so staff see what they approve.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'share.decide');
    if (refusal) return refusal;
    const state = request.nextUrl.searchParams.get('state') ?? 'pending';
    if (state !== 'pending' && state !== 'shared')
      return invalid('state must be pending or shared');
    const snapshots = await listPendingSnapshots(ctx.db);
    const rows = await listCourseShares(ctx.db, state as ShareState);
    const updates =
      state === 'pending'
        ? (await listCourseShares(ctx.db, 'shared')).filter((row) => snapshots.has(row.courseId))
        : [];
    const all = [...rows, ...updates];
    const remixes = await readRemixSources(
      ctx.db,
      all.map((row) => row.courseId),
    );
    const shares = all.map((row) => {
      const snapshot = snapshots.get(row.courseId);
      const remixOf = remixes.get(row.courseId);
      return {
        ...row,
        ...(remixOf ? { remixOf } : {}),
        update: row.state === 'shared' && snapshot !== undefined,
        ...(snapshot
          ? { snapshot: { ...snapshot.summary, submittedAt: snapshot.submittedAt } }
          : {}),
      };
    });
    return apiSuccess({ shares });
  });
}
