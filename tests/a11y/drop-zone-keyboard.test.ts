// @vitest-environment jsdom
/**
 * The course-material drop zone of the home toolbar is a button for keyboard
 * users: Enter and Space open the file picker, as a click does. A locked zone
 * says it is disabled and ignores them.
 */
import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import i18next, { type i18n as I18n } from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import viVN from '@/lib/i18n/locales/vi-VN.json';
import { modelSettingsClient } from '@/lib/model-settings/client';

import { modelSettingsViewFor } from '../helpers/model-settings-view';

let i18n: I18n;

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => i18n.t(key, options ?? {}),
    locale: 'vi-VN',
  }),
}));

// The drop zone sits in the attach popover. Its content is rendered inline here,
// as the dropzone-hint test does, so the test does not drive Radix's open state.
vi.mock('@/components/ui/popover', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children);
  return { Popover: Passthrough, PopoverTrigger: Passthrough, PopoverContent: Passthrough };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  i18n = i18next.createInstance();
  await i18n.init({
    lng: 'vi-VN',
    fallbackLng: 'vi-VN',
    resources: { 'vi-VN': { translation: viVN } },
    interpolation: { escapeValue: false },
  });
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  modelSettingsClient.adopt(null);
  vi.restoreAllMocks();
});

async function renderToolbar(materialsLocked = false) {
  modelSettingsClient.adopt(modelSettingsViewFor({}));
  await act(async () => {
    root.render(
      createElement(GenerationToolbar, {
        courseMaterials: [],
        onCourseMaterialsAdd: () => {},
        onCourseMaterialRemove: () => {},
        onPdfError: () => {},
        materialsLocked,
      }),
    );
  });
}

/** The drop zone: the role=button element that carries the course-material label. */
function dropZone(): HTMLElement {
  const zone = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find((el) =>
    el.textContent?.includes('Tải tài liệu bài học'),
  );
  if (!zone) throw new Error('drop zone is not rendered');
  return zone;
}

function filePicker(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('file input is not rendered');
  return input;
}

/** Sends a keydown to the drop zone; true when the page default was not prevented. */
async function press(key: string): Promise<boolean> {
  let proceeds = true;
  await act(async () => {
    proceeds = dropZone().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
  return proceeds;
}

describe('course-material drop zone', () => {
  it('is in the Tab order and is announced as a button', async () => {
    await renderToolbar();
    expect(dropZone().tabIndex).toBe(0);
    expect(dropZone().getAttribute('aria-disabled')).toBeNull();
  });

  it('Enter and Space open the file picker, as a click does', async () => {
    await renderToolbar();
    const picker = vi.spyOn(filePicker(), 'click').mockImplementation(() => {});

    expect(await press('Enter')).toBe(false);
    expect(picker).toHaveBeenCalledTimes(1);

    expect(await press(' ')).toBe(false);
    expect(picker).toHaveBeenCalledTimes(2);

    await act(async () => dropZone().click());
    expect(picker).toHaveBeenCalledTimes(3);
  });

  it('other keys leave the page and the picker alone', async () => {
    await renderToolbar();
    const picker = vi.spyOn(filePicker(), 'click').mockImplementation(() => {});

    expect(await press('a')).toBe(true);
    expect(await press('Tab')).toBe(true);
    expect(picker).not.toHaveBeenCalled();
  });

  it('a locked zone says it is disabled and ignores Enter and Space', async () => {
    await renderToolbar(true);
    expect(dropZone().getAttribute('aria-disabled')).toBe('true');

    const picker = vi.spyOn(filePicker(), 'click').mockImplementation(() => {});
    await press('Enter');
    await press(' ');
    expect(picker).not.toHaveBeenCalled();
  });
});
