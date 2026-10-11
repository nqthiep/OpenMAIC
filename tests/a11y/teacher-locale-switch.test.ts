// @vitest-environment jsdom
/**
 * /teacher answers in English for an English request and in Vietnamese for any other,
 * and its switch marks the language in use.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TeacherPage from '@/app/teacher/page';
import '@/lib/i18n/config';
import { RequestLocaleProvider } from '@/lib/i18n/request-locale-provider';
import type { Locale } from '@/lib/i18n/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** Mounts the page with no teacher code yet, so the code form is what shows. */
async function mountPage(locale: Locale): Promise<HTMLElement> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 401 })),
  );
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(RequestLocaleProvider, { locale }, createElement(TeacherPage)));
  });
  // The report arrives a few ticks after mount, and how many depends on the run, so wait for the
  // form itself rather than for a fixed number of ticks.
  for (let tick = 0; tick < 50 && !host.querySelector('#teacher-code'); tick += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return host;
}

/** The switch's buttons as [label, aria-pressed], in the order they are shown. */
function switchChoices(host: HTMLElement): [string | null, string | null][] {
  return [...host.querySelectorAll('button[aria-pressed]')].map((button) => [
    button.textContent,
    button.getAttribute('aria-pressed'),
  ]);
}

describe('teacher page language', () => {
  it('shows English and marks English as the choice in use', async () => {
    const host = await mountPage('en-US');
    expect(host.textContent).toContain('Teacher code');
    expect(switchChoices(host)).toEqual([
      ['Tiếng Việt', 'false'],
      ['English', 'true'],
    ]);
  });

  it('shows Vietnamese and marks Vietnamese as the choice in use', async () => {
    const host = await mountPage('vi-VN');
    expect(host.textContent).toContain('Mã giáo viên');
    expect(switchChoices(host)).toEqual([
      ['Tiếng Việt', 'true'],
      ['English', 'false'],
    ]);
  });

  it.each(['ja-JP', 'zh-CN', 'fr-FR'] as const)(
    'shows Vietnamese for %s and marks Vietnamese as the choice in use',
    async (locale) => {
      const host = await mountPage(locale);
      expect(host.textContent).toContain('Mã giáo viên');
      expect(switchChoices(host)).toEqual([
        ['Tiếng Việt', 'true'],
        ['English', 'false'],
      ]);
    },
  );
});
