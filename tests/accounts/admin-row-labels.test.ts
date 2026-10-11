// @vitest-environment jsdom
/**
 * Each row action in the administration table names the account it acts on, so
 * a screen reader does not hear the same "Sửa" or "Xoá" for every row. The usage
 * tab is named for what it shows: request and token counts, no money.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminConsole } from '@/components/accounts/admin-console';

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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

const account = (
  id: string,
  username: string,
  displayName: string,
  status: 'active' | 'disabled',
) => ({
  id,
  username,
  displayName,
  role: 'user',
  status,
  mustChangePassword: false,
  lastLoginAt: null,
  createdAt: '2026-10-01T00:00:00Z',
});

function stubUsers(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) =>
      input.startsWith('/api/admin/users')
        ? json({
            success: true,
            users: [
              account(
                '11111111-1111-4111-8111-111111111111',
                'an.nguyen',
                'Nguyễn Văn An',
                'active',
              ),
              account('22222222-2222-4222-8222-222222222222', 'bo.tran', 'Trần Bảo', 'disabled'),
            ],
            nextCursor: null,
          })
        : json({ success: true, entries: [], nextCursor: null }),
    ),
  );
}

describe('the administration table', () => {
  it('names every row action with the account it acts on', async () => {
    stubUsers();
    const page = render(createElement(AdminConsole, { actorUsername: 'root.admin' }));
    await settle();

    const named = (action: string, username: string) =>
      page.querySelector(`button[aria-label="${action} người dùng ${username}"]`);
    expect(named('Sửa', 'an.nguyen')).not.toBeNull();
    expect(named('Vô hiệu hoá', 'an.nguyen')).not.toBeNull();
    expect(named('Đặt lại mật khẩu', 'an.nguyen')).not.toBeNull();
    expect(named('Xoá', 'an.nguyen')).not.toBeNull();
    expect(named('Kích hoạt lại', 'bo.tran')).not.toBeNull();
    expect(named('Sửa', 'bo.tran')).not.toBeNull();
  });

  it('darkens the tinted delete button text so it keeps 4.5:1', async () => {
    stubUsers();
    const page = render(createElement(AdminConsole, { actorUsername: 'root.admin' }));
    await settle();

    const remove = page.querySelector('button[aria-label="Xoá người dùng an.nguyen"]');
    expect(remove?.className.split(/\s+/)).toContain('text-red-800');
  });

  it('names the usage tab "Sử dụng", not "Chi phí"', async () => {
    stubUsers();
    render(createElement(AdminConsole, { actorUsername: 'root.admin' }));
    await settle();

    const tabs = [...document.querySelectorAll('[role="tab"]')].map((tab) =>
      tab.textContent?.trim(),
    );
    expect(tabs).toContain('Sử dụng');
    expect(tabs).not.toContain('Chi phí');
  });
});
