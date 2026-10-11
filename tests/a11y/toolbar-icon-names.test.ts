// @vitest-environment jsdom
/**
 * The home toolbar's buttons each have a name a screen reader can announce, and
 * the icon-only course-material button names its action in Vietnamese.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next, { type i18n as I18n } from 'i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import viVN from '@/lib/i18n/locales/vi-VN.json';

let i18n: I18n;

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => i18n.t(key, options ?? {}),
    locale: 'vi-VN',
  }),
}));

import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { modelSettingsClient } from '@/lib/model-settings/client';

import { modelSettingsViewFor } from '../helpers/model-settings-view';

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'vi-VN',
    fallbackLng: 'vi-VN',
    resources: { 'vi-VN': { translation: viVN } },
    interpolation: { escapeValue: false },
  });
});

afterEach(() => {
  modelSettingsClient.adopt(null);
  document.body.innerHTML = '';
});

/** The toolbar with no course material attached, as the home page first shows it. */
function renderEmptyToolbar(): HTMLElement {
  modelSettingsClient.adopt(modelSettingsViewFor({}));
  document.body.innerHTML = renderToStaticMarkup(
    createElement(GenerationToolbar, {
      courseMaterials: [],
      onCourseMaterialsAdd: () => {},
      onCourseMaterialRemove: () => {},
      onPdfError: () => {},
    }),
  );
  return document.body;
}

describe('the home toolbar buttons', () => {
  it('names the course-material button in Vietnamese', () => {
    const button = renderEmptyToolbar().querySelector('[data-testid="course-material-button"]');
    expect(button?.getAttribute('aria-label')).toBe('Tải tài liệu bài học');
  });

  it('gives every button a name a screen reader can announce', () => {
    const buttons = [...renderEmptyToolbar().querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const name = button.getAttribute('aria-label') || button.textContent?.trim() || button.title;
      expect(name, button.outerHTML).toBeTruthy();
    }
  });
});
