import { supportedLocales } from './locales';
import type { Locale } from './types';

/** Cookie holding the visitor's explicit language choice, written by LocaleSwitch. */
export const LOCALE_COOKIE = 'locale';

/** Language for a request that names no supported one. Vietnamese is this app's home language. */
export const REQUEST_LOCALE_FALLBACK: Locale = 'vi-VN';

function localeFor(tag: string): Locale | undefined {
  const wanted = tag.toLowerCase();
  const exact = supportedLocales.find((l) => l.code.toLowerCase() === wanted);
  if (exact) return exact.code;
  // Primary subtag match: 'en' and 'en-GB' both resolve to 'en-US'.
  const primary = wanted.split('-')[0];
  return supportedLocales.find((l) => l.code.toLowerCase().split('-')[0] === primary)?.code;
}

/** Accept-Language tags, highest q first. q=0 means refused, so the tag is dropped. */
function rankedTags(header: string): string[] {
  return header
    .split(',')
    .map((item, order) => {
      const [tag, ...params] = item.split(';').map((part) => part.trim());
      const q = params.find((part) => part.startsWith('q='));
      return { tag, weight: q === undefined ? 1 : Number(q.slice(2)), order };
    })
    .filter((entry) => entry.tag && entry.tag !== '*' && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.order - b.order)
    .map((entry) => entry.tag);
}

/**
 * The language the server renders a request in: the cookie when it names a supported
 * locale, else the first Accept-Language tag that matches one, else REQUEST_LOCALE_FALLBACK.
 */
export function resolveRequestLocale(
  cookie: string | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  const chosen = supportedLocales.find((l) => l.code === cookie);
  if (chosen) return chosen.code;
  for (const tag of rankedTags(acceptLanguage ?? '')) {
    const hit = localeFor(tag);
    if (hit) return hit;
  }
  return REQUEST_LOCALE_FALLBACK;
}
