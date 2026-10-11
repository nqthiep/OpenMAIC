import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '@/proxy';
import {
  LEARN_ACCOUNT_API_ROUTES,
  LEARN_API_ROUTES,
  isLearnApiAllowed,
  type LearnApiRoute,
} from '@/lib/server/learn-api-gate';

const open = (method: string, pathname: string, accounts = false) =>
  isLearnApiAllowed({ method, pathname, accounts });

describe('the student API allowlist', () => {
  it.each([
    ['GET', '/api/health'],
    ['GET', '/api/access-code/status'],
    ['POST', '/api/access-code/verify'],
    ['POST', '/api/learn/start'],
    ['HEAD', '/api/stages/stage-abc'],
    ['GET', '/api/stage-meta/stage-abc'],
    ['GET', '/api/model-config'],
    ['GET', '/api/agents'],
    ['GET', '/api/widgets/policy'],
    ['POST', '/api/chat'],
    ['POST', '/api/chat/pi'],
    ['POST', '/api/chat/pi/whiteboard-visibility'],
    ['POST', '/api/quiz-grade'],
    ['GET', '/api/persistence/learner-key'],
    ['GET', '/api/persistence/documents/stage-abc'],
    ['GET', '/api/persistence/assets/asset-1/content'],
    ['POST', '/api/persistence/runtime/sessions'],
    ['GET', '/api/persistence/runtime/sessions/session-1'],
    ['DELETE', '/api/persistence/runtime/sessions/session-1'],
    ['PATCH', '/api/persistence/runtime/sessions/session-1/status'],
    ['GET', '/api/persistence/runtime/sessions/session-1/records'],
    ['POST', '/api/persistence/runtime/sessions/session-1/records'],
    ['GET', '/api/persistence/runtime/stages/stage-abc/learners/key-1/sessions'],
    ['POST', '/api/teacher/login'],
    ['POST', '/api/teacher/logout'],
    ['GET', '/api/teacher/progress'],
  ])('answers %s %s', (method, pathname) => {
    expect(open(method, pathname)).toBe(true);
  });

  it.each([
    // course creation, generation, media and PBL
    ['POST', '/api/generate-classroom'],
    ['GET', '/api/generate-classroom/capabilities'],
    ['GET', '/api/generate-classroom/job-1'],
    ['GET', '/api/generation-runs'],
    ['POST', '/api/generation-runs'],
    ['POST', '/api/generate/image'],
    ['POST', '/api/generate/video'],
    ['POST', '/api/generate/voice'],
    ['POST', '/api/generate/tts'],
    ['POST', '/api/pbl/v2/evaluate'],
    ['POST', '/api/pbl/v2/simulator'],
    ['POST', '/api/materials'],
    ['POST', '/api/parse-pdf'],
    ['POST', '/api/proxy-media'],
    ['POST', '/api/transcription'],
    // export and provider checks
    ['GET', '/api/export-video/capability'],
    ['POST', '/api/export-video/render'],
    ['POST', '/api/verify-model'],
    ['POST', '/api/verify-image-provider'],
    ['POST', '/api/provider/probe-models'],
    ['GET', '/api/server-providers'],
    // the workbench and the agent runtime
    ['GET', '/api/agent/runtime'],
    ['POST', '/api/agent/sessions'],
    ['GET', '/api/agent/skills'],
    ['GET', '/api/skills/skill-1'],
    ['GET', '/api/stages/stage-abc/manifest'],
    ['GET', '/api/stages/stage-abc/freshness'],
    // course writes and deletes
    ['GET', '/api/stages'],
    ['POST', '/api/stages'],
    ['GET', '/api/stages/stage-abc'],
    ['PUT', '/api/stages/stage-abc'],
    ['DELETE', '/api/stages/stage-abc'],
    ['POST', '/api/stages/stage-abc/publish'],
    ['PUT', '/api/persistence/documents/stage-abc'],
    ['DELETE', '/api/persistence/documents/stage-abc'],
    ['GET', '/api/persistence/documents'],
    ['PUT', '/api/persistence/documents/stage-abc/stage'],
    ['PUT', '/api/persistence/documents/stage-abc/scenes/scene-1'],
    ['POST', '/api/persistence/assets'],
    ['PUT', '/api/persistence/assets/asset-1/content'],
    ['POST', '/api/persistence/runtime/learners/merge'],
    ['DELETE', '/api/persistence/runtime/stages/stage-abc'],
    ['DELETE', '/api/persistence/runtime'],
    // the classic file-system media store: no lesson of the student door reads it
    ['GET', '/api/classroom-media/stage-abc/media/image.png'],
    // folders, settings, identity and usage
    ['POST', '/api/folders'],
    ['POST', '/api/folders/members'],
    ['PUT', '/api/model-config'],
    ['POST', '/api/model-config/import'],
    ['POST', '/api/agents'],
    ['POST', '/api/agents/import'],
    ['GET', '/api/usage'],
    ['GET', '/api/comfyui-workflows'],
    ['GET', '/api/azure-voices'],
    ['POST', '/api/identity/claim'],
    ['POST', '/api/identity/legacy-import-binding'],
    // a route that exists, asked with a method it does not export
    ['POST', '/api/widgets/policy'],
    ['GET', '/api/teacher/login'],
    ['POST', '/api/teacher/progress'],
    ['GET', '/api/learn/start'],
  ])('refuses %s %s', (method, pathname) => {
    expect(open(method, pathname)).toBe(false);
  });

  it('answers HEAD wherever a GET or a HEAD rule names the path, and nowhere else', () => {
    expect(open('HEAD', '/api/persistence/documents/stage-abc')).toBe(true);
    expect(open('HEAD', '/api/stages/stage-abc')).toBe(true);
    expect(open('GET', '/api/stages/stage-abc')).toBe(false);
    expect(open('HEAD', '/api/persistence/runtime/sessions')).toBe(false);
  });

  it('reads the method without regard to case', () => {
    expect(open('post', '/api/learn/start')).toBe(true);
  });

  it('ignores one trailing slash and refuses empty or dot segments', () => {
    expect(open('POST', '/api/learn/start/')).toBe(true);
    expect(open('POST', '/api/learn//start')).toBe(false);
    expect(open('GET', '/api/persistence/documents/..')).toBe(false);
    expect(open('GET', '/api/persistence/documents/./stage-abc')).toBe(false);
  });

  it('refuses a path with extra segments', () => {
    expect(open('POST', '/api/learn/start/extra')).toBe(false);
    expect(open('GET', '/api/health/extra')).toBe(false);
    expect(open('GET', '/api/persistence/documents/stage-abc/stage')).toBe(false);
  });

  it('leaves pages alone', () => {
    expect(open('POST', '/classroom/stage-abc')).toBe(true);
    expect(open('GET', '/learn')).toBe(true);
    expect(open('GET', '/')).toBe(true);
  });
});

