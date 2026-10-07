import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getManimServiceConfig } from '@/lib/config/feature-flags';

const KEYS = ['MANIM_SERVICE_URL', 'MANIM_SERVICE_TOKEN'] as const;
const originals = new Map<string, string | undefined>();

beforeEach(() => {
  for (const k of KEYS) {
    originals.set(k, process.env[k]);
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    const v = originals.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('getManimServiceConfig', () => {
  it('is null when nothing is set', () => {
    expect(getManimServiceConfig()).toBeNull();
  });

  it('is null when only one of the two is set, or one is blank', () => {
    process.env.MANIM_SERVICE_URL = 'http://manim:8080';
    expect(getManimServiceConfig()).toBeNull();
    delete process.env.MANIM_SERVICE_URL;
    process.env.MANIM_SERVICE_TOKEN = 't';
    expect(getManimServiceConfig()).toBeNull();
    process.env.MANIM_SERVICE_URL = '   ';
    expect(getManimServiceConfig()).toBeNull();
    process.env.MANIM_SERVICE_URL = 'http://manim:8080';
    process.env.MANIM_SERVICE_TOKEN = '  ';
    expect(getManimServiceConfig()).toBeNull();
  });

  it('returns both, with surrounding spaces and trailing slashes removed from the url', () => {
    process.env.MANIM_SERVICE_URL = '  http://manim:8080//  ';
    process.env.MANIM_SERVICE_TOKEN = ' secret ';
    expect(getManimServiceConfig()).toEqual({ url: 'http://manim:8080', token: 'secret' });
  });

  it('the kill-switch: unsetting the url turns the service off again', () => {
    process.env.MANIM_SERVICE_URL = 'http://manim:8080';
    process.env.MANIM_SERVICE_TOKEN = 't';
    expect(getManimServiceConfig()).not.toBeNull();
    delete process.env.MANIM_SERVICE_URL;
    expect(getManimServiceConfig()).toBeNull();
  });
});
