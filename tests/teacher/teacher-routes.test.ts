/**
 * The teacher routes end to end: real route handlers and real cookies, with the persistence
 * provider replaced by an in-memory store. No database is opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  rows: [] as Record<string, unknown>[],
  queries: [] as { sql: string; params: unknown[] }[],
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, set: mocks.cookieSet }),
}));

vi.mock('@/lib/persistence/server-provider', () => ({
  getServerPersistenceProvider: async () => ({
    pool: {
      query: async (sql: string, params: unknown[]) => {
        mocks.queries.push({ sql, params });
        return { rows: mocks.rows };
      },
    },
  }),
}));

import { createAccessToken, verifyAccessToken } from '@/lib/server/access-token';
import { ACCESS_TOKEN_MAX_AGE_SECONDS } from '@/lib/server/access-token-shared';
import {
  TEACHER_COOKIE,
  createTeacherToken,
  hasTeacherAccess,
  teacherAttemptLimiter,
} from '@/lib/server/teacher-gate';
import { msg } from '@/lib/tutor/catalog/messages';
import { POST as login } from '@/app/api/teacher/login/route';
import { POST as logout } from '@/app/api/teacher/logout/route';
import { GET as progress } from '@/app/api/teacher/progress/route';
import { widgetRegistry } from '@/lib/widgets';

const TEACHER_CODE = 'teacher-code-0000001';
const ACCESS_CODE = 'site-access-code-0001';
const DATABASE_URL = 'postgres://localhost/openmaic_test';
const KEYS = [
  'TUTOR_TEACHER_CODE',
  'ACCESS_CODE',
  'DATABASE_URL',
  'TRUST_PROXY_HEADERS',
  'OPENMAIC_ACCESS_SECRET',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.TUTOR_TEACHER_CODE = TEACHER_CODE;
  process.env.ACCESS_CODE = ACCESS_CODE;
  process.env.DATABASE_URL = DATABASE_URL;
  mocks.rows = [];
  mocks.queries = [];
  mocks.cookieSet.mockReset();
  teacherAttemptLimiter.reset();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function loginRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/teacher/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function progressRequest(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/teacher/progress', {
    headers: cookie === undefined ? {} : { cookie: `${TEACHER_COOKIE}=${cookie}` },
  });
}

type CookieOptions = Record<string, unknown>;

function lastCookieCall(): { name: string; value: string; options: CookieOptions } {
  const [name, value, options] = mocks.cookieSet.mock.calls.at(-1)!;
  return { name, value, options };
}

describe('POST /api/teacher/login', () => {
  it('answers 403 while the teacher code is unset, and counts no attempt', async () => {
    delete process.env.TUTOR_TEACHER_CODE;
    for (let i = 0; i < 12; i += 1) {
      expect((await login(loginRequest({ code: 'x' }))).status).toBe(403);
    }

    process.env.TUTOR_TEACHER_CODE = TEACHER_CODE;
    expect((await login(loginRequest({ code: 'wrong-code' }))).status).toBe(401);
  });

  it('answers 400 for a body that is not JSON or has no string code', async () => {
    expect((await login(loginRequest('{not json'))).status).toBe(400);
    expect((await login(loginRequest({ code: 123 }))).status).toBe(400);
    expect((await login(loginRequest({}))).status).toBe(400);
  });

  it('answers 401 for a wrong code, with an error body', async () => {
    const res = await login(loginRequest({ code: 'wrong-code' }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      errorCode: 'INVALID_REQUEST',
    });
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('answers 429 with Retry-After after ten wrong codes, and also refuses the right code', async () => {
    for (let i = 0; i < 10; i += 1) {
      expect((await login(loginRequest({ code: 'wrong-code' }))).status).toBe(401);
    }

    const limited = await login(loginRequest({ code: 'wrong-code' }));
    expect(limited.status).toBe(429);
    const retryAfter = Number(limited.headers.get('Retry-After'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    await expect(limited.json()).resolves.toMatchObject({ errorCode: 'RATE_LIMITED' });

    expect((await login(loginRequest({ code: TEACHER_CODE }))).status).toBe(429);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it('sets the teacher cookie for the right code, keyed by the teacher code', async () => {
    const res = await login(loginRequest({ code: TEACHER_CODE }));
    expect(res.status).toBe(200);

    const { name, value, options } = lastCookieCall();
    expect(name).toBe(TEACHER_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      secure: false,
    });
    expect(hasTeacherAccess(value, TEACHER_CODE)).toBe(true);
    expect(verifyAccessToken(value, ACCESS_CODE)).toBe(false);
  });
});

describe('POST /api/teacher/logout', () => {
  it('clears the cookie with the same attributes the login cookie had', async () => {
    await login(loginRequest({ code: TEACHER_CODE }));
    const loginCookie = lastCookieCall();

    const res = await logout();
    expect(res.status).toBe(200);

    const cleared = lastCookieCall();
    expect(cleared.name).toBe(TEACHER_COOKIE);
    expect(cleared.value).toBe('');
    expect(cleared.options).toEqual({ ...loginCookie.options, maxAge: 0 });
  });
});

describe('GET /api/teacher/progress', () => {
  it('answers 403 while the teacher code is unset, even with a valid cookie', async () => {
    delete process.env.TUTOR_TEACHER_CODE;
    const res = await progress(progressRequest(createTeacherToken(TEACHER_CODE)));
    expect(res.status).toBe(403);
    expect(mocks.queries).toHaveLength(0);
  });

  it('answers 404 when no database is configured', async () => {
    delete process.env.DATABASE_URL;
    const res = await progress(progressRequest(createTeacherToken(TEACHER_CODE)));
    expect(res.status).toBe(404);
  });

  it('answers 401 without a teacher cookie and reads nothing', async () => {
    const res = await progress(progressRequest());
    expect(res.status).toBe(401);
    expect(mocks.queries).toHaveLength(0);
  });

  it('refuses a site access cookie in the teacher cookie slot', async () => {
    const res = await progress(progressRequest(createAccessToken(ACCESS_CODE)));
    expect(res.status).toBe(401);
    expect(mocks.queries).toHaveLength(0);
  });

  it('reports each learner by the steps of the preset they ran, with step names and no keys', async () => {
    const entry = widgetRegistry.findWalkthrough('binary-search')!;
    const goRight = msg(entry.beatDefs.find((d) => d.id === 'go-right')!.label, 'vi-VN');
    const lesson = msg(entry.title, 'vi-VN');
    const keyA = 'anon:learner-a-0000000000000001';
    const keyB = 'anon:learner-b-0000000000000002';

    mocks.rows = [
      ...beatRows(keyA, 'Học sinh: Lan', 'mid-hit', ['start', 'mid', 'found']),
      ...beatRows(keyB, 'Học sinh: Bình', 'absent', ['start', 'mid', 'go-right']),
      ...['c', 'd', 'e'].flatMap((k) => predictionRow(`anon:learner-${k}-0000000000000009`)),
    ];

    const res = await progress(progressRequest(createTeacherToken(TEACHER_CODE)));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).not.toContain(keyA);
    expect(text).not.toContain(keyB);

    const report = JSON.parse(text);
    expect(report.truncated).toBe(false);

    const lan = report.attempts.find((a: { who: string }) => a.who === 'Lan');
    expect(lan).toMatchObject({ lesson, beats: { reached: 3, total: 4 } });

    const binh = report.attempts.find((a: { who: string }) => a.who === 'Bình');
    expect(binh.beats).toEqual({ reached: 3, total: 6 });

    const anonymous = report.attempts.filter((a: { who: string }) => a.who.startsWith('#'));
    expect(anonymous).toHaveLength(3);
    for (const a of anonymous) expect(a.who).toMatch(/^#[0-9a-f]{12}$/);

    expect(report.lessons[0]).toMatchObject({ walkthroughId: 'binary-search', title: lesson });
    expect(report.lessons[0].hardBeats).toEqual([
      expect.objectContaining({ beatId: 'go-right', label: goRight, answered: 3, rate: 0 }),
    ]);
  });

  it('says so when more learning records exist than the report reads', async () => {
    mocks.rows = beatRows('anon:learner-big-0000000000000003', null, 'single', ['start'], 50_001);
    const res = await progress(progressRequest(createTeacherToken(TEACHER_CODE)));
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.truncated).toBe(true);
    expect(report.attempts).toHaveLength(1);
    expect(mocks.queries[0].params).toEqual([50_001]);
  });
});

/** Rows of one learner's walkthrough session, the way the store returns them (newest first). */
function beatRows(
  learnerKey: string,
  description: string | null,
  preset: string,
  beatIds: string[],
  count = beatIds.length,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i += 1) {
    const beatId = beatIds[i % beatIds.length];
    rows.push({
      stage_id: 'stage-binary',
      learner_key: learnerKey,
      kind: 'tutorLearning',
      created_at: new Date(Date.UTC(2026, 9, 10, 8, 0, i % 3000)).toISOString(),
      payload: {
        type: 'beat',
        sceneId: 's',
        walkthroughId: 'binary-search',
        entryRev: 1,
        preset,
        beatId,
        occurrence: 1,
        at: new Date(0).toISOString(),
      },
      stage_name: 'Tìm kiếm nhị phân',
      stage_description: description,
    });
  }
  return rows.reverse();
}

function predictionRow(learnerKey: string): Record<string, unknown>[] {
  return [
    {
      stage_id: 'stage-binary',
      learner_key: learnerKey,
      kind: 'tutorLearning',
      created_at: '2026-10-10T08:30:00.000Z',
      payload: {
        type: 'prediction',
        sceneId: 's',
        beatId: 'go-right',
        correct: false,
        skipped: false,
      },
      stage_name: 'Tìm kiếm nhị phân',
      stage_description: null,
    },
    {
      stage_id: 'stage-binary',
      learner_key: learnerKey,
      kind: 'tutorLearning',
      created_at: '2026-10-10T08:29:00.000Z',
      payload: {
        type: 'beat',
        sceneId: 's',
        walkthroughId: 'binary-search',
        entryRev: 1,
        preset: 'absent',
        beatId: 'start',
        occurrence: 1,
        at: '2026-10-10T08:29:00.000Z',
      },
      stage_name: 'Tìm kiếm nhị phân',
      stage_description: null,
    },
  ];
}
