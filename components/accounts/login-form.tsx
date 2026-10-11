'use client';

import { type FormEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { prepareAccountSwitch } from '@/lib/accounts/client-state';

import { type ApiFailure, callApi, failureText } from './api';
import { messages } from './messages';

/** The sign-in form. `next` is a same-site path the server already checked. */
export function LoginForm({ next }: { next: string }) {
  const usernameId = useId();
  const passwordId = useId();
  const errorId = useId();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await callApi<{ mustChangePassword: boolean; user: { id: string } }>(
      '/api/auth/login',
      { method: 'POST', body: { username, password } },
    );
    if (result.ok) {
      // The previous account's local state goes before the page loads. A failed
      // clear is retried by the account menu on the next page.
      await prepareAccountSwitch(result.data.user.id);
      // A full load, so the server renders the page with the new session.
      window.location.assign(result.data.mustChangePassword ? '/account/password' : next);
      return;
    }
    setError(signInFailure(result));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-xl border bg-card p-6">
      <p className="text-sm text-muted-foreground">{messages.login.intro}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={usernameId}>{messages.fields.username}</Label>
        <Input
          id={usernameId}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>{messages.fields.password}</Label>
        <Input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
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

      <div>
        <Button type="submit" disabled={busy}>
          {busy ? messages.login.busy : messages.login.submit}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{messages.login.noAccount}</p>
    </form>
  );
}

function signInFailure(failure: ApiFailure): string {
  return failure.errorCode === 'INVALID_CREDENTIALS'
    ? messages.login.invalid
    : failureText(failure);
}
