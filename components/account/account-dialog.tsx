'use client';

import { useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { LoaderCircle } from 'lucide-react';
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
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { AccountRequestError, createAccount, signIn, type AccountCredentials } from './account-api';

type Mode = 'signIn' | 'create';
type Field = 'username' | 'password';

interface Failure {
  readonly message: string;
  /** Set when the server rejected one field, so that field is marked invalid. */
  readonly field?: Field;
}

interface AccountDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Whether the server accepts new accounts. When false only sign-in is offered. */
  readonly registrationOpen: boolean;
  /**
   * Element that receives focus when the dialog closes. Set explicitly because
   * focus is not always on the trigger when it opens (Safari does not focus a
   * button on mouse click).
   */
  readonly returnFocusTo?: RefObject<HTMLElement | null>;
}

const MODES: readonly Mode[] = ['signIn', 'create'];

function joinIds(...ids: Array<string | false | undefined>): string | undefined {
  return ids.filter(Boolean).join(' ') || undefined;
}

export function AccountDialog({
  open,
  onOpenChange,
  registrationOpen,
  returnFocusTo,
}: AccountDialogProps) {
  const { t } = useI18n();
  const idBase = useId();
  const usernameId = `${idBase}-username`;
  const passwordId = `${idBase}-password`;
  const usernameHintId = `${idBase}-username-hint`;
  const passwordHintId = `${idBase}-password-hint`;
  const errorId = `${idBase}-error`;

  const [mode, setMode] = useState<Mode>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  // State updates land after the event, so a second activation can slip past
  // the disabled button. The ref closes that window.
  const pendingRef = useRef(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  const activeMode: Mode = registrationOpen ? mode : 'signIn';
  const creating = activeMode === 'create';
  const usernameInvalid = failure?.field === 'username';
  const passwordInvalid = failure?.field === 'password';

  function describeFailure(caught: unknown): Failure {
    if (!(caught instanceof AccountRequestError)) {
      return { message: t('account.errors.generic') };
    }
    switch (caught.errorCode) {
      case 'USERNAME_INVALID':
        return { field: 'username', message: t('account.errors.usernameInvalid') };
      case 'USERNAME_TAKEN':
        return { field: 'username', message: t('account.errors.usernameTaken') };
      case 'PASSWORD_INVALID':
        return { field: 'password', message: t('account.errors.passwordInvalid') };
      case 'INVALID_CREDENTIALS':
        return { message: t('account.errors.invalidCredentials') };
      case 'RATE_LIMITED': {
        const seconds = caught.retryAfterSeconds;
        if (seconds === undefined) return { message: t('account.errors.rateLimitedLater') };
        const minutes = Math.max(1, Math.ceil(seconds / 60));
        return { message: t('account.errors.rateLimited', { minutes }) };
      }
      case 'REGISTRATION_DISABLED':
        return { message: t('account.errors.registrationDisabled') };
      case 'ACCOUNTS_NOT_CONFIGURED':
        return { message: t('account.errors.notConfigured') };
      case 'INVALID_REQUEST':
        return { message: t('account.errors.invalidRequest') };
      case 'INTERNAL_ERROR':
        return { message: t('account.errors.internal') };
      default:
        // An unrecognised code: the server's English text is the only description.
        return { message: caught.serverMessage || t('account.errors.generic') };
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    // The submit button is about to become disabled. Moving focus first stops
    // it from landing on <body>, which is outside the dialog's focus trap.
    if (document.activeElement === submitRef.current) passwordRef.current?.focus();
    setFailure(null);
    setPending(true);
    const credentials: AccountCredentials = { username: username.trim(), password };
    try {
      if (creating) await createAccount(credentials);
      else await signIn(credentials);
      // The page's learner identity is fixed for its lifetime, so the reload is
      // where the account's partition takes effect. `pending` stays set until
      // the page is replaced.
      window.location.reload();
    } catch (caught) {
      const next = describeFailure(caught);
      pendingRef.current = false;
      setPending(false);
      setFailure(next);
      (next.field === 'username' ? usernameRef : passwordRef).current?.focus();
    }
  }

  function editField(field: Field, value: string) {
    if (field === 'username') setUsername(value);
    else setPassword(value);
    // A field error clears when that field changes. General errors stay visible.
    setFailure((current) => (current?.field === field ? null : current));
  }

  function selectMode(next: Mode) {
    if (pending || next === activeMode) return;
    setMode(next);
    setFailure(null);
  }

  function handleOpenChange(next: boolean) {
    // A request in flight keeps the dialog open. A sign-in that succeeds after
    // the dialog closed would otherwise skip the reload that applies it.
    if (!next && pendingRef.current) return;
    if (!next) {
      setPassword('');
      setFailure(null);
      setMode('signIn');
    }
    onOpenChange(next);
  }

  const submitLabel = creating
    ? pending
      ? t('account.submit.creating')
      : t('account.submit.create')
    : pending
      ? t('account.submit.signingIn')
      : t('account.submit.signIn');

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-modal="true"
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-sm gap-5 motion-reduce:animate-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          usernameRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusTo?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {creating ? t('account.dialog.createTitle') : t('account.dialog.signInTitle')}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? t('account.dialog.createDescription')
              : t('account.dialog.signInDescription')}
          </DialogDescription>
        </DialogHeader>

        {registrationOpen && (
          <div
            role="group"
            aria-label={t('account.modesLabel')}
            className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
          >
            {MODES.map((option) => {
              const selected = activeMode === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  disabled={pending}
                  onClick={() => selectMode(option)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                    selected
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option === 'create' ? t('account.modes.create') : t('account.modes.signIn')}
                </button>
              );
            })}
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} aria-busy={pending || undefined}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={usernameId}>{t('account.fields.username')}</Label>
              <Input
                ref={usernameRef}
                id={usernameId}
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(event) => editField('username', event.target.value)}
                aria-invalid={usernameInvalid || undefined}
                aria-describedby={joinIds(usernameHintId, usernameInvalid && errorId)}
              />
              <p id={usernameHintId} className="text-xs text-muted-foreground">
                {t('account.hints.username')}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={passwordId}>{t('account.fields.password')}</Label>
              <Input
                ref={passwordRef}
                id={passwordId}
                name="password"
                type="password"
                autoComplete={creating ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => editField('password', event.target.value)}
                aria-invalid={passwordInvalid || undefined}
                aria-describedby={joinIds(passwordHintId, passwordInvalid && errorId)}
              />
              <p id={passwordHintId} className="text-xs text-muted-foreground">
                {t('account.hints.password')}
              </p>
            </div>
          </div>

          {/* Always mounted so that screen readers announce messages added to it. */}
          <p id={errorId} role="alert" className="mt-3 text-sm text-destructive empty:mt-0">
            {failure?.message}
          </p>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button ref={submitRef} type="submit" disabled={pending}>
              {pending && (
                <LoaderCircle
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
