'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

export interface Column<T> {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** The value the column sorts by. Without it the header is not sortable. */
  readonly sort?: (row: T) => string | number;
  readonly align?: 'right';
  readonly className?: string;
}

export interface SelectFilter<T> {
  readonly id: string;
  readonly label: string;
  readonly options: readonly { value: string; label: string }[];
  /** Selected first; '' (the "all" option) when omitted. */
  readonly initial?: string;
  readonly test: (row: T, value: string) => boolean;
}

const PAGE_SIZES = [10, 20, 50] as const;

export const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * A table with aligned columns, click-to-sort headers, a text search, select filters and pages.
 * Everything runs on the rows it is given; the panels load their whole list first.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchText,
  filters = [],
  initialSort,
  empty,
  toolbar,
}: {
  /** null while loading. */
  rows: readonly T[] | null;
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  /** The text the search box matches, per row. Without it there is no search box. */
  searchText?: (row: T) => string;
  filters?: readonly SelectFilter<T>[];
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  empty: string;
  /** Extra controls on the right of the filter row, e.g. a create form. */
  toolbar?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(filters.map((f) => [f.id, f.initial ?? ''])),
  );
  const [sort, setSort] = useState(initialSort ?? null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLocaleLowerCase(locale);
    let out = rows.filter(
      (row) =>
        (!needle || (searchText?.(row) ?? '').toLocaleLowerCase(locale).includes(needle)) &&
        filters.every((f) => !selected[f.id] || f.test(row, selected[f.id]!)),
    );
    const column = sort && columns.find((c) => c.id === sort.id);
    if (sort && column?.sort) {
      const key = column.sort;
      const sign = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        const order =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), locale, { numeric: true });
        return order * sign;
      });
    }
    return out;
  }, [rows, query, selected, sort, columns, filters, searchText, locale]);

  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = visible.slice(current * pageSize, (current + 1) * pageSize);

  const toggleSort = (id: string) => {
    setSort((prev) =>
      prev?.id === id ? { id, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: 'asc' },
    );
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchText ? (
          <div className="relative w-full max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={query}
              placeholder={t('admin.table.search')}
              aria-label={t('admin.table.search')}
              className="h-8 pl-8"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
            />
          </div>
        ) : null}
        {filters.map((f) => (
          <select
            key={f.id}
            aria-label={f.label}
            value={selected[f.id] ?? ''}
            className={SELECT_CLASS}
            onChange={(event) => {
              setSelected((prev) => ({ ...prev, [f.id]: event.target.value }));
              setPage(0);
            }}
          >
            <option value="">
              {f.label}: {t('admin.table.all')}
            </option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {f.label}: {o.label}
              </option>
            ))}
          </select>
        ))}
        {toolbar ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => {
                const active = sort?.id === c.id;
                const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={
                      active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'whitespace-nowrap px-3 py-2 font-medium',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.className,
                    )}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded hover:text-foreground',
                          active && 'text-foreground',
                        )}
                      >
                        {c.header}
                        <Icon className={cn('size-3.5', !active && 'opacity-40')} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)} className="border-t align-middle hover:bg-muted/30">
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn('px-3 py-2', c.align === 'right' && 'text-right', c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr className="border-t">
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  {rows === null
                    ? t('admin.table.loading')
                    : rows.length === 0
                      ? empty
                      : t('admin.table.noMatch')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {visible.length === 0
            ? t('admin.table.range', { from: 0, to: 0, total: 0 })
            : t('admin.table.range', {
                from: current * pageSize + 1,
                to: current * pageSize + shown.length,
                total: visible.length,
              })}
        </span>
        <div className="flex items-center gap-2">
          <select
            aria-label={t('admin.table.perPage')}
            value={pageSize}
            className={SELECT_CLASS}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {t('admin.table.rows', { count: n })}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t('admin.table.prev')}
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            {t('admin.table.page', { page: current + 1, pages })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={t('admin.table.next')}
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
