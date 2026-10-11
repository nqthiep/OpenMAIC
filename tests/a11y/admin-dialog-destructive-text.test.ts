// @vitest-environment jsdom
/**
 * The confirm button of a dialog that removes or disables an account is a
 * destructive button. Its text takes the darker red of the account pages in
 * light mode and the lighter one in dark mode, as the destructive token is
 * under 4.5:1 on its own tint (see destructive-action-contrast.test.ts).
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { DeleteUserDialog, StatusDialog } from '@/components/accounts/admin-dialogs';
import type { AdminUser } from '@/components/accounts/admin-types';
import { messages } from '@/components/accounts/messages';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const user: AdminUser = {
  id: '0c3e9b1e-7a4d-4f5e-9b2a-1d2c3e4f5a6b',
  username: 'thiep',
  displayName: 'Nguyễn Thiệp',
  role: 'user',
  status: 'active',
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(element: ReturnType<typeof createElement>): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

/** The button of the open dialog whose text is `text`. */
function buttonNamed(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('[role="dialog"] button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`no button named ${text}`);
  return button;
}

const handlers = { onClose: () => {}, onChanged: () => {} };

describe('the confirm button of the account dialogs', () => {
  it('removing an account is a destructive button with the account-page red', () => {
    render(createElement(DeleteUserDialog, { user, ...handlers }));
    const button = buttonNamed(messages.remove.submit);
    expect(button.dataset.variant).toBe('destructive');
    expect(button.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['text-red-800', 'dark:text-red-200']),
    );
  });

  it('disabling an account is a destructive button with the account-page red', () => {
    render(createElement(StatusDialog, { user, target: 'disabled', ...handlers }));
    const button = buttonNamed(messages.disable.submit);
    expect(button.dataset.variant).toBe('destructive');
    expect(button.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['text-red-800', 'dark:text-red-200']),
    );
  });

  it('enabling an account is not destructive and keeps the default colours', () => {
    render(createElement(StatusDialog, { user, target: 'active', ...handlers }));
    const button = buttonNamed(messages.enable.submit);
    expect(button.dataset.variant).toBe('default');
    expect(button.className).not.toContain('text-red-800');
  });
});
