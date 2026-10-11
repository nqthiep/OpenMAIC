import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: logged.error,
    warn: logged.warn,
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { describeUnexpectedError, runAccountRoute } from '@/lib/server/accounts/http';

beforeEach(() => {
  logged.error.mockReset();
  logged.warn.mockReset();
});

describe('account route diagnostics', () => {
  it('logs the name, the code and the first frame of an unexpected error, never its message', async () => {
    const secret = 'hunter2-and-a-scrypt-hash';
    const error = Object.assign(
      new Error(`insert failed for ${secret}\n    at injected (attacker)`),
      {
        code: '23505',
      },
    );

    const response = await runAccountRoute(async () => {
      throw error;
    });

    expect(response.status).toBe(500);
    const line = String(logged.error.mock.calls[0]?.[1]);
    expect(line).toContain('Error code=23505 frame=at ');
    expect(line).not.toContain(secret);
    expect(line).not.toContain('injected (attacker)');
  });

  it('reports "none" for a missing code and never returns the message as a frame', () => {
    const line = describeUnexpectedError(new TypeError('plain failure'));

    expect(line).toMatch(/^TypeError code=none frame=at /);
    expect(line).not.toContain('plain failure');
  });

  it('describes a value that is not an Error without reading it', () => {
    expect(describeUnexpectedError('password=hunter2')).toBe('non-error value');
  });
});
