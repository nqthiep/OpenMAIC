import { describe, expect, it } from 'vitest';

import {
  dashboardIsSecure,
  dashboardOrigin,
  missingOmnirouteEnv,
  omnirouteConfig,
} from '@/lib/server/omniroute/config';
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
const SESSION = 'ab'.repeat(16);

describe('gate tokens', () => {
  it('verifies a fresh token of the right kind', () => {
    const token = mintToken('ticket', ID, SESSION, TICKET_TTL_MS, SECRET, 1_000);
    expect(verifyToken('ticket', token, SECRET, 2_000)).toMatchObject({
      accountId: ID,
      sessionKey: SESSION,
    });
  });

  it('refuses an expired token, and one exactly at its expiry', () => {
    const token = mintToken('gate', ID, SESSION, GATE_TTL_MS, SECRET, 1_000);
    expect(verifyToken('gate', token, SECRET, 1_000 + GATE_TTL_MS - 1)).toBeDefined();
    expect(verifyToken('gate', token, SECRET, 1_000 + GATE_TTL_MS)).toBeUndefined();
  });

  it('does not let a ticket work as a cookie or the other way round', () => {
    const ticket = mintToken('ticket', ID, SESSION, TICKET_TTL_MS, SECRET);
    const gate = mintToken('gate', ID, SESSION, GATE_TTL_MS, SECRET);
    expect(verifyToken('gate', ticket, SECRET)).toBeUndefined();
    expect(verifyToken('ticket', gate, SECRET)).toBeUndefined();
  });

  it('refuses a token signed with another secret, or edited', () => {
    const token = mintToken('gate', ID, SESSION, GATE_TTL_MS, SECRET);
    expect(verifyToken('gate', token, 'x'.repeat(48))).toBeUndefined();
    const [kind, , session, expires, nonce, signature] = token.split('.');
    const other = `${kind}.someone-else.${session}.${expires}.${nonce}.${signature}`;
    expect(verifyToken('gate', other, SECRET)).toBeUndefined();
    const longer = `${kind}.${ID}.${session}.${Number(expires) + 1}.${nonce}.${signature}`;
    expect(verifyToken('gate', longer, SECRET)).toBeUndefined();
    const elsewhere = `${kind}.${ID}.${'cd'.repeat(16)}.${expires}.${nonce}.${signature}`;
    expect(verifyToken('gate', elsewhere, SECRET)).toBeUndefined();
  });

  it.each(['', 'a.b.c', 'gate.x.1.n', 'gate.x.y.1.n', `${'a.'.repeat(7)}z`])(
    'refuses malformed %j',
    (value) => {
      expect(verifyToken('gate', value, SECRET)).toBeUndefined();
    },
  );

  it('refuses to mint for an account id that would break the format', () => {
    expect(() => mintToken('gate', 'a.b', SESSION, 1, SECRET)).toThrow();
    expect(() => mintToken('gate', '', SESSION, 1, SECRET)).toThrow();
    expect(() => mintToken('gate', ID, 'short', 1, SECRET)).toThrow();
    expect(() => mintToken('gate', ID, 'AB'.repeat(16), 1, SECRET)).toThrow();
    expect(() => mintToken('gate', ID, `${SESSION}.`, 1, SECRET)).toThrow();
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
  const noFiles = () => undefined;

  it('is on with three good values, and defaults the internal address', () => {
    expect(omnirouteConfig(good, noFiles)).toEqual({
      publicUrl: 'https://omniroute.example.test',
      gateSecret: SECRET,
      adminPassword: 'p'.repeat(24),
      internalUrl: 'http://omniroute:20128',
      apiUrl: 'http://omniroute:20129',
    });
  });

  it('is on with nothing in the environment once the password file is there', () => {
    const read = (path: string) =>
      path === '/run/omniroute/admin_password' ? ` ${'f'.repeat(48)}\n`.trim() : undefined;
    const config = omnirouteConfig({}, read)!;
    expect(config).toMatchObject({
      adminPassword: 'f'.repeat(48),
      internalUrl: 'http://omniroute:20128',
      apiUrl: 'http://omniroute:20129',
    });
    expect(config.publicUrl).toBeUndefined();
    expect(config.gateSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('keeps one gate secret for the life of the process, and a variable overrides it', () => {
    const read = () => 'f'.repeat(48);
    const first = omnirouteConfig({}, read)!.gateSecret;
    expect(omnirouteConfig({}, read)!.gateSecret).toBe(first);
    expect(omnirouteConfig({ OMNIROUTE_GATE_SECRET: SECRET }, read)!.gateSecret).toBe(SECRET);
  });

  it('prefers the password variable over the file, and ignores a file that is too short', () => {
    const read = () => 'f'.repeat(48);
    expect(omnirouteConfig({ OMNIROUTE_ADMIN_PASSWORD: 'p'.repeat(24) }, read)!.adminPassword).toBe(
      'p'.repeat(24),
    );
    expect(omnirouteConfig({}, () => 'short')).toBeUndefined();
  });

  it('looks only in the folder OMNIROUTE_SECRETS_DIR names', () => {
    const asked: string[] = [];
    omnirouteConfig({ OMNIROUTE_SECRETS_DIR: '/somewhere' }, (path) => {
      asked.push(path);
      return undefined;
    });
    expect(asked).toEqual(['/somewhere/admin_password']);
  });

  it('looks in the host folder only under `next dev`, and then uses the published loopback ports', () => {
    const read = (path: string) =>
      path.endsWith('.omniroute/secrets/admin_password') ? 'h'.repeat(40) : undefined;
    expect(omnirouteConfig({ NODE_ENV: 'production' }, read)).toBeUndefined();
    expect(omnirouteConfig({ NODE_ENV: 'development' }, read)).toMatchObject({
      adminPassword: 'h'.repeat(40),
      internalUrl: 'http://127.0.0.1:20128',
      apiUrl: 'http://127.0.0.1:20129',
    });
  });

  it.each([
    ['a public URL with a path', { OMNIROUTE_PUBLIC_URL: 'https://x.test/omniroute' }],
    ['a public URL that is not http(s)', { OMNIROUTE_PUBLIC_URL: 'ftp://x.test' }],
    ['a public URL with credentials', { OMNIROUTE_PUBLIC_URL: 'https://a:b@x.test' }],
    ['a short gate secret', { OMNIROUTE_GATE_SECRET: 'short' }],
    ['a short password', { OMNIROUTE_ADMIN_PASSWORD: 'short' }],
    ['an unusable internal URL', { OMNIROUTE_INTERNAL_URL: 'not a url' }],
    ['an unusable API URL', { OMNIROUTE_API_URL: 'ftp://x' }],
  ])('is off with %s, even when the password file is there', (_name, override) => {
    expect(omnirouteConfig({ ...good, ...override }, () => 'f'.repeat(48))).toBeUndefined();
  });

  it('is on without a public URL, and off when nothing at all is there', () => {
    expect(omnirouteConfig({ ...good, OMNIROUTE_PUBLIC_URL: '' }, noFiles)).toBeDefined();
    expect(omnirouteConfig({}, noFiles)).toBeUndefined();
  });
});

describe('missingOmnirouteEnv', () => {
  const noFiles = () => undefined;

  it('names values that are set but wrong, never values that are simply absent', () => {
    expect(missingOmnirouteEnv({}, noFiles)).toEqual([]);
    expect(
      missingOmnirouteEnv(
        {
          OMNIROUTE_PUBLIC_URL: 'https://x.test/path',
          OMNIROUTE_GATE_SECRET: 'short',
          OMNIROUTE_ADMIN_PASSWORD: 'p'.repeat(20),
          OMNIROUTE_INTERNAL_URL: 'nope',
        },
        noFiles,
      ),
    ).toEqual(['OMNIROUTE_PUBLIC_URL', 'OMNIROUTE_GATE_SECRET', 'OMNIROUTE_INTERNAL_URL']);
    expect(
      missingOmnirouteEnv(
        {
          OMNIROUTE_PUBLIC_URL: 'https://x.test',
          OMNIROUTE_GATE_SECRET: 's'.repeat(40),
          OMNIROUTE_ADMIN_PASSWORD: 'p'.repeat(20),
        },
        noFiles,
      ),
    ).toEqual([]);
  });
});

describe('dashboardOrigin and dashboardIsSecure', () => {
  it('follows the page: omniroute. in front of the host, localhost to the published gate port', () => {
    const from = (origin: string | null, env = {}) => dashboardOrigin({}, origin, env);
    expect(from('https://khaitam.ai.vn')).toBe('https://omniroute.khaitam.ai.vn');
    expect(from('https://www.khaitam.ai.vn')).toBe('https://omniroute.khaitam.ai.vn');
    expect(from('https://khaitam.ai.vn:8443')).toBe('https://omniroute.khaitam.ai.vn:8443');
    expect(from('http://localhost:3000')).toBe('http://omniroute.localhost:8081');
    expect(from('http://[::1]:3000')).toBe('http://omniroute.localhost:8081');
    expect(from('http://localhost:3000', { OMNIROUTE_GATE_PORT: '9090' })).toBe(
      'http://omniroute.localhost:9090',
    );
    expect(from('http://localhost:3000', { OMNIROUTE_GATE_PORT: 'x; evil' })).toBe(
      'http://omniroute.localhost:8081',
    );
    expect(from(null)).toBeUndefined();
    expect(from('null')).toBeUndefined();
    expect(from('javascript:alert(1)')).toBeUndefined();
    expect(from('https://khaitam.ai.vn/some/path')).toBeUndefined();
  });

  it('lets OMNIROUTE_PUBLIC_URL win', () => {
    expect(dashboardOrigin({ publicUrl: 'https://gw.test' }, 'https://khaitam.ai.vn')).toBe(
      'https://gw.test',
    );
    expect(dashboardIsSecure({ publicUrl: 'https://gw.test' }, 'localhost')).toBe(true);
    expect(dashboardIsSecure({ publicUrl: 'http://gw.test' }, 'omniroute.khaitam.ai.vn')).toBe(
      false,
    );
  });

  it('is Secure for any host but localhost', () => {
    expect(dashboardIsSecure({}, 'omniroute.khaitam.ai.vn')).toBe(true);
    expect(dashboardIsSecure({}, 'omniroute.localhost:8081')).toBe(false);
    expect(dashboardIsSecure({}, '127.0.0.1:8081')).toBe(false);
    expect(dashboardIsSecure({}, '[::1]:8081')).toBe(false);
    expect(dashboardIsSecure({}, null)).toBe(false);
  });
});
