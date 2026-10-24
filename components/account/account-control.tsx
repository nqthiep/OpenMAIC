'use client';

import { useEffect, useRef, useState } from 'react';
import { KeyRound, LifeBuoy, LogIn, LogOut, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/hooks/use-i18n';
import { createLogger } from '@/lib/logger';
import { isBrowserPersistenceEnabled } from '@/lib/persistence/bootstrap';
import { SESSION_ENDED_EVENT } from '@/lib/persistence/session-end';
import { cn } from '@/lib/utils';
import {
  SUPPORT_OPEN_EVENT,
  SupportDialog,
  useSupportUnread,
} from '@/components/support/support-inbox';
import { AccountDialog } from './account-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import {
  fetchAccountSession,
  peekSharedSession,
  sessionChanged,
  signOut,
  signOutOtherSessions,
  type AccountSession,
} from './account-api';

const log = createLogger('AccountControl');

const TRIGGER_CLASS =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-gray-100/50 bg-white/60 px-2.5 text-sm font-medium text-gray-600 shadow-sm backdrop-blur-md transition-colors hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700/50 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100';

/**
 * Account entry for the header. It renders nothing unless browser persistence is
 * built in and the server reports accounts enabled. A failed session check also
 * renders nothing: the control is never offered on a guess. While the first answer is on its
 * way it holds the button's place, so the bar does not jump when the button arrives; a page
 * reached by a link starts from the last answer and has no wait at all.
 */
