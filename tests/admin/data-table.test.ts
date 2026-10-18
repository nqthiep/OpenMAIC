// @vitest-environment jsdom

/** The admin table: header click sorts, the search and select filters narrow, pages split the rows. */
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

import { DataTable, type Column } from '@/components/learning/data-table';

interface Row {
  name: string;
  age: number;
  team: 'a' | 'b';
}

const ROWS: Row[] = Array.from({ length: 23 }, (_, i) => ({
  name: `user${i + 1}`,
  age: (i * 7) % 23,
  team: i % 2 === 0 ? 'a' : 'b',
}));

const COLUMNS: Column<Row>[] = [
  { id: 'name', header: 'Name', sort: (r) => r.name, cell: (r) => r.name },
  { id: 'age', header: 'Age', sort: (r) => r.age, cell: (r) => String(r.age) },
];

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
    root.render(
      createElement(DataTable<Row>, {
        rows: ROWS,
        columns: COLUMNS,
        rowKey: (r) => r.name,
        searchText: (r) => r.name,
        filters: [
          {
            id: 'team',
            label: 'Team',
            options: [
              { value: 'a', label: 'A' },
              { value: 'b', label: 'B' },
            ],
            test: (r, v) => r.team === v,
          },
        ],
        initialSort: { id: 'name', dir: 'asc' },
        empty: 'empty',
      }),
    );
  });
  return container;
}

const names = (c: HTMLElement) =>
  [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent);

async function change(el: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const proto =
      el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('DataTable', () => {
  it('sorts by the clicked column, pages by ten, and filters', async () => {
    const c = await render();
    // Natural order: user2 comes before user10.
    expect(names(c)).toEqual(Array.from({ length: 10 }, (_, i) => `user${i + 1}`));

    const next = c.querySelector<HTMLButtonElement>('[aria-label="admin.table.next"]')!;
    await act(async () => next.click());
    await act(async () => next.click());
    expect(names(c)).toEqual(['user21', 'user22', 'user23']);
    expect(next.disabled).toBe(true);

    const ageHeader = [...c.querySelectorAll('th button')].find((b) => b.textContent === 'Age')!;
    await act(async () => (ageHeader as HTMLButtonElement).click());
    await act(async () => (ageHeader as HTMLButtonElement).click());
    // Descending by age, back on the first page.
    const ages = [...c.querySelectorAll('tbody tr')].map((tr) =>
      Number(tr.querySelectorAll('td')[1]!.textContent),
    );
    expect(ages).toEqual([...ages].sort((a, b) => b - a));
    expect(ages[0]).toBe(22);

    await change(c.querySelector('select[aria-label="Team"]')!, 'b');
    await change(c.querySelector('input[type="search"]')!, 'user1');
    // Team b is the even users; of those, user10, user12, user14, user16, user18 match "user1".
    expect(names(c)?.sort()).toEqual(['user10', 'user12', 'user14', 'user16', 'user18']);

    await change(c.querySelector('input[type="search"]')!, 'nobody');
    expect(c.querySelector('tbody')!.textContent).toBe('admin.table.noMatch');
  });
});
