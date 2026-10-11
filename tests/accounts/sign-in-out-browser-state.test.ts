// @vitest-environment jsdom
/**
 * The browser's local state on the sign-in and sign-out paths. A sign-in clears
 * the previous account's state before the page loads. A sign-out clears it once
 * the session is revoked. A sign-out everywhere that fails keeps everything and
 * stays on the page. The device cache runs against fake-indexeddb, so the clear
 * is the real one.
 */
import 'fake-indexeddb/auto';

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountPanel } from '@/components/accounts/account-panel';
import { LoginForm } from '@/components/accounts/login-form';
import { messages } from '@/components/accounts/messages';
import { LAST_ACCOUNT_KEY } from '@/lib/accounts/client-state';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS_KEY = 'maic:account:settings-storage';
const ACME = {
  id: 'acct-acme',
  username: 'lan.tran',
  displayName: 'Trần Thị Lan',
  role: 'user' as const,
};
const OTHER_ID = 'acct-other';

let root: Root | undefined;
let container: HTMLDivElement | undefined;

/** The keys this browser's state is checked by, read at the moment the page is left. */
interface LocalSnapshot {
  account: string | null;
  settings: string | null;
  theme: string | null;
}

function localSnapshot(): LocalSnapshot {
  return {
    account: localStorage.getItem(LAST_ACCOUNT_KEY),
    settings: localStorage.getItem(SETTINGS_KEY),
    theme: localStorage.getItem('theme'),
  };
}

function seedAccount(id: string, settings: string): void {
  localStorage.setItem(LAST_ACCOUNT_KEY, id);
  localStorage.setItem(SETTINGS_KEY, settings);
  localStorage.setItem('theme', 'dark');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Replaces the page location. `assign` records the local state at the moment the page is left. */
function stubLocation() {
  const page: { assign: ReturnType<typeof vi.fn>; leftWith?: LocalSnapshot } = {
    assign: vi.fn(),
  };
  page.assign.mockImplementation(() => {
    page.leftWith = localSnapshot();
  });
  vi.stubGlobal('location', { ...window.location, assign: page.assign });
  return page;
}

function stubFetch(answer: (path: string) => Response) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => answer(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mount(element: ReturnType<typeof createElement>): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
}

/** Lets the pending requests and their state updates finish. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** Waits for a step that depends on the device cache (fake IndexedDB). */
async function until(condition: () => boolean, ms = 4000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error('the condition was not reached in time');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

function fieldLabelled(text: string): HTMLInputElement {
  const label = [...document.querySelectorAll('label')].find(
    (element) => element.textContent?.trim() === text,
  );
  const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
  if (!(input instanceof HTMLInputElement)) throw new Error(`no field labelled ${text}`);
  return input;
}

function buttonNamed(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`no button named ${text}`);
  return button;
}

function typeInto(input: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function alertText(): string {
  return [...document.querySelectorAll('[role="alert"]')]
    .map((element) => element.textContent?.trim() ?? '')
    .join(' | ');
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

describe('signing in on a browser that served another account', () => {
  it('clears the previous state and records the new account before the page loads', async () => {
    seedAccount(OTHER_ID, 'another account preferences');
    const page = stubLocation();
    stubFetch((path) => {
      if (path !== '/api/auth/login') throw new Error(`unexpected request ${path}`);
      return json({
        success: true,
        user: { ...ACME, status: 'active', mustChangePassword: false },
        mustChangePassword: false,
      });
    });
    mount(createElement(LoginForm, { next: '/' }));

    typeInto(fieldLabelled(messages.fields.username), ACME.username);
    typeInto(fieldLabelled(messages.fields.password), 'a password of mine');
    act(() => (document.querySelector('form') as HTMLFormElement).requestSubmit());
    await until(() => page.assign.mock.calls.length === 1);

    expect(page.assign).toHaveBeenCalledWith('/');
    expect(page.leftWith).toEqual({ account: ACME.id, settings: null, theme: 'dark' });
  });

  it('leaves the browser alone when the sign-in fails', async () => {
    seedAccount(OTHER_ID, 'another account preferences');
    const page = stubLocation();
    stubFetch(() => json({ success: false, errorCode: 'INVALID_CREDENTIALS' }, 401));
    mount(createElement(LoginForm, { next: '/' }));

    typeInto(fieldLabelled(messages.fields.username), ACME.username);
    typeInto(fieldLabelled(messages.fields.password), 'a wrong password');
    act(() => (document.querySelector('form') as HTMLFormElement).requestSubmit());
    await settle();

    expect(page.assign).not.toHaveBeenCalled();
    expect(localSnapshot()).toEqual({
      account: OTHER_ID,
      settings: 'another account preferences',
      theme: 'dark',
    });
    expect(alertText()).toContain(messages.login.invalid);
  });
});

describe('signing out', () => {
  const user = { username: ACME.username, displayName: ACME.displayName, role: ACME.role };

  it('revokes every session, clears the state, forgets the account and then leaves', async () => {
    seedAccount(ACME.id, 'acme preferences');
    const page = stubLocation();
    const fetchMock = stubFetch(() => json({ success: true }));
    mount(createElement(AccountPanel, { user }));

    act(() => buttonNamed(messages.account.signOutAll).click());
    act(() => buttonNamed(messages.account.signOutAllConfirm).click());
    await until(() => page.assign.mock.calls.length === 1);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout-all',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(page.assign).toHaveBeenCalledWith('/login');
    expect(page.leftWith).toEqual({ account: null, settings: null, theme: 'dark' });
  });

  it('keeps the state and stays on the page when the sign-out everywhere fails', async () => {
    seedAccount(ACME.id, 'acme preferences');
    const page = stubLocation();
    stubFetch(() => json({ success: false }, 500));
    mount(createElement(AccountPanel, { user }));

    act(() => buttonNamed(messages.account.signOutAll).click());
    act(() => buttonNamed(messages.account.signOutAllConfirm).click());
    await settle();

    expect(page.assign).not.toHaveBeenCalled();
    expect(localSnapshot()).toEqual({
      account: ACME.id,
      settings: 'acme preferences',
      theme: 'dark',
    });
    expect(alertText()).toContain(messages.serverError);
    expect(buttonNamed(messages.account.signOutAllConfirm).disabled).toBe(false);
  });

  it('signs out of this device: revokes the session, clears the state and leaves', async () => {
    seedAccount(ACME.id, 'acme preferences');
    const page = stubLocation();
    const fetchMock = stubFetch(() => json({ success: true }));
    mount(createElement(AccountPanel, { user }));

    act(() => buttonNamed(messages.account.signOut).click());
    await until(() => page.assign.mock.calls.length === 1);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(page.assign).toHaveBeenCalledWith('/login');
    expect(page.leftWith).toEqual({ account: null, settings: null, theme: 'dark' });
  });

  it('still clears and leaves when the revoke of this device fails', async () => {
    seedAccount(ACME.id, 'acme preferences');
    const page = stubLocation();
    stubFetch(() => json({ success: false }, 500));
    mount(createElement(AccountPanel, { user }));

    act(() => buttonNamed(messages.account.signOut).click());
    await until(() => page.assign.mock.calls.length === 1);

    expect(page.assign).toHaveBeenCalledWith('/login');
    expect(page.leftWith).toEqual({ account: null, settings: null, theme: 'dark' });
  });
});
