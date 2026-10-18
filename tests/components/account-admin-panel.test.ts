// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountAdminPanel } from '@/components/settings/account-admin-panel';

const sonner = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('sonner', () => sonner);

vi.mock('@/lib/persistence/bootstrap', () => ({ isBrowserPersistenceEnabled: () => true }));

// Resolves keys against the English catalogue, so a missing key renders as its own name.
vi.mock('@/lib/hooks/use-i18n', async () => {
  const { default: en } = await import('@/lib/i18n/locales/en-US.json');
  const t = (key: string, options: Record<string, unknown> = {}) => {
    const template = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
    if (typeof template !== 'string') return key;
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name]));
  };
  return { useI18n: () => ({ t, locale: 'en-US' }) };
});

const ROOT = {
  id: 'id-root',
  username: 'root',
  role: 'admin',
  createdAt: '2026-01-05T09:00:00.000Z',
  disabledAt: null,
};
const ALICE = {
  id: 'id-alice',
  username: 'alice',
  role: 'learner',
  createdAt: '2026-02-10T09:00:00.000Z',
  disabledAt: null,
};
const BOB = {
  id: 'id-bob',
  username: 'bob',
  role: 'operator',
  createdAt: '2026-03-01T09:00:00.000Z',
  disabledAt: '2026-03-02T09:00:00.000Z',
};

const SIGNED_IN_AS_ROOT = {
  success: true,
  enabled: true,
  registrationOpen: false,
  authenticated: true,
  account: { username: 'root' },
  role: 'admin',
  administrator: true,
};
const SIGNED_IN_AS_BOB = {
  ...SIGNED_IN_AS_ROOT,
  account: { username: 'bob' },
  role: 'learner',
  administrator: false,
};
const ANONYMOUS = { success: true, enabled: true, registrationOpen: false, authenticated: false };
const LIST = { success: true, accounts: [ROOT, ALICE, BOB], nextAfter: null };

interface Reply {
  readonly status: number;
  readonly body: unknown;
}

let container: HTMLDivElement;
let root: Root;
let requests: { key: string; body: string | undefined }[] = [];

