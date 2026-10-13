/**
 * One user-owned Skill body, without bloating the global picker payload.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import {
  deleteUserSkill,
  findUserSkill,
  UserSkillError,
} from '@/lib/server/agent-runtime/user-skills';
import { withRequestOwnerId } from '@/lib/server/agent-runtime/with-owner';
import { apiError } from '@/lib/server/api-response';
import { ownerApiError } from '@/lib/server/agent-runtime/route-response';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');
  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id } = await params;
    const skill = await findUserSkill(id, ownerId);
    if (!skill) return apiError('NOT_FOUND', 404, 'Not found');
    return NextResponse.json(
      { id: skill.id, content: skill.content },
      { headers: responseHeaders },
    );
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');
  return withRequestOwnerId(req, async (ownerId, responseHeaders) => {
    const { id } = await params;
    if (!id.startsWith('usk_')) {
      return ownerApiError(
        'SKILL_BUILTIN_DELETE',
        405,
        'Built-in skills cannot be deleted.',
        responseHeaders,
      );
    }
    try {
      await deleteUserSkill(ownerId, id);
      return new Response(null, { status: 204, headers: responseHeaders });
    } catch (error) {
      if (error instanceof UserSkillError && error.code === 'not-found') {
        return ownerApiError('NOT_FOUND', 404, 'Not found', responseHeaders);
      }
      throw error;
    }
  });
}