export function AccountControl() {
  const { t } = useI18n();
  // Undefined: no answer yet. Null: no control (persistence off, or the check failed).
  const [session, setSession] = useState<AccountSession | null | undefined>(peekSharedSession);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const signingOutOthersRef = useRef(false);
  const signInTriggerRef = useRef<HTMLButtonElement>(null);
  const [support, setSupport] = useState<{ open: boolean; subject?: string }>({ open: false });
  const [passwordOpen, setPasswordOpen] = useState(false);
  const learnerSignedIn =
    session?.authenticated === true && session.role !== 'operator' && session.role !== 'admin';
  const supportUnread = useSupportUnread(learnerSignedIn);

  // "Contact the admin" buttons elsewhere on the page open the dialog mounted here.
  useEffect(() => {
    if (!learnerSignedIn) return;
    const onOpen = (event: Event) =>
      setSupport({
        open: true,
        subject: (event as CustomEvent<{ subject?: string }>).detail?.subject,
      });
    window.addEventListener(SUPPORT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(SUPPORT_OPEN_EVENT, onOpen);
  }, [learnerSignedIn]);

  useEffect(() => {
    if (!isBrowserPersistenceEnabled()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no control to wait for
      setSession(null);
      return;
    }
    let active = true;
    fetchAccountSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((error: unknown) => {
        if (active) setSession(null);
        log.warn(
          'Account session check failed',
          error instanceof Error ? error.name : 'unknown error',
        );
      });
    return () => {
      active = false;
    };
  }, []);

  // A tab left open on another device learns that its session was revoked (sign out of other
  // devices), expired or disabled when the person comes back to it, not only at its next save.
  // Only a tab that believes it is signed in asks; a failed check changes nothing.
  const signedInRef = useRef(false);
  useEffect(() => {
    signedInRef.current = session?.authenticated === true;
  }, [session]);
  useEffect(() => {
    if (!isBrowserPersistenceEnabled()) return;
    const recheck = () => {
      if (document.visibilityState !== 'visible' || !signedInRef.current) return;
      fetchAccountSession()
        .then((next) => {
          if (!next.authenticated) window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
        })
        .catch(() => {});
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, []);

  // The server reports an ended session on any API request. Show the signed-out state and say why.
  useEffect(() => {
    const onSessionEnded = () => {
      setSession((current) =>
        current
          ? {
              enabled: current.enabled,
              registrationOpen: current.registrationOpen,
              authenticated: false,
            }
          : current,
      );
      sessionChanged();
      toast(t('account.errors.sessionEnded'));
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, [t]);

  if (session === undefined) {
    return (
      <span
        aria-hidden="true"
        className="h-9 w-9 shrink-0 rounded-full bg-gray-100/60 sm:w-24 dark:bg-gray-700/40"
      />
    );
  }
  if (!session?.enabled) return null;

  if (!session.authenticated) {
    return (
      <>
        <button
          ref={signInTriggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={dialogOpen}
          aria-label={t('account.trigger.signIn')}
          onClick={() => setDialogOpen(true)}
          className={cn(TRIGGER_CLASS, 'w-9 px-0 sm:w-auto sm:px-3')}
        >
          <LogIn className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('account.trigger.signIn')}</span>
        </button>
        <AccountDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          registrationOpen={session.registrationOpen}
          returnFocusTo={signInTriggerRef}
        />
      </>
    );
  }

  const username = session.account?.username ?? '';
  const role = session.role;
  const isStaff = role === 'operator' || role === 'admin';
  const membership = session.membership;

  const handleSignOut = () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    signOut()
      // To the home page, not a reload: a reload keeps the address, so signing out on /admin or
      // the workspace left the person on a page that is closed to them.
      .then(() => window.location.assign('/'))
      .catch((error: unknown) => {
        log.warn('Sign-out failed', error instanceof Error ? error.name : 'unknown error');
        signingOutRef.current = false;
        setSigningOut(false);
        toast.error(t('account.errors.generic'));
      });
  };

  const handleSignOutOthers = () => {
    if (signingOutOthersRef.current) return;
    signingOutOthersRef.current = true;
    signOutOtherSessions()
      .then(() => toast.success(t('account.signOutOthersDone')))
      .catch((error: unknown) => {
        log.warn(
          'Sign-out of other sessions failed',
          error instanceof Error ? error.name : 'unknown error',
        );
        toast.error(t('account.errors.generic'));
      })
      .finally(() => {
        signingOutOthersRef.current = false;
      });
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={
              supportUnread > 0
                ? `${t('account.accountMenu', { username })} · ${t('support.unreadCount', { count: supportUnread })}`
                : t('account.accountMenu', { username })
            }
            className={cn(TRIGGER_CLASS, 'relative w-9 px-0 lg:w-auto lg:px-3')}
          >
            <UserRound className="size-4" aria-hidden="true" />
            <span className="hidden max-w-[8rem] truncate lg:inline-block">{username}</span>
            {supportUnread > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"
              />
            ) : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="min-w-[200px] motion-reduce:animate-none"
        >
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="text-xs text-muted-foreground">{t('account.signedInAs')}</span>
            <span className="truncate text-sm font-medium text-foreground">{username}</span>
            {role ? (
              <span className="text-xs text-muted-foreground">{t(`account.roles.${role}`)}</span>
            ) : null}
            {isStaff ? null : (
              <span className="text-xs text-muted-foreground">
                {membership?.active
                  ? t('account.membership.active', {
                      date: new Date(membership.expiresAt).toLocaleDateString(),
                      quota: membership.monthlyQuota.toLocaleString(),
                    })
                  : t('account.membership.none')}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Places (home, catalog, community, dashboard) are links in the top bar; this menu
              keeps what belongs to the account. */}
          {isStaff ? (
            <DropdownMenuItem
              onSelect={() => window.location.assign('/admin#support')}
              className="cursor-pointer gap-2"
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              {t('support.panelTitle')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => setSupport({ open: true })}
              className="cursor-pointer gap-2"
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              <span className="flex-1">{t('support.contact')}</span>
              {supportUnread > 0 ? (
                <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white tabular-nums">
                  {supportUnread}
                </span>
              ) : null}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)} className="cursor-pointer gap-2">
            <KeyRound className="size-4" aria-hidden="true" />
            {t('account.password.title')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={signingOut}
            onSelect={handleSignOut}
            className="cursor-pointer gap-2"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t('account.signOut')}
          </DropdownMenuItem>
          {/* Apart from "sign out": a slip next to it would end the other devices' sessions. */}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={handleSignOutOthers}
            className="cursor-pointer gap-2 text-muted-foreground"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t('account.signOutOthers')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {learnerSignedIn ? (
        <SupportDialog
          open={support.open}
          initialSubject={support.subject}
          onOpenChange={(open) => setSupport({ open })}
        />
      ) : null}
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
