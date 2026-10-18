// @vitest-environment jsdom

/**
 * The composer's lock for a learner without a membership: the way to ask, and what is said after
 * the question is sent, after a rejection, and when an administrator paused the membership.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MembershipNoticeKind } from '@/lib/home/learner-status';

const mocks = vi.hoisted(() => ({
  capabilities: undefined as { requestAccess: boolean } | undefined,
  fetch: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/capabilities/use-capabilities', () => ({
  useCapabilities: () => mocks.capabilities,
  // The "contact the admin" button stays hidden: no signed-in session here.
  useAccountSession: () => undefined,
}));
vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    // Only this code has a translation, so a code without one falls back to the generic message.
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'learning.errors.REQUEST_PENDING'
        ? 'Already waiting'
        : params
          ? `${key} ${JSON.stringify(params)}`
          : key,
  }),
}));
vi.mock('@/components/learning/learning-api', () => ({
  fetchAccessRequest: mocks.fetch,
  sendAccessRequest: mocks.send,
  LearningRequestError: class extends Error {
    constructor(
      readonly status: number,
      readonly errorCode?: string,
    ) {
      super('failed');
    }
  },
}));

import { AccessRequest } from '@/components/home/access-request';
import { LearningRequestError } from '@/components/learning/learning-api';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function render(kind: MembershipNoticeKind): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(AccessRequest, { kind }));
  });
  return container;
}

const PENDING = {
  state: 'pending' as const,
  note: null,
  requestedAt: '2026-10-17T00:00:00.000Z',
  decidedAt: null,
};

beforeEach(() => {
  mocks.capabilities = { requestAccess: true };
  mocks.fetch.mockResolvedValue({ request: null, retryAt: null });
  mocks.send.mockResolvedValue({ request: PENDING });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('AccessRequest', () => {
  it('offers the question, with the renewal wording for an expired membership', async () => {
    const fresh = await render('none');
    expect(fresh.textContent).toContain('home.access.prompt');
    expect(fresh.textContent).toContain('home.access.button');
    expect(fresh.textContent).not.toContain('home.access.promptRenew');

    const expired = await render('expired');
    expect(expired.textContent).toContain('home.access.promptRenew');
    expect(expired.textContent).toContain('home.access.renewButton');
  });

  it('sends the trimmed note and then says that the request is waiting', async () => {
    const container = await render('none');
    const textarea = container.querySelector('textarea')!;
    expect(textarea.maxLength).toBe(280);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, '  I am in class 10A  ');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('button')!.click();
    });
    expect(mocks.send).toHaveBeenCalledWith('I am in class 10A');
    expect(container.textContent).toContain('home.access.pending');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows the translated message of a refusal and stays open to try again', async () => {
    mocks.send.mockRejectedValue(new LearningRequestError(409, 'REQUEST_PENDING'));
    const container = await render('none');
    await act(async () => {
      container.querySelector('button')!.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Already waiting');
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('falls back to the generic message for a code with no translation', async () => {
    mocks.send.mockRejectedValue(new LearningRequestError(500, 'SOMETHING_ELSE'));
    const container = await render('none');
    await act(async () => {
      container.querySelector('button')!.click();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('learning.errors.generic');
  });

  it('says a request is already waiting, without a button', async () => {
    mocks.fetch.mockResolvedValue({ request: PENDING, retryAt: null });
    const container = await render('none');
    expect(container.textContent).toContain('home.access.pending');
    expect(container.querySelector('button')).toBeNull();
  });

  it('says when a rejected learner may ask again, and offers the question once that time has passed', async () => {
    const rejected = {
      state: 'rejected' as const,
      note: null,
      requestedAt: '2026-10-10T00:00:00.000Z',
      decidedAt: '2026-10-10T10:00:00.000Z',
    };
    mocks.fetch.mockResolvedValue({ request: rejected, retryAt: '2999-01-01T00:00:00.000Z' });
    const waiting = await render('none');
    expect(waiting.textContent).toContain('home.access.rejected');
    expect(waiting.querySelector('button')).toBeNull();

    mocks.fetch.mockResolvedValue({ request: rejected, retryAt: '2000-01-01T00:00:00.000Z' });
    const ready = await render('none');
    expect(ready.querySelector('button')).not.toBeNull();
  });

  it('gives a paused membership no button and does not read the request', async () => {
    const container = await render('suspended');
    expect(container.textContent).toContain('home.access.suspended');
    expect(container.querySelector('button')).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('gives only the plain lock when the capability is missing', async () => {
    mocks.capabilities = { requestAccess: false };
    const container = await render('none');
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toContain('home.locked.contactAdmin');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
