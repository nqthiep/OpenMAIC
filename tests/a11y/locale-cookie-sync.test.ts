// @vitest-environment jsdom
/**
 * Choosing a language on the home page writes the cookie that /learn reads on
 * the server, so both pages show the same language after the choice.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/lib/i18n/config';
import { I18nProvider, useI18n } from '@/lib/hooks/use-i18n';
import { LOCALE_COOKIE, resolveRequestLocale } from '@/lib/i18n/request-locale';
import type { Locale } from '@/lib/i18n/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  // the provider suspends until a language's resources have loaded
  await act(async () => {
    await i18n.loadLanguages(['vi-VN', 'en-US']);
  });
});

/** A language choice, as the home page's switcher offers it. */
function Choice({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n();
  return createElement('button', { type: 'button', onClick: () => setLocale(locale) }, locale);
}

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function cookieValue(name: string): string | undefined {
  const pair = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`));
  return pair?.slice(name.length + 1);
}

function choose(locale: Locale): void {
  if (!root || !container) throw new Error('not mounted');
  act(() => {
    root?.render(createElement(I18nProvider, null, createElement(Choice, { locale })));
  });
  act(() => (container?.querySelector('button') as HTMLButtonElement).click());
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  document.cookie = `${LOCALE_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  localStorage.clear();
});

describe('a language choice on the home page', () => {
  it('writes the cookie the server reads for /learn, and the storage key', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    choose('en-US');

    expect(cookieValue(LOCALE_COOKIE)).toBe('en-US');
    expect(localStorage.getItem('locale')).toBe('en-US');
    // the same resolution /learn runs on the server for a request carrying that cookie
    expect(resolveRequestLocale(cookieValue(LOCALE_COOKIE), 'vi-VN')).toBe('en-US');
  });

  it('a later choice replaces the earlier one', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    choose('en-US');
    choose('vi-VN');

    expect(cookieValue(LOCALE_COOKIE)).toBe('vi-VN');
    expect(resolveRequestLocale(cookieValue(LOCALE_COOKIE), 'en-US')).toBe('vi-VN');
  });
});
