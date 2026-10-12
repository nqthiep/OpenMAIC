import { randomUUID } from 'crypto';
import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { authorize, bodyOf, invalid, learningRoute } from '@/lib/server/learning/http';
import { hashJoinCode, newJoinCode } from '@/lib/server/learning/join-code';
import { createClass, listAllClasses } from '@/lib/server/learning/store';

export const runtime = 'nodejs';

const NAME_MAX = 80;

/** Every class with its member count and courses. Operators and administrators only. */
export async function GET(request: NextRequest): Promise<Response> {
  return learningRoute(request, async (ctx) => {
    const refusal = authorize(ctx, 'class.manage');
    if (refusal) return refusal;
    return apiSuccess({ classes: await listAllClasses(ctx.db) });
  });
}

/** Creates a class. Returns its join code once. Body: { name }. */
export async function POST(request: Request): Promise<Response> {
  return learningRoute(
    request,
    async (ctx) => {
      const refusal = authorize(ctx, 'class.manage');
      if (refusal) return refusal;
      const body = await bodyOf(request);
      if (!body.ok) return body.response;
      const name = typeof body.body.name === 'string' ? body.body.name.trim() : '';
      if (name === '' || Array.from(name).length > NAME_MAX) {
        return invalid(`name must be text of 1 to ${NAME_MAX} characters`);
      }
      const id = randomUUID();
      const joinCode = newJoinCode();
      await createClass(ctx.db, {
        id,
        name,
        createdBy: ctx.viewer.accountId!,
        joinCodeHash: hashJoinCode(joinCode),
        now: ctx.now,
      });
      return apiSuccess({ id, name, joinCode }, 201);
    },
    { mutating: true },
  );
}
