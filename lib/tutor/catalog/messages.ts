/**
 * Message helpers: pick a locale, fill '{var}' placeholders.
 * Browser-safe: no Node APIs.
 */
import type { Messages } from '@/lib/tutor/catalog/types';

const FALLBACK_LOCALE = 'en-US';
const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** m[locale] → m['en-US'] → ''. Only own string keys count (no 'constructor' leaks). */
export function msg(m: Messages, locale: string): string {
  for (const l of [locale, FALLBACK_LOCALE]) {
    if (own(m, l) && typeof m[l] === 'string') return m[l];
  }
  return '';
}

/** Replaces '{name}' with vars[name]; unknown names stay as '{name}'. */
export function fill(template: string, vars?: Record<string, number | string>): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    own(vars, name) ? String(vars[name]) : whole,
  );
}

/** Leftover '{name}' tokens, in order of appearance (duplicates kept). */
export function unresolved(s: string): string[] {
  return s.match(PLACEHOLDER) ?? [];
}

/** Has non-empty 'vi-VN' and 'en-US'. */
export function hasRequiredLocales(m: Messages): boolean {
  return ['vi-VN', 'en-US'].every((l) => own(m, l) && typeof m[l] === 'string' && m[l] !== '');
}
