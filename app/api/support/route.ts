import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { normalizeUsername } from '@/lib/server/accounts/validation';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { can } from '@/lib/server/authz/policy';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import {
  SUPPORT_BODY_MAX,
  SUPPORT_OPEN_LIMIT,
  SUPPORT_REQUEST_BYTES,
  SUPPORT_SUBJECT_MAX,
  countWaitingSupportThreadsOf,
  findAccountIdByUsername,
  listSupportThreads,
  openSupportThread,
} from '@/lib/server/learning/support';

export const runtime = 'nodejs';

/**
 * Support threads. A learner gets their own; staff get every account's, waiting ones first, and
 * may narrow with `?state=open|closed` or `?mine=1` (threads about the staff account itself).
 */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'support.open');
    if (refusal) return refusal;
    const state = request.nextUrl.searchParams.get('state');
    const staffView =
      can(ctx.viewer, 'support.manage') && request.nextUrl.searchParams.get('mine') !== '1';
    const threads = await listSupportThreads(ctx.db, {
      accountId: staffView ? undefined : ctx.viewer.accountId,
      state: state === 'open' || state === 'closed' ? state : undefined,
    });
    return apiSuccess({ threads });
  });
}

/**
 * Opens a thread. Body: { subject, body, username? }. A learner opens one about themself; staff
 * pass `username` to write to a learner first.
 */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'support.open');
      if (refusal) return refusal;
      const read = await bodyOf(request, SUPPORT_REQUEST_BYTES);
      if (!read.ok) return read.response;
      const subject = typeof read.body.subject === 'string' ? read.body.subject.trim() : '';
      const body = typeof read.body.body === 'string' ? read.body.body.trim() : '';
      if (subject === '' || subject.length > SUPPORT_SUBJECT_MAX) {
        return invalid(`subject must be 1 to ${SUPPORT_SUBJECT_MAX} characters`);
      }
      if (body === '' || body.length > SUPPORT_BODY_MAX) {
        return invalid(`body must be 1 to ${SUPPORT_BODY_MAX} characters`);
      }

      const accountId = ctx.viewer.accountId!;
      let target = accountId;
      if (read.body.username !== undefined) {
        const manage = authorize(ctx, 'support.manage');
        if (manage) return manage;
        const username = normalizeUsername(read.body.username);
        const found = username ? await findAccountIdByUsername(ctx.db, username) : undefined;
        if (!found) return apiError('NOT_FOUND', 404, 'No account with this username.');
        target = found;
      } else if ((await countWaitingSupportThreadsOf(ctx.db, accountId)) >= SUPPORT_OPEN_LIMIT) {
        return apiError(
          'RATE_LIMITED',
          429,
          `At most ${SUPPORT_OPEN_LIMIT} unanswered requests at a time.`,
        );
      }

      const id = randomUUID();
      await openSupportThread(ctx.db, {
        id,
        accountId: target,
        subject,
        body,
        authorId: accountId,
        fromStaff: target !== accountId,
        now: ctx.now,
      });
      return apiSuccess({ id }, 201);
    },
    { mutating: true },
  );
}
