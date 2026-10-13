import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Publishing a course is account-gated by design (see the publish route's
 * docstring). Before accounts existed every owner was anonymous, so the route
 * could never succeed. These tests check the signed-in path end to end at the
 * route level: the owner comes from the session, not from a client header.
 */

const TOKEN_A = 'a'.repeat(43);
const TOKEN_B = 'b'.repeat(43);
const FORGED = 'z'.repeat(10);

const mocks = vi.hoisted(() => ({
  access: null as null | {
    ownerId: string;
    isPublic: boolean;
    publishedAt: number | null;
    name: string;
  },
  setStagePublished: vi.fn(async (..._args: unknown[]) => undefined),
  sessionOwners: {} as Record<string, string>,
}));

vi.mock('@/lib/config/feature-flags', () => ({
  isAgentRuntimeConfigured: () => true,
  isServerPersistenceConfigured: () => true,
}));

vi.mock('@/lib/server/accounts/runtime', () => ({
  // The real session lookup needs Postgres; this stub answers from a token table.
  resolveAuthenticatedOwnerId: async (headers: Headers) => {
    const cookie = headers.get('cookie') ?? '';
    for (const [token, owner] of Object.entries(mocks.sessionOwners)) {
      if (cookie.includes(`openmaic_session=${token}`)) return owner;
    }
    return undefined;
  },
}));

vi.mock('@/lib/server/stage-access', () => ({
  getStageAccessDb: async () => ({ query: vi.fn() }),
  resolveStageAccess: async () => mocks.access,
}));

vi.mock('@/lib/persistence/stage-meta', () => ({
  setStagePublished: mocks.setStagePublished,
}));

import { POST as postPublish } from '@/app/api/stages/[id]/publish/route';

const STAGE_ID = 'stage-owned-by-a';

function publish(cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return postPublish(
    new NextRequest(`http://localhost/api/stages/${STAGE_ID}/publish`, {
      method: 'POST',
      headers,
    }),
    { params: Promise.resolve({ id: STAGE_ID }) },
  );
}

describe('publishing a course by account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionOwners = {
      [TOKEN_A]: 'acct:owner-a',
      [TOKEN_B]: 'acct:owner-b',
    };
    mocks.access = {
      ownerId: 'acct:owner-a',
      isPublic: false,
      publishedAt: null,
      name: 'Course A',
    };
  });

  it('lets the owning account publish its own course', async () => {
    const response = await publish(`openmaic_session=${TOKEN_A}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, name: 'Course A' });
    expect(mocks.setStagePublished).toHaveBeenCalledTimes(1);
    expect(mocks.setStagePublished.mock.calls[0]?.[1]).toBe(STAGE_ID);
  });

  it('refuses another account publishing a course it does not own', async () => {
    const response = await publish(`openmaic_session=${TOKEN_B}`);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'FORBIDDEN',
    });
    expect(mocks.setStagePublished).not.toHaveBeenCalled();
  });

  it('refuses an anonymous visitor with login_required', async () => {
    const response = await publish();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'login_required' });
    expect(mocks.setStagePublished).not.toHaveBeenCalled();
  });

  it('treats a malformed session cookie as anonymous, never as an account', async () => {
    const response = await publish(`openmaic_session=${FORGED}`);

    expect(response.status).toBe(401);
    expect(mocks.setStagePublished).not.toHaveBeenCalled();
  });
});
