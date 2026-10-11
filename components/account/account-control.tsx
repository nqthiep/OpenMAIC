'use client';

import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
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
import { AccountDialog } from './account-dialog';
import { fetchAccountSession, signOut, type AccountSession } from './account-api';

const log = createLogger('AccountControl');

const TRIGGER_CLASS =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-gray-100/50 bg-white/60 px-2.5 text-sm font-medium text-gray-600 shadow-sm backdrop-blur-md transition-colors hover:bg-white hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:border-gray-700/50 dark:bg-gray-800/60 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100';

/**
 * Account entry for the header. It renders nothing unless browser persistence is
 * built in and the server reports accounts enabled. A failed session check also
 * renders nothing: the control is never offered on a guess.
 */
export function AccountControl() {
  const { t } = useI18n();
  const [session, setSession] = useState<AccountSession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);
  const signInTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isBrowserPersistenceEnabled()) return;
    let active = true;
    fetchAccountSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((error: unknown) => {
        log.warn(
          'Account session check failed',
          error instanceof Error ? error.name : 'unknown error',
        );
      });
    return () => {
      active = false;
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
      toast(t('account.errors.sessionEnded'));
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, [t]);

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

  const handleSignOut = () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    signOut()
      .then(() => window.location.reload())
      .catch((error: unknown) => {
        log.warn('Sign-out failed', error instanceof Error ? error.name : 'unknown error');
        signingOutRef.current = false;
        setSigningOut(false);
        toast.error(t('account.errors.generic'));
      });
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('account.accountMenu', { username })}
          className={cn(TRIGGER_CLASS, 'w-9 px-0 sm:w-auto sm:px-3')}
        >
          <UserRound className="size-4" aria-hidden="true" />
          <span className="hidden max-w-[8rem] truncate sm:inline-block">{username}</span>
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
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={handleSignOut}
          className="cursor-pointer gap-2"
        >
          <LogOut className="size-4" aria-hidden="true" />
          {t('account.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
