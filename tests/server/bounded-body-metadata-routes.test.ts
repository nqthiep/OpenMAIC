// The folder and agent-session metadata routes read their JSON body through the shared
// bounded reader, so an oversized or endless body is refused before it is buffered.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { createFakeDocumentStore } from '../agent-runtime/_fake-document-store';
import { useProviders } from '../fixtures/provider-snapshot';

const MAX_BYTES = 1024 * 1024;

const mocks = vi.hoisted(() => ({
  fakeStore: null as ReturnType<typeof createFakeDocumentStore> | null,
  getSession: vi.fn(),
  setManualSessionTitle: vi.fn(),
  createSession: vi.fn(),
  postUserMessage: vi.fn(),
  softDeleteSession: vi.fn(),
  listSessionsByOwner: vi.fn(),
  inferSkillIdFromPrompt: vi.fn(),
  listSkills: vi.fn(),
  findSkill: vi.fn(),
  bindOwnerMaterialsToSession: vi.fn(),
  scheduleConversationTitle: vi.fn(),
}));

vi.mock('@/lib/config/feature-flags', () => ({
  isServerPersistenceConfigured: () => true,
  isAgentRuntimeEnabled: () => true,
  isAgentRuntimeConfigured: () => true,
}));
// Persistence is configured here (the folder routes need it), so the provider settings count as loaded,
// and a visitor may spend: these tests are about the body limit, not about access.
vi.mock('@/lib/server/authz/viewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/authz/viewer')>()),
  requireSpender: async () => undefined,
}));
vi.mock('@/lib/server/identity/resolve', async () =>
  (await import('../helpers/owner-resolution-mock')).ownerResolveModule(() => 'owner-1'),
);
vi.mock('@/lib/server/agent-runtime/owner-scoped-documents', () => ({
  getOwnerScopedDocumentStore: async () => mocks.fakeStore!.store,
}));
vi.mock('@/lib/server/agent-runtime/store', () => ({
  getAgentSessionStore: async () => ({
    createSession: mocks.createSession,
    readRetirement: async () => null,
    postUserMessage: mocks.postUserMessage,
    softDeleteSession: mocks.softDeleteSession,
    listSessionsByOwner: mocks.listSessionsByOwner,
    getSession: mocks.getSession,
    setManualSessionTitle: mocks.setManualSessionTitle,
  }),
}));
vi.mock('@/lib/server/agent-runtime/skills', () => ({
  listSkills: mocks.listSkills,
  findSkill: mocks.findSkill,
  inferSkillIdFromPrompt: mocks.inferSkillIdFromPrompt,
}));
vi.mock('@/lib/server/agent-runtime/session-materials', () => ({
  bindOwnerMaterialsToSession: mocks.bindOwnerMaterialsToSession,
  SessionMaterialBindingError: class SessionMaterialBindingError extends Error {},
}));
vi.mock('@/lib/server/agent-runtime/conversation-title-task', () => ({
  scheduleConversationTitle: mocks.scheduleConversationTitle,
}));

import { POST as postFolder } from '@/app/api/folders/route';
import { PATCH as patchFolder } from '@/app/api/folders/[id]/route';
import { POST as postFolderMembers } from '@/app/api/folders/members/route';
import { POST as postSession } from '@/app/api/agent/sessions/route';
import { PATCH as patchSession } from '@/app/api/agent/sessions/[id]/route';
import { POST as postMessage } from '@/app/api/agent/sessions/[id]/messages/route';

interface BodyRoute {
  readonly name: string;
  readonly method: 'POST' | 'PATCH';
  readonly url: string;
  readonly call: (request: NextRequest) => Promise<Response>;
  readonly valid: { readonly body: unknown; readonly status: number; readonly json: object };
  readonly nullJson: unknown;
  readonly invalidJson: unknown;
  readonly tooLarge: unknown;
}

type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];

const TOO_LARGE = `request body exceeds ${MAX_BYTES} bytes`;
const folderError = (code: string, message: string) => ({ error: { code, message } });
const sessionError = (errorCode: string, error: string) => ({
  success: false,
  errorCode,
  error,
});

