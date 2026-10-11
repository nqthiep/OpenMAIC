'use client';

import { type FormEvent, useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { callApi, failureText } from './api';
import { type AccountStatus, messages, statusLabel } from './messages';

type UsageKind = 'llm' | 'image' | 'video' | 'tts' | 'asr';

const KINDS: UsageKind[] = ['llm', 'image', 'video', 'tts', 'asr'];

/** Counts for one account, for the rows with no account, or for all rows. */
interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  byKind: Partial<Record<UsageKind, number>>;
}

/** One account's usage, as `GET /api/admin/usage` lists it. */
interface AccountUsage extends UsageTotals {
  userId: string;
  username: string | null;
  displayName: string | null;
  status: AccountStatus | null;
}

interface UsageReport {
  from: string | null;
  to: string | null;
  accounts: AccountUsage[];
  unattributed: UsageTotals;
  totals: UsageTotals;
}

interface DayRange {
  from: string;
  to: string;
}

const NO_RANGE: DayRange = { from: '', to: '' };
const CELL = 'px-3 py-2 text-right tabular-nums';

function formatCount(value: number): string {
  return value.toLocaleString('vi-VN');
}

function kindsText(byKind: Partial<Record<UsageKind, number>>): string {
  const parts = KINDS.filter((kind) => (byKind[kind] ?? 0) > 0).map(
    (kind) => `${messages.admin.usage.kindLabel[kind]}: ${formatCount(byKind[kind] ?? 0)}`,
  );
  return parts.length > 0 ? parts.join(' · ') : '–';
}

/** Usage per account for a range of days, with the rows no account owns in a group of their own. */
export function UsageTab() {
  const fromId = useId();
  const toId = useId();
  const [draft, setDraft] = useState<DayRange>(NO_RANGE);
  const [range, setRange] = useState<DayRange>(NO_RANGE);
  const [formError, setFormError] = useState<string | null>(null);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams();
    if (range.from) query.set('from', range.from);
    if (range.to) query.set('to', range.to);
    const text = query.toString();
    callApi<UsageReport>(text ? `/api/admin/usage?${text}` : '/api/admin/usage').then((result) => {
      if (!current) return;
      if (result.ok) {
        setReport(result.data);
        setLoadError(null);
      } else {
        setLoadError(failureText(result));
      }
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [range, reload]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFormError(messages.admin.usage.invalidRange);
      return;
    }
    setFormError(null);
    setLoading(true);
    setRange(draft);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={fromId}>{messages.admin.usage.from}</Label>
          <Input
            id={fromId}
            type="date"
            className="w-44"
            value={draft.from}
            onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={toId}>{messages.admin.usage.to}</Label>
          <Input
            id={toId}
            type="date"
            className="w-44"
            value={draft.to}
            onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
          />
        </div>
        <Button type="submit" variant="outline">
          {messages.admin.usage.apply}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">{messages.admin.usage.note}</p>

      {formError !== null && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      {loadError !== null ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <span>{loadError}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              setReload((count) => count + 1);
            }}
          >
            {messages.admin.retry}
          </Button>
        </div>
      ) : loading || report === null ? (
        <p className="text-sm text-muted-foreground">{messages.loading}</p>
      ) : report.totals.requests === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.admin.usage.empty}</p>
      ) : (
        <UsageTable report={report} />
      )}
    </div>
  );
}

function UsageTable({ report }: { report: UsageReport }) {
  const columns = messages.admin.usage.columns;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">{messages.admin.tabCost}</caption>
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              {columns.account}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {columns.requests}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {columns.input}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {columns.output}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {columns.total}
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              {columns.kinds}
            </th>
          </tr>
        </thead>
        <tbody>
          {report.accounts.map((account) => (
            <tr key={account.userId} className="border-t align-top">
              <td className="px-3 py-2">
                <div className="font-mono text-xs">{account.username ?? '–'}</div>
                {account.displayName && (
                  <div className="text-muted-foreground">{account.displayName}</div>
                )}
                {account.status !== null && account.status !== 'active' && (
                  <div className="text-xs text-muted-foreground">{statusLabel[account.status]}</div>
                )}
              </td>
              <td className={CELL}>{formatCount(account.requests)}</td>
              <td className={CELL}>{formatCount(account.inputTokens)}</td>
              <td className={CELL}>{formatCount(account.outputTokens)}</td>
              <td className={CELL}>{formatCount(account.totalTokens)}</td>
              <td className="px-3 py-2">{kindsText(account.byKind)}</td>
            </tr>
          ))}
          {report.unattributed.requests > 0 && (
            <tr className="border-t align-top text-muted-foreground">
              <td className="px-3 py-2 italic">{messages.admin.usage.unattributed}</td>
              <td className={CELL}>{formatCount(report.unattributed.requests)}</td>
              <td className={CELL}>{formatCount(report.unattributed.inputTokens)}</td>
              <td className={CELL}>{formatCount(report.unattributed.outputTokens)}</td>
              <td className={CELL}>{formatCount(report.unattributed.totalTokens)}</td>
              <td className="px-3 py-2">{kindsText(report.unattributed.byKind)}</td>
            </tr>
          )}
        </tbody>
        <tfoot className="border-t bg-muted/50 font-medium">
          <tr>
            <th scope="row" className="px-3 py-2 text-left">
              {messages.admin.usage.totals}
            </th>
            <td className={CELL}>{formatCount(report.totals.requests)}</td>
            <td className={CELL}>{formatCount(report.totals.inputTokens)}</td>
            <td className={CELL}>{formatCount(report.totals.outputTokens)}</td>
            <td className={CELL}>{formatCount(report.totals.totalTokens)}</td>
            <td className="px-3 py-2">{kindsText(report.totals.byKind)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
