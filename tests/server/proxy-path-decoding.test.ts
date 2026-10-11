import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { proxy } from '@/proxy';

/** A GET request for `path`, sent as the browser spells it (percent-encoding kept). */
const get = (path: string) => new NextRequest(`http://localhost${path}`, { method: 'GET' });

describe('the proxy decides on the decoded path', () => {
  beforeEach(() => {
    vi.stubEnv('ACCESS_CODE', '');
    vi.stubEnv('OPENMAIC_HOME', '');
    vi.stubEnv('NEXT_PUBLIC_PRO_WORKBENCH_ENABLED', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('with accounts on', () => {
    beforeEach(() => {
      vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    });

    it.each([
      '/teacher',
      '/%74eacher',
      '/api/teacher/progress',
      '/api/%74eacher/progress',
      '/api/teacher%2Fprogress',
      '/api/%74%65acher/%70rogress',
    ])('closes the teacher route %s, with or without a session', async (path) => {
      const response = await proxy(get(path));
      expect(response.status).toBe(404);
      expect(response.headers.get('location')).toBeNull();
    });

    it('lets an encoded spelling of a public page through as the page itself', async () => {
      const response = await proxy(get('/%6Cogin'));
      expect(response.status).toBe(200);
    });
  });

  it('answers a malformed percent-encoding with 400, whatever the mode', async () => {
    expect((await proxy(get('/api/%E0%A4%A'))).status).toBe(400);
    expect((await proxy(get('/%'))).status).toBe(400);
    vi.stubEnv('OPENMAIC_ACCOUNTS', 'true');
    expect((await proxy(get('/api/health/%'))).status).toBe(400);
  });

  it('gives the workbench its 404 when the path is encoded', async () => {
    vi.stubEnv('OPENMAIC_ACCOUNTS', '');
    expect((await proxy(get('/workbench'))).status).toBe(404);
    expect((await proxy(get('/%77orkbench'))).status).toBe(404);
    expect((await proxy(get('/%77orkbench/session-1'))).status).toBe(404);
  });
});
