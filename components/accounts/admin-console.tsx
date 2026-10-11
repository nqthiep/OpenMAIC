'use client';

import { type FormEvent, useEffect, useId, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { AdminUser, AuditEntry } from './admin-types';
import {
  CreateUserDialog,
  DeleteUserDialog,
  EditUserDialog,
  ResetPasswordDialog,
  StatusDialog,
} from './admin-dialogs';
import { callApi, failureText } from './api';
import { UsageTab } from './admin-usage';
import {
  type AccountRole,
  type AccountStatus,
  formatDateTime,
  messages,
  roleLabel,
  statusLabel,
} from './messages';

type Filter = { q: string; status: AccountStatus | 'all'; role: AccountRole | 'all' };

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit' | 'disable' | 'enable' | 'reset' | 'delete'; user: AdminUser };

/** The administration page: the user list, the audit log, and usage per account. */
export function AdminConsole({ actorUsername }: { actorUsername: string }) {
  return (
    <Tabs defaultValue="users" className="gap-6">
      <TabsList>
        <TabsTrigger value="users">{messages.admin.tabUsers}</TabsTrigger>
        <TabsTrigger value="audit">{messages.admin.tabAudit}</TabsTrigger>
        <TabsTrigger value="cost">{messages.admin.tabCost}</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <UsersTab actorUsername={actorUsername} />
      </TabsContent>
      <TabsContent value="audit">
        <AuditTab />
      </TabsContent>
      <TabsContent value="cost">
        <UsageTab />
      </TabsContent>
    </Tabs>
  );
}

/** Cursor paging: `history` holds the cursors of the pages before the current one. */
function usePaging() {
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  return { cursor, setCursor, history, setHistory, nextCursor, setNextCursor };
}

function PageButtons({
  canPrevious,
  canNext,
  busy,
  onPrevious,
  onNext,
}: {
  canPrevious: boolean;
  canNext: boolean;
  busy: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={!canPrevious || busy} onClick={onPrevious}>
        {messages.admin.previous}
      </Button>
      <Button variant="outline" size="sm" disabled={!canNext || busy} onClick={onNext}>
        {messages.admin.next}
      </Button>
    </div>
  );
}

function UsersTab({ actorUsername }: { actorUsername: string }) {
  const searchId = useId();
  const statusLabelId = useId();
  const roleFilterId = useId();
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<Filter>({ q: '', status: 'all', role: 'all' });
  const [reload, setReload] = useState(0);
  const { cursor, setCursor, history, setHistory, nextCursor, setNextCursor } = usePaging();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    let current = true;
    const query = new URLSearchParams();
    if (filter.q) query.set('q', filter.q);
    if (filter.status !== 'all') query.set('status', filter.status);
    if (filter.role !== 'all') query.set('role', filter.role);
    if (cursor !== null) query.set('cursor', cursor);
    callApi<{ users: AdminUser[]; nextCursor: string | null }>(
      `/api/admin/users?${query.toString()}`,
    ).then((result) => {
      if (!current) return;
      if (result.ok) {
        setUsers(result.data.users);
        setNextCursor(result.data.nextCursor);
        setLoadError(null);
      } else {
        setLoadError(failureText(result));
      }
      setLoading(false);
    });
    return () => {
      current = false;
    };
  }, [filter, cursor, reload, setNextCursor]);

  function applyFilter(next: Filter) {
    setFilter(next);
    setCursor(null);
    setHistory([]);
    setLoading(true);
  }

  function refresh() {
    setLoading(true);
    setReload((count) => count + 1);
  }

  function changed(message: string) {
    setNotice(message);
    refresh();
  }

  function goNext() {
    if (nextCursor === null) return;
    setHistory([...history, cursor]);
    setCursor(nextCursor);
    setLoading(true);
  }

  function goPrevious() {
    const previous = history[history.length - 1] ?? null;
    setHistory(history.slice(0, -1));
    setCursor(previous);
    setLoading(true);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilter({ ...filter, q: draft.trim() });
  }

  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={onSearch} role="search" className="flex min-w-72 flex-1 items-end gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor={searchId}>{messages.fields.search}</Label>
            <Input
              id={searchId}
              type="search"
              maxLength={100}
              placeholder={messages.admin.searchPlaceholder}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            {messages.admin.search}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          <Label id={statusLabelId}>{messages.fields.status}</Label>
          <Select
            value={filter.status}
            onValueChange={(value) => applyFilter({ ...filter, status: value as Filter['status'] })}
          >
            <SelectTrigger aria-labelledby={statusLabelId} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{messages.admin.all}</SelectItem>
              <SelectItem value="active">{statusLabel.active}</SelectItem>
              <SelectItem value="disabled">{statusLabel.disabled}</SelectItem>
              <SelectItem value="deleted">{statusLabel.deleted}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label id={roleFilterId}>{messages.fields.role}</Label>
          <Select
            value={filter.role}
            onValueChange={(value) => applyFilter({ ...filter, role: value as Filter['role'] })}
          >
            <SelectTrigger aria-labelledby={roleFilterId} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{messages.admin.all}</SelectItem>
              <SelectItem value="user">{roleLabel.user}</SelectItem>
              <SelectItem value="admin">{roleLabel.admin}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="button" onClick={() => setDialog({ kind: 'create' })}>
          {messages.admin.create}
        </Button>
      </div>

      <p role="status" aria-live="polite" className="min-h-5 text-sm">
        {notice}
      </p>

      {loadError !== null ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={refresh}>
            {messages.admin.retry}
          </Button>
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{messages.loading}</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.admin.empty}</p>
      ) : (
        <UsersTable users={users} actorUsername={actorUsername} onAction={setDialog} />
      )}

      <PageButtons
        canPrevious={history.length > 0}
        canNext={nextCursor !== null}
        busy={loading}
        onPrevious={goPrevious}
        onNext={goNext}
      />

      {dialog?.kind === 'create' && <CreateUserDialog onClose={close} onChanged={changed} />}
      {dialog?.kind === 'edit' && (
        <EditUserDialog user={dialog.user} onClose={close} onChanged={changed} />
      )}
      {dialog?.kind === 'disable' && (
        <StatusDialog user={dialog.user} target="disabled" onClose={close} onChanged={changed} />
      )}
      {dialog?.kind === 'enable' && (
        <StatusDialog user={dialog.user} target="active" onClose={close} onChanged={changed} />
      )}
      {dialog?.kind === 'reset' && (
        <ResetPasswordDialog user={dialog.user} onClose={close} onChanged={changed} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteUserDialog user={dialog.user} onClose={close} onChanged={changed} />
      )}
    </div>
  );
}

