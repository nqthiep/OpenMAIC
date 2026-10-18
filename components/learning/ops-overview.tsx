'use client';

import {
  ArrowRight,
  CircleCheck,
  CircleMinus,
  GraduationCap,
  Info,
  KeyRound,
  OctagonAlert,
  Share2,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import {
  deriveAlerts,
  QUOTA_NEAR,
  type AlertSeverity,
  type OpsHealth,
  type OpsTab,
} from '@/lib/admin/ops-alerts';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { PROVIDER_KINDS, type ProviderKind } from './learning-api';

/** Opens a tab and, when given, scrolls to the panel with that element id. */
export type OpenDetail = (tab: OpsTab, anchor?: string) => void;

/** Status colours: the same four steps in light and dark, always shown with an icon and a label. */
const SEVERITY: Record<AlertSeverity, { icon: LucideIcon; tone: string; row: string }> = {
  critical: {
    icon: OctagonAlert,
    tone: 'text-red-600 dark:text-red-400',
    row: 'border-red-200 bg-red-50/70 dark:border-red-500/30 dark:bg-red-500/10',
  },
  warning: {
    icon: TriangleAlert,
    tone: 'text-amber-600 dark:text-amber-400',
    row: 'border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10',
  },
  info: {
    icon: Info,
    tone: 'text-brand-600 dark:text-brand-300',
    row: 'border-brand-100 bg-brand-50/60 dark:border-white/10 dark:bg-white/5',
  },
};

/** Where each alert is handled. */
const ALERT_ANCHOR: Record<string, string> = {
  noProviders: 'ops-providers',
  quotaOver: 'ops-members',
  accessRequestsOverdue: 'ops-access-requests',
  accessRequestsPending: 'ops-access-requests',
  quotaNear: 'ops-members',
  expiringSoon: 'ops-members',
  sharesOverdue: 'ops-shares',
  sharesPending: 'ops-shares',
  expired: 'ops-members',
  quiet: 'ops-usage',
};

function compact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/**
 * One diagram. With `onOpen` the whole card is a control that opens the detail behind it, so an
 * operator goes from "what" to "where to act" in one click.
 */
function Card({
  title,
  description,
  onOpen,
  className,
  children,
}: {
  title: string;
  description?: string;
  onOpen?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <section
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      className={cn(
        'group/card flex flex-col gap-4 rounded-3xl p-6 text-left',
        GLASS,
        onOpen &&
          'cursor-pointer transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:border-brand-400/50',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <SectionTitle>{title}</SectionTitle>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {onOpen ? (
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-600 opacity-70 transition group-hover/card:opacity-100 dark:text-brand-300">
            {t('admin.ops.details')}
            <ArrowRight className="size-3.5 transition group-hover/card:translate-x-0.5" />
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Horizontal bars for a few named magnitudes, one hue, value printed at the end of each bar. */
function Bars({
  rows,
}: {
  rows: readonly { key: string; label: string; value: number; fill?: string; note?: string }[];
}) {
  const { locale } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate text-muted-foreground" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 rounded-full bg-muted">
            <span
              className={cn(
                'block h-full rounded-full',
                r.fill ?? 'bg-brand-600 dark:bg-brand-400',
              )}
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value > 0 ? 4 : 0 }}
            />
          </span>
          <span className="text-right font-semibold tabular-nums">
            {r.value.toLocaleString(locale)}
            {r.note ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">{r.note}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── What needs a person now ─────────────────────────────────────────────────

function AttentionList({
  health,
  llmProviders,
  onOpen,
}: {
  health: OpsHealth;
  llmProviders: number | null;
  onOpen: OpenDetail;
}) {
  const { t } = useI18n();
  const alerts = deriveAlerts(health, llmProviders, new Date());
  return (
    <Card title={t('admin.ops.attention.title')} description={t('admin.ops.attention.description')}>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          {t('admin.ops.attention.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => {
            const { icon: Icon, tone, row } = SEVERITY[alert.severity];
            const names = alert.names
              ? alert.names.join(', ') + (alert.count > alert.names.length ? ', …' : '')
              : '';
            return (
              <li
                key={alert.id}
                className={cn('flex items-center gap-3 rounded-2xl border px-4 py-3', row)}
              >
                <Icon className={cn('size-5 shrink-0', tone)} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('text-xs font-semibold uppercase tracking-wide', tone)}>
                    {t(`admin.ops.severity.${alert.severity}`)}
                  </span>
                  <span className="text-sm text-foreground">
                    {t(`admin.ops.alerts.${alert.id}`, {
                      count: alert.count,
                      hours: alert.hours ?? 0,
                    })}
                  </span>
                  {names ? (
                    <span className="break-all text-xs text-muted-foreground">{names}</span>
                  ) : null}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpen(alert.tab, ALERT_ANCHOR[alert.id])}
                >
                  {t(`admin.ops.attention.open.${alert.tab}`)}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function CountTiles({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t, locale } = useI18n();
  const { counts } = health;
  // One tint per count, whole class names for Tailwind: blue for people, warm tints for what waits.
  const tiles: {
    label: string;
    value: number;
    icon: LucideIcon;
    tab: OpsTab;
    anchor: string;
    tile: string;
    card: string;
  }[] = [
    {
      label: t('account.adminPage.summary.activeMembers'),
      value: counts.activeMembers,
      icon: Users,
      tab: 'support',
      anchor: 'ops-members',
      tile: 'bg-brand-600 shadow-brand-600/30',
      card: 'from-brand-50 border-brand-100',
    },
    {
      label: t('account.adminPage.summary.pendingAccessRequests'),
      value: counts.pendingAccessRequests,
      icon: KeyRound,
      tab: 'support',
      anchor: 'ops-access-requests',
      tile: 'bg-rose-500 shadow-rose-500/30',
      card: 'from-rose-50 border-rose-100',
    },
    {
      label: t('account.adminPage.summary.pendingShares'),
      value: counts.pendingShares,
      icon: Share2,
      tab: 'content',
      anchor: 'ops-shares',
      tile: 'bg-amber-500 shadow-amber-500/30',
      card: 'from-amber-50 border-amber-100',
    },
    {
      label: t('account.adminPage.summary.classes'),
      value: counts.classes,
      icon: GraduationCap,
      tab: 'content',
      anchor: 'ops-classes',
      tile: 'bg-emerald-600 shadow-emerald-600/30',
      card: 'from-emerald-50 border-emerald-100',
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(({ label, value, icon: Icon, tab, anchor, tile, card }) => (
        <button
          key={label}
          type="button"
          onClick={() => onOpen(tab, anchor)}
          className={cn(
            'flex items-center gap-4 rounded-3xl bg-gradient-to-br to-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:from-white/5 dark:to-transparent dark:border-white/10',
            GLASS,
            card,
          )}
        >
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg',
              tile,
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-3xl font-bold tabular-nums text-brand-800 dark:text-white">
              {value.toLocaleString(locale)}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── People ──────────────────────────────────────────────────────────────────

/** Part-to-whole: where the learners stand, one bar split by membership state. */
function MembershipChart({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t, locale } = useI18n();
  const m = health.memberships;
  const parts = [
    { key: 'active', value: m.active, fill: 'bg-emerald-600' },
    { key: 'expiringSoon', value: m.expiringSoon, fill: 'bg-amber-500' },
    { key: 'expired', value: m.expired, fill: 'bg-orange-500' },
    { key: 'suspended', value: m.suspended, fill: 'bg-red-600' },
    { key: 'none', value: m.none, fill: 'bg-slate-300 dark:bg-slate-600' },
  ];
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <Card
      title={t('admin.ops.charts.membership.title')}
      description={t('admin.ops.charts.membership.description')}
      onOpen={() => onOpen('support', 'ops-members')}
    >
      {total === 0 ? (
        <Empty>{t('admin.ops.charts.membership.empty')}</Empty>
      ) : (
        <>
          <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full">
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <div
                  key={p.key}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', p.fill)}
                  style={{ width: `${(p.value / total) * 100}%` }}
                  title={`${t(`admin.ops.charts.membership.${p.key}`)}: ${p.value}`}
                />
              ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2">
                <span className={cn('size-2.5 shrink-0 rounded-full', p.fill)} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {t(`admin.ops.charts.membership.${p.key}`)}
                </span>
                <span className="font-semibold tabular-nums">{p.value.toLocaleString(locale)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function AccountsChart({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t } = useI18n();
  const a = health.accounts;
  return (
    <Card
      title={t('admin.ops.charts.accounts.title')}
      description={t('admin.ops.charts.accounts.description')}
      onOpen={() => onOpen('support', 'ops-accounts')}
    >
      <Bars
        rows={[
          { key: 'learner', label: t('account.roles.learner'), value: a.learner },
          { key: 'operator', label: t('account.roles.operator'), value: a.operator },
          { key: 'admin', label: t('account.roles.admin'), value: a.admin },
          {
            key: 'disabled',
            label: t('admin.ops.charts.accounts.disabled'),
            value: a.disabled,
            fill: 'bg-slate-400 dark:bg-slate-500',
          },
        ]}
      />
    </Card>
  );
}

/** Who is closest to being blocked by this month's allowance. */
function QuotaChart({
  health,
  onOpen,
  className,
}: {
  health: OpsHealth;
  onOpen: OpenDetail;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const rows = health.quota.slice(0, 6);
  return (
    <Card
      title={t('admin.ops.charts.quota.title')}
      description={t('admin.ops.charts.quota.description')}
      onOpen={() => onOpen('support', 'ops-members')}
      className={className}
    >
      {rows.length === 0 ? (
        <Empty>{t('admin.ops.charts.quota.empty')}</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const share = row.limit > 0 ? row.used / row.limit : 1;
            const fill =
              share >= 1 ? 'bg-red-600' : share >= QUOTA_NEAR ? 'bg-amber-500' : 'bg-brand-600';
            return (
              <li key={row.username} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{row.username}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {Math.round(share * 100)}%
                    </span>{' '}
                    · {compact(row.used, locale)} / {compact(row.limit, locale)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', fill)}
                    style={{ width: `${Math.min(share, 1) * 100}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Review queues ───────────────────────────────────────────────────────────

/** A request's path as boxes and arrows: waiting, then one box per outcome. */
function Flow({
  pending,
  outcomes,
}: {
  pending: { label: string; value: number };
  outcomes: readonly { label: string; value: number; tone: string; bar: string }[];
}) {
  const { locale } = useI18n();
  const box = (label: string, value: number, tone: string) => (
    <div className={cn('flex min-w-0 flex-col rounded-2xl border px-4 py-3', tone)}>
      <span className="text-2xl font-bold tabular-nums">{value.toLocaleString(locale)}</span>
      <span className="truncate text-xs">{label}</span>
    </div>
  );
  const total = pending.value + outcomes.reduce((sum, o) => sum + o.value, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {box(
          pending.label,
          pending.value,
          pending.value > 0
            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
            : 'border-border bg-muted/40 text-foreground',
        )}
        <ArrowRight className="size-5 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-2">
          {outcomes.map((o) => (
            <div key={o.label}>{box(o.label, o.value, o.tone)}</div>
          ))}
        </div>
      </div>
      {total > 0 ? (
        <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
          <div
            className="h-full bg-amber-500"
            style={{ width: `${(pending.value / total) * 100}%` }}
          />
          {outcomes.map((o) => (
            <div
              key={o.label}
              className={cn('h-full', o.bar)}
              style={{ width: `${(o.value / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const GOOD_BOX =
  'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';
const BAD_BOX =
  'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200';

function AccessFlow({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t } = useI18n();
  const r = health.accessRequests;
  return (
    <Card
      title={t('admin.ops.charts.accessFlow.title')}
      description={t('admin.ops.charts.accessFlow.description')}
      onOpen={() => onOpen('support', 'ops-access-requests')}
    >
      <Flow
        pending={{ label: t('admin.ops.charts.accessFlow.pending'), value: r.pending }}
        outcomes={[
          {
            label: t('admin.ops.charts.accessFlow.approved'),
            value: r.approved,
            tone: GOOD_BOX,
            bar: 'bg-emerald-600',
          },
          {
            label: t('admin.ops.charts.accessFlow.rejected'),
            value: r.rejected,
            tone: BAD_BOX,
            bar: 'bg-red-600',
          },
        ]}
      />
    </Card>
  );
}

function ShareFlow({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t } = useI18n();
  const s = health.shares;
  return (
    <Card
      title={t('admin.ops.charts.shareFlow.title')}
      description={t('admin.ops.charts.shareFlow.description')}
      onOpen={() => onOpen('content', 'ops-shares')}
    >
      <Flow
        pending={{ label: t('admin.ops.charts.shareFlow.pending'), value: s.pending }}
        outcomes={[
          {
            label: t('admin.ops.charts.shareFlow.shared'),
            value: s.shared,
            tone: GOOD_BOX,
            bar: 'bg-emerald-600',
          },
        ]}
      />
    </Card>
  );
}

// ── AI usage ────────────────────────────────────────────────────────────────

/** AI requests per day: a sudden drop to zero is the first sign something upstream broke. */
function ActivityChart({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t, locale } = useI18n();
  const days = health.dailyRequests;
  const max = Math.max(0, ...days.map((d) => d.requests));
  const total = days.reduce((sum, d) => sum + d.requests, 0);
  const label = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'numeric',
      timeZone: 'UTC',
    });
  return (
    <Card
      title={t('admin.ops.charts.activity.title')}
      description={t('admin.ops.charts.activity.description', {
        count: days.length,
        total: total.toLocaleString(locale),
      })}
      onOpen={() => onOpen('system', 'ops-usage')}
      className="lg:col-span-2"
    >
      {max === 0 ? (
        <Empty>{t('admin.ops.charts.activity.empty')}</Empty>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex h-36 items-end gap-1.5 border-b border-border">
            {days.map((d) => (
              <div
                key={d.day}
                className="group relative flex h-full flex-1 items-end"
                title={`${label(d.day)}: ${d.requests.toLocaleString(locale)}`}
              >
                {d.requests === max ? (
                  <span className="absolute inset-x-0 top-0 text-center text-xs font-semibold tabular-nums">
                    {d.requests.toLocaleString(locale)}
                  </span>
                ) : null}
                <div
                  className="w-full rounded-t-[4px] bg-brand-600 transition-colors group-hover:bg-brand-800 dark:bg-brand-400 dark:group-hover:bg-brand-200"
                  style={{
                    height: `${(d.requests / max) * 85}%`,
                    minHeight: d.requests > 0 ? 2 : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 text-[11px] text-muted-foreground">
            {days.map((d, i) => (
              <span key={d.day} className="flex-1 text-center tabular-nums">
                {(days.length - 1 - i) % 2 === 0 ? label(d.day) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const KIND_LABEL: Record<string, string> = {
  llm: 'settings.usage.kindLlm',
  image: 'settings.usage.kindImage',
  video: 'settings.usage.kindVideo',
  tts: 'settings.usage.kindTts',
  asr: 'settings.usage.kindAsr',
};

function UsageKindsChart({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t } = useI18n();
  const rows = health.usageByKind;
  return (
    <Card
      title={t('admin.ops.charts.usageKinds.title')}
      description={t('admin.ops.charts.usageKinds.description', {
        count: health.dailyRequests.length,
      })}
      onOpen={() => onOpen('system', 'ops-usage')}
    >
      {rows.every((r) => r.requests === 0) ? (
        <Empty>{t('admin.ops.charts.activity.empty')}</Empty>
      ) : (
        <Bars
          rows={rows.map((r) => ({ key: r.kind, label: t(KIND_LABEL[r.kind]), value: r.requests }))}
        />
      )}
    </Card>
  );
}

// ── Content and system ──────────────────────────────────────────────────────

function ContentChart({ health, onOpen }: { health: OpsHealth; onOpen: OpenDetail }) {
  const { t, locale } = useI18n();
  const stats = [
    { key: 'shared', value: health.shares.shared, anchor: 'ops-shares' },
    { key: 'previews', value: health.previews, anchor: 'ops-previews' },
    { key: 'classes', value: health.counts.classes, anchor: 'ops-classes' },
  ];
  return (
    <Card
      title={t('admin.ops.charts.content.title')}
      description={t('admin.ops.charts.content.description')}
      onOpen={() => onOpen('content', 'ops-classes')}
    >
      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.key} className="rounded-2xl bg-muted/50 px-3 py-2.5">
            <div className="text-xl font-bold tabular-nums">{s.value.toLocaleString(locale)}</div>
            <div className="text-xs text-muted-foreground">
              {t(`admin.ops.charts.content.${s.key}`)}
            </div>
          </div>
        ))}
      </div>
      {health.classes.length === 0 ? (
        <Empty>{t('admin.ops.charts.content.empty')}</Empty>
      ) : (
        <Bars
          rows={health.classes.map((c, i) => ({
            key: `${i}-${c.name}`,
            label: c.name,
            value: c.members,
            fill: 'bg-emerald-600',
            note: t('admin.ops.charts.content.courses', { count: c.courses }),
          }))}
        />
      )}
    </Card>
  );
}

function ProvidersChart({
  providers,
  onOpen,
}: {
  providers: Record<ProviderKind, string[]> | null;
  onOpen: OpenDetail;
}) {
  const { t } = useI18n();
  return (
    <Card
      title={t('admin.ops.charts.providers.title')}
      description={t('admin.ops.charts.providers.description')}
      onOpen={() => onOpen('system', 'ops-providers')}
    >
      {providers === null ? (
        <Empty>{t('admin.ops.charts.providers.unknown')}</Empty>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {PROVIDER_KINDS.map((kind) => {
            const ids = providers[kind];
            const on = ids.length > 0;
            // Without an LLM nobody can generate, so its absence is the one red row.
            const Icon = on ? CircleCheck : kind === 'providers' ? OctagonAlert : CircleMinus;
            const tone = on
              ? 'text-emerald-600 dark:text-emerald-400'
              : kind === 'providers'
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground';
            return (
              <li key={kind} className="flex items-center gap-2.5">
                <Icon className={cn('size-4 shrink-0', tone)} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {t(`admin.ops.charts.providers.kinds.${kind}`)}
                </span>
                <span
                  className={cn('max-w-[55%] truncate text-xs', on ? 'font-mono' : tone)}
                  title={ids.join(', ')}
                >
                  {on ? ids.join(', ') : t('admin.ops.charts.providers.missing')}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/**
 * The overview: what needs a person first, then the whole system in four groups (people, review
 * queues, AI usage, content and system). Every diagram opens the panel behind it.
 */
export function OpsOverview({
  health,
  providers,
  onOpen,
}: {
  health: OpsHealth;
  providers: Record<ProviderKind, string[]> | null;
  onOpen: OpenDetail;
}) {
  const { t } = useI18n();
  const llmProviders = providers ? providers.providers.length : null;
  return (
    <div className="flex flex-col gap-8">
      <AttentionList health={health} llmProviders={llmProviders} onOpen={onOpen} />
      <CountTiles health={health} onOpen={onOpen} />
      <Group title={t('admin.ops.groups.people')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <MembershipChart health={health} onOpen={onOpen} />
          <AccountsChart health={health} onOpen={onOpen} />
          <QuotaChart health={health} onOpen={onOpen} className="lg:col-span-2" />
        </div>
      </Group>
      <Group title={t('admin.ops.groups.queues')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <AccessFlow health={health} onOpen={onOpen} />
          <ShareFlow health={health} onOpen={onOpen} />
        </div>
      </Group>
      <Group title={t('admin.ops.groups.usage')}>
        <div className="grid gap-6 lg:grid-cols-3">
          <ActivityChart health={health} onOpen={onOpen} />
          <UsageKindsChart health={health} onOpen={onOpen} />
        </div>
      </Group>
      <Group title={t('admin.ops.groups.system')}>
        <div className="grid gap-6 lg:grid-cols-2">
          <ContentChart health={health} onOpen={onOpen} />
          <ProvidersChart providers={providers} onOpen={onOpen} />
        </div>
      </Group>
    </div>
  );
}
