import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import {
  COMMUNITY_REQUEST_BYTES,
  QUESTION_BODY_MAX,
  QUESTION_TITLE_MAX,
  createQuestion,
  isBanned,
  listQuestions,
} from '@/lib/server/learning/community';
import { readCommunityCourse } from '@/lib/server/learning/community-course';
import {
  authorize,
  bodyOf,
  communityPostRefusal,
  invalid,
  learningRoute,
} from '@/lib/server/learning/http';

export const runtime = 'nodejs';

const SEARCH_MAX = 100;

/**
 * Questions, newest activity first. Filters: `courseId`, `mine=1`, `unsolved=1`, `q` (words).
 * With `courseId` the answer also says whether the course is open to questions and whether the
 * viewer may post, so the classroom knows which button to show.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'community.read');
    if (refusal) return refusal;
    const query = request.nextUrl.searchParams;
    const courseId = query.get('courseId') ?? undefined;
    const search = (query.get('q') ?? '').slice(0, SEARCH_MAX);
    const questions = await listQuestions(ctx.db, {
      courseId,
      authorId: query.get('mine') === '1' ? ctx.viewer.accountId : undefined,
      unsolved: query.get('unsolved') === '1',
      search: search === '' ? undefined : search,
      includeHidden: can(ctx.viewer, 'community.moderate'),
    });
    const canPost =
      can(ctx.viewer, 'community.post') && !(await isBanned(ctx.db, ctx.viewer.accountId!));
    const open = courseId ? (await readCommunityCourse(ctx.db, courseId)) !== undefined : undefined;
    return apiSuccess({ questions, canPost, ...(open === undefined ? {} : { open }) });
  });
}

/** Asks a question. Body: { courseId, sceneId?, title, body }. Members only, on an open course. */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = await communityPostRefusal(ctx);
      if (refusal) return refusal;
      const read = await bodyOf(request, COMMUNITY_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const { courseId, sceneId } = read.body;
      const title = typeof read.body.title === 'string' ? read.body.title.trim() : '';
      const body = typeof read.body.body === 'string' ? read.body.body.trim() : '';
      if (typeof courseId !== 'string') return invalid('courseId is required');
      if (sceneId !== undefined && sceneId !== null && typeof sceneId !== 'string') {
        return invalid('sceneId must be text');
      }
      if (title === '' || title.length > QUESTION_TITLE_MAX) {
        return invalid(`title must be 1 to ${QUESTION_TITLE_MAX} characters`);
      }
      if (body.length > QUESTION_BODY_MAX) {
        return invalid(`body must be at most ${QUESTION_BODY_MAX} characters`);
      }
      const course = await readCommunityCourse(ctx.db, courseId);
      if (!course) {
        return apiError(
          'FORBIDDEN',
          403,
          'Questions are open on previews and shared courses only.',
        );
      }
      let sceneTitle: string | null = null;
      if (typeof sceneId === 'string') {
        const scene = course.scenes.find((s) => s.id === sceneId);
        if (!scene) return invalid('No such scene in this course');
        sceneTitle = scene.title;
      }
      const id = randomUUID();
      await createQuestion(ctx.db, {
        id,
        courseId,
        courseTitle: course.title,
        sceneId: typeof sceneId === 'string' ? sceneId : null,
        sceneTitle,
        authorId: ctx.viewer.accountId!,
        title,
        body,
        now: ctx.now,
      });
      return apiSuccess({ id }, 201);
    },
    { mutating: true },
  );
}
