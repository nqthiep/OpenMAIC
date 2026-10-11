import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '@/app/api/usage/route';
import { readUsageRecords } from '@/lib/server/usage-storage';

vi.mock('@/lib/server/usage-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/server/usage-storage')>();
  return { ...actual, readUsageRecords: vi.fn(async () => []) };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/usage with accounts off', () => {
  it.each(['', 'false', '0'])(
    'answers without a session when OPENMAIC_ACCOUNTS is %j',
    async (value) => {
      vi.stubEnv('OPENMAIC_ACCOUNTS', value);
      const response = await GET(new NextRequest('http://localhost:3001/api/usage'));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totals).toEqual({ requests: 0, llmTokens: 0 });
      expect(readUsageRecords).toHaveBeenCalled();
    },
  );
});
