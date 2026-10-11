// @vitest-environment jsdom
/**
 * Vietnamese is the default language: the i18n instance starts in it and falls back
 * to it, and a browser language the app does not support lands on it. A supported
 * browser language keeps its own.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/lib/hooks/use-i18n';
import { defaultLocale } from '@/lib/i18n';
import i18n from '@/lib/i18n/config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

beforeEach(async () => {
  localStorage.clear();
  // Start elsewhere, so landing on Vietnamese is a change the test can see.
  await i18n.changeLanguage('en-US');
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  delete (navigator as { language?: string }).language;
  localStorage.clear();
});

/** Mounts the provider as a browser that reports `language`, with no stored choice. */
async function mountWithBrowserLanguage(language: string): Promise<void> {
  Object.defineProperty(navigator, 'language', { value: language, configurable: true });
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(I18nProvider, null, null));
  });
}

describe('default language', () => {
  it('is Vietnamese for the i18n instance and its fallback', () => {
    expect(defaultLocale).toBe('vi-VN');
    expect(i18n.options.lng).toBe('vi-VN');
    // i18next stores the fallback as a list
    expect(i18n.options.fallbackLng).toEqual(['vi-VN']);
  });

  it('falls back to Vietnamese for a browser language the app does not support', async () => {
    await mountWithBrowserLanguage('th-TH');
    await vi.waitFor(() => expect(i18n.language).toBe('vi-VN'), { timeout: 5000 });
  });

  it('keeps a browser language the app supports', async () => {
    await mountWithBrowserLanguage('zh-CN');
    await vi.waitFor(() => expect(i18n.language).toBe('zh-CN'), { timeout: 5000 });
  });
});
