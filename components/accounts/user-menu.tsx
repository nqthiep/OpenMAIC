'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  accountChangedElsewhere,
  endAccountSession,
  prepareAccountSwitch,
} from '@/lib/accounts/client-state';

import { callApi } from './api';
import { type AccountRole, messages } from './messages';

/** The signed-in account as the menu shows it. */
export interface MenuAccount {
  id: string;
  username: string;
  displayName: string;
  role: AccountRole;
  mustChangePassword: boolean;
}

export type MenuEntry =
  | { kind: 'link'; href: string; label: string }
  | { kind: 'sign-out'; label: string };

/**
 * The menu's items. The admin page is offered only to an administrator who is
 * not due to change a password first: that page sends such a session back.
 */
export function menuEntries(account: MenuAccount): MenuEntry[] {
  const entries: MenuEntry[] = [
    { kind: 'link', href: '/account', label: messages.userMenu.account },
  ];
  if (account.role === 'admin' && !account.mustChangePassword) {
    entries.push({ kind: 'link', href: '/admin', label: messages.userMenu.admin });
  }
  entries.push({ kind: 'sign-out', label: messages.userMenu.signOut });
  return entries;
}

function nameOf(account: MenuAccount): string {
  return account.displayName.trim() || account.username;
}

/** The letter in the trigger: the first character of the name, whole code point. */
function initialOf(account: MenuAccount): string {
  const [first] = [...nameOf(account)];
  return (first ?? '?').toLocaleUpperCase('vi-VN');
}

/** The trigger and its menu. A small button fixed at the bottom left, away from the top-right controls. */
export function AccountMenu({
  account,
  onSignOut,
}: {
  account: MenuAccount;
  onSignOut: () => void;
}) {
  const name = nameOf(account);
  return (
    <div className="fixed bottom-4 left-4 z-40">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={messages.userMenu.trigger(name)}
            title={name}
            className="flex h-10 w-10 items-center justify-center rounded-full border bg-background/90 text-sm font-semibold text-foreground shadow-md backdrop-blur-md transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {initialOf(account)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-56">
          <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {account.username}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {menuEntries(account).map((entry) =>
            entry.kind === 'link' ? (
              <DropdownMenuItem key={entry.href} asChild>
                <Link href={entry.href}>{entry.label}</Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem key="sign-out" onSelect={onSignOut}>
                {entry.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface MeResponse {
  user: { id: string; username: string; displayName: string; role: AccountRole };
  mustChangePassword: boolean;
}

/**
 * The account menu of the header, shown only when accounts are on. The layout
 * says whether a session cookie is present; the account itself comes from
 * `/api/auth/me`, so nothing is requested without a cookie. When the account
 * differs from the one this browser last served, the previous account's local
 * state is cleared and the page reloads, so nothing of it stays in memory. A
 * change of account in another tab reloads this one too.
 */
export function UserMenu({ hasSessionCookie }: { hasSessionCookie: boolean }) {
  const [account, setAccount] = useState<MenuAccount | null>(null);
  const accountId = account?.id;

  useEffect(() => {
    if (!hasSessionCookie) return;
    let active = true;
    void (async () => {
      const result = await callApi<MeResponse>('/api/auth/me');
      if (!active || !result.ok) return;
      const next: MenuAccount = {
        id: result.data.user.id,
        username: result.data.user.username,
        displayName: result.data.user.displayName,
        role: result.data.user.role,
        mustChangePassword: result.data.mustChangePassword,
      };
      setAccount(next);
      const switched = await prepareAccountSwitch(next.id);
      if (active && switched === 'switched') window.location.reload();
    })();
    return () => {
      active = false;
    };
  }, [hasSessionCookie]);

  useEffect(() => {
    if (accountId === undefined) return;
    const onStorage = (event: StorageEvent) => {
      if (accountChangedElsewhere(event, accountId)) window.location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [accountId]);

  if (!account) return null;
  return (
    <AccountMenu
      account={account}
      onSignOut={() => {
        void endAccountSession({
          revoke: () => callApi('/api/auth/logout', { method: 'POST' }),
          leave: () => window.location.assign('/login'),
        });
      }}
    />
  );
}
