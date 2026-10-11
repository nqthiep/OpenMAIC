import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clientAddress } from '@/lib/accounts/http';
import { clientIdentity } from '@/lib/server/client-identity';

/** A request carrying these headers; the identity helpers read nothing else. */
const requestWith = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe('the client identity behind a trusted proxy', () => {
  beforeEach(() => {
    vi.stubEnv('TRUST_PROXY_HEADERS', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes the last X-Forwarded-For entry, which the nearest proxy appended', () => {
    const identity = clientIdentity(requestWith({ 'x-forwarded-for': '10.9.9.9, 203.0.113.7' }));
    expect(identity).toBe('203.0.113.7');
  });

  it('takes the only entry when the proxy overwrote the header', () => {
    expect(clientIdentity(requestWith({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('falls back to X-Real-IP when there is no X-Forwarded-For', () => {
    expect(clientIdentity(requestWith({ 'x-real-ip': '203.0.113.8' }))).toBe('203.0.113.8');
  });

  it('is one shared identity without the trust flag, whatever the headers say', () => {
    vi.stubEnv('TRUST_PROXY_HEADERS', '');
    expect(clientIdentity(requestWith({ 'x-forwarded-for': '203.0.113.7' }))).toBe('direct');
  });
});

describe('the client address of sign-in throttling', () => {
  it('takes the same last X-Forwarded-For entry as the client identity', () => {
    const headers = new Headers({ 'x-forwarded-for': '10.9.9.9, 203.0.113.7' });
    expect(clientAddress(headers)).toBe('203.0.113.7');
  });

  it('takes no address from a header that is not an address', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, not an address' });
    expect(clientAddress(headers)).toBeUndefined();
  });
});
