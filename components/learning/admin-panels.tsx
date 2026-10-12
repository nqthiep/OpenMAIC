'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  attachCourse,
  createClass,
  decideShare,
  fetchAudit,
  fetchClasses,
  fetchMembers,
  fetchPreviews,
  fetchShares,
  grantMembership,
  LearningRequestError,
  setMembershipSuspended,
  setPreview,
  type AuditRow,
  type ClassRow,
  type MemberRow,
  type ShareRow,
} from './learning-api';

const DEFAULT_DAYS = 30;
const DEFAULT_QUOTA = 1_000_000;

/** A translated line for a failed request. The server's own text is English and stays out of the UI. */
function useFailureMessage() {
  const { t } = useI18n();
  return (error: unknown): string => {
    const code = error instanceof LearningRequestError ? error.errorCode : undefined;
    const key = code ? `learning.errors.${code}` : 'learning.errors.generic';
    const text = t(key);
    return text === key ? t('learning.errors.generic') : text;
  };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function MembershipPanel() {
  const { t, locale } = useI18n();
  const failure = useFailureMessage();
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [nextAfter, setNextAfter] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { days: string; quota: string }>>({});

  const load = useCallback(
    async (after?: string) => {
      try {
        const page = await fetchMembers(after);
        setRows((current) =>
          after === undefined ? page.accounts : [...current, ...page.accounts],
        );
        setNextAfter(page.nextAfter);
      } catch (error) {
        toast.error(failure(error));
      }
    },
    [failure],
  );

  useEffect(() => {
    let active = true;
    fetchMembers()
      .then((page) => {
        if (active) {
          setRows(page.accounts);
          setNextAfter(page.nextAfter);
        }
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const statusLabel = (row: MemberRow): string => {
    if (!row.membership) return t('membership.status.none');
    if (row.membership.status === 'suspended') return t('membership.status.suspended');
    return row.membership.active ? t('membership.status.active') : t('membership.status.expired');
  };

  const grant = async (row: MemberRow) => {
    const entry = draft[row.id] ?? { days: String(DEFAULT_DAYS), quota: String(DEFAULT_QUOTA) };
    try {
      await grantMembership(row.id, Number(entry.days), Number(entry.quota));
      toast.success(t('membership.granted'));
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  const toggle = async (row: MemberRow) => {
    try {
      await setMembershipSuspended(row.id, row.membership?.status !== 'suspended');
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  return (
    <Section title={t('admin.members.title')} description={t('admin.members.description')}>
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => {
          const entry = draft[row.id] ?? {
            days: String(DEFAULT_DAYS),
            quota: String(DEFAULT_QUOTA),
          };
          return (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 basis-40">
                <p className="break-all text-sm font-medium">{row.username}</p>
                {row.membership ? (
                  <p className="text-xs text-muted-foreground">
                    {t('membership.expiresOn', {
                      date: new Date(row.membership.expiresAt).toLocaleDateString(locale),
                    })}
                    {' · '}
                    {t('admin.members.quotaValue', {
                      tokens: row.membership.monthlyQuota.toLocaleString(locale),
                    })}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{statusLabel(row)}</Badge>
                <Input
                  aria-label={t('admin.members.days')}
                  inputMode="numeric"
                  className="h-8 w-20"
                  value={entry.days}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [row.id]: { ...entry, days: event.target.value },
                    }))
                  }
                />
                <Input
                  aria-label={t('admin.members.quota')}
                  inputMode="numeric"
                  className="h-8 w-32"
                  value={entry.quota}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [row.id]: { ...entry, quota: event.target.value },
                    }))
                  }
                />
                <Button variant="outline" size="sm" onClick={() => void grant(row)}>
                  {t('admin.members.grant')}
                </Button>
                {row.membership ? (
                  <Button variant="outline" size="sm" onClick={() => void toggle(row)}>
                    {row.membership.status === 'suspended'
                      ? t('admin.members.resume')
                      : t('admin.members.suspend')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {nextAfter !== null ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void load(nextAfter)}>
            {t('account.admin.loadMore')}
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

export function SharesPanel() {
  const { t, locale } = useI18n();
  const failure = useFailureMessage();
  const [rows, setRows] = useState<ShareRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchShares('pending'));
    } catch (error) {
      toast.error(failure(error));
    }
  }, [failure]);

  useEffect(() => {
    let active = true;
    fetchShares('pending')
      .then((page) => {
        if (active) setRows(page);
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const decide = async (row: ShareRow, decision: 'approve' | 'reject') => {
    try {
      await decideShare(row.courseId, decision);
      toast.success(
        decision === 'approve' ? t('admin.shares.approved') : t('admin.shares.rejected'),
      );
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  return (
    <Section title={t('admin.shares.title')} description={t('admin.shares.description')}>
      {rows && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.shares.empty')}</p>
      ) : null}
      {rows && rows.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.courseId}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 basis-40">
                <p className="break-all text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t('admin.shares.requested', {
                    date: new Date(row.requestedAt).toLocaleDateString(locale),
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void decide(row, 'approve')}>
                  {t('admin.shares.approve')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void decide(row, 'reject')}>
                  {t('admin.shares.reject')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

export function PreviewsPanel() {
  const { t } = useI18n();
  const failure = useFailureMessage();
  const [previews, setPreviews] = useState<string[]>([]);
  const [courseId, setCourseId] = useState('');

  const load = useCallback(async () => {
    try {
      setPreviews(await fetchPreviews());
    } catch (error) {
      toast.error(failure(error));
    }
  }, [failure]);

  useEffect(() => {
    let active = true;
    fetchPreviews()
      .then((page) => {
        if (active) setPreviews(page);
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const add = async () => {
    const id = courseId.trim();
    if (id === '') return;
    try {
      await setPreview(id, true);
      setCourseId('');
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  const remove = async (id: string) => {
    try {
      await setPreview(id, false);
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  return (
    <Section title={t('admin.previews.title')} description={t('admin.previews.description')}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t('admin.previews.courseId')}
          placeholder={t('admin.previews.courseId')}
          className="h-8 max-w-xs"
          value={courseId}
          onChange={(event) => setCourseId(event.target.value)}
        />
        <Button variant="outline" size="sm" onClick={() => void add()}>
          {t('admin.previews.add')}
        </Button>
      </div>
      {previews.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.previews.empty')}</p>
      ) : null}
      {previews.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {previews.map((id) => (
            <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="break-all font-mono text-xs">{id}</span>
              <Button variant="outline" size="sm" onClick={() => void remove(id)}>
                {t('admin.previews.remove')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

export function ClassesPanel() {
  const { t } = useI18n();
  const failure = useFailureMessage();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [courseIds, setCourseIds] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setClasses(await fetchClasses());
    } catch (error) {
      toast.error(failure(error));
    }
  }, [failure]);

  useEffect(() => {
    let active = true;
    fetchClasses()
      .then((page) => {
        if (active) setClasses(page);
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    try {
      const created = await createClass(trimmed);
      setName('');
      setJoinCode(`${created.name}: ${created.joinCode}`);
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  const attach = async (row: ClassRow) => {
    const courseId = (courseIds[row.id] ?? '').trim();
    if (courseId === '') return;
    try {
      await attachCourse(row.id, courseId);
      setCourseIds((current) => ({ ...current, [row.id]: '' }));
      await load();
    } catch (error) {
      toast.error(failure(error));
    }
  };

  return (
    <Section title={t('admin.classes.title')} description={t('admin.classes.description')}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t('admin.classes.name')}
          placeholder={t('admin.classes.name')}
          className="h-8 max-w-xs"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button variant="outline" size="sm" onClick={() => void create()}>
          {t('admin.classes.create')}
        </Button>
      </div>
      {joinCode ? (
        <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm">
          {t('admin.classes.joinCode', { code: joinCode })}
        </p>
      ) : null}
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.classes.empty')}</p>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {classes.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{row.name}</span>
              <span className="text-xs text-muted-foreground">
                {t('admin.classes.members', { count: row.memberCount })} ·{' '}
                {t('admin.classes.courses', { count: row.courseIds.length })}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t('admin.previews.courseId')}
                placeholder={t('admin.previews.courseId')}
                className="h-8 max-w-xs"
                value={courseIds[row.id] ?? ''}
                onChange={(event) =>
                  setCourseIds((current) => ({ ...current, [row.id]: event.target.value }))
                }
              />
              <Button variant="outline" size="sm" onClick={() => void attach(row)}>
                {t('admin.classes.attach')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function AuditPanel() {
  const { t, locale } = useI18n();
  const failure = useFailureMessage();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(true);

  const load = useCallback(
    async (before?: number) => {
      try {
        const page = await fetchAudit(before);
        setRows((current) => (before === undefined ? page : [...current, ...page]));
        setMore(page.length === 50);
      } catch (error) {
        toast.error(failure(error));
      }
    },
    [failure],
  );

  useEffect(() => {
    let active = true;
    fetchAudit()
      .then((page) => {
        if (active) {
          setRows(page);
          setMore(page.length === 50);
        }
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [failure]);

  return (
    <Section title={t('admin.audit.title')} description={t('admin.audit.description')}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('admin.audit.empty')}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="divide-y rounded-lg border text-xs">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span className="font-mono">{row.action}</span>
              <span className="text-muted-foreground">
                {new Date(row.createdAt).toLocaleString(locale)}
                {row.reason ? ` · ${row.reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {more && rows.length > 0 ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void load(rows[rows.length - 1]!.id)}>
            {t('account.admin.loadMore')}
          </Button>
        </div>
      ) : null}
    </Section>
  );
}
