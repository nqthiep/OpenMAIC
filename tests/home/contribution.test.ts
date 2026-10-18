// @vitest-environment jsdom

/** The "My contribution" block: hidden when empty, otherwise the figures, the badges and the next badge. */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contribution } from '@/components/learning/learning-api';

const mocks = vi.hoisted(() => ({
  session: undefined as { authenticated: boolean } | null | undefined,
  fetch: vi.fn(),
  // Only the readers-10 badge has a label here, so readers-100 shows its code.
  t: (key: string, params?: Record<string, unknown>) =>
    key === 'home.contribution.badge.readers-10'
      ? 'Ten readers'
      : params
        ? `${key} ${JSON.stringify(params)}`
        : key,
}));

vi.mock('@/lib/capabilities/use-capabilities', () => ({ useAccountSession: () => mocks.session }));
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ locale: 'en-US', t: mocks.t }) }));
vi.mock('@/components/learning/learning-api', () => ({ fetchContribution: mocks.fetch }));

import { ContributionBlock } from '@/components/home/contribution';

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
    root.render(createElement(ContributionBlock));
  });
  return container;
}

const EMPTY: Contribution = {
  shares: [],
  readers: 0,
  bonus: { month: '2026-10', tokens: 0, cap: 200_000 },
  badges: [],
  next: { code: 'readers-10', readersNeeded: 10 },
};

beforeEach(() => {
  mocks.session = { authenticated: true };
  mocks.fetch.mockResolvedValue(EMPTY);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ContributionBlock', () => {
  it('renders nothing for a learner who shared nothing and earned nothing', async () => {
    const container = await render();
    expect(container.innerHTML).toBe('');
  });

  it('does not read anything for a visitor who is not signed in', async () => {
    mocks.session = { authenticated: false };
    const container = await render();
    expect(container.innerHTML).toBe('');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('renders nothing when the figures cannot be read', async () => {
    mocks.fetch.mockRejectedValue(new Error('down'));
    const container = await render();
    expect(container.innerHTML).toBe('');
  });

  it('shows the counts, the reward, the badge and how far the next one is', async () => {
    mocks.fetch.mockResolvedValue({
      shares: [
        { courseId: 'c1', title: 'Binary search', state: 'shared', readers: 11 },
        { courseId: 'c2', title: 'Fractions', state: 'pending', readers: 0 },
      ],
      readers: 11,
      bonus: { month: '2026-10', tokens: 220_000, cap: 200_000 },
      badges: ['readers-10'],
      next: { code: 'readers-100', readersNeeded: 89 },
    } satisfies Contribution);
    const container = await render();
    const text = container.textContent ?? '';
    expect(text).toContain('Binary search');
    expect(text).toContain('Fractions');
    expect(text).toContain('Ten readers');
    expect(text).toContain('"tokens":"220,000","cap":"200,000"');
    // The pending course shows its state instead of a reader count.
    expect(text).toContain('home.contribution.pending');
    // The next badge has no label here, so its code stands in.
    expect(text).toContain('"count":"89","badge":"readers-100"');
  });

  it('shows only the first five shared courses', async () => {
    mocks.fetch.mockResolvedValue({
      ...EMPTY,
      shares: Array.from({ length: 7 }, (_, i) => ({
        courseId: `c${i}`,
        title: `Course ${i}`,
        state: 'shared' as const,
        readers: i,
      })),
    });
    const container = await render();
    expect(container.querySelectorAll('ul > li')).toHaveLength(5);
  });
});
