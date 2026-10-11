// @vitest-environment jsdom
/**
 * The access-code dialog is a modal named by its title. Its field has a real
 * label, the submit button has a name, a wrong code is announced as an alert,
 * and the field has the focus when the dialog opens.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

import { AccessCodeModal } from '@/components/access-code-modal';

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

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function renderModal(): HTMLDivElement {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(AccessCodeModal, { open: true, onSuccess: () => {} })));
  return container;
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

describe('the access-code dialog', () => {
  it('is a modal dialog named by its Vietnamese title', () => {
    const page = renderModal();
    const dialog = page.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const name = document.getElementById(dialog!.getAttribute('aria-labelledby') ?? '');
    expect(name?.textContent).toBe('Nhập mã truy cập');
  });

  it('labels the code field and names the submit button in Vietnamese', () => {
    renderModal();
    const input = document.querySelector('input') as HTMLInputElement;
    expect(input.labels?.[0]?.textContent).toBe('Mã truy cập');
    const submit = document.querySelector('button[type="submit"]');
    expect(submit?.getAttribute('aria-label')).toBe('Xác nhận');
  });

  it('puts the focus in the code field when it opens', () => {
    renderModal();
    expect(document.activeElement).toBe(document.querySelector('input'));
  });

  it('announces a wrong code as an alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    const page = renderModal();
    typeInto(page.querySelector('input') as HTMLInputElement, 'sai-ma');
    await act(async () => {
      (page.querySelector('form') as HTMLFormElement).requestSubmit();
      await new Promise((settle) => setTimeout(settle, 0));
    });
    const alert = page.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('Mã truy cập không đúng. Vui lòng thử lại.');
  });
});
