import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  phaseAt,
  readChallenge,
  readEntry,
  setEntryHidden,
  toggleEntryVote,
} from '@/lib/server/learning/challenge';
import {
  authorize,
  bodyOf,
  communityPostRefusal,
  invalid,
  learningRoute,
} from '@/lib/server/learning/http';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

function entryIdOf(id: string): number | undefined {
  return /^\d{1,15}$/.test(id) ? Number(id) : undefined;
}

/** Votes for an entry, or takes the vote back, while voting runs. Members; not your own entry. */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = await communityPostRefusal(ctx);
      if (refusal) return refusal;
      const entryId = entryIdOf(id);
      const entry = entryId === undefined ? undefined : await readEntry(ctx.db, entryId);
      const challenge = entry
        ? await readChallenge(ctx.db, { id: entry.challengeId, staff: false, now: ctx.now })
        : undefined;
      if (!entry || entry.hidden || !challenge) {
        return apiError('NOT_FOUND', 404, 'No such entry.');
      }
      if (phaseAt(challenge, ctx.now) !== 'voting') {
        return apiError('FORBIDDEN', 403, 'Voting is not open for this challenge.');
      }
      if (entry.accountId === ctx.viewer.accountId) {
        return apiError('FORBIDDEN', 403, 'You cannot vote for your own entry.');
      }
      return apiSuccess({
        ...(await toggleEntryVote(ctx.db, { entryId: entryId!, accountId: ctx.viewer.accountId! })),
      });
    },
    { mutating: true },
  );
}

/** Hides or shows an entry that has no place yet. Body: { hidden }. Staff only. */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'community.moderate');
      if (refusal) return refusal;
      const read = await bodyOf(request);
      if (!read.ok) return read.response;
      if (typeof read.body.hidden !== 'boolean') return invalid('hidden must be true or false');
      const entryId = entryIdOf(id);
      if (entryId === undefined || !(await setEntryHidden(ctx.db, entryId, read.body.hidden))) {
        return apiError('NOT_FOUND', 404, 'No such entry, or it already has a place.');
      }
      return apiSuccess({ id: entryId, hidden: read.body.hidden });
    },
    { mutating: true },
  );
}
