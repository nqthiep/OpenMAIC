import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCodeWidgetAllowed, isWidgetProvidersDisabled } from '@/lib/config/feature-flags';
import { GET } from '@/app/api/widgets/policy/route';

const KEYS = ['OPENMAIC_ALLOW_CODE_WIDGET', 'OPENMAIC_DISABLE_WIDGET_PROVIDERS'] as const;
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

describe('isCodeWidgetAllowed', () => {
  it('is false when unset', () => {
    expect(isCodeWidgetAllowed()).toBe(false);
  });
  it('is true for "true"', () => {
    process.env.OPENMAIC_ALLOW_CODE_WIDGET = 'true';
    expect(isCodeWidgetAllowed()).toBe(true);
  });
  it('is false for "false"', () => {
    process.env.OPENMAIC_ALLOW_CODE_WIDGET = 'false';
    expect(isCodeWidgetAllowed()).toBe(false);
  });
});

describe('isWidgetProvidersDisabled', () => {
  it('follows OPENMAIC_DISABLE_WIDGET_PROVIDERS', () => {
    expect(isWidgetProvidersDisabled()).toBe(false);
    process.env.OPENMAIC_DISABLE_WIDGET_PROVIDERS = 'true';
    expect(isWidgetProvidersDisabled()).toBe(true);
  });
});

describe('GET /api/widgets/policy', () => {
  it('returns codeWidgetAllowed false by default', async () => {
    expect(await (await GET()).json()).toEqual({ codeWidgetAllowed: false });
  });
  it('returns codeWidgetAllowed true when enabled', async () => {
    process.env.OPENMAIC_ALLOW_CODE_WIDGET = 'true';
    expect(await (await GET()).json()).toEqual({ codeWidgetAllowed: true });
  });
});
