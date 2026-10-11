import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearSessionCookieHeader,
  createSessionToken,
  hashSessionToken,
  readSessionCookie,
  sessionCookieHeader,
} from '@/lib/server/accounts/session';

describe('session tokens', () => {
  it('creates 43-character base64url tokens that differ on every call', () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  it('hashes tokens deterministically to 64 lowercase hex characters', () => {
    // SHA-256("abc") is a published test vector.
    expect(hashSessionToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    const token = createSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).not.toContain(token);
  });
});

describe('readSessionCookie', () => {
  const token = createSessionToken();

  it('finds the session cookie among other cookies', () => {
    const headers = new Headers({ cookie: `theme=dark; openmaic_session=${token}; lang=vi` });
    expect(readSessionCookie(headers)).toBe(token);
  });

  it('ignores cookies whose names only look like the session cookie', () => {
    const headers = new Headers({
      cookie: `xopenmaic_session=${token}; openmaic_session_v2=${token}`,
    });
    expect(readSessionCookie(headers)).toBeUndefined();
  });

  it('returns undefined for any value that is not exactly 43 base64url characters', () => {
    const malformed: Array<[string, string]> = [
      ['empty', ''],
      ['too short', token.slice(0, 42)],
      ['too long', `${token}A`],
      ['padded with "="', `${token.slice(0, 42)}=`],
      ['containing a dot', `${token.slice(0, 42)}.`],
      ['containing a "+"', `${token.slice(0, 42)}+`],
    ];
    const accepted = malformed
      .filter(
        ([, value]) =>
          readSessionCookie(new Headers({ cookie: `openmaic_session=${value}` })) !== undefined,
      )
      .map(([label]) => label);
    expect(accepted).toEqual([]);
  });

  it('returns undefined when there is no cookie header', () => {
    expect(readSessionCookie(new Headers())).toBeUndefined();
  });
});

describe('session cookie attributes', () => {
  const token = createSessionToken();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets an HttpOnly, SameSite=Lax, root-path cookie that lasts 30 days outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(sessionCookieHeader(token)).toBe(
      `openmaic_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
    );
  });

  it('adds Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookieHeader(token)).toBe(
      `openmaic_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure`,
    );
  });

  it('clears the cookie with an empty value and Max-Age=0', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(clearSessionCookieHeader()).toBe(
      'openmaic_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
  });

  it('refuses a session cookie name that is present twice, whichever value is first', () => {
    const token = 'x'.repeat(43);
    const other = 'y'.repeat(43);
    const headers = new Headers({
      cookie: `openmaic_session=${token}; openmaic_session=${other}`,
    });

    expect(readSessionCookie(headers)).toBeUndefined();
  });
});
