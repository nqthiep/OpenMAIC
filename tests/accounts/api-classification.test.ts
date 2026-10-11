import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { gateDecision, routeKind } from '@/lib/accounts/gate';

/**
 * Every `app/api/**\/route.ts` is classified. `public` routes need no session
 * under the accounts gate; `protected` routes need a valid session. A route
 * without an entry fails the test, so each new route gets a decision on purpose.
 * The file list is read from the disk, not from git, so untracked routes count.
 */
type Access = 'public' | 'protected';

interface RouteClass {
  access: Access;
  why: string;
}

const CLASSIFIED: Record<string, RouteClass> = {
  'app/api/access-code/status/route.ts': {
    access: 'public',
    why: 'the access-code gate itself, reached before any session exists',
  },
  'app/api/access-code/verify/route.ts': {
    access: 'public',
    why: 'the access-code gate itself, reached before any session exists',
  },
  'app/api/admin/audit/route.ts': {
    access: 'protected',
    why: 'administrator route: a session is required, and the role is checked inside the route',
  },
  'app/api/admin/usage/route.ts': {
    access: 'protected',
    why: 'administrator route: a session is required, and the role is checked inside the route',
  },
  'app/api/admin/users/[id]/reset-password/route.ts': {
    access: 'protected',
    why: 'administrator route: a session is required, and the role is checked inside the route',
  },
  'app/api/admin/users/[id]/route.ts': {
    access: 'protected',
    why: 'administrator route: a session is required, and the role is checked inside the route',
  },
  'app/api/admin/users/route.ts': {
    access: 'protected',
    why: 'administrator route: a session is required, and the role is checked inside the route',
  },
  'app/api/agent/owner-events/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/runtime/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/sessions/[id]/cancel/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/sessions/[id]/events/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/sessions/[id]/messages/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/sessions/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/sessions/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/sessions/status/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/skills/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agent/skills/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agents/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agents/import/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/agents/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/auth/login/route.ts': {
    access: 'public',
    why: 'sign-in: the session is what it creates',
  },
  'app/api/auth/logout-all/route.ts': {
    access: 'protected',
    why: 'the account own route; a session is required',
  },
  'app/api/auth/logout/route.ts': {
    access: 'public',
    why: 'clears the cookie; works without a live session',
  },
  'app/api/auth/me/route.ts': {
    access: 'protected',
    why: 'the account own route; a session is required',
  },
  'app/api/auth/password/route.ts': {
    access: 'protected',
    why: 'the account own route; a session is required',
  },
  'app/api/azure-voices/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/chat/pi/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/chat/pi/whiteboard-visibility/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/chat/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/classroom-media/[classroomId]/[...path]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/comfyui-workflows/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/export-video/capability/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/export-video/render/[jobId]/download/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/export-video/render/[jobId]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/export-video/render/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/folders/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/folders/members/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/folders/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate-classroom/[jobId]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate-classroom/capabilities/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate-classroom/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate/image/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate/tts/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate/video/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generate/voice/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/[id]/confirm-outline/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/[id]/events/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/[id]/hold-outline/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/[id]/retry/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/events/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/generation-runs/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/health/route.ts': { access: 'public', why: 'liveness probe' },
  'app/api/identity/claim/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/identity/legacy-import-binding/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/learn/start/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/materials/[id]/extraction/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/materials/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/materials/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/model-config/import/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/model-config/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/parse-pdf/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/pbl/v2/evaluate/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/pbl/v2/instructor/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/pbl/v2/open-task/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/pbl/v2/simulator/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/pbl/v2/task/update/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/persistence/[...path]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/provider/probe-models/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/proxy-media/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/quiz-grade/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/server-providers/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/skills/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stage-meta/[stageId]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/freshness/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/generation-complete/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/manifest/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/publish/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/scenes/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/status/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/[id]/unpublish/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/stages/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/teacher/login/route.ts': {
    access: 'protected',
    why: 'reads across owners: closed while accounts are on, until the admin check exists',
  },
  'app/api/teacher/logout/route.ts': {
    access: 'protected',
    why: 'teacher route: closed while accounts are on, like the other teacher routes',
  },
  'app/api/teacher/progress/route.ts': {
    access: 'protected',
    why: 'reads across owners: closed while accounts are on, until the admin check exists',
  },
  'app/api/transcription/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/usage/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/verify-image-provider/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/verify-model/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/verify-pdf-provider/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/verify-video-provider/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
  'app/api/widgets/policy/route.ts': {
    access: 'protected',
    why: 'requires a valid session under the accounts gate',
  },
};

const ROOT = join(__dirname, '..', '..');
const API_DIR = join(ROOT, 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === 'route.ts' ? [relative(ROOT, path).split(sep).join('/')] : [];
  });
}

/** The URL a route file serves, with every dynamic segment filled by a sample value. */
function sampleUrl(file: string): string {
  const segments = file
    .replace(/^app\//, '')
    .replace(/\/route\.ts$/, '')
    .split('/')
    .map((segment) => {
      if (segment.startsWith('[...')) return 'a/b';
      if (segment.startsWith('[')) return 'sample';
      return segment;
    });
  return `/${segments.join('/')}`;
}

const files = routeFiles(API_DIR).sort();

describe('API route classification under the accounts gate', () => {
  it('reads the route files from disk', () => {
    expect(files.length).toBeGreaterThan(80);
  });

  it('classifies every route file', () => {
    expect(files.filter((file) => !(file in CLASSIFIED))).toEqual([]);
  });

  it('has no entry for a file that does not exist', () => {
    const present = new Set(files);
    expect(Object.keys(CLASSIFIED).filter((file) => !present.has(file))).toEqual([]);
  });

  it.each(files)('%s follows its classification', (file) => {
    const entry = CLASSIFIED[file];
    if (!entry) throw new Error(`${file} is not classified`);
    const url = sampleUrl(file);
    const kind = routeKind(url);
    if (entry.access === 'public') {
      expect(kind).toBe('public');
      expect(
        gateDecision({
          method: 'GET',
          pathname: url,
          search: '',
          host: 'app.example',
          headers: new Headers(),
          kind,
          session: 'none',
        }),
      ).toEqual({ action: 'next' });
      return;
    }
    expect(kind === 'api' || kind === 'closed').toBe(true);
    const refused = gateDecision({
      method: 'GET',
      pathname: url,
      search: '',
      host: 'app.example',
      headers: new Headers(),
      kind,
      session: 'none',
    });
    expect(refused.action).toBe('reject');
    if (kind === 'api') {
      expect(
        gateDecision({
          method: 'GET',
          pathname: url,
          search: '',
          host: 'app.example',
          headers: new Headers(),
          kind,
          session: 'valid',
        }),
      ).toEqual({ action: 'next' });
    }
  });
});
