import { describe, expect, it } from 'vitest';

import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from '@/lib/accounts/gate';
import { resolveSession, sessionIdOf, sessionVerdict } from '@/lib/accounts/session';
import type { Db } from '@/lib/accounts/repository';

const NOW = 1_800_000_000_000;
const live = {
  revokedAt: null,
  expiresAt: new Date(NOW + SESSION_ABSOLUTE_MS),
  lastSeenAt: new Date(NOW),
};

/** A database that fails the test if anything queries it. */
const noDatabase = {
  query: async () => {
    throw new Error('no query expected');
  },
} as unknown as Db;

describe('session lifecycle rules', () => {
  it('is valid while live and the account is active', () => {
    expect(sessionVerdict(live, 'active', NOW)).toBe('valid');
  });

  it('ends at the absolute 30 days, whatever the activity', () => {
    const session = { ...live, lastSeenAt: new Date(NOW + SESSION_ABSOLUTE_MS - 1000) };
    expect(sessionVerdict(session, 'active', NOW + SESSION_ABSOLUTE_MS - 1)).toBe('valid');
    expect(sessionVerdict(session, 'active', NOW + SESSION_ABSOLUTE_MS)).toBe('expired');
  });

  it('ends after 7 days without activity', () => {
    const session = { ...live, lastSeenAt: new Date(NOW) };
    expect(sessionVerdict(session, 'active', NOW + SESSION_IDLE_MS - 1)).toBe('valid');
    expect(sessionVerdict(session, 'active', NOW + SESSION_IDLE_MS)).toBe('idle');
  });

  it('is revoked once revoked, whatever else holds', () => {
    expect(sessionVerdict({ ...live, revokedAt: new Date(NOW) }, 'active', NOW)).toBe('revoked');
  });

  it('is inactive for a disabled or deleted account', () => {
    expect(sessionVerdict(live, 'disabled', NOW)).toBe('inactive');
    expect(sessionVerdict(live, 'deleted', NOW)).toBe('inactive');
  });

  it('hashes a token to a 64-character hex id that is not the token', () => {
    const token = 'a'.repeat(43);
    expect(sessionIdOf(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionIdOf(token)).not.toContain(token);
  });
});

describe('resolving a presented token', () => {
  it('is none when there is no cookie, without touching the database', async () => {
    expect(await resolveSession(noDatabase, undefined, NOW)).toEqual({ state: 'none' });
  });

  it('is invalid for a malformed or empty token, without touching the database', async () => {
    expect(await resolveSession(noDatabase, '', NOW)).toEqual({ state: 'invalid' });
    expect(await resolveSession(noDatabase, 'short', NOW)).toEqual({ state: 'invalid' });
    expect(await resolveSession(noDatabase, `${'a'.repeat(42)}!`, NOW)).toEqual({
      state: 'invalid',
    });
  });
});
