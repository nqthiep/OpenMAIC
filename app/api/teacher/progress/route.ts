/**
 * GET /api/teacher/progress — the cross-learner progress report for teachers and parents.
 *
 * Behind `TUTOR_TEACHER_CODE` only (see `lib/server/teacher-gate.ts`): it reads every learner's
 * `tutorLearning` and `quizAttempt` records, which the owner-scoped stores never expose together.
 */
import type { NextRequest } from 'next/server';

import type { Queryable } from '@openmaic/storage/document/pg';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError } from '@/lib/server/api-response';
import { TEACHER_COOKIE, hasTeacherAccess, teacherCode } from '@/lib/server/teacher-gate';
import { loadProgressRecords, summarize } from '@/lib/tutor/door/progress';
import { msg } from '@/lib/tutor/catalog/messages';
import { widgetRegistry } from '@/lib/widgets';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = teacherCode();
  if (!code || !isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });
  if (!hasTeacherAccess(req.cookies.get(TEACHER_COOKIE)?.value, code)) {
    return apiError('UNAUTHENTICATED', 401, 'Teacher code required');
  }

  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const rows = await loadProgressRecords(pool as unknown as Queryable);
  const report = summarize(rows, (id) => {
    const entry = widgetRegistry.findWalkthrough(id);
    if (!entry) return null;
    return {
      title: msg(entry.title, 'vi-VN'),
      beatCount: entry.beatDefs.length,
    };
  });
  return Response.json(report, { headers: { 'cache-control': 'no-store' } });
}
