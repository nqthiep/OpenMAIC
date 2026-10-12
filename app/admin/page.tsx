'use client';

import { useEffect, useState } from 'react';
import { fetchAccountSession, type AccountSession } from '@/components/account/account-api';
import { AccountAdminPanel } from '@/components/settings/account-admin-panel';
import { UsageDashboard } from '@/components/settings/usage-dashboard';
import {
  AuditPanel,
  ClassesPanel,
  MembershipPanel,
  PreviewsPanel,
  SharesPanel,
} from '@/components/learning/admin-panels';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * Administration for operators and administrators: usage, accounts, memberships, share requests,
 * free previews, classes and the audit log. The page only lays out the panels. Each panel is
 * checked again by the server on its own requests.
 */
export default function AdminPage() {
  const { t } = useI18n();
  const [session, setSession] = useState<AccountSession | null>(null);

  useEffect(() => {
    fetchAccountSession()
      .then(setSession)
      .catch(() => setSession({ enabled: false, registrationOpen: false, authenticated: false }));
  }, []);

  if (!session) return null;

  const staff = session.role === 'operator' || session.role === 'admin';
  if (!session.enabled || !session.authenticated || !staff) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t('account.adminPage.denied')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('account.adminPage.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.adminPage.description')}</p>
      </header>
      <UsageDashboard />
      <AccountAdminPanel />
      <MembershipPanel />
      <SharesPanel />
      <PreviewsPanel />
      <ClassesPanel />
      <AuditPanel />
    </main>
  );
}