const BODY_ROUTES: BodyRoute[] = [
  {
    name: 'POST /api/folders',
    method: 'POST',
    url: 'http://localhost/api/folders',
    call: (request) => postFolder(request),
    valid: { body: { name: 'Physics' }, status: 200, json: { folder: { name: 'Physics' } } },
    nullJson: folderError('FOLDER_NAME_INVALID', 'name must be a string'),
    invalidJson: folderError('INVALID_BODY', 'request body must be JSON'),
    tooLarge: folderError('INVALID_BODY', TOO_LARGE),
  },
  {
    name: 'PATCH /api/folders/[id]',
    method: 'PATCH',
    url: 'http://localhost/api/folders/folder-a',
    call: (request) => patchFolder(request, { params: Promise.resolve({ id: 'folder-a' }) }),
    valid: { body: { name: 'Chemistry' }, status: 200, json: { folder: { name: 'Chemistry' } } },
    nullJson: folderError('FOLDER_NAME_INVALID', 'name must be a string'),
    invalidJson: folderError('INVALID_BODY', 'request body must be JSON'),
    tooLarge: folderError('INVALID_BODY', TOO_LARGE),
  },
  {
    name: 'POST /api/folders/members',
    method: 'POST',
    url: 'http://localhost/api/folders/members',
    call: (request) => postFolderMembers(request),
    valid: {
      body: { stageId: 'stage-1', folderId: 'folder-a' },
      status: 200,
      json: { ok: true },
    },
    nullJson: folderError('MISSING_STAGE_ID', 'stageId must be a non-empty string'),
    invalidJson: folderError('INVALID_BODY', 'request body must be JSON'),
    tooLarge: folderError('INVALID_BODY', TOO_LARGE),
  },
  {
    name: 'POST /api/agent/sessions',
    method: 'POST',
    url: 'http://localhost/api/agent/sessions',
    call: (request) => postSession(request),
    valid: { body: { prompt: 'Build a course' }, status: 202, json: { id: 'session-1' } },
    nullJson: sessionError('MISSING_REQUIRED_FIELD', 'prompt is required'),
    invalidJson: sessionError('INVALID_REQUEST', 'invalid JSON body'),
    tooLarge: sessionError('INVALID_REQUEST', TOO_LARGE),
  },
  {
    name: 'PATCH /api/agent/sessions/[id]',
    method: 'PATCH',
    url: 'http://localhost/api/agent/sessions/session-1',
    call: (request) => patchSession(request, { params: Promise.resolve({ id: 'session-1' }) }),
    valid: {
      body: { title: 'Focused question' },
      status: 200,
      json: { title: 'Focused question' },
    },
    nullJson: sessionError('MISSING_REQUIRED_FIELD', 'title is required'),
    invalidJson: sessionError('INVALID_REQUEST', 'invalid JSON body'),
    tooLarge: sessionError('INVALID_REQUEST', TOO_LARGE),
  },
  {
    name: 'POST /api/agent/sessions/[id]/messages',
    method: 'POST',
    url: 'http://localhost/api/agent/sessions/session-1/messages',
    call: (request) => postMessage(request, { params: Promise.resolve({ id: 'session-1' }) }),
    valid: {
      body: { text: 'Continue' },
      status: 202,
      json: { id: 'session-1', message: { text: 'Continue' } },
    },
    nullJson: sessionError('MISSING_REQUIRED_FIELD', 'text is required'),
    invalidJson: sessionError('INVALID_REQUEST', 'invalid JSON body'),
    tooLarge: sessionError('INVALID_REQUEST', TOO_LARGE),
  },
];

function jsonRequest(route: BodyRoute, body: string): NextRequest {
  return new NextRequest(route.url, {
    method: route.method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

/** A body streamed in chunks with no Content-Length, so only the counted bytes can refuse it. */
function chunkedRequest(route: BodyRoute, chunks: string[]): NextRequest {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new NextRequest(route.url, {
    method: route.method,
    headers: { 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as NextRequestInit);
}

/** A body that counts the reads requested from it. Nothing is produced until a read arrives. */
function countedRequest(route: BodyRoute, declaredLength: number) {
  let reads = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads += 1;
        controller.enqueue(encoder.encode('{}'));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const request = new NextRequest(route.url, {
    method: route.method,
    headers: { 'content-type': 'application/json', 'content-length': String(declaredLength) },
    body: stream,
    duplex: 'half',
  } as NextRequestInit);
  return { request, reads: () => reads };
}

beforeEach(async () => {
  vi.clearAllMocks();
  useProviders({});
  mocks.fakeStore = createFakeDocumentStore();
  await mocks.fakeStore.store.createFolder('folder-a', 'Math');
  mocks.getSession.mockResolvedValue({ id: 'session-1', ownerId: 'owner-1', status: 'succeeded' });
  mocks.setManualSessionTitle.mockImplementation(
    async (id: string, ownerId: string, title: string | null) => ({ id, ownerId, title }),
  );
  mocks.createSession.mockResolvedValue({ id: 'session-1', ownerId: 'owner-1', status: 'queued' });
  mocks.postUserMessage.mockResolvedValue({ seq: 4, delivery: 'queued', requeued: true });
  mocks.inferSkillIdFromPrompt.mockResolvedValue(undefined);
  mocks.bindOwnerMaterialsToSession.mockResolvedValue([]);
});

describe.each(BODY_ROUTES)('$name bounded body', (route) => {
  it('answers 413 for a declared length over the cap without reading the body', async () => {
    const { request, reads } = countedRequest(route, MAX_BYTES + 1);

    const response = await route.call(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual(route.tooLarge);
    expect(reads()).toBe(0);
  });

  it('answers 413 for a chunked body that passes the cap', async () => {
    const half = 'x'.repeat(MAX_BYTES / 2 + 1);

    const response = await route.call(chunkedRequest(route, ['{"text":"', half, half, '"}']));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual(route.tooLarge);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await route.call(jsonRequest(route, '{not json'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(route.invalidJson);
  });

  it('sends a JSON null body to the existing validation answer', async () => {
    const response = await route.call(jsonRequest(route, 'null'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(route.nullJson);
  });

  it('still answers one valid request with the normal response', async () => {
    const response = await route.call(jsonRequest(route, JSON.stringify(route.valid.body)));

    expect(response.status).toBe(route.valid.status);
    await expect(response.json()).resolves.toMatchObject(route.valid.json);
  });
});
