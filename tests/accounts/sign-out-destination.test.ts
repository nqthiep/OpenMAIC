// @vitest-environment jsdom

/** Where the account menu sends a person after "Sign out": the home page, never the page they were on. */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  assign: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ locale: 'vi-VN', t: (key: string) => key }),
}));
vi.mock('@/lib/persistence/bootstrap', () => ({ isBrowserPersistenceEnabled: () => true }));
vi.mock('@/components/support/support-inbox', () => ({
  SUPPORT_OPEN_EVENT: 'support-open',
  SupportDialog: () => null,
  useSupportUnread: () => 0,
}));
vi.mock('@/components/account/account-dialog', () => ({ AccountDialog: () => null }));
vi.mock('@/components/account/change-password-dialog', () => ({
  ChangePasswordDialog: () => null,
}));
vi.mock('@/components/account/account-api', () => ({
  peekSharedSession: () => undefined,
  fetchAccountSession: async () => ({
    enabled: true,
    registrationOpen: false,
    authenticated: true,
    account: { username: 'admin' },
    role: 'admin',
    membership: null,
  }),
  sessionChanged: () => {},
  signOut: mocks.signOut,
  signOutOtherSessions: async () => {},
}));

import { AccountControl } from '@/components/account/account-control';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const realLocation = window.location;

beforeEach(() => {
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.assign.mockReset();
  mocks.reload.mockReset();
  // jsdom does not navigate; the page watches what the control asks the location to do.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: mocks.assign, reload: mocks.reload, pathname: '/admin' },
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

async function openMenuAndClick(label: string): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AccountControl));
  });
  const trigger = container.querySelector('button[aria-haspopup="menu"]') as HTMLElement;
  expect(trigger).not.toBeNull();
  // Radix opens its menu on a primary-button pointer down.
  await act(async () => {
    trigger.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
    );
  });
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (el) => el.textContent === label,
  ) as HTMLElement | undefined;
  expect(item, `menu item ${label}`).toBeDefined();
  await act(async () => {
    item!.click();
  });
}

describe('signing out from the account menu', () => {
  it('goes to the home page and does not reload the page the person was on', async () => {
    await openMenuAndClick('account.signOut');
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.assign).toHaveBeenCalledWith('/');
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('stays where it is when the server refuses the sign-out', async () => {
    mocks.signOut.mockRejectedValue(new Error('network'));
    await openMenuAndClick('account.signOut');
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
