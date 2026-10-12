'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  AccountRequestError,
  changeAccountRole,
  disableAccount,
  enableAccount,
  fetchAccountSession,
  fetchAdminAccounts,
  type AccountRole,
  type AdminAccount,
} from '@/components/account/account-api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { isBrowserPersistenceEnabled } from '@/lib/persistence/bootstrap';

const log = createLogger('AccountAdminPanel');

/** Stays hidden until the first page loads, so a visitor who is not an administrator sees nothing. */
type PanelStatus = 'checking' | 'hidden' | 'shown';

interface AccountRow {
  readonly id: string;
  readonly username: string;
  readonly role: AccountRole;
  readonly createdAt: string;
  readonly disabled: boolean;
}

const ROLE_OPTIONS: readonly AccountRole[] = ['learner', 'operator', 'admin'];

function toRow(account: AdminAccount): AccountRow {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    createdAt: account.createdAt,
    disabled: account.disabledAt !== null,
  };
}

/** A 401 or 403 from an admin route means this visitor is not a signed-in administrator. */
function isNotAdministrator(error: unknown): boolean {
  return error instanceof AccountRequestError && (error.status === 401 || error.status === 403);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

function formatCreated(createdAt: string, locale: string): string {
  return new Date(createdAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Account list with disable and enable controls, shown beside the usage dashboard. It
 * renders nothing unless accounts are on, the visitor is signed in, and the admin list
 * answers. Each change waits for confirmation in a dialog.
 */
export function AccountAdminPanel() {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<PanelStatus>('checking');
  const [viewer, setViewer] = useState<string | undefined>(undefined);
  // Only an administrator changes roles. An operator sees the list and the disable control.
  const [isAdministrator, setIsAdministrator] = useState(false);
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [nextAfter, setNextAfter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState<AccountRow | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  // The control that opened the dialog. Focus returns to it when the dialog closes.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const reportListFailure = useCallback(
    (error: unknown) => {
      if (isNotAdministrator(error)) {
        setStatus('hidden');
        return;
      }
      log.warn('Account list request failed', errorName(error));
      setStatus('shown');
      toast.error(t('account.admin.errors.loadFailed'));
    },
    [t],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchAdminAccounts();
      setRows(page.accounts.map(toRow));
      setNextAfter(page.nextAfter);
      setStatus('shown');
    } catch (error) {
      reportListFailure(error);
    } finally {
      setLoading(false);
    }
  }, [reportListFailure]);

  useEffect(() => {
    if (!isBrowserPersistenceEnabled()) return;
    let active = true;
    fetchAccountSession()
      .then((session) => {
        if (!active) return;
        // An anonymous visitor, a deployment without accounts, or a learner makes no admin request.
        const administrator = session.role === 'admin' || session.administrator === true;
        const staff = administrator || session.role === 'operator';
        if (!session.enabled || !session.authenticated || !staff) {
          setStatus('hidden');
          return;
        }
        setIsAdministrator(administrator);
        setViewer(session.account?.username);
        void reload();
      })
      .catch((error: unknown) => {
        log.warn('Account session check failed', errorName(error));
        setStatus('hidden');
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const changeRole = async (row: AccountRow, role: AccountRole) => {
    if (role === row.role) return;
    try {
      await changeAccountRole(row.id, role);
      setRows(
        (current) =>
          current?.map((item) => (item.id === row.id ? { ...item, role } : item)) ?? null,
      );
      toast.success(t('account.admin.roleChanged'));
    } catch (error) {
      log.warn('Role change failed', errorName(error));
      toast.error(t('account.admin.errors.roleFailed'));
      // Reload so the select shows the role the server still has.
      void reload();
    }
  };

  const loadMore = async () => {
    if (nextAfter === null) return;
    setLoading(true);
    try {
      const page = await fetchAdminAccounts(nextAfter);
      setRows((current) => [...(current ?? []), ...page.accounts.map(toRow)]);
      setNextAfter(page.nextAfter);
    } catch (error) {
      reportListFailure(error);
    } finally {
      setLoading(false);
    }
  };

  const requestChange = (button: HTMLButtonElement, row: AccountRow) => {
    triggerRef.current = button;
    setPending(row);
    setDialogOpen(true);
  };

  const confirmChange = async () => {
    if (!pending || savingRef.current) return;
    const target = pending;
    const disable = !target.disabled;
    savingRef.current = true;
    setSaving(true);
    try {
      if (disable) await disableAccount(target.id);
      else await enableAccount(target.id);
      setRows(
        (current) =>
          current?.map((row) => (row.id === target.id ? { ...row, disabled: disable } : row)) ??
          null,
      );
    } catch (error) {
      log.warn('Account change failed', errorName(error));
      if (isNotAdministrator(error)) setStatus('hidden');
      toast.error(t('account.admin.errors.changeFailed'));
    } finally {
      savingRef.current = false;
      setSaving(false);
      setDialogOpen(false);
    }
  };

  if (status !== 'shown') return null;

  const disabling = pending !== null && !pending.disabled;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{t('account.admin.title')}</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void reload()}
          disabled={loading}
          className="shrink-0 gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t('account.admin.refresh')}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t('account.admin.description')}</p>

      {rows?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('account.admin.empty')}</p>
      ) : null}

      {rows && rows.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 basis-40">
                <p className="break-all text-sm font-medium">{row.username}</p>
                <p className="text-xs text-muted-foreground">
                  {t('account.admin.created', { date: formatCreated(row.createdAt, locale) })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {isAdministrator && row.username !== viewer ? (
                  <select
                    aria-label={t('account.admin.changeRoleLabel', { username: row.username })}
                    value={row.role}
                    onChange={(event) => void changeRole(row, event.target.value as AccountRole)}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {t(`account.roles.${role}`)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Badge variant="outline">{t(`account.roles.${row.role}`)}</Badge>
                )}
                <Badge variant={row.disabled ? 'destructive' : 'secondary'}>
                  {t(
                    row.disabled ? 'account.admin.status.disabled' : 'account.admin.status.active',
                  )}
                </Badge>
                {row.username === viewer ? (
                  <span className="text-xs text-muted-foreground">{t('account.admin.you')}</span>
                ) : isAdministrator || row.role !== 'admin' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t(
                      row.disabled ? 'account.admin.enableLabel' : 'account.admin.disableLabel',
                      { username: row.username },
                    )}
                    onClick={(event) => requestChange(event.currentTarget, row)}
                  >
                    {t(row.disabled ? 'account.admin.enable' : 'account.admin.disable')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {nextAfter !== null ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loading}>
            {t('account.admin.loadMore')}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !savingRef.current) setDialogOpen(false);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending &&
                t(
                  pending.disabled
                    ? 'account.admin.confirm.enableTitle'
                    : 'account.admin.confirm.disableTitle',
                  { username: pending.username },
                )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                disabling
                  ? 'account.admin.confirm.disableDescription'
                  : 'account.admin.confirm.enableDescription',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant={disabling ? 'destructive' : 'default'}
              disabled={saving}
              onClick={() => void confirmChange()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t(
                disabling
                  ? 'account.admin.confirm.disableAction'
                  : 'account.admin.confirm.enableAction',
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
