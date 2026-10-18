import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import {
  COMMUNITY_REQUEST_BYTES,
  QUESTION_BODY_MAX,
  QUESTION_SORTS,
  QUESTION_TITLE_MAX,
  createQuestion,
  isBanned,
  listQuestions,
  type QuestionSort,
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
const ID_MAX = 200;
const PAGE_MAX = 100;
const OFFSET_MAX = 10_000;

/** A whole number in [min, max] from a query value, or undefined when it is missing or not one. */
function wholeNumber(value: string | null, min: number, max: number): number | undefined {
  if (value === null || !/^\d{1,6}$/.test(value)) return undefined;
  return Math.min(max, Math.max(min, Number(value)));
}

/**
 * Questions, newest activity first. Filters: `courseId`, `sceneId`, `mine=1`, `unsolved=1`, `q`
 * (words). `sort` is one of `QUESTION_SORTS`. A page is `limit` (1 to 100, 100 when absent) from
 * `offset`, and `hasMore` says whether another follows.
 * With `courseId` the answer also says whether the course is open to questions and whether the
 * viewer may post, so the classroom knows which button to show.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'community.read');
    if (refusal) return refusal;
    const query = request.nextUrl.searchParams;
    const courseId = query.get('courseId') ?? undefined;
    const sceneId = query.get('sceneId')?.slice(0, ID_MAX) || undefined;
    const search = (query.get('q') ?? '').slice(0, SEARCH_MAX);
    const sort = query.get('sort');
    const { questions, hasMore } = await listQuestions(ctx.db, {
      courseId,
      sceneId,
      authorId: query.get('mine') === '1' ? ctx.viewer.accountId : undefined,
      unsolved: query.get('unsolved') === '1',
      search: search === '' ? undefined : search,
      includeHidden: can(ctx.viewer, 'community.moderate'),
      sort: QUESTION_SORTS.includes(sort as QuestionSort) ? (sort as QuestionSort) : undefined,
      limit: wholeNumber(query.get('limit'), 1, PAGE_MAX),
      offset: wholeNumber(query.get('offset'), 0, OFFSET_MAX),
    });
    const canPost =
      can(ctx.viewer, 'community.post') && !(await isBanned(ctx.db, ctx.viewer.accountId!));
    const open = courseId ? (await readCommunityCourse(ctx.db, courseId)) !== undefined : undefined;
    return apiSuccess({ questions, hasMore, canPost, ...(open === undefined ? {} : { open }) });
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
