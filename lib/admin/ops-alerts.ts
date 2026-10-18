/**
 * What the operations page shows first: the state of the deployment (`OpsHealth`, built on the
 * server from the database and the usage log) and the rules that turn it into a short list of
 * things an operator should look at, worst first. Pure, so the page and the tests share it.
 */

export type UsageKindName = 'llm' | 'image' | 'video' | 'tts' | 'asr';

/** Classes listed in the overview chart. */
export const CLASSES_SHOWN = 6;

export type OpsTab = 'overview' | 'support' | 'content' | 'system' | 'audit';

export interface OpsHealth {
  readonly counts: {
    readonly activeMembers: number;
    readonly pendingShares: number;
    readonly pendingAccessRequests: number;
    readonly classes: number;
    /** Open support threads whose last message is the learner's. */
    readonly supportWaiting?: number;
    /** Community questions and answers with unresolved reports. */
    readonly openReports?: number;
  };
  readonly memberships: {
    readonly active: number;
    readonly expiringSoon: number;
    readonly expired: number;
    readonly suspended: number;
    readonly none: number;
  };
  readonly accounts: {
    readonly learner: number;
    readonly operator: number;
    readonly admin: number;
    readonly disabled: number;
  };
  readonly accessRequests: {
    readonly pending: number;
    readonly approved: number;
    readonly rejected: number;
  };
  readonly shares: { readonly pending: number; readonly shared: number };
  readonly previews: number;
  /** Classes with the most members first, at most CLASSES_SHOWN. */
  readonly classes: readonly { name: string; members: number; courses: number }[];
  /** AI requests by kind over the dailyRequests window, every kind present, most used first. */
  readonly usageByKind: readonly { kind: UsageKindName; requests: number }[];
  readonly oldestPendingAccessRequest: string | null;
  readonly oldestPendingShare: string | null;
  readonly expiring: readonly { username: string; expiresAt: string }[];
  /** Learners at QUOTA_SHOWN or more of this month's allowance, most used first. */
  readonly quota: readonly { username: string; used: number; limit: number }[];
  /** Requests per UTC day, oldest first, zero-filled. */
  readonly dailyRequests: readonly { day: string; requests: number }[];
}

/** Share of the allowance from which a learner is listed in the quota chart. */
export const QUOTA_SHOWN = 0.5;
/** Share of the allowance from which a learner is about to be blocked. */
export const QUOTA_NEAR = 0.8;
/** Hours an access request may wait before it is overdue (the learner cannot generate meanwhile). */
export const ACCESS_REQUEST_OVERDUE_HOURS = 48;
/** Hours a share request may wait before it is overdue. */
export const SHARE_OVERDUE_HOURS = 72;
/** Days without any AI request, while members are active, before the page says so. */
export const QUIET_DAYS = 3;

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface OpsAlert {
  /** Also the translation key under `admin.ops.alerts`. */
  readonly id:
    | 'noProviders'
    | 'quotaOver'
    | 'accessRequestsOverdue'
    | 'accessRequestsPending'
    | 'supportWaiting'
    | 'reportsOpen'
    | 'quotaNear'
    | 'expiringSoon'
    | 'sharesOverdue'
    | 'sharesPending'
    | 'expired'
    | 'quiet';
  readonly severity: AlertSeverity;
  readonly tab: OpsTab;
  readonly count: number;
  /** Who is affected, at most three, when the alert is about people. */
  readonly names?: readonly string[];
  /** Hours the oldest item has waited, for the overdue alerts. */
  readonly hours?: number;
}

const RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

function hoursSince(iso: string | null, now: Date): number {
  return iso === null ? 0 : Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
}

/**
 * The alerts for `health`, worst first. `llmProviders` is the number of LLM providers the server
 * manages, or null when it is not known yet (then nothing is said about providers).
 */
export function deriveAlerts(
  health: OpsHealth,
  llmProviders: number | null,
  now: Date,
): OpsAlert[] {
  const alerts: OpsAlert[] = [];
  const top = (rows: readonly { username: string }[]) => rows.slice(0, 3).map((r) => r.username);

  if (llmProviders === 0) {
    alerts.push({ id: 'noProviders', severity: 'critical', tab: 'system', count: 0 });
  }

  const over = health.quota.filter((r) => r.used >= r.limit);
  if (over.length > 0) {
    alerts.push({
      id: 'quotaOver',
      severity: 'critical',
      tab: 'support',
      count: over.length,
      names: top(over),
    });
  }

  const pendingAccess = health.counts.pendingAccessRequests;
  if (pendingAccess > 0) {
    const hours = hoursSince(health.oldestPendingAccessRequest, now);
    const overdue = hours >= ACCESS_REQUEST_OVERDUE_HOURS;
    alerts.push({
      id: overdue ? 'accessRequestsOverdue' : 'accessRequestsPending',
      severity: overdue ? 'critical' : 'warning',
      tab: 'support',
      count: pendingAccess,
      hours,
    });
  }

  const supportWaiting = health.counts.supportWaiting ?? 0;
  if (supportWaiting > 0) {
    alerts.push({
      id: 'supportWaiting',
      severity: 'warning',
      tab: 'support',
      count: supportWaiting,
    });
  }

  const openReports = health.counts.openReports ?? 0;
  if (openReports > 0) {
    alerts.push({ id: 'reportsOpen', severity: 'warning', tab: 'content', count: openReports });
  }

  const near = health.quota.filter((r) => r.used < r.limit && r.used >= r.limit * QUOTA_NEAR);
  if (near.length > 0) {
    alerts.push({
      id: 'quotaNear',
      severity: 'warning',
      tab: 'support',
      count: near.length,
      names: top(near),
    });
  }

  if (health.memberships.expiringSoon > 0) {
    alerts.push({
      id: 'expiringSoon',
      severity: 'warning',
      tab: 'support',
      count: health.memberships.expiringSoon,
      names: top(health.expiring),
    });
  }

  const pendingShares = health.counts.pendingShares;
  if (pendingShares > 0) {
    const hours = hoursSince(health.oldestPendingShare, now);
    const overdue = hours >= SHARE_OVERDUE_HOURS;
    alerts.push({
      id: overdue ? 'sharesOverdue' : 'sharesPending',
      severity: overdue ? 'warning' : 'info',
      tab: 'content',
      count: pendingShares,
      hours,
    });
  }

  if (health.memberships.expired > 0) {
    alerts.push({
      id: 'expired',
      severity: 'info',
      tab: 'support',
      count: health.memberships.expired,
    });
  }

  const recent = health.dailyRequests.slice(-QUIET_DAYS);
  if (
    health.counts.activeMembers > 0 &&
    recent.length === QUIET_DAYS &&
    recent.every((d) => d.requests === 0)
  ) {
    alerts.push({ id: 'quiet', severity: 'info', tab: 'system', count: QUIET_DAYS });
  }

  return alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

/** Items waiting for a decision, by tab, for the badges on the tab triggers. */
export function waitingByTab(health: OpsHealth): Partial<Record<OpsTab, number>> {
  return {
    support: health.counts.pendingAccessRequests + (health.counts.supportWaiting ?? 0),
    content: health.counts.pendingShares + (health.counts.openReports ?? 0),
  };
}
