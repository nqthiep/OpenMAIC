import Link from 'next/link';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { messages } from './messages';

/** The frame of the account pages: one column, 768 px and wider. */
export function AccountShell({
  title,
  wide = false,
  showHomeLink = true,
  children,
}: {
  title: string;
  wide?: boolean;
  showHomeLink?: boolean;
  children: ReactNode;
}) {
  const width = wide ? 'max-w-6xl' : 'max-w-2xl';
  return (
    <main lang="vi-VN" className="bg-background text-foreground min-h-dvh">
      <header className="border-b">
        <div className={cn('mx-auto flex items-center justify-between px-6 py-4', width)}>
          <Link
            href="/"
            className="rounded-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            {messages.appName}
          </Link>
          {showHomeLink && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/">{messages.goHome}</Link>
            </Button>
          )}
        </div>
      </header>
      <div className={cn('mx-auto px-6 py-8', width)}>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** What a signed-in user who is not an administrator sees on the administration page. */
export function ForbiddenPanel({ username }: { username: string }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <p className="text-sm">{messages.forbidden.body(username)}</p>
      <p className="text-sm text-muted-foreground">{messages.forbidden.help}</p>
      <div>
        <Button asChild variant="outline">
          <Link href="/account">{messages.forbidden.toAccount}</Link>
        </Button>
      </div>
    </section>
  );
}
