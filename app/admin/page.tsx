'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  Loader2,
  RefreshCw,
  ScrollText,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BRAND_GRADIENT, BrandDecor } from '@/components/home/brand-band';
import { GLASS } from '@/components/home/site-shell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountAdminPanel } from '@/components/settings/account-admin-panel';
import { UsageDashboard } from '@/components/settings/usage-dashboard';
import {
  AuditPanel,
  ClassesPanel,
  CoursesPanel,
  AccessRequestsPanel,
  MembershipPanel,
  PreviewsPanel,
  ProviderStatusPanel,
  SharesPanel,
} from '@/components/learning/admin-panels';
import {
  fetchOpsHealth,
  fetchServerProviders,
  type ProviderKind,
} from '@/components/learning/learning-api';
import { OpsOverview } from '@/components/learning/ops-overview';
import { deriveAlerts, waitingByTab, type OpsHealth, type OpsTab } from '@/lib/admin/ops-alerts';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { SupportInboxPanel } from '@/components/support/support-inbox';
import { CommunityReportsPanel } from '@/components/community/community';
import { ChallengeAdminPanel, ChallengeSettingsPanel } from '@/components/community/challenge';
import { RemixSettingsPanel } from '@/components/community/remix';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const TABS: { id: OpsTab; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'support', icon: LifeBuoy },
  { id: 'content', icon: FolderOpen },
  { id: 'system', icon: Activity },
  { id: 'audit', icon: ScrollText },
];

function tabFromHash(): OpsTab {
  const id = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return TABS.some((tab) => tab.id === id) ? (id as OpsTab) : 'overview';
}

/**
 * The operations dashboard for operators and administrators, in tabs. Overview says what needs a
 * person now (overdue requests, learners blocked by their allowance, expiring memberships, no AI
 * provider, a quiet deployment), then shows the system in diagrams; each alert and diagram opens
 * the tab and scrolls to the panel where it is handled. The tab is kept in the URL hash so a link
 * can open it. Each panel is checked again by the server on its own requests.
 */
export default function AdminPage() {
  const { t } = useI18n();
  const session = useAccountSession();
  const staff = session?.role === 'operator' || session?.role === 'admin';
  const allowed = Boolean(session?.enabled && session.authenticated && staff);
  const [tab, setTab] = useState<OpsTab>('overview');
  const [health, setHealth] = useState<OpsHealth | null>(null);
  const [providers, setProviders] = useState<Record<ProviderKind, string[]> | null>(null);
  const [loading, setLoading] = useState(false);
  // The panel a diagram asked for, scrolled to once its tab has rendered.
  const [focus, setFocus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [next, byKind] = await Promise.all([
        fetchOpsHealth(),
        fetchServerProviders().catch(() => null),
      ]);
      setHealth(next);
      setProviders(byKind);
    } catch {
      // The overview shows its loading line; the other tabs load on their own.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    setTab(tabFromHash());
    void refresh();
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [allowed, refresh]);

  useEffect(() => {
    if (!focus) return;
    document.getElementById(focus)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setFocus(null);
  }, [focus, tab]);

  const open = (next: OpsTab, anchor?: string) => {
    setTab(next);
    setFocus(anchor ?? null);
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', next === 'overview' ? pathname + search : `#${next}`);
    // Decisions taken in the other tabs change the counts; read them again on the way back.
    if (next === 'overview') void refresh();
  };

  if (session === undefined) return null;

  if (!allowed || !session) {
    return (
      <main className="mx-auto max-w-md px-5 py-16">
        <div className={cn('flex flex-col items-center gap-4 rounded-3xl p-8 text-center', GLASS)}>
          <ShieldAlert className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm">{t('account.adminPage.denied')}</p>
          {!session?.authenticated ? (
            <p className="text-xs text-muted-foreground">{t('account.adminPage.deniedSignIn')}</p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/">{t('classroom.backToHome')}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/catalog">{t('catalog.title')}</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 md:px-8">
      <header
        className={cn(
          'relative overflow-hidden rounded-3xl border border-brand-teal/30 px-8 py-8 text-white shadow-xl shadow-brand-900/20',
          BRAND_GRADIENT,
        )}
      >
        <div aria-hidden="true">
          <BrandDecor compact />
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{t('account.adminPage.title')}</h1>
              {session.role ? (
                <Badge variant="secondary">{t(`account.roles.${session.role}`)}</Badge>
              ) : null}
            </div>
            <p className="max-w-xl text-sm text-white/85">{t('account.adminPage.description')}</p>
          </div>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(value) => open(value as OpsTab)} className="gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="h-auto flex-wrap justify-start rounded-2xl group-data-horizontal/tabs:h-auto bg-white p-1.5 shadow-md shadow-brand-800/[0.06] dark:bg-slate-900/70">
            {TABS.map(({ id, icon: Icon }) => {
              const waiting = health ? (waitingByTab(health)[id] ?? 0) : 0;
              const urgent =
                id === 'overview' && health
                  ? deriveAlerts(
                      health,
                      providers ? providers.providers.length : null,
                      new Date(),
                    ).filter((alert) => alert.severity === 'critical').length
                  : 0;
              const badge = id === 'overview' ? urgent : waiting;
              return (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="h-9 flex-none rounded-xl px-3.5 data-active:bg-brand-600 data-active:text-white dark:data-active:bg-brand-600 dark:data-active:text-white"
                >
                  <Icon aria-hidden="true" />
                  {t(`admin.ops.tabs.${id}`)}
                  {badge > 0 ? (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-5 text-white',
                          id === 'overview' ? 'bg-red-600' : 'bg-amber-500',
                        )}
                      >
                        {badge}
                      </span>
                      <span className="sr-only">{t('admin.ops.tabs.badge', { count: badge })}</span>
                    </>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {t('admin.ops.refresh')}
          </Button>
        </div>
        <TabsContent value="overview">
          {health ? (
            <OpsOverview health={health} providers={providers} onOpen={open} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('admin.ops.loading')}</p>
          )}
        </TabsContent>
        <TabsContent value="support" className="flex flex-col gap-8">
          <SupportInboxPanel />
          <AccessRequestsPanel />
          <MembershipPanel />
          <div id="ops-accounts" className={cn('scroll-mt-6 rounded-3xl p-6', GLASS)}>
            <AccountAdminPanel />
          </div>
        </TabsContent>
        <TabsContent value="content" className="flex flex-col gap-8">
          <CommunityReportsPanel />
          <ChallengeAdminPanel />
          <SharesPanel />
          <CoursesPanel />
          <ClassesPanel />
          <PreviewsPanel />
        </TabsContent>
        <TabsContent value="system" className="flex flex-col gap-8">
          <ProviderStatusPanel />
          <ChallengeSettingsPanel />
          <RemixSettingsPanel />
          <section id="ops-usage" className={cn('scroll-mt-6 rounded-3xl p-6', GLASS)}>
            <UsageDashboard />
          </section>
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </main>
  );
}
