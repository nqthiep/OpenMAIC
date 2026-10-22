import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { middleware } from '@/middleware';
import { isCrossOriginWrite } from '@/lib/server/same-origin-writes';

describe('isCrossOriginWrite', () => {
  it.each([
    ['POST', '/api/stages/s1/publish', 'same-site', true],
    ['POST', '/api/stages/s1/publish', 'cross-site', true],
    ['DELETE', '/api/folders', 'same-site', true],
    ['put', '/api/classroom', 'cross-site', true],
    ['PATCH', '/api/x', 'none', true],
    ['POST', '/api/stages/s1/publish', 'same-origin', false],
    ['POST', '/api/stages/s1/publish', null, false],
    ['GET', '/api/catalog', 'cross-site', false],
    ['HEAD', '/api/catalog', 'same-site', false],
    ['OPTIONS', '/api/catalog', 'cross-site', false],
    ['POST', '/not-api/form', 'cross-site', false],
    ['POST', '/apiary', 'cross-site', false],
  ])('%s %s with Sec-Fetch-Site %s -> refused: %s', (method, path, site, refused) => {
    expect(isCrossOriginWrite(method, path, site)).toBe(refused);
  });
});

describe('middleware', () => {
  afterEach(() => vi.unstubAllEnvs());

  const send = (method: string, path: string, site?: string) =>
    middleware(
      new NextRequest(`https://khaitam.example${path}`, {
        method,
        headers: site ? { 'sec-fetch-site': site } : {},
      }),
    );

  it('refuses a write that a sibling hostname sent, with a JSON 403', async () => {
    const response = await send('POST', '/api/stages/s1/publish', 'same-site');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
  });

  it('refuses a cross-site write, also with the access code switched on', async () => {
    vi.stubEnv('ACCESS_CODE', 'letmein');
    expect((await send('POST', '/api/generate/tts', 'cross-site')).status).toBe(403);
  });

  it('lets same-origin writes, header-less writes and reads through', async () => {
    for (const [method, path, site] of [
      ['POST', '/api/stages/s1/publish', 'same-origin'],
      ['POST', '/api/stages/s1/publish', undefined],
      ['GET', '/api/catalog', 'same-site'],
      ['GET', '/api/catalog', 'cross-site'],
    ] as const) {
      const response = await send(method, path, site);
      expect(response.status, `${method} ${path} ${site}`).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    }
  });
});
