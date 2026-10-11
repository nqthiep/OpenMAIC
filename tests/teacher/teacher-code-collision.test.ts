/**
 * A teacher code equal to the site access code switches the teacher feature off. Otherwise a
 * student holding the access code presents the site cookie in the teacher slot and reads the
 * cross-learner progress report. Env is set per test and restored afterwards.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
}));

vi.mock('@/lib/persistence/server-provider', () => ({
  getServerPersistenceProvider: async () => ({
    pool: {
      query: async (sql: string, params: unknown[]) => {
        mocks.queries.push({ sql, params });
        return { rows: [] };
      },
    },
  }),
}));

import { createAccessToken } from '@/lib/server/access-token';
import { TEACHER_COOKIE, createTeacherToken, teacherCode } from '@/lib/server/teacher-gate';
import { GET as progress } from '@/app/api/teacher/progress/route';

const ACCESS_CODE = 'site-access-code-0001';
const TEACHER_CODE = 'teacher-code-0000001';
const SECRET = 'k7Qe2vR9xL0mNp4sD8fH1jW6yB3cT5gA';
const KEYS = [
  'TUTOR_TEACHER_CODE',
  'ACCESS_CODE',
  'DATABASE_URL',
  'OPENMAIC_ACCESS_SECRET',
] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
  process.env.ACCESS_CODE = ACCESS_CODE;
  process.env.DATABASE_URL = 'postgres://localhost/openmaic_test';
  mocks.queries = [];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function progressRequest(cookie: string): NextRequest {
  return new NextRequest('http://localhost/api/teacher/progress', {
    headers: { cookie: `${TEACHER_COOKIE}=${cookie}` },
  });
}

describe('teacherCode when the teacher code equals the site access code', () => {
  it('is off with OPENMAIC_ACCESS_SECRET set', () => {
    const env = { TUTOR_TEACHER_CODE: ACCESS_CODE, ACCESS_CODE, OPENMAIC_ACCESS_SECRET: SECRET };
    expect(teacherCode(env)).toBeNull();
  });

  it('is off without the secret, and with a secret too short to count', () => {
    expect(teacherCode({ TUTOR_TEACHER_CODE: ACCESS_CODE, ACCESS_CODE })).toBeNull();
    expect(
      teacherCode({
        TUTOR_TEACHER_CODE: ACCESS_CODE,
        ACCESS_CODE,
        OPENMAIC_ACCESS_SECRET: 'short-secret',
      }),
    ).toBeNull();
  });

  it('keeps a distinct teacher code, with or without the secret', () => {
    const env = { TUTOR_TEACHER_CODE: TEACHER_CODE, ACCESS_CODE, OPENMAIC_ACCESS_SECRET: SECRET };
    expect(teacherCode(env)).toBe(TEACHER_CODE);
    expect(teacherCode({ TUTOR_TEACHER_CODE: TEACHER_CODE, ACCESS_CODE })).toBe(TEACHER_CODE);
  });
});

describe('GET /api/teacher/progress when the teacher code equals the site access code', () => {
  it('refuses a valid site access cookie in the teacher slot, and reads nothing', async () => {
    process.env.OPENMAIC_ACCESS_SECRET = SECRET;
    process.env.TUTOR_TEACHER_CODE = ACCESS_CODE;

    const res = await progress(progressRequest(createAccessToken(ACCESS_CODE)));
    expect(res.status).toBe(403);
    expect(mocks.queries).toHaveLength(0);
  });

  it('refuses a teacher cookie signed for the same code, so the feature is off', async () => {
    process.env.TUTOR_TEACHER_CODE = ACCESS_CODE;

    const res = await progress(progressRequest(createTeacherToken(ACCESS_CODE)));
    expect(res.status).toBe(403);
    expect(mocks.queries).toHaveLength(0);
  });

  it('control: with a distinct teacher code, the site cookie gets 401 and the teacher cookie gets 200', async () => {
    process.env.OPENMAIC_ACCESS_SECRET = SECRET;
    process.env.TUTOR_TEACHER_CODE = TEACHER_CODE;

    expect((await progress(progressRequest(createAccessToken(ACCESS_CODE)))).status).toBe(401);
    expect((await progress(progressRequest(createTeacherToken(TEACHER_CODE)))).status).toBe(200);
  });
});
