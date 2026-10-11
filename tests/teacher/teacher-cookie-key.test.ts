/**
 * The teacher cookie is keyed by accessSigningKey(TUTOR_TEACHER_CODE): the code joined with
 * OPENMAIC_ACCESS_SECRET when that is set. Env is set per test and restored afterwards.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyKeyedAccessToken } from '@/lib/server/access-token';
import { accessSigningKey } from '@/lib/server/access-token-edge';
import { createTeacherToken, hasTeacherAccess, teacherCode } from '@/lib/server/teacher-gate';

const TEACHER_CODE = 'teacher-code-0000001';
const OTHER_CODE = 'teacher-code-0000002';
const SECRET = 'k7Qe2vR9xL0mNp4sD8fH1jW6yB3cT5gA';
const OTHER_SECRET = 'another-secret-value-that-is-long-enough-x';

const saved = {
  secret: process.env.OPENMAIC_ACCESS_SECRET,
  code: process.env.TUTOR_TEACHER_CODE,
};

function setEnv(name: 'OPENMAIC_ACCESS_SECRET' | 'TUTOR_TEACHER_CODE', value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  setEnv('OPENMAIC_ACCESS_SECRET', undefined);
});

afterEach(() => {
  setEnv('OPENMAIC_ACCESS_SECRET', saved.secret);
  setEnv('TUTOR_TEACHER_CODE', saved.code);
});

describe('teacher cookie key', () => {
  it('accepts its own cookie, with and without the secret', () => {
    expect(hasTeacherAccess(createTeacherToken(TEACHER_CODE), TEACHER_CODE)).toBe(true);

    setEnv('OPENMAIC_ACCESS_SECRET', SECRET);
    expect(hasTeacherAccess(createTeacherToken(TEACHER_CODE), TEACHER_CODE)).toBe(true);
  });

  it('without the secret the key is the code alone, so a copied cookie checks offline', () => {
    expect(verifyKeyedAccessToken(createTeacherToken(TEACHER_CODE), TEACHER_CODE)).toBe(true);
  });

  it('with the secret the code alone no longer verifies the cookie', () => {
    setEnv('OPENMAIC_ACCESS_SECRET', SECRET);
    const token = createTeacherToken(TEACHER_CODE);

    expect(verifyKeyedAccessToken(token, TEACHER_CODE)).toBe(false);
    expect(verifyKeyedAccessToken(token, accessSigningKey(TEACHER_CODE))).toBe(true);
  });

  it('enabling or changing the secret revokes the cookies minted under the other key', () => {
    const bare = createTeacherToken(TEACHER_CODE);
    setEnv('OPENMAIC_ACCESS_SECRET', SECRET);
    expect(hasTeacherAccess(bare, TEACHER_CODE)).toBe(false);

    const withSecret = createTeacherToken(TEACHER_CODE);
    setEnv('OPENMAIC_ACCESS_SECRET', OTHER_SECRET);
    expect(hasTeacherAccess(withSecret, TEACHER_CODE)).toBe(false);
  });

  it('changing TUTOR_TEACHER_CODE revokes the cookie minted under the old code', () => {
    setEnv('OPENMAIC_ACCESS_SECRET', SECRET);
    setEnv('TUTOR_TEACHER_CODE', TEACHER_CODE);
    const token = createTeacherToken(TEACHER_CODE);

    setEnv('TUTOR_TEACHER_CODE', OTHER_CODE);
    expect(teacherCode()).toBe(OTHER_CODE);
    expect(hasTeacherAccess(token, OTHER_CODE)).toBe(false);
    expect(hasTeacherAccess(createTeacherToken(OTHER_CODE), OTHER_CODE)).toBe(true);
  });
});
