// @vitest-environment jsdom

/**
 * What a learner sees of a course's tags in the catalog: the subject and grades under the title
 * (not the topics), and a "new" mark for a course changed within two weeks.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

import { CourseCard } from '@/components/home/course-card';
import { CourseRow } from '@/components/home/course-row';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const DAY = 86_400_000;
const base = {
  courseId: 'c1',
  title: 'Derivatives',
  kind: 'shared' as const,
  sceneCount: 6,
  tags: ['subject:math', 'grade:12', 'topic:math.derivative'],
};

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(element);
  });
  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('a course card', () => {
  it('shows the subject and grade, not the topics, and marks a recent update as new', async () => {
    const recent = { ...base, updatedAt: new Date(Date.now() - 2 * DAY).toISOString() };
    const card = await render(
      createElement(CourseCard, { entry: recent, index: 0, now: Date.now() }),
    );
    expect(card.textContent).toContain('taxonomy.subject.math · taxonomy.grade.12');
    expect(card.textContent).not.toContain('Derivatives and function study');
    expect(card.textContent).toContain('catalog.new');
  });

  it('shows nothing extra for an untagged, old course', async () => {
    const old = {
      ...base,
      tags: undefined,
      updatedAt: new Date(Date.now() - 30 * DAY).toISOString(),
    };
    const card = await render(createElement(CourseCard, { entry: old, index: 0, now: Date.now() }));
    expect(card.textContent).not.toContain('taxonomy.');
    expect(card.textContent).not.toContain('catalog.new');
  });
});

describe('without a time to judge by', () => {
  it('marks nothing as new, so the home page cards stay as they were', async () => {
    const recent = { ...base, updatedAt: new Date(Date.now() - DAY).toISOString() };
    const card = await render(createElement(CourseCard, { entry: recent, index: 0 }));
    expect(card.textContent).not.toContain('catalog.new');
  });
});

describe('a compact row', () => {
  it('carries the same tag line and new mark', async () => {
    const recent = { ...base, updatedAt: new Date(Date.now() - DAY).toISOString() };
    const row = await render(
      createElement(CourseRow, { entry: recent, href: '/x', now: Date.now() }),
    );
    expect(row.textContent).toContain('taxonomy.subject.math · taxonomy.grade.12');
    expect(row.textContent).toContain('catalog.new');
  });
});
