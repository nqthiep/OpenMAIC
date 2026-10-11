'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { endAccountSession } from '@/lib/accounts/client-state';

import { callApi, failureText, signOut } from './api';
import { type AccountRole, messages, roleLabel } from './messages';

export interface AccountUser {
  username: string;
  displayName: string;
  role: AccountRole;
}

/** The signed-in account's page: its name, its security actions, and sign-out. */
export function AccountPanel({ user }: { user: AccountUser }) {
  const nameId = useId();
  const [name, setName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const confirmAllRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmAll) confirmAllRef.current?.focus();
  }, [confirmAll]);

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const result = await callApi<{ user: { displayName: string } }>('/api/auth/me', {
      method: 'PATCH',
      body: { displayName: name },
    });
    setBusy(false);
    if (result.ok) {
      setName(result.data.user.displayName);
      setNotice(messages.account.nameSaved);
      return;
    }
    setError(failureText(result));
  }

  async function signOutEverywhere() {
    if (busy) return;
    setBusy(true);
    const result = await callApi('/api/auth/logout-all', { method: 'POST' });
    if (!result.ok) {
      setBusy(false);
      setError(failureText(result));
      return;
    }
    // Every session is revoked above, so only this device's state is left to clear.
    await endAccountSession({
      revoke: () => Promise.resolve(),
      leave: () => window.location.assign('/login'),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-xl border bg-card p-6">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">{messages.account.username}</dt>
          <dd className="font-mono">{user.username}</dd>
          <dt className="text-muted-foreground">{messages.account.role}</dt>
          <dd>{roleLabel[user.role]}</dd>
        </dl>

        <form onSubmit={saveName} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor={nameId}>{messages.fields.displayName}</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? messages.account.saving : messages.account.saveName}
          </Button>
        </form>

        <p role="status" aria-live="polite" className="min-h-5 text-sm">
          {notice}
        </p>
        <p role="alert" aria-live="assertive" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <h2 className="text-base font-medium">{messages.account.security}</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/account/password">{messages.account.changePassword}</Link>
          </Button>
          {user.role === 'admin' && (
            <Button asChild variant="outline">
              <Link href="/admin">{messages.account.adminPage}</Link>
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            {messages.account.signOut}
          </Button>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">{messages.account.signOutAllHint}</p>
          {confirmAll ? (
            <div className="flex flex-wrap gap-3">
              <Button
                ref={confirmAllRef}
                type="button"
                variant="destructive"
                className="text-red-800 dark:text-red-200"
                disabled={busy}
                onClick={() => void signOutEverywhere()}
              >
                {messages.account.signOutAllConfirm}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmAll(false)}>
                {messages.cancel}
              </Button>
            </div>
          ) : (
            <div>
              <Button type="button" variant="outline" onClick={() => setConfirmAll(true)}>
                {messages.account.signOutAll}
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
