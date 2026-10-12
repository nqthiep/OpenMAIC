import { describe, expect, it } from 'vitest';

import { providerFailureText, providerStatusOf } from '@/lib/server/error-summary';

describe('providerStatusOf', () => {
  it('reads the HTTP status the SDK attaches to an upstream failure', () => {
    expect(providerStatusOf(Object.assign(new Error('x'), { statusCode: 402 }))).toBe(402);
  });

  it('is undefined for anything without a numeric status', () => {
    expect(providerStatusOf(new Error('no status'))).toBeUndefined();
    expect(providerStatusOf(undefined)).toBeUndefined();
    expect(providerStatusOf({ statusCode: '402' })).toBeUndefined();
  });
});

describe('providerFailureText', () => {
  it('tells the visitor about an empty balance, with the operator text for the operator key', () => {
    expect(providerFailureText(402, true)).toMatch(/administrator to top it up/);
    expect(providerFailureText(402, false)).toMatch(/Top it up, then try again/);
  });

  it('tells the visitor when the key is refused', () => {
    expect(providerFailureText(401, true)).toMatch(/server key/);
    expect(providerFailureText(403, false)).toMatch(/API key/);
  });

  it('is undefined for other statuses, so the caller keeps its own fallback', () => {
    expect(providerFailureText(500, true)).toBeUndefined();
    expect(providerFailureText(429, false)).toBeUndefined();
    expect(providerFailureText(undefined, true)).toBeUndefined();
  });

  it('never contains upstream text: every message is a fixed string', () => {
    const messages = [402, 401, 403].flatMap((status) => [
      providerFailureText(status, true),
      providerFailureText(status, false),
    ]);
    for (const message of messages) {
      expect(message).toMatch(/^[A-Z][^<>{}]*\.$|^[A-Z][^<>{}]*$/);
    }
  });
});
