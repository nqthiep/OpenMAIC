/**
 * Message helpers: pick a locale, fill '{var}' placeholders.
 * Browser-safe: no Node APIs.
 */
import type { Messages } from '@/lib/tutor/catalog/types';

const FALLBACK_LOCALE = 'en-US';
/** `{name}` or the English count form `{name|one|other}` (value 1 picks `one`, anything else `other`). */
const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)(?:\|([^|{}]+)\|([^|{}]+))?\}/g;

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** m[locale] → m['en-US'] → ''. Only own string keys count (no 'constructor' leaks). */
export function msg(m: Messages, locale: string): string {
  for (const l of [locale, FALLBACK_LOCALE]) {
    if (own(m, l) && typeof m[l] === 'string') return m[l];
  }
  return '';
}

/**
 * Replaces '{name}' with vars[name]; unknown names stay as they are. `{name|node|nodes}` writes the
 * count and the matching noun ("1 node", "3 nodes"), so English text never says "1 nodes".
 */
export function fill(template: string, vars?: Record<string, number | string>): string {
  if (!vars) return template;
  return template.replace(PLACEHOLDER, (whole, name: string, one?: string, other?: string) => {
    if (!own(vars, name)) return whole;
    const value = vars[name];
    return one === undefined ? String(value) : `${value} ${Number(value) === 1 ? one : other}`;
  });
}

/** Leftover '{name}' tokens, in order of appearance (duplicates kept). */
export function unresolved(s: string): string[] {
  return s.match(PLACEHOLDER) ?? [];
}

/** Variable name of a token returned by `unresolved`: '{n}' and '{n|node|nodes}' both give 'n'. */
export function placeholderName(token: string): string {
  return token.slice(1, -1).split('|')[0];
}

/** Has non-empty 'vi-VN' and 'en-US'. */
export function hasRequiredLocales(m: Messages): boolean {
  return ['vi-VN', 'en-US'].every((l) => own(m, l) && typeof m[l] === 'string' && m[l] !== '');
}
