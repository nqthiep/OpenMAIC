import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account; its role and membership
// come from this table. The render service is a stub that records the owner header it is sent; it
// is the render service (upstream's owner-bound endpoints) that keeps a job with its owner. No
// database is involved.
type Role = 'learner' | 'operator' | 'admin';
const ACTIVE: MembershipView = {
  status: 'active',
  active: true,
  expiresAt: '2100-01-01T00:00:00.000Z',
  monthlyQuota: 1000,
  cycle: {
    start: '2026-10-01T00:00:00.000Z',
    end: '2100-01-01T00:00:00.000Z',
    key: '2026-10-01T00:00:00.000Z',
  },
};
const accounts = new Map<string, { role: Role; membership?: MembershipView }>();
const sentOwners: Array<string | null> = [];
const upstream = vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
  sentOwners.push(init?.headers?.['x-openmaic-render-owner'] ?? null);
  return new Response(JSON.stringify({ jobId: 'job-1' }), {
    status: 202,
    headers: { 'content-type': 'application/json', 'x-openmaic-render-owner-bound': '1' },
  });
});

vi.mock('@/lib/server/accounts/runtime', () => ({
  accountsEnabled: () => process.env.DATABASE_URL !== '',
  accountServiceDeps: async () => ({ db: {} }),
  resolveRequestAccount: async (headers: Headers) => {
    const id = /session=([^;]+)/.exec(headers.get('cookie') ?? '')?.[1];
    const account = id ? accounts.get(id) : undefined;
    return id && account ? { accountId: id, username: id, role: account.role } : undefined;
  },
  registrationOpen: () => false,
}));

vi.mock('@/lib/server/learning/store', () => ({
  readMembership: async (_db: unknown, accountId: string) => accounts.get(accountId)?.membership,
  readCourseShare: async () => undefined,
  isCoursePreview: async () => false,
  isCourseInClassOf: async () => false,
  readBonusTokens: async () => 0,
  recordCourseRead: async () => 0,
}));

// The owner of a request is what the account method resolves (tests/accounts cover it): here a
// `session=<id>` cookie is the account `acct:<id>`, anything else an anonymous owner.
vi.mock('@/lib/server/identity/with-owner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/identity/with-owner')>()),
  withRequestOwner: async (
    req: Request,
    run: (principal: { ownerId: string }, headers: Headers) => Promise<Response>,
  ) => {
    const id = /session=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
    return run({ ownerId: id ? `acct:${id}` : 'anon:visitor' }, new Headers());
  },
}));

vi.mock('@/lib/server/render-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/render-service')>()),
  resolveRenderServiceUrl: () => ({ url: 'http://render.test' }),
}));

vi.mock('@/lib/server/proxy-fetch', () => ({
  proxyFetch: (url: string, init?: { headers?: Record<string, string> }) => upstream(url, init),
}));

function submit(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/export-video/render', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=test',
      ...(cookie ? { cookie } : {}),
    },
    body: 'x',
  });
}

function jobRequest(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/export-video/render/job-1', {
    headers: cookie ? { cookie } : {},
  });
}

function jobCall(handler: Handler, cookie?: string): Promise<Response> {
  return handler(jobRequest(cookie), { params: Promise.resolve({ jobId: 'job-1' }) });
}

type Handler = (
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) => Promise<Response>;

async function jobHandlers() {
  const job = await import('@/app/api/export-video/render/[jobId]/route');
  const download = await import('@/app/api/export-video/render/[jobId]/download/route');
  return {
    GET: job.GET as Handler,
    DELETE: job.DELETE as Handler,
    DOWNLOAD: download.GET as Handler,
  };
}

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgres://render-jobs-test');
  accounts.clear();
  accounts.set('learner-member', { role: 'learner', membership: ACTIVE });
  accounts.set('learner-other', { role: 'learner', membership: ACTIVE });
  accounts.set('learner-plain', { role: 'learner' });
  accounts.set('operator-1', { role: 'operator' });
  sentOwners.length = 0;
  upstream.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});
describe('submitting an export render', () => {
  it('lets the signed-in member submit, and sends the render service that member as the owner', async () => {
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit('session=learner-member'));
    expect(response.status).toBe(202);
    expect(sentOwners).toEqual(['acct:learner-member']);
  });

  it('refuses a visitor with no session before reaching the render service', async () => {
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit());
    expect(response.status).toBe(401);
    expect((await response.json()).errorCode).toBe('LOGIN_REQUIRED');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('refuses a learner without an active membership', async () => {
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit('session=learner-plain'));
    expect(response.status).toBe(403);
    expect((await response.json()).errorCode).toBe('MEMBERSHIP_REQUIRED');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('lets staff submit without a membership', async () => {
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit('session=operator-1'));
    expect(response.status).toBe(202);
    expect(sentOwners).toEqual(['acct:operator-1']);
  });

  it('needs no session when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit());
    expect(response.status).toBe(202);
  });
});

describe('reading, cancelling and downloading a render job', () => {
  it.each(['GET', 'DELETE', 'DOWNLOAD'] as const)(
    '%s: asks the render service on behalf of the caller as owner; the service binds the job to it',
    async (name) => {
      const handler = (await jobHandlers())[name];
      await jobCall(handler, 'session=learner-member');
      expect(sentOwners).toEqual(['acct:learner-member']);
    },
  );
});
