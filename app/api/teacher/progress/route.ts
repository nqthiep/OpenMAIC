/**
 * GET /api/teacher/progress — the cross-learner progress report for teachers and parents.
 *
 * Behind the teacher cookie only (see `lib/server/teacher-gate.ts`): it reads every learner's
 * `tutorLearning` and `quizAttempt` records, which the owner-scoped stores never expose together.
 * 403 while the teacher code is not set, 404 without a database, 401 without the teacher cookie.
 */
import type { NextRequest } from 'next/server';

import type { Queryable } from '@openmaic/storage/document/pg';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';
import { apiError } from '@/lib/server/api-response';
import { TEACHER_COOKIE, hasTeacherAccess, teacherCode } from '@/lib/server/teacher-gate';
import { msg } from '@/lib/tutor/catalog/messages';
import { presetFrames } from '@/lib/tutor/engine/preset-frames';
import { loadProgressRecords, summarize, type LessonMeta } from '@/lib/tutor/door/progress';
import { widgetRegistry } from '@/lib/widgets';
import type { AnyWalkthroughEntry } from '@/lib/widgets/types';

export const runtime = 'nodejs';

/** Distinct beat ids a preset plays, from the frames the tutor serves; null when the preset cannot run. */
function beatIdsOf(entry: AnyWalkthroughEntry, presetId: string): readonly string[] | null {
  const preset = entry.presets.find((p) => p.id === presetId);
  if (!preset) return null;
  try {
    const ids = new Set<string>();
    for (const frame of presetFrames(entry, preset, 'vi-VN').frames) {
      for (const tag of frame.meta.tags ?? []) {
        if (tag.startsWith('beat:')) ids.add(tag.slice('beat:'.length));
      }
    }
    return [...ids];
  } catch {
    return null;
  }
}

function lessonMetaOf(entry: AnyWalkthroughEntry): LessonMeta {
  const presets = new Map<string, readonly string[] | null>();
  return {
    title: msg(entry.title, 'vi-VN'),
    beatCount: entry.beatDefs.length,
    beatLabels: Object.fromEntries(entry.beatDefs.map((d) => [d.id, msg(d.label, 'vi-VN')])),
    presetBeats(presetId) {
      if (!presets.has(presetId)) presets.set(presetId, beatIdsOf(entry, presetId));
      return presets.get(presetId) ?? null;
    },
  };
}

export async function GET(req: NextRequest) {
  const code = teacherCode();
  if (!code) return apiError('INVALID_REQUEST', 403, 'Teacher code is not set on the server');
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });
  if (!hasTeacherAccess(req.cookies.get(TEACHER_COOKIE)?.value, code)) {
    return apiError('UNAUTHENTICATED', 401, 'Teacher code required');
  }

  const metas = new Map<string, LessonMeta | null>();
  const lessonMeta = (id: string): LessonMeta | null => {
    if (!metas.has(id)) {
      const entry = widgetRegistry.findWalkthrough(id);
      metas.set(id, entry ? lessonMetaOf(entry) : null);
    }
    return metas.get(id)!;
  };

  const { pool } = await getServerPersistenceProvider(process.env.DATABASE_URL ?? '');
  const { records, truncated } = await loadProgressRecords(pool as unknown as Queryable);
  const report = summarize(records, lessonMeta, undefined, truncated);
  return Response.json(report, { headers: { 'cache-control': 'no-store' } });
}
