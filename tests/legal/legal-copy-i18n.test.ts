import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'lib/i18n/locales';
const codes = readdirSync(DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace('.json', ''));
const load = (code: string) => JSON.parse(readFileSync(`${DIR}/${code}.json`, 'utf8'));
const read = (root: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], root);
const placeholders = (text: string) =>
  [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!).sort();

/** The copy that carries the consent, the free month, the prices and the contact address, with what each must interpolate. */
const KEYS: Record<string, string[]> = {
  'account.consent.label': ['privacy', 'terms'],
  'account.consent.terms': [],
  'account.consent.privacy': [],
  'account.errors.termsNotAccepted': [],
  'account.hints.trial': ['days'],
  'account.hints.forgot': ['email'],
  'home.guest.footerLegal': [],
  'home.guest.footerTerms': [],
  'home.guest.footerPrivacy': [],
  'home.guest.footerContact': [],
  'home.guest.pricing.trial': ['days'],
  'home.guest.pricing.trialBody': [],
  'home.guest.pricing.then': [],
  'home.guest.pricing.price': [],
  'home.guest.pricing.plan.m1': [],
  'home.guest.pricing.plan.m6': [],
  'home.guest.pricing.plan.m12': [],
  'home.guest.pricing.save': ['percent'],
  'home.guest.pricing.note': [],
  'home.guest.pricing.pay': ['email'],
  'home.guest.pricing.cta': [],
  'home.locked.contactAdmin': ['email'],
  'home.status.expiring': ['date', 'days', 'email'],
  'home.status.expired': ['date', 'email'],
  'home.status.suspended': ['email'],
};

describe.each(codes)('the consent, trial, price and contact copy (%s)', (code) => {
  const locale = load(code);

  it('has every string, and each one interpolates exactly what the page passes', () => {
    for (const [key, expected] of Object.entries(KEYS)) {
      const value = read(locale, key);
      expect(typeof value, `${code}: ${key}`).toBe('string');
      expect(placeholders(value as string), `${code}: ${key}`).toEqual(expected);
    }
  });

  it('shows the contact address instead of sending a member to an unnamed administrator', () => {
    for (const key of ['home.locked.contactAdmin', 'home.status.expiring', 'home.status.expired']) {
      expect(read(locale, key) as string, `${code}: ${key}`).toContain('{{email}}');
    }
  });

  it('keeps the consent sentence readable when its two links are put back', () => {
    const label = (read(locale, 'account.consent.label') as string)
      .replace('{{terms}}', read(locale, 'account.consent.terms') as string)
      .replace('{{privacy}}', read(locale, 'account.consent.privacy') as string);
    expect(label).toContain('16');
    expect(label).not.toContain('{{');
  });
});
