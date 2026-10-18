'use client';

import { useRef, useState } from 'react';
import { ArrowRight, Lock, MessagesSquare, Trophy } from 'lucide-react';
import { AccountDialog } from '@/components/account/account-dialog';
import { ChallengeBoard } from '@/components/community/challenge';
import { CommunityFeed } from '@/components/community/community';
import { AccessRequest } from '@/components/home/access-request';
import { GLASS, Reveal, SiteShell } from '@/components/home/site-shell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { useMembershipStatus } from '@/lib/home/use-membership-status';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import { cn } from '@/lib/utils';

type CommunityTab = 'questions' | 'challenges';

const TABS: { id: CommunityTab; icon: typeof Trophy }[] = [
  { id: 'questions', icon: MessagesSquare },
  { id: 'challenges', icon: Trophy },
];

/**
 * The community: questions members asked on the slides of open courses, and the weekly
 * challenges. Every signed-in account reads it; members ask, answer, submit and vote. It shares
 * the catalog's frame (blue band, glass panels, the same membership request), and keeps the tab in
 * `?tab=` so a link can open the challenges.
 */
export default function CommunityPage() {
  const { t } = useI18n();
  useDocumentTitle(t('community.title'));
  const session = useAccountSession();
  const membershipStatus = useMembershipStatus();
  const [dialogOpen, setDialogOpen] = useState(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<CommunityTab>(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('tab') === 'challenges'
      ? 'challenges'
      : 'questions',
  );

  const choose = (next: CommunityTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  };

  const signedIn = session?.authenticated === true;
  const staff = session?.role === 'operator' || session?.role === 'admin';
  const member = session?.membership?.active === true || staff;

  return (
    <SiteShell mainClassName="gap-10 pb-20 pt-10 md:pt-14" bandClassName="h-[300px] md:h-[320px]">
      <Reveal className="flex flex-col gap-3">
        <h1 className="pb-1 text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          {t('community.title')}
        </h1>
        <p className="max-w-2xl text-sm text-white/85 md:text-base">
          {/* Tabs exist only for a signed-in visitor, and `signedIn` is false until the session loads, so the server HTML and the first client render agree. */}
          {t(
            signedIn && tab === 'challenges'
              ? 'community.challengeDescription'
              : 'community.description',
          )}
        </p>
      </Reveal>

      {session === undefined ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : !signedIn ? (
        <Reveal>
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 md:p-6',
              GLASS,
            )}
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <Lock className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">{t('community.signIn')}</p>
            </div>
            <Button
              onClick={(event) => {
                returnFocusTo.current = event.currentTarget;
                setDialogOpen(true);
              }}
              className="cursor-pointer"
            >
              {t('home.guest.signIn')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </Reveal>
      ) : (
        <>
          {!member ? (
            <Reveal>
              <AccessRequest
                kind={membershipStatus.notice.kind}
                reason={t('community.join.title')}
              />
            </Reveal>
          ) : null}
          <Reveal>
            <Tabs
              value={tab}
              onValueChange={(value) => choose(value as CommunityTab)}
              className="gap-6"
            >
              <TabsList className="h-auto flex-wrap justify-start rounded-2xl group-data-horizontal/tabs:h-auto bg-white p-1.5 shadow-md shadow-brand-800/[0.06] dark:bg-slate-900/70">
                {TABS.map(({ id, icon: Icon }) => (
                  <TabsTrigger
                    key={id}
                    value={id}
                    className="h-9 flex-none rounded-xl px-3.5 data-active:bg-brand-600 data-active:text-white dark:data-active:bg-brand-600 dark:data-active:text-white"
                  >
                    <Icon aria-hidden="true" />
                    {t(`community.tabs.${id}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value="questions">
                <CommunityFeed />
              </TabsContent>
              <TabsContent value="challenges">
                <ChallengeBoard />
              </TabsContent>
            </Tabs>
          </Reveal>
        </>
      )}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        registrationOpen={session?.registrationOpen ?? false}
        returnFocusTo={returnFocusTo}
      />
    </SiteShell>
  );
}
