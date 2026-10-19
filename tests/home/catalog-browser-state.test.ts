// @vitest-environment jsdom

/**
 * What the catalog list remembers: the layout the learner chose last time (unless the address
 * says otherwise), and the match order while they search.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

import { CatalogBrowser } from '@/components/home/catalog-browser';

// The cards fade in when they scroll into view, which jsdom cannot watch.
class NoObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal('IntersectionObserver', NoObserver);

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// More than the threshold, so the toolbar shows.
const COURSES = Array.from({ length: 14 }, (_, i) => ({
  courseId: `c${i}`,
  title: `Course ${String(i).padStart(2, '0')}`,
  kind: 'shared' as const,
  sceneCount: 5,
}));

async function render(url: string): Promise<HTMLElement> {
  window.history.replaceState(null, '', url);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      createElement(CatalogBrowser, {
        courses: COURSES,
        progress: new Map(),
        href: (id: string) => `/classroom/${id}`,
      }),
    );
  });
  return container;
}

const layoutButton = (container: HTMLElement, layout: 'grid' | 'list') =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="catalog.layout.${layout}"]`)!;
const compactRows = (container: HTMLElement) => container.querySelectorAll('ul.divide-y > li');

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('the remembered layout', () => {
  it('uses the layout chosen last time when the address does not say', async () => {
    window.localStorage.setItem('openmaic.catalog.layout', 'list');
    const container = await render('/catalog');
    expect(compactRows(container)).toHaveLength(14);
    expect(layoutButton(container, 'list').getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the address win over the remembered layout', async () => {
    window.localStorage.setItem('openmaic.catalog.layout', 'list');
    const container = await render('/catalog?layout=grid');
    expect(compactRows(container)).toHaveLength(0);
    expect(layoutButton(container, 'grid').getAttribute('aria-pressed')).toBe('true');
  });

  it('remembers a new choice, and still works when storage is blocked', async () => {
    const container = await render('/catalog');
    await act(async () => layoutButton(container, 'list').click());
    expect(window.localStorage.getItem('openmaic.catalog.layout')).toBe('list');

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await act(async () => layoutButton(container, 'grid').click());
    expect(layoutButton(container, 'grid').getAttribute('aria-pressed')).toBe('true');
    spy.mockRestore();
  });
});

describe('the search order', () => {
  it('ranks by match while searching and goes back to A to Z when the search is cleared', async () => {
    const container = await render('/catalog');
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="catalog.search.label"]',
    )!;
    const type = async (text: string) =>
      act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

    await type('course');
    expect(window.location.search).toContain('sort=match');
    await type('');
    expect(window.location.search).not.toContain('sort=');
  });
});
