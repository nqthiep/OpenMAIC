'use client';

import Link from 'next/link';
import { type FormEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { type ApiFailure, callApi, failureText, signOut } from './api';
import { messages } from './messages';

const MIN_LENGTH = 10;
const MAX_LENGTH = 200;

/** The first problem with the three entries, checked before the server is asked. */
function localProblem(current: string, next: string, confirm: string): string | null {
  const length = [...next].length;
  if (length < MIN_LENGTH || length > MAX_LENGTH) return messages.policy('length');
  if (next !== confirm) return messages.password.mismatch;
  if (next === current) return messages.policy('unchanged');
  return null;
}

function passwordFailure(failure: ApiFailure): string {
  return failure.errorCode === 'INVALID_CREDENTIALS'
    ? messages.password.wrongCurrent
    : failureText(failure);
}

/**
 * The password change form. With `mustChange`, the account has a temporary
 * password: the page says why, and a successful change goes to the home page.
 */
export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const hintId = useId();
  const errorId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setDone(false);
    const problem = localProblem(current, next, confirm);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const result = await callApi('/api/auth/password', {
      method: 'POST',
      body: { currentPassword: current, newPassword: next },
    });
    if (result.ok) {
      if (mustChange) {
        window.location.assign('/');
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      setBusy(false);
      return;
    }
    setError(passwordFailure(result));
    setBusy(false);
  }

  const describedBy = `${hintId} ${errorId}`;

  return (
    <div className="flex flex-col gap-6">
      {mustChange && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          {messages.password.mustChange}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-5 rounded-xl border bg-card p-6">
        <p id={hintId} className="text-sm text-muted-foreground">
          {messages.password.hint}
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor={currentId}>{messages.fields.currentPassword}</Label>
          <Input
            id={currentId}
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={describedBy}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={nextId}>{messages.fields.newPassword}</Label>
          <Input
            id={nextId}
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(event) => setNext(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={describedBy}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={confirmId}>{messages.fields.confirmPassword}</Label>
          <Input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-invalid={error !== null}
            aria-describedby={describedBy}
          />
        </div>

        <div
          id={errorId}
          role="alert"
          aria-live="assertive"
          className="min-h-5 text-sm text-destructive"
        >
          {error}
        </div>

        {done && (
          <p role="status" className="text-sm">
            {messages.password.done}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? messages.password.saving : messages.password.submit}
          </Button>
          {!mustChange && (
            <Button asChild variant="outline">
              <Link href="/account">{messages.password.backToAccount}</Link>
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            {messages.account.signOut}
          </Button>
        </div>
      </form>
    </div>
  );
}
