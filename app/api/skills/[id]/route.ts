/** Download the OpenMAIC skill, a builtin agent skill, or one owner skill as zip. */
import type { NextRequest } from 'next/server';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { findUserSkill } from '@/lib/server/agent-runtime/user-skills';
import { apiError } from '@/lib/server/api-response';
import { ownerApiError } from '@/lib/server/agent-runtime/route-response';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import {
  buildBuiltinSkillZip,
  buildOpenClawSkillZip,
  buildUserSkillZip,
  isSafeSkillId,
} from '@/lib/server/skill-export';

export const runtime = 'nodejs';

function zipResponse(id: string, zip: Buffer, headers = new Headers()): Response {
  headers.set('Content-Type', 'application/zip');
  headers.set('Content-Disposition', `attachment; filename="${id}-skill.zip"`);
  headers.set('Cache-Control', 'no-store');
  return new Response(new Uint8Array(zip), { headers });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');
  const { id } = await params;
  if (!isSafeSkillId(id)) return apiError('INVALID_REQUEST', 400, 'Invalid skill id');

  if (id === 'openmaic') {
    const zip = await buildOpenClawSkillZip();
    return zip ? zipResponse(id, zip) : apiError('NOT_FOUND', 404, 'Not found');
  }
  const builtin = await buildBuiltinSkillZip(id);
  if (builtin) return zipResponse(id, builtin);

  return withRequestOwner(req, async ({ ownerId }, responseHeaders) => {
    const skill = await findUserSkill(id, ownerId);
    if (!skill) return ownerApiError('NOT_FOUND', 404, 'Not found', responseHeaders);
    return zipResponse(
      id,
      await buildUserSkillZip({
        name: skill.name,
        title: skill.title,
        description: skill.description,
        content: skill.content,
      }),
      responseHeaders,
    );
  });
}
