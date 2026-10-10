import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { middleware } from '@/middleware';

const home = (query = '') => new NextRequest(`http://localhost/${query}`, { method: 'GET' });

describe('OPENMAIC_HOME', () => {
  afterEach(() => {
    delete process.env.OPENMAIC_HOME;
  });

  it('leaves `/` alone by default', async () => {
    const res = await middleware(home());
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('sends `/` to the lesson picker when set to learn', async () => {
    process.env.OPENMAIC_HOME = 'learn';
    const res = await middleware(home());
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/learn');
  });

  it('keeps `/?classic=1` and every other page open', async () => {
    process.env.OPENMAIC_HOME = 'learn';
    expect((await middleware(home('?classic=1'))).headers.get('location')).toBeNull();
    const other = new NextRequest('http://localhost/classroom/stage-x', { method: 'GET' });
    expect((await middleware(other)).headers.get('location')).toBeNull();
  });
});