describe('the account routes on a student deployment', () => {
  it.each([
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/logout'],
    ['POST', '/api/auth/logout-all'],
    ['GET', '/api/auth/me'],
    ['PATCH', '/api/auth/me'],
    ['POST', '/api/auth/password'],
    ['GET', '/api/admin/audit'],
    ['GET', '/api/admin/usage'],
    ['GET', '/api/admin/users'],
    ['POST', '/api/admin/users'],
    ['PATCH', '/api/admin/users/user-1'],
    ['POST', '/api/admin/users/user-1/reset-password'],
  ])('answers %s %s only when accounts are on', (method, pathname) => {
    expect(open(method, pathname, false)).toBe(false);
    expect(open(method, pathname, true)).toBe(true);
  });

  it('refuses the methods no account route exports', () => {
    expect(open('DELETE', '/api/admin/users/user-1', true)).toBe(false);
    expect(open('POST', '/api/auth/me', true)).toBe(false);
    expect(open('GET', '/api/auth/login', true)).toBe(false);
  });
});

const ROOT = join(__dirname, '..', '..');
const API_DIR = join(ROOT, 'app', 'api');

/** Next's path template for an `app/api` directory name: `[id]` is `:id`, `[...path]` is `*`. */
function segmentOf(name: string): string {
  if (name.startsWith('[...')) return '*';
  if (name.startsWith('[')) return `:${name.slice(1, -1)}`;
  return name;
}

/** Every `route.ts` under `app/api`: its path template and the HTTP methods it exports. */
function apiRoutes(dir = API_DIR, template = '/api'): Map<string, Set<string>> {
  const routes = new Map<string, Set<string>>();
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      for (const [path, methods] of apiRoutes(full, `${template}/${segmentOf(entry)}`)) {
        routes.set(path, methods);
      }
    } else if (entry === 'route.ts') {
      const source = readFileSync(full, 'utf8');
      const exported = source.matchAll(
        /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\b/g,
      );
      routes.set(template, new Set([...exported].map((match) => match[1])));
    }
  }
  return routes;
}

/** A path with every parameter and catch-all written as `:`, so the two spellings compare equal. */
const shapeOf = (path: string) =>
  path
    .split('/')
    .map((part) => (part.startsWith(':') || part === '*' ? ':' : part))
    .join('/');

describe('the allowlist names routes that exist and export the method', () => {
  const routes = apiRoutes();
  const shapes = new Map([...routes].map(([path, methods]) => [shapeOf(path), methods]));
  const rules: readonly LearnApiRoute[] = [...LEARN_API_ROUTES, ...LEARN_ACCOUNT_API_ROUTES];

  // `/api/persistence/**` is served by one catch-all route, which exports every method it answers.
  const exportsOf = (path: string) =>
    shapes.get(shapeOf(path)) ??
    (path.startsWith('/api/persistence/') ? shapes.get(shapeOf('/api/persistence/*')) : undefined);

  it.each(rules.map((rule) => [rule.methods.join(' '), rule.path]))(
    '%s %s has a route that exports it',
    (methods, path) => {
      const exported = exportsOf(path);
      expect(exported, `no route file for ${path}`).toBeDefined();
      for (const method of methods.split(' ')) {
        expect(exported!.has(method === 'HEAD' ? 'GET' : method), `${method} ${path}`).toBe(true);
      }
    },
  );

  // A plain sub-path has its own route file: it is not answered by the persistence catch-all.
  it('dispatches /api/learn/start to its own route file, which exports only POST', () => {
    expect(routes.get('/api/learn/start')).toEqual(new Set(['POST']));
  });
});

describe('the proxy on a student deployment', () => {
  beforeEach(() => {
    vi.stubEnv('ACCESS_CODE', '');
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const request = (method: string, path: string) =>
    new NextRequest(`http://localhost${path}`, { method });

  it('answers a route the lesson flow does not use with a 404 and one generic note', async () => {
    vi.stubEnv('OPENMAIC_HOME', 'learn');
    const res = await proxy(request('POST', '/api/generate-classroom'));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Không tìm thấy.');
  });

  it('lets a route the lesson flow uses through', async () => {
    vi.stubEnv('OPENMAIC_HOME', 'learn');
    const res = await proxy(request('POST', '/api/learn/start'));
    expect(res.status).toBe(200);
  });

  it('leaves the same route open outside a student deployment', async () => {
    vi.stubEnv('OPENMAIC_HOME', '');
    const res = await proxy(request('POST', '/api/generate-classroom'));
    expect(res.status).toBe(200);
  });
});
