'use client';

import { type FormEvent, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { callApi, failureText } from './api';
import type { AdminUser } from './admin-types';
import { type AccountRole, messages, roleLabel } from './messages';

/** Every dialog reports a change to the list (`onChanged`) and closes through `onClose`. */
interface DialogProps {
  onClose: () => void;
  onChanged: (notice: string) => void;
}

/**
 * A temporary password, shown in the dialog only. Closing the dialog drops it:
 * the parent unmounts the dialog, and nothing keeps the value.
 */
function TemporaryPassword({ value }: { value: string }) {
  const inputId = useId();
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={inputId}>{messages.temporary.title}</Label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          readOnly
          value={value}
          className="font-mono"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {messages.copy}
        </Button>
      </div>
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        {messages.temporary.warning}
      </p>
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {copied === 'yes' ? messages.copied : copied === 'no' ? messages.copyFailed : null}
      </p>
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return (
    <p role="alert" aria-live="assertive" className="min-h-5 text-sm text-destructive">
      {message}
    </p>
  );
}

export function CreateUserDialog({ onClose, onChanged }: DialogProps) {
  const usernameId = useId();
  const displayId = useId();
  const roleId = useId();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<AccountRole>('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; temporaryPassword: string } | null>(
    null,
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await callApi<{ user: { username: string }; temporaryPassword: string }>(
      '/api/admin/users',
      { method: 'POST', body: { username, displayName, role } },
    );
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    setCreated({
      username: result.data.user.username,
      temporaryPassword: result.data.temporaryPassword,
    });
    onChanged(messages.admin.notice.created(result.data.user.username));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{messages.create.title}</DialogTitle>
          <DialogDescription>
            {created
              ? messages.admin.notice.created(created.username)
              : messages.create.description}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-4">
            <TemporaryPassword value={created.temporaryPassword} />
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                {messages.close}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={usernameId}>{messages.fields.username}</Label>
              <Input
                id={usernameId}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                aria-describedby={`${usernameId}-hint`}
              />
              <p id={`${usernameId}-hint`} className="text-xs text-muted-foreground">
                {messages.create.usernameHint}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={displayId}>{messages.fields.displayName}</Label>
              <Input
                id={displayId}
                required
                maxLength={200}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={roleId}>{messages.fields.role}</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AccountRole)}>
                <SelectTrigger id={roleId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{roleLabel.user}</SelectItem>
                  <SelectItem value="admin">{roleLabel.admin}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ErrorLine message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {messages.cancel}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? messages.create.busy : messages.create.submit}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EditUserDialog({ user, onClose, onChanged }: DialogProps & { user: AdminUser }) {
  const displayId = useId();
  const roleId = useId();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<AccountRole>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const changes: { displayName?: string; role?: AccountRole } = {};
    if (displayName !== user.displayName) changes.displayName = displayName;
    if (role !== user.role) changes.role = role;
    if (Object.keys(changes).length === 0) {
      setError(messages.edit.nothing);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await callApi('/api/admin/users/' + user.id, { method: 'PATCH', body: changes });
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    onChanged(messages.admin.notice.updated(user.username));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{messages.edit.title}</DialogTitle>
          <DialogDescription>{messages.edit.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm">
            <span className="text-muted-foreground">{messages.fields.username}: </span>
            <span className="font-mono">{user.username}</span>
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={displayId}>{messages.fields.displayName}</Label>
            <Input
              id={displayId}
              required
              maxLength={200}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={roleId}>{messages.fields.role}</Label>
            <Select value={role} onValueChange={(value) => setRole(value as AccountRole)}>
              <SelectTrigger id={roleId} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{roleLabel.user}</SelectItem>
                <SelectItem value="admin">{roleLabel.admin}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ErrorLine message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {messages.cancel}
            </Button>
            <Button type="submit" disabled={busy}>
              {messages.edit.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deactivate (`disabled`) or reactivate (`active`) an account. */
export function StatusDialog({
  user,
  target,
  onClose,
  onChanged,
}: DialogProps & { user: AdminUser; target: 'active' | 'disabled' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = target === 'disabled' ? messages.disable : messages.enable;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await callApi('/api/admin/users/' + user.id, {
      method: 'PATCH',
      body: { status: target },
    });
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    onChanged(
      target === 'disabled'
        ? messages.admin.notice.disabled(user.username)
        : messages.admin.notice.enabled(user.username),
    );
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <p className="font-mono text-sm">{user.username}</p>
        <ErrorLine message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {messages.cancel}
          </Button>
          <Button
            type="button"
            variant={target === 'disabled' ? 'destructive' : 'default'}
            className={target === 'disabled' ? 'text-red-800 dark:text-red-200' : undefined}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Set a new temporary password. The sessions of the account end; the new password is shown once. */
export function ResetPasswordDialog({
  user,
  onClose,
  onChanged,
}: DialogProps & { user: AdminUser }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await callApi<{ temporaryPassword: string }>(
      `/api/admin/users/${user.id}/reset-password`,
      { method: 'POST' },
    );
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    setTemporary(result.data.temporaryPassword);
    onChanged(messages.admin.notice.reset(user.username));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{messages.reset.title}</DialogTitle>
          <DialogDescription>{messages.reset.description}</DialogDescription>
        </DialogHeader>
        {temporary ? (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-sm">{user.username}</p>
            <TemporaryPassword value={temporary} />
            <DialogFooter>
              <Button type="button" onClick={onClose}>
                {messages.close}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="font-mono text-sm">{user.username}</p>
            <ErrorLine message={error} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {messages.cancel}
              </Button>
              <Button type="button" disabled={busy} onClick={() => void confirm()}>
                {messages.reset.submit}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Delete keeps the username reserved; the account can no longer sign in. The admin retypes the username to confirm. */
export function DeleteUserDialog({ user, onClose, onChanged }: DialogProps & { user: AdminUser }) {
  const typedId = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed === user.username;

  async function confirm() {
    if (busy || !confirmed) return;
    setBusy(true);
    setError(null);
    const result = await callApi('/api/admin/users/' + user.id, {
      method: 'PATCH',
      body: { status: 'deleted' },
    });
    setBusy(false);
    if (!result.ok) {
      setError(failureText(result));
      return;
    }
    onChanged(messages.admin.notice.deleted(user.username));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{messages.remove.title}</DialogTitle>
          <DialogDescription>{messages.remove.description(user.username)}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={typedId}>{messages.remove.typeHint}</Label>
            <Input
              id={typedId}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="font-mono"
            />
          </div>
          <ErrorLine message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {messages.cancel}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              className="text-red-800 dark:text-red-200"
              disabled={!confirmed || busy}
            >
              {messages.remove.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