/** Answers each `METHOD /path` from the table. An unlisted request fails the test. */
function stubFetch(routes: Record<string, Reply>) {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url}`;
      requests.push({ key, body: typeof init?.body === 'string' ? init.body : undefined });
      const reply = routes[key];
      if (!reply) throw new Error(`Unexpected request: ${key}`);
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

const requestKeys = () => requests.map((request) => request.key);
const sentChange = () => requestKeys().some((key) => key.startsWith('POST'));

async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPanel() {
  await act(async () => root.render(createElement(AccountAdminPanel)));
  await settle();
}

async function click(element: HTMLElement | null | undefined) {
  await act(async () => element?.click());
  await settle();
}

function button(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="alertdialog"]');
}

function dialogButton(text: string): HTMLButtonElement | undefined {
  return Array.from(dialog()?.querySelectorAll('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AccountAdminPanel', () => {
  it('an operator sees a disable control on learners but none on an administrator, and no role select', async () => {
    stubFetch({
      'GET /api/auth/session': { status: 200, body: { ...SIGNED_IN_AS_BOB, role: 'operator' } },
      'GET /api/admin/accounts': { status: 200, body: LIST },
    });
    await renderPanel();

    // The table has filter selects of its own; no row has a role select.
    expect(container.querySelector('tbody select')).toBeNull();
    expect(container.querySelector('[aria-label="Disable alice"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Disable root"]')).toBeNull();
  });

  it('lists accounts for an administrator and offers no change on the signed-in account', async () => {
    stubFetch({
      'GET /api/auth/session': { status: 200, body: SIGNED_IN_AS_ROOT },
      'GET /api/admin/accounts': { status: 200, body: LIST },
    });
    await renderPanel();

    const created = new Date(ALICE.createdAt).toLocaleDateString('en-US');
    expect(container.textContent).toContain('Accounts');
    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain(created);
    expect(container.textContent).toContain('Disabled');
    expect(container.textContent).toContain('You');
    expect(button('Disable alice')).not.toBeNull();
    expect(button('Enable bob')).not.toBeNull();
    expect(button('Disable root')).toBeNull();
    expect(requestKeys()).toEqual(['GET /api/auth/session', 'GET /api/admin/accounts']);
  });

  it('asks for confirmation before disabling, and sends the request only once confirmed', async () => {
    stubFetch({
      'GET /api/auth/session': { status: 200, body: SIGNED_IN_AS_ROOT },
      'GET /api/admin/accounts': { status: 200, body: LIST },
      'POST /api/admin/accounts/id-alice/disable': {
        status: 200,
        body: { success: true, id: 'id-alice', disabled: true },
      },
    });
    await renderPanel();

    await click(button('Disable alice'));
    expect(dialog()?.textContent).toContain('Disable alice?');
    expect(sentChange()).toBe(false);

    // Escape cancels, and focus returns to the control that opened the dialog.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button('Disable alice'));
    expect(sentChange()).toBe(false);

    await click(button('Disable alice'));
    await click(dialogButton('Disable account'));

    expect(requests[requests.length - 1]).toEqual({
      key: 'POST /api/admin/accounts/id-alice/disable',
      body: '{}',
    });
    expect(button('Enable alice')).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('asks for confirmation before changing a role, and sends nothing when cancelled', async () => {
    stubFetch({
      'GET /api/auth/session': { status: 200, body: SIGNED_IN_AS_ROOT },
      'GET /api/admin/accounts': { status: 200, body: LIST },
      'POST /api/admin/accounts/id-alice/role': { status: 200, body: { success: true } },
    });
    await renderPanel();
    const select = () =>
      container.querySelector<HTMLSelectElement>('select[aria-label="Change role of alice"]')!;
    const pick = async (role: string) => {
      await act(async () => {
        select().value = role;
        select().dispatchEvent(new Event('change', { bubbles: true }));
      });
      await settle();
    };

    await pick('operator');
    expect(dialog()?.textContent).toContain('Make alice Operator?');
    expect(sentChange()).toBe(false);
    await click(dialogButton('Cancel'));
    expect(dialog()).toBeNull();
    expect(sentChange()).toBe(false);
    expect(select().value).toBe('learner');

    await pick('operator');
    await click(dialogButton('Change role'));
    expect(requests[requests.length - 1]).toEqual({
      key: 'POST /api/admin/accounts/id-alice/role',
      body: '{"role":"operator"}',
    });
    expect(select().value).toBe('operator');
  });

  it('asks for confirmation before enabling a disabled account', async () => {
    stubFetch({
      'GET /api/auth/session': { status: 200, body: SIGNED_IN_AS_ROOT },
      'GET /api/admin/accounts': { status: 200, body: LIST },
      'POST /api/admin/accounts/id-bob/enable': {
        status: 200,
        body: { success: true, id: 'id-bob', disabled: false },
      },
    });
    await renderPanel();

    await click(button('Enable bob'));
    expect(dialog()?.textContent).toContain('Enable bob?');
    expect(sentChange()).toBe(false);

    await click(dialogButton('Enable account'));
    expect(requests[requests.length - 1]?.key).toBe('POST /api/admin/accounts/id-bob/enable');
    expect(button('Disable bob')).not.toBeNull();
  });

  it('shows a failed change as an error toast and leaves the account as it was', async () => {
    stubFetch({
      'GET /api/auth/session': { status: 200, body: SIGNED_IN_AS_ROOT },
      'GET /api/admin/accounts': { status: 200, body: LIST },
      'POST /api/admin/accounts/id-alice/disable': {
        status: 500,
        body: { success: false, errorCode: 'INTERNAL_ERROR', error: 'Internal server error' },
      },
    });
    await renderPanel();

    await click(button('Disable alice'));
    await click(dialogButton('Disable account'));

    expect(sonner.toast.error).toHaveBeenCalledWith('The account could not be updated. Try again.');
    expect(button('Disable alice')).not.toBeNull();
    expect(dialog()).toBeNull();
  });

  it('renders nothing when the admin list refuses a signed-in visitor', async () => {
    // The session claims administrator here, so the list is asked and refuses (a stale flag).
    stubFetch({
      'GET /api/auth/session': { status: 200, body: { ...SIGNED_IN_AS_BOB, administrator: true } },
      'GET /api/admin/accounts': {
        status: 403,
        body: { success: false, errorCode: 'ADMIN_ONLY', error: 'Administrators only.' },
      },
    });
    await renderPanel();

    expect(container.innerHTML).toBe('');
    expect(sonner.toast.error).not.toHaveBeenCalled();
  });

  it('makes no admin request for a signed-in account that is not an administrator', async () => {
    stubFetch({ 'GET /api/auth/session': { status: 200, body: SIGNED_IN_AS_BOB } });
    await renderPanel();

    expect(container.innerHTML).toBe('');
    expect(requestKeys()).toEqual(['GET /api/auth/session']);
  });

  it('makes no admin request for an anonymous visitor', async () => {
    stubFetch({ 'GET /api/auth/session': { status: 200, body: ANONYMOUS } });
    await renderPanel();

    expect(container.innerHTML).toBe('');
    expect(requestKeys()).toEqual(['GET /api/auth/session']);
  });
});
