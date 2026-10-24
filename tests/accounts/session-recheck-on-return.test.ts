// @vitest-environment jsdom

/**
 * A tab left open on another device: after "sign out other devices" (or an expiry, or a disabled
 * account) it must notice when the person comes back to it, and not keep showing the account menu.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSession: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(mocks.toast, { error: vi.fn(), success: vi.fn() }),
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
  fetchAccountSession: mocks.fetchSession,
  sessionChanged: () => {},
  signOut: async () => {},
  signOutOtherSessions: async () => {},
}));

import { AccountControl } from '@/components/account/account-control';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SIGNED_IN = {
  enabled: true,
  registrationOpen: false,
  authenticated: true,
  account: { username: 'minh' },
  role: 'learner',
  membership: null,
};
const SIGNED_OUT = { enabled: true, registrationOpen: false, authenticated: false };

const roots: Root[] = [];
let visibility: DocumentVisibilityState = 'visible';

beforeEach(() => {
  mocks.fetchSession.mockReset();
  mocks.toast.mockReset();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AccountControl));
  });
  return container;
}

const hasAccountMenu = (c: HTMLElement) => c.querySelector('button[aria-haspopup="menu"]') !== null;
const hasSignIn = (c: HTMLElement) => c.querySelector('button[aria-haspopup="dialog"]') !== null;

async function comeBack(event: 'focus' | 'visibilitychange'): Promise<void> {
  await act(async () => {
    if (event === 'focus') window.dispatchEvent(new Event('focus'));
    else document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('an open tab after its session was ended elsewhere', () => {
  it('shows the signed-out state and says why when the person returns to the window', async () => {
    mocks.fetchSession.mockResolvedValueOnce(SIGNED_IN).mockResolvedValue(SIGNED_OUT);
    const container = await mount();
    expect(hasAccountMenu(container)).toBe(true);

    await comeBack('focus');

    expect(hasAccountMenu(container)).toBe(false);
    expect(hasSignIn(container)).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith('account.errors.sessionEnded');
  });

  it('does the same when the person switches back to the tab', async () => {
    mocks.fetchSession.mockResolvedValueOnce(SIGNED_IN).mockResolvedValue(SIGNED_OUT);
    const container = await mount();
    await comeBack('visibilitychange');
    expect(hasSignIn(container)).toBe(true);
  });

  it('changes nothing while the session is still alive', async () => {
    mocks.fetchSession.mockResolvedValue(SIGNED_IN);
    const container = await mount();
    await comeBack('focus');
    expect(hasAccountMenu(container)).toBe(true);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('changes nothing when the check itself fails, as it must not guess', async () => {
    mocks.fetchSession.mockResolvedValueOnce(SIGNED_IN).mockRejectedValue(new Error('offline'));
    const container = await mount();
    await comeBack('focus');
    expect(hasAccountMenu(container)).toBe(true);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('does not ask while the tab is hidden', async () => {
    mocks.fetchSession.mockResolvedValueOnce(SIGNED_IN).mockResolvedValue(SIGNED_OUT);
    const container = await mount();
    visibility = 'hidden';
    await comeBack('visibilitychange');
    expect(mocks.fetchSession).toHaveBeenCalledTimes(1);
    expect(hasAccountMenu(container)).toBe(true);
  });

  it('does not ask for a visitor who is not signed in', async () => {
    mocks.fetchSession.mockResolvedValue(SIGNED_OUT);
    const container = await mount();
    await comeBack('focus');
    expect(mocks.fetchSession).toHaveBeenCalledTimes(1);
    expect(hasSignIn(container)).toBe(true);
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
