import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import en from '@/lib/i18n/locales/en-US.json';
import vi from '@/lib/i18n/locales/vi-VN.json';

const PANEL = readFileSync('components/settings/omniroute-panel.tsx', 'utf8');

function lookup(tree: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], tree);
}

/** Keys the panel writes out in full, plus the families it builds from a state, role, group or preset. */
const USED = [
  // A key cut short by a template (`admin.omniroute.state.${...}`) ends in a dot: the families below cover it.
  ...new Set(
    (PANEL.match(/admin\.omniroute\.[A-Za-z0-9.]+/g) ?? []).filter((key) => !key.endsWith('.')),
  ),
  ...['ready', 'unconfigured', 'unreachable', 'noProviders', 'noKey'].map(
    (s) => `admin.omniroute.state.${s}`,
  ),
  ...['generate', 'chat', 'grade', 'utility'].map((r) => `admin.omniroute.role.${r}`),
  ...['auto', 'combo', 'model'].map((g) => `admin.omniroute.group.${g}`),
  ...['presetBalanced', 'presetEconomy', 'presetQuality'].map((p) => `admin.omniroute.step3.${p}`),
];

const tokens = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();

describe('OmniRoute panel strings', () => {
  it('has every key the panel uses, in English and in Vietnamese', () => {
    expect(USED.length).toBeGreaterThan(40);
    for (const key of USED) {
      expect(typeof lookup(en, key), `en-US ${key}`).toBe('string');
      expect(typeof lookup(vi, key), `vi-VN ${key}`).toBe('string');
    }
  });

  it('keeps the same placeholders in both languages', () => {
    for (const key of USED) {
      expect(tokens(lookup(vi, key) as string), key).toEqual(tokens(lookup(en, key) as string));
    }
  });

  it('no longer carries the strings of the old open-the-dashboard block', () => {
    expect(lookup(en, 'admin.providers.omniroute')).toBeUndefined();
    expect(lookup(vi, 'admin.providers.omniroute')).toBeUndefined();
  });
});
