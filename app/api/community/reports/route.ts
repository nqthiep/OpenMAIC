import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  REPORT_REASON_MAX,
  addReport,
  listOpenReports,
  readAnswer,
  readQuestion,
  resolveReports,
  type ReportKind,
} from '@/lib/server/learning/community';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';

export const runtime = 'nodejs';

const QUESTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function targetOf(
  body: Record<string, unknown>,
): { kind: ReportKind; targetId: string } | undefined {
  const { kind, targetId } = body;
  if (kind === 'question' && typeof targetId === 'string' && QUESTION_ID_PATTERN.test(targetId)) {
    return { kind, targetId };
  }
  if (kind === 'answer' && (typeof targetId === 'string' || typeof targetId === 'number')) {
    const text = String(targetId);
    if (/^\d{1,15}$/.test(text)) return { kind, targetId: text };
  }
  return undefined;
}

/** Items with open reports, most reported first. Staff only. */
export async function GET(request: Request): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'community.moderate');
    if (refusal) return refusal;
    return apiSuccess({ reports: await listOpenReports(ctx.db) });
  });
}

/** Reports a question or an answer. Body: { kind, targetId, reason }. Any signed-in account. */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.read');
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const target = targetOf(read.body);
      if (!target) return invalid('kind must be question or answer, with its id');
      const reason = typeof read.body.reason === 'string' ? read.body.reason.trim() : '';
      if (reason === '' || reason.length > REPORT_REASON_MAX) {
        return invalid(`reason must be 1 to ${REPORT_REASON_MAX} characters`);
      }
      const exists =
        target.kind === 'question'
          ? await readQuestion(ctx.db, target.targetId)
          : await readAnswer(ctx.db, Number(target.targetId));
      if (!exists) return apiError('NOT_FOUND', 404, 'Nothing to report.');
      await addReport(ctx.db, {
        ...target,
        reporterId: ctx.viewer.accountId!,
        reason,
        now: ctx.now,
      });
      return apiSuccess({ reported: true });
    },
    { mutating: true },
  );
}

/** Closes the open reports of an item, after hiding it or deciding it is fine. Staff only. */
export async function PATCH(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.moderate');
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      const target = targetOf(read.body);
      if (!target) return invalid('kind must be question or answer, with its id');
      await resolveReports(ctx.db, { ...target, actorId: ctx.viewer.accountId!, now: ctx.now });
      return apiSuccess({ resolved: true });
    },
    { mutating: true },
  );
}
