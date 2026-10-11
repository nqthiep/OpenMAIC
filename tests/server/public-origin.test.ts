import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { requestOrigin } from '@/lib/server/media-origin';
import { parsePublicAppOrigin } from '@/lib/server/public-origin';

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://0.0.0.0:3000/api/classroom', { headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('parsePublicAppOrigin', () => {
  it.each([
    ['https://classroom.example.edu', 'https://classroom.example.edu'],
    ['https://classroom.example.edu/', 'https://classroom.example.edu'],
    ['http://localhost:3000', 'http://localhost:3000'],
  ])('accepts %s as the origin %s', (raw, origin) => {
    expect(parsePublicAppOrigin(raw)).toBe(origin);
  });

  it.each([
    'classroom.example.edu',
    'javascript:alert(1)',
    'ftp://classroom.example.edu',
    'https://classroom.example.edu/app',
    'https://classroom.example.edu?next=/',
    'https://classroom.example.edu/#top',
    'https://user:secret@classroom.example.edu',
  ])('rejects %s', (raw) => {
    expect(parsePublicAppOrigin(raw)).toBeUndefined();
  });
});

describe('the origin used in generated links', () => {
  it('uses the configured origin, and ignores forwarded headers, when it is set', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://classroom.example.edu');
    const req = request({ 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'http' });

    expect(buildRequestOrigin(req)).toBe('https://classroom.example.edu');
    expect(requestOrigin(req)).toBe('https://classroom.example.edu');
  });

  it('ignores forwarded headers when the configured value is invalid', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://classroom.example.edu/app');
    const req = request({ 'x-forwarded-host': 'attacker.example' });

    expect(buildRequestOrigin(req)).toBe('http://0.0.0.0:3000');
    expect(requestOrigin(req)).toBe('http://0.0.0.0:3000');
  });

  it('trusts the forwarded host when nothing is configured, as before', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', '');
    const req = request({ 'x-forwarded-host': 'school.example', 'x-forwarded-proto': 'https' });

    expect(buildRequestOrigin(req)).toBe('https://school.example');
    expect(requestOrigin(req)).toBe('https://school.example');
  });

  it('uses the request URL when nothing is forwarded or configured', () => {
    vi.stubEnv('PUBLIC_APP_ORIGIN', '');

    expect(buildRequestOrigin(request())).toBe('http://0.0.0.0:3000');
  });
});
