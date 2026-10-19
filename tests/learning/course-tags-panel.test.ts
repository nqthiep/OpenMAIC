// @vitest-environment jsdom

/**
 * Staff tag a course from the shares panel: one subject, up to two grades, up to three topics of
 * that subject. What cannot be chosen any more is disabled, and the saved list is in the
 * taxonomy's order.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shares: vi.fn(),
  setTags: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ locale: 'en-US', t: mocks.t }),
}));
vi.mock('@/components/learning/learning-api', () => ({
  fetchShares: mocks.shares,
  setCourseTags: mocks.setTags,
  decideShare: vi.fn(),
  revokeShare: vi.fn(),
  LearningRequestError: class extends Error {},
}));

import { SharesPanel } from '@/components/learning/admin-panels';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SHARE = {
  courseId: 'c1',
  ownerId: 'acct:o',
  title: 'Fractions',
  state: 'pending',
  requestedAt: '2026-10-18T00:00:00.000Z',
  tags: [] as string[],
};

async function render(): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(SharesPanel));
  });
  await act(async () => {});
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const buttonIn = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
const press = (text: string) => act(async () => buttonIn(dialog(), text)!.click());

beforeEach(() => {
  mocks.shares.mockImplementation(async (state: string) => (state === 'pending' ? [SHARE] : []));
  mocks.setTags.mockResolvedValue({});
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('tagging a course in the shares panel', () => {
  it('offers topics only after a subject, limits grades and topics, and saves in taxonomy order', async () => {
    await render();
    await act(async () => buttonIn(document.body, 'admin.tags.add')!.click());
    expect(dialog()).not.toBeNull();

    // No topic chips yet: the form asks for a subject first.
    expect(dialog().textContent).toContain('admin.tags.pickSubject');
    expect(buttonIn(dialog(), 'Limits')).toBeUndefined();

    await press('taxonomy.subject.math');
    expect(dialog().textContent).not.toContain('admin.tags.pickSubject');
    for (const topic of [
      'Limits',
      'Derivatives and function study',
      'Exponentials and logarithms',
    ]) {
      await press(topic);
    }
    // Three topics are chosen: the others are disabled, the chosen ones are not.
    expect(buttonIn(dialog(), 'Trigonometry')!.disabled).toBe(true);
    expect(buttonIn(dialog(), 'Limits')!.disabled).toBe(false);

    for (const grade of ['taxonomy.grade.12', 'taxonomy.grade.10']) await press(grade);
    expect(buttonIn(dialog(), 'taxonomy.grade.11')!.disabled).toBe(true);

    await act(async () => buttonIn(dialog(), 'admin.table.save')!.click());
    expect(mocks.setTags).toHaveBeenCalledWith('c1', [
      'subject:math',
      'grade:10',
      'grade:12',
      'topic:math.limits',
      'topic:math.derivative',
      'topic:math.exp_log',
    ]);
  });

  it('opens with a suggestion from the title when the course has no tags, and saves only on Save', async () => {
    mocks.shares.mockImplementation(async (state: string) =>
      state === 'pending'
        ? [{ ...SHARE, title: 'Đạo hàm cơ bản lớp 12', tags: [], snapshot: { sceneTitles: [] } }]
        : [],
    );
    await render();
    await act(async () => buttonIn(document.body, 'admin.tags.add')!.click());

    expect(dialog().textContent).toContain('admin.tags.suggested');
    expect(buttonIn(dialog(), 'taxonomy.subject.math')!.getAttribute('aria-pressed')).toBe('true');
    expect(buttonIn(dialog(), 'taxonomy.grade.12')!.getAttribute('aria-pressed')).toBe('true');
    expect(buttonIn(dialog(), 'Derivatives and function study')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(mocks.setTags).not.toHaveBeenCalled();

    await act(async () => buttonIn(dialog(), 'admin.table.save')!.click());
    expect(mocks.setTags).toHaveBeenCalledWith('c1', [
      'subject:math',
      'grade:12',
      'topic:math.derivative',
    ]);
  });

  it('does not suggest over tags the course already has', async () => {
    mocks.shares.mockImplementation(async (state: string) =>
      state === 'pending' ? [{ ...SHARE, title: 'Đạo hàm cơ bản', tags: ['subject:english'] }] : [],
    );
    await render();
    await act(async () => buttonIn(document.body, 'admin.tags.edit')!.click());
    expect(dialog().textContent).not.toContain('admin.tags.suggested');
    expect(buttonIn(dialog(), 'taxonomy.subject.english')!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(buttonIn(dialog(), 'taxonomy.subject.math')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('drops the topics of the old subject when another subject is picked', async () => {
    mocks.shares.mockImplementation(async (state: string) =>
      state === 'pending'
        ? [{ ...SHARE, tags: ['subject:math', 'topic:math.limits'], title: 'Limits course' }]
        : [],
    );
    await render();
    await act(async () => buttonIn(document.body, 'admin.tags.edit')!.click());
    expect(buttonIn(dialog(), 'Limits')!.getAttribute('aria-pressed')).toBe('true');

    await press('taxonomy.subject.physics');
    await act(async () => buttonIn(dialog(), 'admin.table.save')!.click());
    expect(mocks.setTags).toHaveBeenCalledWith('c1', ['subject:physics']);
  });
});
