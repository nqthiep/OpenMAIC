import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '@/proxy';

const get = (path: string) => new NextRequest(`http://localhost${path}`, { method: 'GET' });

describe('the course generator on a student deployment', () => {
  beforeEach(() => {
    vi.stubEnv('ACCESS_CODE', '');
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['/', '/?classic=1', '/?classic', '/?classic=0', '/?classic=1&lang=vi'])(
    'sends %s to the lesson picker',
    async (path) => {
      vi.stubEnv('OPENMAIC_HOME', 'learn');
      const res = await proxy(get(path));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/learn');
    },
  );

  it('keeps `/?classic=1` open outside a student deployment', async () => {
    vi.stubEnv('OPENMAIC_HOME', '');
    const res = await proxy(get('/?classic=1'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });
});
