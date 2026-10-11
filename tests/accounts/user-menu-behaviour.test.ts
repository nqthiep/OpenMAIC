// @vitest-environment jsdom
/**
 * The account menu on a real (jsdom) page: it asks who is signed in only with a
 * session cookie, clears the previous account's state when the account differs
 * and reloads, reloads when another tab changes the account, and signs out. The
 * device cache runs against fake-indexeddb, so the clear is the real one.
 */
import 'fake-indexeddb/auto';

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { messages } from '@/components/accounts/messages';
import { UserMenu } from '@/components/accounts/user-menu';
import { LAST_ACCOUNT_KEY } from '@/lib/accounts/client-state';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function () {};
});

const ACME = { id: 'acct-acme', username: 'lan.tran', displayName: 'Trần Thị Lan', role: 'user' };
const OTHER = { id: 'acct-other', username: 'an.nguyen', displayName: 'Nguyễn An', role: 'user' };
const BOSS = { id: 'acct-boss', username: 'admin', displayName: 'Quản trị', role: 'admin' };

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function meFor(account: typeof ACME, mustChangePassword = false) {
  return json({
    success: true,
    user: { ...account, status: 'active' },
    mustChangePassword,
  });
}

/** Answers `/api/auth/me` and `/api/auth/logout`; any other request is a test error. */
function stubFetch(answers: { me: Response; logout?: Response }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/auth/me') return answers.me.clone();
    if (path === '/api/auth/logout') return (answers.logout ?? json({ success: true })).clone();
    throw new Error(`unexpected request ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Replaces the page's location so reload and assign are observed, not performed. */
function stubLocation() {
  const reload = vi.fn();
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload, assign });
  return { reload, assign };
}

function mount(hasSessionCookie: boolean): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(UserMenu, { hasSessionCookie })));
}

/** Lets pending requests and their state updates finish. */
async function flush(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Waits for a condition that depends on the device cache (fake IndexedDB). */
async function until(condition: () => boolean, ms = 4000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error('the condition was not reached in time');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

function trigger(): HTMLButtonElement | null {
  return document.body.querySelector<HTMLButtonElement>(
    `button[aria-label^="${messages.userMenu.trigger('')}"]`,
  );
}

async function openMenu(): Promise<void> {
  const button = trigger();
  if (!button) throw new Error('the account menu trigger is not on the page');
  act(() => {
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  });
  await flush();
}

function menuItemTexts(): string[] {
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
    (item) => item.textContent?.trim() ?? '',
  );
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

describe('the account menu on a page', () => {
  it('asks no one who is signed in when there is no session cookie', async () => {
    const fetchMock = stubFetch({ me: meFor(ACME) });
    mount(false);
    await flush();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(trigger()).toBeNull();
  });

  it('keeps the state of the account this browser last served, without a reload', async () => {
    localStorage.setItem(LAST_ACCOUNT_KEY, ACME.id);
    localStorage.setItem('maic:account:settings-storage', 'acme preferences');
    const { reload } = stubLocation();
    const fetchMock = stubFetch({ me: meFor(ACME) });
    mount(true);
    await flush();

    expect(trigger()).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.anything());
    expect(localStorage.getItem('maic:account:settings-storage')).toBe('acme preferences');
    expect(reload).not.toHaveBeenCalled();
  });

  it('clears the previous account, records this one and reloads when they differ', async () => {
    localStorage.setItem(LAST_ACCOUNT_KEY, OTHER.id);
    localStorage.setItem('maic:account:settings-storage', 'another account preferences');
    localStorage.setItem('theme', 'dark');
    const { reload } = stubLocation();
    stubFetch({ me: meFor(ACME) });
    mount(true);

    await until(() => reload.mock.calls.length === 1);
    expect(localStorage.getItem('maic:account:settings-storage')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBe(ACME.id);
  });

  it('reloads when another tab records a different account', async () => {
    localStorage.setItem(LAST_ACCOUNT_KEY, ACME.id);
    const { reload } = stubLocation();
    stubFetch({ me: meFor(ACME) });
    mount(true);
    await flush();
    expect(reload).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: LAST_ACCOUNT_KEY, newValue: OTHER.id }),
      );
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('offers the administration page to an administrator only', async () => {
    stubLocation();
    stubFetch({ me: meFor({ ...BOSS, displayName: ACME.displayName }) });
    mount(true);
    await flush();
    await openMenu();
    expect(menuItemTexts()).toEqual([
      messages.userMenu.account,
      messages.userMenu.admin,
      messages.userMenu.signOut,
    ]);

    act(() => root?.unmount());
    root = undefined;
    container?.remove();
    container = undefined;
    stubFetch({ me: meFor(ACME) });
    mount(true);
    await flush();
    await openMenu();
    expect(menuItemTexts()).toEqual([messages.userMenu.account, messages.userMenu.signOut]);
  });

  it('signs out: revokes the session, clears the account, forgets it and leaves', async () => {
    localStorage.setItem(LAST_ACCOUNT_KEY, ACME.id);
    localStorage.setItem('maic:account:settings-storage', 'acme preferences');
    localStorage.setItem('theme', 'dark');
    const { reload, assign } = stubLocation();
    const fetchMock = stubFetch({ me: meFor(ACME) });
    mount(true);
    await flush();
    await openMenu();

    const signOut = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.trim() === messages.userMenu.signOut,
    );
    if (!signOut) throw new Error('no sign-out item');
    act(() => {
      signOut.click();
    });
    await until(() => assign.mock.calls.length === 1);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(assign).toHaveBeenCalledWith('/login');
    expect(localStorage.getItem('maic:account:settings-storage')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem(LAST_ACCOUNT_KEY)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});
