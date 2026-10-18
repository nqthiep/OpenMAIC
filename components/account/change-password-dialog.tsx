'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
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
import { AccountRequestError, changePassword } from './account-api';

/**
 * Changes the signed-in account's password. A temporary password from staff is changed here too.
 * Other devices are signed out by the server; this one stays signed in.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const close = (value: boolean) => {
    if (busy) return;
    if (!value) {
      setCurrent('');
      setNext('');
      setConfirm('');
      setFailure(null);
    }
    onOpenChange(value);
  };

  const messageFor = (error: unknown): string => {
    if (!(error instanceof AccountRequestError)) return t('account.errors.generic');
    switch (error.errorCode) {
      case 'INVALID_CREDENTIALS':
        return t('account.password.wrongCurrent');
      case 'PASSWORD_INVALID':
        return t('account.errors.passwordInvalid');
      case 'RATE_LIMITED':
        return error.retryAfterSeconds === undefined
          ? t('account.errors.rateLimitedLater')
          : t('account.errors.rateLimited', {
              minutes: Math.max(1, Math.ceil(error.retryAfterSeconds / 60)),
            });
      default:
        return t('account.errors.generic');
    }
  };

  const submit = async () => {
    if (next !== confirm) {
      setFailure(t('account.password.mismatch'));
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      await changePassword(current, next);
      toast.success(t('account.password.changed'));
      setBusy(false);
      close(false);
    } catch (error) {
      setFailure(messageFor(error));
      setBusy(false);
    }
  };

  const field = (
    key: string,
    label: string,
    value: string,
    set: (v: string) => void,
    autoComplete: string,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input
        id={`${id}-${key}`}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => set(event.target.value)}
        required
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('account.password.title')}</DialogTitle>
            <DialogDescription>{t('account.password.description')}</DialogDescription>
          </DialogHeader>
          {field('current', t('account.password.current'), current, setCurrent, 'current-password')}
          {field('new', t('account.password.new'), next, setNext, 'new-password')}
          <p className="-mt-2 text-xs text-muted-foreground">{t('account.hints.password')}</p>
          {field('confirm', t('account.password.confirm'), confirm, setConfirm, 'new-password')}
          <p role="alert" className="min-h-4 text-xs text-destructive">
            {failure}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('account.password.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