function UsersTable({
  users,
  actorUsername,
  onAction,
}: {
  users: AdminUser[];
  actorUsername: string;
  onAction: (state: DialogState) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">{messages.admin.tabUsers}</caption>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              {messages.admin.columns.username}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {messages.admin.columns.displayName}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {messages.admin.columns.role}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {messages.admin.columns.status}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {messages.admin.columns.lastLogin}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {messages.admin.columns.actions}
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const deleted = user.status === 'deleted';
            return (
              <tr key={user.id} className="border-t align-top">
                <td className="px-3 py-2 font-mono text-xs">
                  {user.username}
                  {user.username === actorUsername && (
                    <span className="ml-2 font-sans text-muted-foreground">
                      {messages.admin.you}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{user.displayName}</td>
                <td className="px-3 py-2">{roleLabel[user.role]}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="outline">{statusLabel[user.status]}</Badge>
                    {user.mustChangePassword && (
                      <span className="text-xs text-muted-foreground">
                        {messages.admin.mustChange}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {user.lastLoginAt
                    ? formatDateTime(user.lastLoginAt)
                    : messages.admin.neverSignedIn}
                </td>
                <td className="px-3 py-2">
                  {!deleted && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={messages.admin.rowAction(messages.admin.edit, user.username)}
                        onClick={() => onAction({ kind: 'edit', user })}
                      >
                        {messages.admin.edit}
                      </Button>
                      {user.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={messages.admin.rowAction(
                            messages.admin.disable,
                            user.username,
                          )}
                          onClick={() => onAction({ kind: 'disable', user })}
                        >
                          {messages.admin.disable}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={messages.admin.rowAction(
                            messages.admin.enable,
                            user.username,
                          )}
                          onClick={() => onAction({ kind: 'enable', user })}
                        >
                          {messages.admin.enable}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={messages.admin.rowAction(
                          messages.admin.resetPassword,
                          user.username,
                        )}
                        onClick={() => onAction({ kind: 'reset', user })}
                      >
                        {messages.admin.resetPassword}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-red-800 dark:text-red-200"
                        aria-label={messages.admin.rowAction(messages.admin.delete, user.username)}
                        onClick={() => onAction({ kind: 'delete', user })}
                      >
                        {messages.admin.delete}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab() {
  const { cursor, setCursor, history, setHistory, nextCursor, setNextCursor } = usePaging();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`;
    callApi<{ entries: AuditEntry[]; nextCursor: string | null }>(`/api/admin/audit${query}`).then(
      (result) => {
        if (!current) return;
        if (result.ok) {
          setEntries(result.data.entries);
          setNextCursor(result.data.nextCursor);
          setLoadError(null);
        } else {
          setLoadError(failureText(result));
        }
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [cursor, reload, setNextCursor]);

  function goNext() {
    if (nextCursor === null) return;
    setHistory([...history, cursor]);
    setCursor(nextCursor);
    setLoading(true);
  }

  function goPrevious() {
    const previous = history[history.length - 1] ?? null;
    setHistory(history.slice(0, -1));
    setCursor(previous);
    setLoading(true);
  }

  return (
    <div className="flex flex-col gap-4">
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
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{messages.loading}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{messages.audit.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">{messages.admin.tabAudit}</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {messages.audit.when}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {messages.audit.actor}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {messages.audit.action}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {messages.audit.target}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {messages.audit.detail}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entry.at)}</td>
                  <td className="px-3 py-2">
                    {entry.actor === null ? messages.audit.cli : (entry.actor.username ?? '–')}
                  </td>
                  <td className="px-3 py-2">{messages.audit.actionLabel(entry.action)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{entry.target?.username ?? '–'}</td>
                  <td className="px-3 py-2">{detailText(entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PageButtons
        canPrevious={history.length > 0}
        canNext={nextCursor !== null}
        busy={loading}
        onPrevious={goPrevious}
        onNext={goNext}
      />
    </div>
  );
}

/** What an entry changed, from its detail: field names and roles only. */
function detailText(entry: AuditEntry): string {
  const { detail } = entry;
  if (Array.isArray(detail.changed)) {
    return messages.audit.changed(
      detail.changed.filter((item): item is string => typeof item === 'string'),
    );
  }
  if (entry.action === 'user.create' && typeof detail.role === 'string') {
    return messages.audit.created(detail.role, detail.generatedPassword === true);
  }
  return '–';
}
