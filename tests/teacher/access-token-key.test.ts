/**
 * The site access cookie is keyed by OPENMAIC_ACCESS_SECRET when that is set (SEC-04), and the teacher
 * cookie never shares a key with it. Node and Edge must apply the same key rule.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAccessToken,
  createKeyedAccessToken,
  verifyAccessToken,
  verifyKeyedAccessToken,
} from '@/lib/server/access-token';
import {
  ACCESS_SECRET_MIN_LENGTH,
  accessSigningKey,
  verifyAccessTokenEdge,
} from '@/lib/server/access-token-edge';
import { createTeacherToken, hasTeacherAccess, teacherCode } from '@/lib/server/teacher-gate';

const ACCESS_CODE = 'site-access-code-0001';
const TEACHER_CODE = 'teacher-code-0000001';
const SECRET = 'k7Qe2vR9xL0mNp4sD8fH1jW6yB3cT5gA';

const savedSecret = process.env.OPENMAIC_ACCESS_SECRET;

function setSecret(value: string | undefined): void {
  if (value === undefined) delete process.env.OPENMAIC_ACCESS_SECRET;
  else process.env.OPENMAIC_ACCESS_SECRET = value;
}

beforeEach(() => {
  setSecret(undefined);
});

afterEach(() => {
  setSecret(savedSecret);
  vi.restoreAllMocks();
});

describe('accessSigningKey', () => {
  it('uses the secret only when it is at least the minimum length', () => {
    expect(accessSigningKey(ACCESS_CODE, {})).toBe(ACCESS_CODE);
    expect(accessSigningKey(ACCESS_CODE, { OPENMAIC_ACCESS_SECRET: 'x'.repeat(31) })).toBe(
      ACCESS_CODE,
    );
    expect(
      accessSigningKey(ACCESS_CODE, {
        OPENMAIC_ACCESS_SECRET: 'x'.repeat(ACCESS_SECRET_MIN_LENGTH),
      }),
    ).toBe(`${'x'.repeat(ACCESS_SECRET_MIN_LENGTH)}\u0000${ACCESS_CODE}`);
  });

  it('counts code points, so an emoji secret is not short-changed', () => {
    expect(accessSigningKey(ACCESS_CODE, { OPENMAIC_ACCESS_SECRET: '😀'.repeat(16) })).toBe(
      ACCESS_CODE,
    );
    expect(accessSigningKey(ACCESS_CODE, { OPENMAIC_ACCESS_SECRET: '😀'.repeat(32) })).toBe(
      `${'😀'.repeat(32)}\u0000${ACCESS_CODE}`,
    );
  });

  it('reads process.env when no environment object is passed', () => {
    setSecret(SECRET);
    expect(accessSigningKey(ACCESS_CODE)).toBe(`${SECRET}\u0000${ACCESS_CODE}`);
  });
});

describe('site access cookie keyed by OPENMAIC_ACCESS_SECRET', () => {
  it('without a secret, the cookie is keyed by ACCESS_CODE as before', async () => {
    const token = createAccessToken(ACCESS_CODE);
    expect(verifyKeyedAccessToken(token, ACCESS_CODE)).toBe(true);
    expect(verifyAccessToken(token, ACCESS_CODE)).toBe(true);
    await expect(verifyAccessTokenEdge(token, ACCESS_CODE)).resolves.toBe(true);
  });

  it('with a secret, Node and Edge accept the cookie and reject other keys', async () => {
    setSecret(SECRET);
    const token = createAccessToken(ACCESS_CODE);

    expect(verifyAccessToken(token, ACCESS_CODE)).toBe(true);
    await expect(verifyAccessTokenEdge(token, ACCESS_CODE)).resolves.toBe(true);

    expect(verifyAccessToken(token, 'wrong-code')).toBe(false);
    await expect(verifyAccessTokenEdge(token, 'wrong-code')).resolves.toBe(false);
  });

  it('with a secret, a cookie signed with ACCESS_CODE alone is refused: no offline check against the code', async () => {
    setSecret(SECRET);
    const codeOnly = createKeyedAccessToken(ACCESS_CODE);

    expect(verifyAccessToken(codeOnly, ACCESS_CODE)).toBe(false);
    await expect(verifyAccessTokenEdge(codeOnly, ACCESS_CODE)).resolves.toBe(false);
  });

  it('with a secret, changing ACCESS_CODE revokes every cookie minted under the old code', async () => {
    setSecret(SECRET);
    const token = createAccessToken(ACCESS_CODE);
    const rotated = 'site-access-code-0002';

    expect(verifyAccessToken(token, rotated)).toBe(false);
    await expect(verifyAccessTokenEdge(token, rotated)).resolves.toBe(false);
    expect(verifyAccessToken(createAccessToken(rotated), rotated)).toBe(true);
  });

  it('with a secret, a cookie signed with a different secret is refused by both runtimes', async () => {
    const token = (() => {
      setSecret('another-secret-value-that-is-long-enough-x');
      return createAccessToken(ACCESS_CODE);
    })();
    setSecret(SECRET);

    expect(verifyAccessToken(token, ACCESS_CODE)).toBe(false);
    await expect(verifyAccessTokenEdge(token, ACCESS_CODE)).resolves.toBe(false);
  });

  it('a secret shorter than the minimum is ignored, so the cookie stays keyed by ACCESS_CODE', async () => {
    setSecret('short-secret');
    const token = createAccessToken(ACCESS_CODE);
    expect(verifyKeyedAccessToken(token, ACCESS_CODE)).toBe(true);
    await expect(verifyAccessTokenEdge(token, ACCESS_CODE)).resolves.toBe(true);
  });

  it('warns once per process when the secret is missing, and once when it is too short', async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const missing = await import('@/lib/server/access-token');

    missing.createAccessToken(ACCESS_CODE);
    missing.createAccessToken(ACCESS_CODE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('OPENMAIC_ACCESS_SECRET is not set');
    expect(String(warn.mock.calls[0][0])).not.toContain(ACCESS_CODE);

    vi.resetModules();
    warn.mockClear();
    setSecret('short-secret');
    const short = await import('@/lib/server/access-token');
    short.createAccessToken(ACCESS_CODE);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('shorter than 32 characters');
  });
});

describe('teacher cookie is kept apart from the site cookie', () => {
  it('a site cookie never passes the teacher gate, with or without a secret', () => {
    const siteToken = createAccessToken(ACCESS_CODE);
    expect(hasTeacherAccess(siteToken, TEACHER_CODE)).toBe(false);

    setSecret(SECRET);
    const siteWithSecret = createAccessToken(ACCESS_CODE);
    expect(hasTeacherAccess(siteWithSecret, TEACHER_CODE)).toBe(false);
  });

  it('a teacher cookie never passes the site gate, with or without a secret', async () => {
    const teacherToken = createTeacherToken(TEACHER_CODE);
    expect(hasTeacherAccess(teacherToken, TEACHER_CODE)).toBe(true);
    expect(verifyAccessToken(teacherToken, ACCESS_CODE)).toBe(false);

    setSecret(SECRET);
    const teacherWithSecret = createTeacherToken(TEACHER_CODE);
    expect(hasTeacherAccess(teacherWithSecret, TEACHER_CODE)).toBe(true);
    expect(verifyAccessToken(teacherWithSecret, ACCESS_CODE)).toBe(false);
    await expect(verifyAccessTokenEdge(teacherWithSecret, ACCESS_CODE)).resolves.toBe(false);
  });

  it('the teacher code is refused when it equals the site key, so no cookie could cross over', () => {
    expect(
      teacherCode({ TUTOR_TEACHER_CODE: 'a'.repeat(16), ACCESS_CODE: 'a'.repeat(16) }),
    ).toBeNull();
    const env = { TUTOR_TEACHER_CODE: '', ACCESS_CODE, OPENMAIC_ACCESS_SECRET: SECRET };
    expect(
      teacherCode({ ...env, TUTOR_TEACHER_CODE: accessSigningKey(ACCESS_CODE, env) }),
    ).toBeNull();
    expect(teacherCode({ TUTOR_TEACHER_CODE: TEACHER_CODE, ACCESS_CODE: ACCESS_CODE })).toBe(
      TEACHER_CODE,
    );
  });

  it('the teacher code must be at least 16 characters', () => {
    expect(teacherCode({ TUTOR_TEACHER_CODE: 'x'.repeat(15) })).toBeNull();
    expect(teacherCode({ TUTOR_TEACHER_CODE: 'x'.repeat(16) })).toBe('x'.repeat(16));
  });
});
