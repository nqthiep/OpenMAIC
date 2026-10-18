// @vitest-environment jsdom

/**
 * Progress on the server shows where the learner reads a course they did not write: a row of
 * "Lớp của tôi" and the "Tiếp tục học" card, on any device.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  myClasses: vi.fn(),
  catalog: vi.fn(),
  progress: vi.fn(),
  leave: vi.fn(),
  position: vi.fn(),
  access: vi.fn(),
  session: vi.fn(),
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ locale: 'en-US', t: mocks.t }) }));
vi.mock('@/components/learning/learning-api', () => ({
  fetchMyClasses: mocks.myClasses,
  fetchCatalog: mocks.catalog,
  fetchProgress: mocks.progress,
  leaveClass: mocks.leave,
}));
vi.mock('@/lib/capabilities/use-capabilities', () => ({ useAccountSession: mocks.session }));
vi.mock('@/lib/document-store', () => ({
  loadCurrentScene: mocks.position,
  accessDocument: mocks.access,
}));
vi.mock('@/components/slide-renderer/SlideThumbnail', () => ({ SlideThumbnail: () => null }));

import { ContinueCard } from '@/components/home/continue-card';
import { MyClasses } from '@/components/home/my-classes';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  await act(async () => {});
  return container;
}

const row = (courseId: string, extra: Record<string, unknown> = {}) => ({
  courseId,
  sceneId: `${courseId}-s`,
  sceneIndex: 2,
  sceneCount: 5,
  quizScore: null,
  doneAt: null,
  updatedAt: '2026-10-18T10:00:00.000Z',
  ...extra,
});

beforeEach(() => {
  mocks.session.mockReturnValue({ authenticated: true });
  mocks.position.mockResolvedValue(null);
  mocks.access.mockResolvedValue({ document: null });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('MyClasses with progress', () => {
  it('shows the scene the learner is on, the quiz score and a done mark per course', async () => {
    mocks.myClasses.mockResolvedValue([
      { id: 'k1', name: 'Grade 6', memberCount: 3, courseIds: ['a', 'b', 'c'] },
    ]);
    mocks.catalog.mockResolvedValue({
      member: true,
      courses: [
        { courseId: 'a', title: 'Course A', kind: 'class', sceneCount: 8 },
        { courseId: 'b', title: 'Course B', kind: 'class' },
        { courseId: 'c', title: 'Course C', kind: 'class' },
      ],
    });
    mocks.progress.mockResolvedValue([
      row('a'),
      row('b', { sceneIndex: 5, quizScore: 70, doneAt: '2026-10-18T09:00:00.000Z' }),
    ]);

    const page = await render(createElement(MyClasses));

    expect(mocks.progress).toHaveBeenCalledWith(['a', 'b', 'c']);
    const [a, b, c] = [...page.querySelectorAll('ol > li')].map((li) => li.textContent ?? '');
    // The catalog's scene count wins over the one the row saw.
    expect(a).toContain('home.continue.progress {"current":2,"total":8}');
    expect(b).toContain('courseProgress.done');
    expect(b).toContain('courseProgress.quizScore {"score":70}');
    expect(c).not.toContain('home.continue.progress');
    expect(page.textContent).toContain('home.myClasses.progressVisible');
  });

  it('still lists the courses when the progress cannot be read', async () => {
    mocks.myClasses.mockResolvedValue([
      { id: 'k1', name: 'Grade 6', memberCount: 3, courseIds: ['a'] },
    ]);
    mocks.catalog.mockResolvedValue({
      member: true,
      courses: [{ courseId: 'a', title: 'Course A', kind: 'class' }],
    });
    mocks.progress.mockRejectedValue(new Error('offline'));

    const page = await render(createElement(MyClasses));

    expect(page.textContent).toContain('Course A');
  });
});

describe('ContinueCard with progress on the server', () => {
  const catalog = {
    member: true,
    courses: [{ courseId: 'shared-1', title: 'Shared fractions', kind: 'shared', sceneCount: 6 }],
  };

  it('offers a class or shared course on a device that has no copy of it', async () => {
    mocks.progress.mockResolvedValue([row('shared-1', { sceneIndex: 4 })]);
    mocks.catalog.mockResolvedValue(catalog);

    const page = await render(createElement(ContinueCard, { classrooms: [], thumbnails: {} }));

    expect(page.querySelector('a')?.getAttribute('href')).toBe('/classroom/shared-1');
    expect(page.textContent).toContain('Shared fractions');
    expect(page.textContent).toContain('home.continue.progress {"current":4,"total":6}');
  });

  it('keeps the own course when it was studied after the server course', async () => {
    mocks.progress.mockResolvedValue([row('shared-1', { updatedAt: '2026-10-18T10:00:00.000Z' })]);
    mocks.catalog.mockResolvedValue(catalog);
    mocks.position.mockResolvedValue({ sceneId: 's1', updatedAt: '2026-10-18T11:00:00.000Z' });
    const own = { id: 'own-1', name: 'My course', sceneCount: 3, updatedAt: 1 };

    const page = await render(
      createElement(ContinueCard, { classrooms: [own] as never, thumbnails: {} }),
    );

    expect(page.querySelector('a')?.getAttribute('href')).toBe('/classroom/own-1');
  });

  it('asks the server nothing of a guest', async () => {
    mocks.session.mockReturnValue({ authenticated: false });

    const page = await render(createElement(ContinueCard, { classrooms: [], thumbnails: {} }));

    expect(mocks.progress).not.toHaveBeenCalled();
    expect(page.querySelector('a')).toBeNull();
  });
});
