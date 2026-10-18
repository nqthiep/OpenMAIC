import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MembershipView } from '@/lib/server/learning/store';

// Accounts are on. A `session=<id>` cookie names the signed-in account; its role and membership
// come from this table. Render jobs are kept in memory. No database is involved.
type Role = 'learner' | 'operator' | 'admin';
const ACTIVE: MembershipView = {
  status: 'active',
  active: true,
  expiresAt: '2100-01-01T00:00:00.000Z',
  monthlyQuota: 1000,
};
const accounts = new Map<string, { role: Role; membership?: MembershipView }>();
const jobOwners = new Map<string, string>();
const upstream = vi.fn(
  async () =>
    new Response(JSON.stringify({ jobId: 'job-1' }), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    }),
);

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
  readRenderJobOwner: async (_db: unknown, jobId: string) => jobOwners.get(jobId),
  recordRenderJob: async (_db: unknown, jobId: string, ownerId: string) => {
    jobOwners.set(jobId, ownerId);
  },
}));

vi.mock('@/lib/server/render-service', () => ({
  resolveRenderServiceUrl: () => ({ url: 'http://render.test' }),
}));

vi.mock('@/lib/server/proxy-fetch', () => ({ proxyFetch: () => upstream() }));

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
  jobOwners.clear();
  upstream.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});
describe('submitting an export render', () => {
  it('lets the signed-in member submit, and records the job under that member', async () => {
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit('session=learner-member'));
    expect(response.status).toBe(202);
    expect(jobOwners.get('job-1')).toBe('acct:learner-member');
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
    expect(jobOwners.size).toBe(0);
  });

  it('lets staff submit without a membership', async () => {
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit('session=operator-1'));
    expect(response.status).toBe(202);
    expect(jobOwners.get('job-1')).toBe('acct:operator-1');
  });

  it('needs no session and records nothing when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { POST } = await import('@/app/api/export-video/render/route');
    const response = await POST(submit());
    expect(response.status).toBe(202);
    expect(jobOwners.size).toBe(0);
  });
});

describe('reading, cancelling and downloading a render job', () => {
  it.each(['GET', 'DELETE', 'DOWNLOAD'] as const)(
    '%s: the submitter and staff pass, another member gets 404 without reaching the render service',
    async (name) => {
      jobOwners.set('job-1', 'acct:learner-member');
      const handler = (await jobHandlers())[name];

      expect((await jobCall(handler, 'session=learner-member')).status).not.toBe(404);
      expect((await jobCall(handler, 'session=operator-1')).status).not.toBe(404);

      upstream.mockClear();
      expect((await jobCall(handler, 'session=learner-other')).status).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it('answers 404 to a visitor with no session, and to an unknown job', async () => {
    const { GET } = await jobHandlers();
    jobOwners.set('job-1', 'acct:learner-member');
    expect((await jobCall(GET)).status).toBe(404);

    jobOwners.clear();
    expect((await jobCall(GET, 'session=learner-member')).status).toBe(404);
  });

  it('leaves job routes unchecked when accounts are off', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { GET } = await jobHandlers();
    expect((await jobCall(GET)).status).not.toBe(404);
  });
});
