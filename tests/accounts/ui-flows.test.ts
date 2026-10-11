// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminConsole } from '@/components/accounts/admin-console';
import { LoginForm } from '@/components/accounts/login-form';
import { PasswordForm } from '@/components/accounts/password-form';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function render(element: ReturnType<typeof createElement>): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Let the pending fetch promises and their state updates finish. */
async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
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

function submit(form: HTMLFormElement): void {
  act(() => form.requestSubmit());
}

function alertText(): string {
  return [...document.querySelectorAll('[role="alert"]')]
    .map((element) => element.textContent?.trim() ?? '')
    .join(' | ');
}

describe('the administration page', () => {
  it('lists the accounts the API returns, with their status, and enables the next page when there is one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.startsWith('/api/admin/users')) {
          return json({
            success: true,
            users: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                username: 'an.nguyen',
                displayName: 'Nguyễn Văn An',
                role: 'user',
                status: 'active',
                mustChangePassword: true,
                lastLoginAt: null,
                createdAt: '2026-10-01T00:00:00Z',
              },
            ],
            nextCursor: 'an.nguyen',
          });
        }
        return json({ success: true, entries: [], nextCursor: null });
      }),
    );
    const page = render(createElement(AdminConsole, { actorUsername: 'root.admin' }));
    await settle();

    expect(page.textContent).toContain('an.nguyen');
    expect(page.textContent).toContain('Nguyễn Văn An');
    expect(page.textContent).toContain('Đang hoạt động');
    expect(page.textContent).toContain('Phải đổi mật khẩu');
    expect(buttonNamed('Trang sau').disabled).toBe(false);
    expect(buttonNamed('Trang trước').disabled).toBe(true);
  });

  it('creates an account, posts the chosen fields, and shows the temporary password in the dialog', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          posted.push(JSON.parse(String(init.body)));
          return json(
            {
              success: true,
              user: {
                id: '22222222-2222-4222-8222-222222222222',
                username: 'lan.tran',
                displayName: 'Trần Thị Lan',
                role: 'user',
                status: 'active',
                mustChangePassword: true,
              },
              temporaryPassword: 'abcd-2345-kmnp-wxyz',
            },
            201,
          );
        }
        return json({ success: true, users: [], nextCursor: null });
      }),
    );
    render(createElement(AdminConsole, { actorUsername: 'root.admin' }));
    await settle();

    act(() => buttonNamed('Tạo người dùng').click());
    await settle();
    typeInto(fieldLabelled('Tên đăng nhập'), 'lan.tran');
    typeInto(fieldLabelled('Tên hiển thị'), 'Trần Thị Lan');
    const form = document.querySelector<HTMLFormElement>('[role="dialog"] form');
    if (!form) throw new Error('the create dialog has no form');
    submit(form);
    await settle();

    expect(posted).toEqual([{ username: 'lan.tran', displayName: 'Trần Thị Lan', role: 'user' }]);
    const shown = document.querySelector<HTMLInputElement>('[role="dialog"] input[readonly]');
    expect(shown?.value).toBe('abcd-2345-kmnp-wxyz');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('không thể xem lại');
  });
});

describe('the sign-in form', () => {
  it('shows the one generic message for a wrong password, and the wait for a locked name', async () => {
    let answer: () => Response = () =>
      json({ success: false, errorCode: 'INVALID_CREDENTIALS', error: 'x' }, 401);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer()),
    );
    render(createElement(LoginForm, { next: '/' }));

    typeInto(fieldLabelled('Tên đăng nhập'), 'an.nguyen');
    typeInto(fieldLabelled('Mật khẩu'), 'wrong password 1');
    submit(document.querySelector('form') as HTMLFormElement);
    await settle();
    expect(alertText()).toContain('Tên đăng nhập hoặc mật khẩu không đúng.');

    answer = () =>
      json({ success: false, errorCode: 'LOCKED', error: 'x' }, 429, { 'retry-after': '600' });
    submit(document.querySelector('form') as HTMLFormElement);
    await settle();
    expect(alertText()).toContain('Thử lại sau 10 phút.');
  });
});

describe('the password form', () => {
  it('refuses a mismatched confirmation without sending anything', async () => {
    const fetchMock = vi.fn(async () => json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(PasswordForm, { mustChange: true }));

    typeInto(fieldLabelled('Mật khẩu hiện tại'), 'temporary-one-2');
    typeInto(fieldLabelled('Mật khẩu mới'), 'a password of my own');
    typeInto(fieldLabelled('Nhập lại mật khẩu mới'), 'a different one here');
    submit(document.querySelector('form') as HTMLFormElement);
    await settle();

    expect(alertText()).toContain('Hai ô mật khẩu mới chưa khớp.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a new password shorter than ten characters, before the server is asked', async () => {
    const fetchMock = vi.fn(async () => json({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(createElement(PasswordForm, { mustChange: false }));

    typeInto(fieldLabelled('Mật khẩu hiện tại'), 'temporary-one-2');
    typeInto(fieldLabelled('Mật khẩu mới'), 'short');
    typeInto(fieldLabelled('Nhập lại mật khẩu mới'), 'short');
    submit(document.querySelector('form') as HTMLFormElement);
    await settle();

    expect(alertText()).toContain('Mật khẩu phải từ 10 đến 200 ký tự.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
