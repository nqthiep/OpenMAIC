// @vitest-environment jsdom

/**
 * The operator's class list: courses are attached from a dialog that lists every course by title,
 * not by pasting an ID, and a private learner course shows why it cannot be attached.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  classes: vi.fn(),
  courses: vi.fn(),
  attach: vi.fn(),
  detach: vi.fn(),
  members: vi.fn(),
  progress: vi.fn(),
  accounts: vi.fn(),
  addMember: vi.fn(),
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
  fetchClasses: mocks.classes,
  fetchCourses: mocks.courses,
  attachCourse: mocks.attach,
  detachCourse: mocks.detach,
  fetchClassMembers: mocks.members,
  fetchClassProgress: mocks.progress,
  fetchAllMembers: mocks.accounts,
  addClassMember: mocks.addMember,
  LearningRequestError: class extends Error {},
}));

import { ClassesPanel } from '@/components/learning/admin-panels';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CLASS = { id: 'class-1', name: 'Grade 6', memberCount: 2, courseIds: [] as string[] };
const SHARED = {
  courseId: 'c-shared',
  title: 'Fractions',
  owner: 'alice',
  updatedAt: null,
  attachable: true,
};
const PRIVATE = {
  courseId: 'c-private',
  title: 'Draft notes',
  owner: 'bob',
  updatedAt: null,
  attachable: false,
};

async function render(): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ClassesPanel));
  });
  await act(async () => {});
}

const buttonByText = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const rowOf = (title: string) =>
  [...(dialog()?.querySelectorAll('li') ?? [])].find((li) => li.textContent?.includes(title))!;

beforeEach(() => {
  mocks.classes.mockResolvedValue([CLASS]);
  mocks.courses.mockResolvedValue([PRIVATE, SHARED]);
  mocks.attach.mockResolvedValue({});
  mocks.members.mockResolvedValue([
    { accountId: 'id-alice', username: 'alice', joinedAt: '2026-10-18T00:00:00.000Z' },
  ]);
  mocks.accounts.mockResolvedValue([
    { id: 'id-alice', username: 'alice', membership: { active: true } },
    { id: 'id-bob', username: 'bob', membership: { active: true } },
    { id: 'id-carol', username: 'carol', membership: null },
  ]);
  mocks.addMember.mockResolvedValue({});
  mocks.progress.mockResolvedValue([]);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('ClassesPanel', () => {
  it('attaches a course picked by title from the dialog, and marks a private one', async () => {
    await render();
    await act(async () => buttonByText('admin.classes.manageCourses')!.click());

    expect(dialog()).not.toBeNull();
    // An attachable course comes before a private one, and only it has an Attach button.
    const items = [...dialog()!.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Fractions');
    expect(rowOf('Draft notes').textContent).toContain('admin.classes.coursesDialog.private');
    expect(rowOf('Draft notes').querySelector('button')).toBeNull();

    await act(async () =>
      [...rowOf('Fractions').querySelectorAll('button')]
        .find((b) => b.textContent === 'admin.classes.coursesDialog.attach')!
        .click(),
    );
    expect(mocks.attach).toHaveBeenCalledWith('class-1', 'c-shared');
  });

  it('filters the list by title or creator', async () => {
    await render();
    await act(async () => buttonByText('admin.classes.manageCourses')!.click());
    const search = dialog()!.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(search, 'bob');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const items = [...dialog()!.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(items).toHaveLength(1);
    expect(items[0]).toContain('Draft notes');
  });

  it('adds a learner from the members dialog, offering only accounts not in the class', async () => {
    await render();
    const open = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('admin.classes.manageMembers'),
    )!;
    await act(async () => open.click());
    await act(async () => {});

    const section = [...dialog()!.querySelectorAll('section')].pop()!;
    const names = [...section.querySelectorAll('li')].map((li) => li.textContent ?? '');
    expect(names.some((n) => n.includes('alice'))).toBe(false);
    expect(names.find((n) => n.includes('carol'))).toContain(
      'admin.classes.addMember.noMembership',
    );

    const bobRow = [...section.querySelectorAll('li')].find((li) =>
      li.textContent?.includes('bob'),
    )!;
    await act(async () => bobRow.querySelector('button')!.click());
    expect(mocks.addMember).toHaveBeenCalledWith('class-1', 'id-bob');
  });

  it('shows each member how far they got in the class courses, and who has not started', async () => {
    mocks.classes.mockResolvedValue([{ ...CLASS, courseIds: ['c-shared', 'c-other'] }]);
    mocks.members.mockResolvedValue([
      { accountId: 'id-alice', username: 'alice', joinedAt: '2026-10-18T00:00:00.000Z' },
      { accountId: 'id-bob', username: 'bob', joinedAt: '2026-10-18T00:00:00.000Z' },
    ]);
    mocks.progress.mockResolvedValue([
      {
        accountId: 'id-alice',
        courseId: 'c-shared',
        sceneId: 's3',
        sceneIndex: 3,
        sceneCount: 3,
        quizScore: 90,
        doneAt: '2026-10-18T08:00:00.000Z',
        updatedAt: '2026-10-18T08:00:00.000Z',
      },
    ]);
    await render();
    const open = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('admin.classes.manageMembers'),
    )!;
    await act(async () => open.click());
    await act(async () => {});

    const memberRows = [...dialog()!.querySelectorAll('ul')][0]!.querySelectorAll('li');
    expect(mocks.progress).toHaveBeenCalledWith('class-1');
    expect(memberRows[0]!.textContent).toContain(
      'admin.classes.progress.summary {"done":1,"total":2}',
    );
    expect(memberRows[1]!.textContent).toContain('admin.classes.progress.none');
  });
});
