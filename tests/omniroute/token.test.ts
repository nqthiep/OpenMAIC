import { describe, expect, it } from 'vitest';

import { omnirouteConfig } from '@/lib/server/omniroute/config';
import {
  gateCookieHeader,
  GATE_TTL_MS,
  mintToken,
  readGateCookie,
  redeemOnce,
  TICKET_TTL_MS,
  verifyToken,
} from '@/lib/server/omniroute/token';

const SECRET = 's'.repeat(48);
const ID = '0b9f0e0e-5f3a-4a39-9c52-0f2c1f3d9a11';

describe('gate tokens', () => {
  it('verifies a fresh token of the right kind', () => {
    const token = mintToken('ticket', ID, TICKET_TTL_MS, SECRET, 1_000);
    expect(verifyToken('ticket', token, SECRET, 2_000)).toMatchObject({ accountId: ID });
  });

  it('refuses an expired token, and one exactly at its expiry', () => {
    const token = mintToken('gate', ID, GATE_TTL_MS, SECRET, 1_000);
    expect(verifyToken('gate', token, SECRET, 1_000 + GATE_TTL_MS - 1)).toBeDefined();
    expect(verifyToken('gate', token, SECRET, 1_000 + GATE_TTL_MS)).toBeUndefined();
  });

  it('does not let a ticket work as a cookie or the other way round', () => {
    const ticket = mintToken('ticket', ID, TICKET_TTL_MS, SECRET);
    const gate = mintToken('gate', ID, GATE_TTL_MS, SECRET);
    expect(verifyToken('gate', ticket, SECRET)).toBeUndefined();
    expect(verifyToken('ticket', gate, SECRET)).toBeUndefined();
  });

  it('refuses a token signed with another secret, or edited', () => {
    const token = mintToken('gate', ID, GATE_TTL_MS, SECRET);
    expect(verifyToken('gate', token, 'x'.repeat(48))).toBeUndefined();
    const [kind, , expires, nonce, signature] = token.split('.');
    const other = `${kind}.someone-else.${expires}.${nonce}.${signature}`;
    expect(verifyToken('gate', other, SECRET)).toBeUndefined();
    const longer = `${kind}.${ID}.${Number(expires) + 1}.${nonce}.${signature}`;
    expect(verifyToken('gate', longer, SECRET)).toBeUndefined();
  });

  it.each(['', 'a.b.c', 'gate.x.1.n', `${'a.'.repeat(6)}z`])('refuses malformed %j', (value) => {
    expect(verifyToken('gate', value, SECRET)).toBeUndefined();
  });

  it('refuses to mint for an account id that would break the format', () => {
    expect(() => mintToken('gate', 'a.b', 1, SECRET)).toThrow();
    expect(() => mintToken('gate', '', 1, SECRET)).toThrow();
  });

  it('redeems a nonce once', () => {
    expect(redeemOnce('n-1', Date.now() + 1_000)).toBe(true);
    expect(redeemOnce('n-1', Date.now() + 1_000)).toBe(false);
    expect(redeemOnce('n-2', Date.now() + 1_000)).toBe(true);
  });

  it('forgets a nonce after it expired', () => {
    expect(redeemOnce('n-3', 1_000, 500)).toBe(true);
    expect(redeemOnce('n-3', 1_000, 1_500)).toBe(true);
  });
});

describe('gate cookie', () => {
  it('reads the cookie among others, and refuses a duplicate', () => {
    expect(readGateCookie(new Headers({ cookie: 'a=1; omniroute_gate=abc; b=2' }))).toBe('abc');
    expect(readGateCookie(new Headers({ cookie: 'omniroute_gate=a; omniroute_gate=b' }))).toBe(
      undefined,
    );
    expect(readGateCookie(new Headers())).toBeUndefined();
  });

  it('is HttpOnly, SameSite=Lax, host-only, and Secure only over https', () => {
    const secure = gateCookieHeader('t', true);
    expect(secure).toContain('HttpOnly');
    expect(secure).toContain('SameSite=Lax');
    expect(secure).toContain('Path=/');
    expect(secure).toContain('Secure');
    expect(secure).toContain(`Max-Age=${GATE_TTL_MS / 1000}`);
    expect(secure).not.toContain('Domain');
    expect(gateCookieHeader('t', false)).not.toContain('Secure');
  });
});

describe('omnirouteConfig', () => {
  const good = {
    OMNIROUTE_PUBLIC_URL: 'https://omniroute.example.test/',
    OMNIROUTE_GATE_SECRET: SECRET,
    OMNIROUTE_ADMIN_PASSWORD: 'p'.repeat(24),
  };

  it('is on with three good values, and defaults the internal address', () => {
    expect(omnirouteConfig(good)).toEqual({
      publicUrl: 'https://omniroute.example.test',
      gateSecret: SECRET,
      adminPassword: 'p'.repeat(24),
      internalUrl: 'http://omniroute:20128',
    });
  });

  it.each([
    ['no public URL', { OMNIROUTE_PUBLIC_URL: '' }],
    ['a public URL with a path', { OMNIROUTE_PUBLIC_URL: 'https://x.test/omniroute' }],
    ['a public URL that is not http(s)', { OMNIROUTE_PUBLIC_URL: 'ftp://x.test' }],
    ['a public URL with credentials', { OMNIROUTE_PUBLIC_URL: 'https://a:b@x.test' }],
    ['a short gate secret', { OMNIROUTE_GATE_SECRET: 'short' }],
    ['a short password', { OMNIROUTE_ADMIN_PASSWORD: 'short' }],
    ['an unusable internal URL', { OMNIROUTE_INTERNAL_URL: 'not a url' }],
  ])('is off with %s', (_name, override) => {
    expect(omnirouteConfig({ ...good, ...override })).toBeUndefined();
  });

  it('is off when nothing is set', () => {
    expect(omnirouteConfig({})).toBeUndefined();
  });
});
