/**
 * Agent runtime control plane — the installed skills.
 *
 *   GET /api/agent/skills -> [{ id, name, title, description, hasConstraints, source }]
 *
 * Drives the `/` picker (a skill the user names there becomes the session's
 * user-locked skill at creation). `title` is the skill's display name from its
 * frontmatter; every surface shows it beside the id, which stays the English
 * contract.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isAgentRuntimeConfigured } from '@/lib/config/feature-flags';
import { listSkills } from '@/lib/server/agent-runtime/skills';
import { createUserSkill, UserSkillError } from '@/lib/server/agent-runtime/user-skills';
import { apiError } from '@/lib/server/api-response';
import { ownerApiError } from '@/lib/server/agent-runtime/route-response';
import { withRequestOwner } from '@/lib/server/identity/with-owner';
import { ownerWriteErrorResponse } from '@/lib/persistence/owner-merges';
import {
  parseUserSkillMarkdown,
  parseUserSkillZip,
  UserSkillUploadError,
} from '@/lib/server/skill-export';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!isAgentRuntimeConfigured()) {
    return apiError('NOT_FOUND', 404, 'Not found');
  }
  return withRequestOwner(req, async ({ ownerId }, responseHeaders) => {
    const skills = await listSkills(ownerId);
    return NextResponse.json(
      skills.map((s) => ({
        id: s.id,
        name: s.name,
        ...(s.title ? { title: s.title } : {}),
        description: s.description,
        hasConstraints: !!s.constraints,
        source: s.source,
      })),
      { headers: responseHeaders },
    );
  });
}

/** Upload one owner Skill as the exporter zip or a bare canonical SKILL.md. */
export async function POST(req: NextRequest) {
  if (!isAgentRuntimeConfigured()) return apiError('NOT_FOUND', 404, 'Not found');
  return withRequestOwner(req, async ({ ownerId }, responseHeaders) => {
    try {
      const form = await req.formData();
      const upload = form.get('file');
      if (!upload || typeof upload === 'string' || typeof upload.arrayBuffer !== 'function') {
        return ownerApiError(
          'MISSING_REQUIRED_FIELD',
          400,
          'A skill file is required.',
          responseHeaders,
        );
      }
      const bytes = Buffer.from(await upload.arrayBuffer());
      // Exported owner zips are at most a little over the 64 KiB content cap.
      // Bound compressed input before JSZip expands it; field validation below
      // remains the authoritative create limit after parsing.
      if (bytes.byteLength > 1_048_576) {
        return ownerApiError(
          'PAYLOAD_TOO_LARGE',
          413,
          'The skill upload is too large.',
          responseHeaders,
        );
      }
      const input = upload.name.toLowerCase().endsWith('.zip')
        ? await parseUserSkillZip(bytes)
        : parseUserSkillMarkdown(bytes.toString('utf8'));
      const skill = await createUserSkill(ownerId, input, { source: 'request' });
      return NextResponse.json(
        {
          id: skill.id,
          name: skill.name,
          title: skill.title,
          description: skill.description,
          hasConstraints: false,
          source: 'user',
        },
        { status: 201, headers: responseHeaders },
      );
    } catch (error) {
      if (error instanceof UserSkillError) {
        const status = error.code === 'duplicate' || error.code === 'quota' ? 409 : 400;
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status, headers: responseHeaders },
        );
      }
      if (error instanceof UserSkillUploadError) {
        return NextResponse.json(
          { error: 'invalid-upload', message: error.message },
          { status: 400, headers: responseHeaders },
        );
      }
      const claimed = ownerWriteErrorResponse(error, responseHeaders);
      if (claimed) return claimed;
      throw error;
    }
  });
}
