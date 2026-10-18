// @vitest-environment jsdom

/** The operator's queue: each row can be approved or rejected with an optional reason, and the list reloads after. */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  decide: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  // One function for every render, like the real `t`.
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ locale: 'en-US', t: mocks.t }),
}));
vi.mock('@/components/learning/learning-api', () => ({
  fetchAccessRequests: mocks.list,
  decideAccessRequest: mocks.decide,
  LearningRequestError: class extends Error {
    constructor(
      readonly status: number,
      readonly errorCode?: string,
    ) {
      super('failed');
    }
  },
}));

import { AccessRequestsPanel } from '@/components/learning/admin-panels';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function render(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AccessRequestsPanel));
  });
  return container;
}

const ROW = {
  accountId: '0f0f0f0f-1111-4222-8333-444444444444',
  username: 'alice',
  note: 'I am in class 10A',
  requestedAt: '2026-10-17T00:00:00.000Z',
  membership: 'expired' as const,
};

const button = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === label)!;

beforeEach(() => {
  mocks.list.mockResolvedValue([ROW]);
  mocks.decide.mockResolvedValue({});
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('AccessRequestsPanel', () => {
  it('reads the queue once, not again after every render', async () => {
    await render();
    await act(async () => {});
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it('shows who asked, their note and their membership state', async () => {
    const container = await render();
    expect(container.textContent).toContain('alice');
    expect(container.textContent).toContain('“I am in class 10A”');
    expect(container.textContent).toContain('membership.status.expired');
  });

  it('says so when nothing is waiting', async () => {
    mocks.list.mockResolvedValue([]);
    const container = await render();
    expect(container.textContent).toContain('admin.accessRequests.empty');
    expect(container.querySelector('tbody input')).toBeNull();
  });

  it('approves with the trimmed reason, announces it and reloads the queue', async () => {
    const container = await render();
    // The reason field is in the row; the first input on the panel is the table search.
    const input = container.querySelector<HTMLInputElement>('tbody input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '  known student  ',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    mocks.list.mockResolvedValue([]);
    await act(async () => {
      button(container, 'admin.accessRequests.approve').click();
    });
    expect(mocks.decide).toHaveBeenCalledWith(ROW.accountId, 'approve', 'known student');
    expect(mocks.success).toHaveBeenCalled();
    expect(container.querySelector('tbody input')).toBeNull();
  });

  it('rejects with no reason when the field is empty', async () => {
    const container = await render();
    await act(async () => {
      button(container, 'admin.accessRequests.reject').click();
    });
    expect(mocks.decide).toHaveBeenCalledWith(ROW.accountId, 'reject', undefined);
  });

  it('shows the failure and reloads when the decision is refused', async () => {
    mocks.decide.mockRejectedValue(new Error('boom'));
    const container = await render();
    await act(async () => {
      button(container, 'admin.accessRequests.approve').click();
    });
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });
});
