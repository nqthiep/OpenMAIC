'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Copy, ExternalLink, Link2, ListPlus, Pencil, Trash2, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CourseTagsEditor, TagBadges } from '@/components/learning/course-tags-editor';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { DataTable, type Column } from './data-table';
import {
  AUDIT_MAX,
  addClassMember,
  attachCourse,
  createClass,
  decideAccessRequest,
  decideShare,
  deleteClass,
  detachCourse,
  fetchAccessRequests,
  fetchAllMembers,
  fetchAudit,
  fetchClasses,
  fetchClassMembers,
  fetchClassProgress,
  fetchCourses,
  fetchPreviews,
  fetchServerProviders,
  fetchShares,
  grantMembership,
  LearningRequestError,
  renameClass,
  revokeMembership,
  revokeShare,
  removeClassMember,
  rotateJoinCode,
  setMembershipSuspended,
  setCourseTags,
  setPreview,
  updateMembership,
  type AuditRow,
  type ClassMember,
  type ClassProgressRow,
  type ClassRow,
  type CourseEntry,
  type MemberRow,
  type PendingAccessRequestRow,
  type PreviewRow,
  type ShareRow,
} from './learning-api';

const DEFAULT_DAYS = 30;
const DEFAULT_QUOTA = 1_000_000;

/** A translated line for a failed request. The server's own text is English and stays out of the UI. */
function useFailureMessage() {
  const { t } = useI18n();
  // Stable on purpose: the panels list it as an effect dependency, and a new function on every
  // render made each panel fetch again after every fetch.
  return useCallback(
    (error: unknown): string => {
      const code = error instanceof LearningRequestError ? error.errorCode : undefined;
      const key = code ? `learning.errors.${code}` : 'learning.errors.generic';
      const text = t(key);
      return text === key ? t('learning.errors.generic') : text;
    },
    [t],
  );
}

/** Loads `fetcher` once and on `reload`; a failed load shows a toast and keeps the last rows. */
function useRows<T>(fetcher: () => Promise<T[]>) {
  const failure = useFailureMessage();
  const [rows, setRows] = useState<T[] | null>(null);
  const reload = useCallback(async () => {
    try {
      setRows(await fetcher());
    } catch (error) {
      toast.error(failure(error));
    }
  }, [fetcher, failure]);
  useEffect(() => {
    let active = true;
    fetcher()
      .then((next) => {
        if (active) setRows(next);
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [fetcher, failure]);
  return { rows, reload };
}

/** Runs a change, then reloads; a refusal becomes a translated toast. */
function useAction(reload: () => Promise<void>) {
  const failure = useFailureMessage();
  return useCallback(
    /** Runs a change, toasts the outcome, reloads, and says whether the change went through. */
    async (change: () => Promise<unknown>, done?: string): Promise<boolean> => {
      let ok = true;
      try {
        await change();
        if (done) toast.success(done);
      } catch (error) {
        toast.error(failure(error));
        ok = false;
      }
      await reload();
      return ok;
    },
    [failure, reload],
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  /** Anchor the overview's diagrams scroll to. */
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn('flex scroll-mt-6 flex-col gap-4 rounded-3xl p-6', GLASS)}>
      <div className="flex flex-col gap-1.5">
        <SectionTitle>{title}</SectionTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function day(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale);
}

/** `YYYY-MM-DD` of an instant in the viewer's time zone, the value an `<input type="date">` shows. */
function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Opens the course in a new tab, so a reviewer keeps their place in the dashboard. */
function CourseLink({ courseId, children }: { courseId: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <a
      href={`/classroom/${encodeURIComponent(courseId)}`}
      target="_blank"
      rel="noopener noreferrer"
      title={t('admin.courses.open')}
      className="inline-flex items-center gap-1 hover:text-primary hover:underline"
    >
      {children}
      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
    </a>
  );
}

/** Course titles by ID, so panels that store only IDs can show names. Empty until loaded. */
function useCourseTitles(): Map<string, string> {
  const { rows } = useRows(fetchCourses);
  return new Map((rows ?? []).map((c) => [c.courseId, c.title]));
}

/** A delete or revoke button that asks first. Every confirmed change lands in the audit log. */
function ConfirmButton({
  label,
  title,
  description,
  confirm,
  onConfirm,
  icon = true,
}: {
  label: string;
  title: string;
  description: string;
  confirm: string;
  onConfirm: () => Promise<unknown>;
  icon?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700 dark:text-red-400"
        onClick={() => setOpen(true)}
      >
        {icon ? <Trash2 /> : null}
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onConfirm();
                setBusy(false);
                setOpen(false);
              }}
            >
              {confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** An edit form in a dialog. `onSave` returns false to keep the dialog open. */
function EditDialog({
  title,
  description,
  open,
  onOpenChange,
  onSave,
  submitLabel,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<boolean>;
  /** The submit button's text; "Save" when absent. */
  submitLabel?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const ok = await onSave();
            setBusy(false);
            if (ok) onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {submitLabel ?? t('admin.table.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

// ── Members ─────────────────────────────────────────────────────────────────

type MemberState = 'active' | 'expired' | 'suspended' | 'none';

function memberState(row: MemberRow): MemberState {
  if (!row.membership) return 'none';
  if (row.membership.status === 'suspended') return 'suspended';
  return row.membership.active ? 'active' : 'expired';
}

const STATE_BADGE: Record<MemberState, string> = {
  active:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  expired:
    'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
  suspended:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  none: '',
};

/** Who has a membership, and the controls to grant, edit, suspend and revoke one. */
export function MembershipPanel() {
  const { t, locale } = useI18n();
  const { rows, reload } = useRows(fetchAllMembers);
  const act = useAction(reload);
  // One dialog for both granting (no membership, or extend) and editing the exact values.
  const [editing, setEditing] = useState<{
    row: MemberRow;
    mode: 'grant' | 'edit';
    days: string;
    quota: string;
    expires: string;
  } | null>(null);

  const open = (row: MemberRow, mode: 'grant' | 'edit') =>
    setEditing({
      row,
      mode,
      days: String(DEFAULT_DAYS),
      quota: String(row.membership?.monthlyQuota ?? DEFAULT_QUOTA),
      expires: row.membership ? localDate(row.membership.expiresAt) : '',
    });

  const columns: Column<MemberRow>[] = [
    {
      id: 'username',
      header: t('admin.members.columns.username'),
      sort: (r) => r.username,
      cell: (r) => <span className="whitespace-nowrap font-medium">{r.username}</span>,
    },
    {
      id: 'state',
      header: t('admin.members.columns.status'),
      sort: (r) => memberState(r),
      cell: (r) => (
        <Badge variant="outline" className={STATE_BADGE[memberState(r)]}>
          {t(`membership.status.${memberState(r)}`)}
        </Badge>
      ),
    },
    {
      id: 'expires',
      header: t('admin.members.columns.expires'),
      sort: (r) => r.membership?.expiresAt ?? '',
      cell: (r) => (r.membership ? day(r.membership.expiresAt, locale) : '—'),
    },
    {
      id: 'quota',
      header: t('admin.members.quota'),
      align: 'right',
      sort: (r) => r.membership?.monthlyQuota ?? -1,
      cell: (r) => (
        <span className="tabular-nums">
          {r.membership ? r.membership.monthlyQuota.toLocaleString(locale) : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('admin.table.actions'),
      align: 'right',
      cell: (r) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => open(r, 'grant')}>
            {t('admin.members.grant')}
          </Button>
          {r.membership ? (
            <>
              <Button variant="outline" size="sm" onClick={() => open(r, 'edit')}>
                <Pencil />
                {t('admin.table.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void act(() => setMembershipSuspended(r.id, r.membership?.status !== 'suspended'))
                }
              >
                {r.membership.status === 'suspended'
                  ? t('admin.members.resume')
                  : t('admin.members.suspend')}
              </Button>
              <ConfirmButton
                label={t('admin.members.revoke')}
                title={t('admin.members.revokeTitle', { name: r.username })}
                description={t('admin.members.revokeDescription')}
                confirm={t('admin.members.revoke')}
                onConfirm={() =>
                  act(
                    () => revokeMembership(r.id),
                    t('admin.members.revoked', { name: r.username }),
                  )
                }
              />
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const save = async (): Promise<boolean> => {
    if (!editing) return false;
    const quota = Number(editing.quota);
    if (!Number.isInteger(quota) || quota < 0) {
      toast.error(t('admin.members.invalidQuota'));
      return false;
    }
    if (editing.mode === 'grant') {
      const days = Number(editing.days);
      if (!Number.isInteger(days) || days < 1) {
        toast.error(t('admin.members.invalidDays'));
        return false;
      }
      await act(() => grantMembership(editing.row.id, days, quota), t('membership.granted'));
      return true;
    }
    if (!editing.expires) {
      toast.error(t('admin.members.invalidDate'));
      return false;
    }
    // The end of the chosen day in the operator's time zone, the day the table then shows, so
    // "until 2026-12-31" includes that day.
    const expiresAt = new Date(`${editing.expires}T23:59:59`).toISOString();
    await act(() => updateMembership(editing.row.id, expiresAt, quota), t('admin.members.updated'));
    return true;
  };

  return (
    <Section
      id="ops-members"
      title={t('admin.members.title')}
      description={t('admin.members.description')}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        searchText={(r) => r.username}
        filters={[
          {
            id: 'state',
            label: t('admin.members.columns.status'),
            options: (['active', 'expired', 'suspended', 'none'] as const).map((s) => ({
              value: s,
              label: t(`membership.status.${s}`),
            })),
            test: (r, v) => memberState(r) === v,
          },
        ]}
        initialSort={{ id: 'username', dir: 'asc' }}
        empty={t('admin.members.empty')}
      />
      <EditDialog
        open={editing !== null}
        onOpenChange={(next) => !next && setEditing(null)}
        title={
          editing
            ? t(editing.mode === 'grant' ? 'admin.members.grantTitle' : 'admin.members.editTitle', {
                name: editing.row.username,
              })
            : ''
        }
        description={
          editing?.mode === 'grant'
            ? t('admin.members.grantDescription')
            : t('admin.members.editDescription')
        }
        onSave={save}
      >
        {editing?.mode === 'grant' ? (
          <Field label={t('admin.members.days')}>
            <Input
              inputMode="numeric"
              value={editing.days}
              onChange={(e) => setEditing({ ...editing, days: e.target.value })}
            />
          </Field>
        ) : editing ? (
          <Field label={t('admin.members.columns.expires')}>
            <Input
              type="date"
              value={editing.expires}
              onChange={(e) => setEditing({ ...editing, expires: e.target.value })}
            />
          </Field>
        ) : null}
        {editing ? (
          <Field label={t('admin.members.quota')}>
            <Input
              inputMode="numeric"
              value={editing.quota}
              onChange={(e) => setEditing({ ...editing, quota: e.target.value })}
            />
          </Field>
        ) : null}
      </EditDialog>
    </Section>
  );
}

// ── Access requests ─────────────────────────────────────────────────────────

/**
 * Learners asking for a membership, oldest first. Approving grants the same defaults as the members
 * panel (30 days and the default monthly allowance); the operator can change them there afterwards.
 * The optional reason goes to the audit log with the decision.
 */
export function AccessRequestsPanel() {
  const { t, locale } = useI18n();
  const { rows, reload } = useRows(fetchAccessRequests);
  const act = useAction(reload);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const decide = (row: PendingAccessRequestRow, decision: 'approve' | 'reject') =>
    act(
      () => decideAccessRequest(row.accountId, decision, reasons[row.accountId]?.trim()),
      decision === 'approve'
        ? t('admin.accessRequests.approved', { name: row.username })
        : t('admin.accessRequests.rejected', { name: row.username }),
    );

  const columns: Column<PendingAccessRequestRow>[] = [
    {
      id: 'username',
      header: t('admin.members.columns.username'),
      sort: (r) => r.username,
      cell: (r) => <span className="whitespace-nowrap font-medium">{r.username}</span>,
    },
    {
      id: 'membership',
      header: t('admin.members.columns.status'),
      sort: (r) => r.membership,
      cell: (r) => <Badge variant="secondary">{t(`membership.status.${r.membership}`)}</Badge>,
    },
    {
      id: 'requested',
      header: t('admin.table.requested'),
      sort: (r) => r.requestedAt,
      cell: (r) => day(r.requestedAt, locale),
    },
    {
      id: 'note',
      header: t('admin.accessRequests.note'),
      className: 'max-w-xs',
      cell: (r) => (r.note ? <span className="break-words">“{r.note}”</span> : '—'),
    },
    {
      id: 'reason',
      header: t('admin.accessRequests.reason'),
      cell: (r) => (
        <Input
          value={reasons[r.accountId] ?? ''}
          maxLength={200}
          className="h-8 min-w-40"
          placeholder={t('admin.accessRequests.reasonPlaceholder')}
          aria-label={t('admin.accessRequests.reasonPlaceholder')}
          onChange={(event) =>
            setReasons((current) => ({ ...current, [r.accountId]: event.target.value }))
          }
        />
      ),
    },
    {
      id: 'actions',
      header: t('admin.table.actions'),
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void decide(r, 'approve')}>
            {t('admin.accessRequests.approve')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void decide(r, 'reject')}>
            {t('admin.accessRequests.reject')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Section
      id="ops-access-requests"
      title={t('admin.accessRequests.title')}
      description={t('admin.accessRequests.description')}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.accountId}
        searchText={(r) => `${r.username} ${r.note ?? ''}`}
        initialSort={{ id: 'requested', dir: 'asc' }}
        empty={t('admin.accessRequests.empty')}
      />
    </Section>
  );
}

// ── Shares ──────────────────────────────────────────────────────────────────

// A shared course with an update waiting appears once, as the update to decide.
const fetchAllShares = async () => {
  const pending = await fetchShares('pending');
  const waiting = new Set(pending.map((r) => r.courseId));
  const shared = (await fetchShares('shared')).filter((r) => !waiting.has(r.courseId));
  return [...pending, ...shared] as ShareRow[];
};

/** The tags being edited for one course. */
interface TagTarget {
  courseId: string;
  title: string;
  tags: string[];
}

/** A course's tags with a button that opens the tag editor. */
function TagsCell({ tags, onEdit }: { tags: readonly string[] | undefined; onEdit: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-1.5">
      <TagBadges tags={tags} />
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
        <Pencil className="size-3" aria-hidden="true" />
        {t(tags && tags.length > 0 ? 'admin.tags.edit' : 'admin.tags.add')}
      </Button>
    </div>
  );
}

/** The dialog that sets the subject, grade and topic tags of one course. */
function TagsDialog({
  target,
  onTarget,
  act,
}: {
  target: TagTarget | null;
  onTarget: (next: TagTarget | null) => void;
  act: (change: () => Promise<unknown>, done?: string) => Promise<boolean>;
}) {
  const { t } = useI18n();
  return (
    <EditDialog
      open={target !== null}
      onOpenChange={(next) => !next && onTarget(null)}
      title={t('admin.tags.title', { title: target?.title ?? '' })}
      description={t('admin.tags.description')}
      onSave={async () => {
        if (!target) return false;
        return act(() => setCourseTags(target.courseId, target.tags), t('admin.tags.saved'));
      }}
    >
      <CourseTagsEditor
        value={target?.tags ?? []}
        onChange={(tags) => target && onTarget({ ...target, tags })}
      />
    </EditDialog>
  );
}

/** Share requests to decide, and shared courses an operator can take back. */
export function SharesPanel() {
  const { t, locale } = useI18n();
  const { rows, reload } = useRows(fetchAllShares);
  const act = useAction(reload);
  // The request being refused, with the reason its owner will see.
  const [rejecting, setRejecting] = useState<{ row: ShareRow; reason: string } | null>(null);
  const [tagging, setTagging] = useState<TagTarget | null>(null);

  const columns: Column<ShareRow>[] = [
    {
      id: 'title',
      header: t('admin.shares.columns.title'),
      sort: (r) => r.title,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">
            <CourseLink courseId={r.courseId}>{r.title}</CourseLink>
          </span>
          <span className="break-all font-mono text-xs text-muted-foreground">{r.courseId}</span>
          {r.remixOf ? (
            <span className="text-xs text-muted-foreground">
              {t('admin.shares.remixOf', { title: r.remixOf.sourceTitle })}{' '}
              <CourseLink courseId={r.remixOf.sourceId}>{r.remixOf.sourceId}</CourseLink>
            </span>
          ) : null}
          {r.snapshot ? (
            <span className="text-xs text-muted-foreground">
              {t('admin.shares.snapshot', {
                name: r.snapshot.name,
                count: r.snapshot.sceneCount,
                media: r.snapshot.mediaCount,
                size: `${(r.snapshot.bytes / 1_048_576).toFixed(1)} MB`,
              })}
              {r.snapshot.sceneTitles.length > 0
                ? ` · ${r.snapshot.sceneTitles.slice(0, 8).join(' · ')}`
                : ''}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'tags',
      header: t('admin.tags.column'),
      cell: (r) => (
        <TagsCell
          tags={r.tags}
          onEdit={() => setTagging({ courseId: r.courseId, title: r.title, tags: r.tags ?? [] })}
        />
      ),
    },
    {
      id: 'state',
      header: t('admin.members.columns.status'),
      sort: (r) => r.state,
      cell: (r) => (
        <Badge variant={r.state === 'pending' || r.update ? 'secondary' : 'outline'}>
          {r.update ? t('admin.shares.state.update') : t(`admin.shares.state.${r.state}`)}
        </Badge>
      ),
    },
    {
      id: 'requested',
      header: t('admin.table.requested'),
      sort: (r) => r.requestedAt,
      cell: (r) => day(r.requestedAt, locale),
    },
    {
      id: 'actions',
      header: t('admin.table.actions'),
      align: 'right',
      cell: (r) =>
        r.state === 'pending' || r.update ? (
          <div className="flex justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void act(() => decideShare(r.courseId, 'approve'), t('admin.shares.approved'))
              }
            >
              {t('admin.shares.approve')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejecting({ row: r, reason: '' })}
            >
              {t('admin.shares.reject')}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <ConfirmButton
              label={t('admin.shares.revoke')}
              title={t('admin.shares.revokeTitle', { title: r.title })}
              description={t('admin.shares.revokeDescription')}
              confirm={t('admin.shares.revoke')}
              onConfirm={() => act(() => revokeShare(r.courseId), t('admin.shares.revoked'))}
            />
          </div>
        ),
    },
  ];

  return (
    <Section
      id="ops-shares"
      title={t('admin.shares.title')}
      description={t('admin.shares.description')}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.courseId}
        searchText={(r) => `${r.title} ${r.courseId}`}
        filters={[
          {
            id: 'state',
            label: t('admin.members.columns.status'),
            options: (['pending', 'shared'] as const).map((s) => ({
              value: s,
              label: t(`admin.shares.state.${s}`),
            })),
            initial: 'pending',
            test: (r, v) => r.state === v,
          },
        ]}
        initialSort={{ id: 'requested', dir: 'asc' }}
        empty={t('admin.shares.empty')}
      />
      <EditDialog
        open={rejecting !== null}
        onOpenChange={(next) => !next && setRejecting(null)}
        title={t('admin.shares.rejectTitle', { title: rejecting?.row.title ?? '' })}
        description={t('admin.shares.rejectDescription')}
        submitLabel={t('admin.shares.reject')}
        onSave={async () => {
          if (!rejecting) return false;
          const reason = rejecting.reason.trim();
          await act(
            () => decideShare(rejecting.row.courseId, 'reject', reason === '' ? undefined : reason),
            t('admin.shares.rejected'),
          );
          return true;
        }}
      >
        <Field label={t('admin.shares.rejectReason')}>
          <Input
            value={rejecting?.reason ?? ''}
            maxLength={200}
            onChange={(e) => rejecting && setRejecting({ ...rejecting, reason: e.target.value })}
          />
        </Field>
      </EditDialog>
      <TagsDialog target={tagging} onTarget={setTagging} act={act} />
    </Section>
  );
}

// ── Previews ────────────────────────────────────────────────────────────────

export function PreviewsPanel() {
  const { t, locale } = useI18n();
  const { rows, reload } = useRows(fetchPreviews);
  const titles = useCourseTitles();
  const act = useAction(reload);
  const [courseId, setCourseId] = useState('');
  const [tagging, setTagging] = useState<TagTarget | null>(null);

  const add = async () => {
    const id = courseId.trim();
    if (id === '') return;
    await act(() => setPreview(id, true));
    setCourseId('');
  };

  const columns: Column<PreviewRow>[] = [
    {
      id: 'course',
      header: t('admin.previews.courseId'),
      sort: (r) => titles.get(r.courseId) ?? r.courseId,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-medium">
            <CourseLink courseId={r.courseId}>{titles.get(r.courseId) ?? r.courseId}</CourseLink>
          </span>
          <span className="break-all font-mono text-xs text-muted-foreground">{r.courseId}</span>
        </div>
      ),
    },
    {
      id: 'tags',
      header: t('admin.tags.column'),
      cell: (r) => (
        <TagsCell
          tags={r.tags}
          onEdit={() =>
            setTagging({
              courseId: r.courseId,
              title: titles.get(r.courseId) ?? r.courseId,
              tags: r.tags ?? [],
            })
          }
        />
      ),
    },
    {
      id: 'marked',
      header: t('admin.previews.marked'),
      sort: (r) => r.markedAt,
      cell: (r) => day(r.markedAt, locale),
    },
    {
      id: 'actions',
      header: t('admin.table.actions'),
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end">
          <ConfirmButton
            label={t('admin.previews.remove')}
            title={t('admin.previews.removeTitle', { id: r.courseId })}
            description={t('admin.previews.removeDescription')}
            confirm={t('admin.previews.remove')}
            onConfirm={() => act(() => setPreview(r.courseId, false))}
          />
        </div>
      ),
    },
  ];

  return (
    <Section
      id="ops-previews"
      title={t('admin.previews.title')}
      description={t('admin.previews.description')}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.courseId}
        searchText={(r) => r.courseId}
        initialSort={{ id: 'marked', dir: 'desc' }}
        empty={t('admin.previews.empty')}
        toolbar={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Input
              aria-label={t('admin.previews.courseId')}
              placeholder={t('admin.previews.courseId')}
              className="h-8 w-56"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            />
            <Button type="submit" size="sm">
              {t('admin.previews.add')}
            </Button>
          </form>
        }
      />
      <TagsDialog target={tagging} onTarget={setTagging} act={act} />
    </Section>
  );
}

// ── Courses ─────────────────────────────────────────────────────────────────

/** Every course, so staff can review one and copy its ID for a preview or a class. */
export function CoursesPanel() {
  const { t, locale } = useI18n();
  const { rows } = useRows(fetchCourses);

  const copy = (id: string) => {
    navigator.clipboard
      .writeText(id)
      .then(() => toast.success(t('admin.courses.copied', { id })))
      .catch(() => toast.error(t('learning.errors.generic')));
  };

  const columns: Column<CourseEntry>[] = [
    {
      id: 'title',
      header: t('admin.shares.columns.title'),
      sort: (r) => r.title,
      cell: (r) => (
        <span className="font-medium">
          <CourseLink courseId={r.courseId}>{r.title}</CourseLink>
        </span>
      ),
    },
    {
      id: 'id',
      header: t('admin.previews.courseId'),
      sort: (r) => r.courseId,
      cell: (r) => (
        <span className="inline-flex items-center gap-1">
          <span className="break-all font-mono text-xs">{r.courseId}</span>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('admin.courses.copy', { id: r.courseId })}
            title={t('admin.courses.copy', { id: r.courseId })}
            onClick={() => copy(r.courseId)}
          >
            <Copy className="size-3.5" />
          </button>
        </span>
      ),
    },
    {
      id: 'owner',
      header: t('admin.courses.owner'),
      sort: (r) => r.owner ?? '',
      cell: (r) =>
        r.owner ?? <span className="text-muted-foreground">{t('admin.courses.anonymous')}</span>,
    },
    {
      id: 'updated',
      header: t('admin.courses.updated'),
      sort: (r) => r.updatedAt ?? '',
      cell: (r) => (r.updatedAt ? day(r.updatedAt, locale) : '—'),
    },
  ];

  return (
    <Section
      id="ops-courses"
      title={t('admin.courses.title')}
      description={t('admin.courses.description')}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.courseId}
        searchText={(r) => `${r.title} ${r.courseId} ${r.owner ?? ''}`}
        initialSort={{ id: 'updated', dir: 'desc' }}
        empty={t('admin.courses.empty')}
      />
    </Section>
  );
}

// ── Classes ─────────────────────────────────────────────────────────────────

/** The members of one class, each with a way to take them out. Closes with `onClose`. */
function ClassMembersDialog({
  row,
  onClose,
  onChanged,
}: {
  row: ClassRow | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const failure = useFailureMessage();
  const [members, setMembers] = useState<ClassMember[] | null>(null);
  // How far each member got in the class courses. Missing rows read as "not started".
  const [progress, setProgress] = useState<ClassProgressRow[]>([]);
  // Every account, for adding learners without a code. Loaded with the dialog.
  const [accounts, setAccounts] = useState<MemberRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const classId = row?.id;

  const load = useCallback(async () => {
    if (!classId) return;
    try {
      setMembers(await fetchClassMembers(classId));
    } catch (error) {
      toast.error(failure(error));
    }
  }, [classId, failure]);

  // Mounted per class (keyed by its id), so the list starts empty for each one.
  useEffect(() => {
    if (!classId) return;
    let active = true;
    fetchClassMembers(classId)
      .then((next) => {
        if (active) setMembers(next);
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    fetchClassProgress(classId)
      .then((next) => {
        if (active) setProgress(next);
      })
      .catch(() => {
        // The member list works without progress.
      });
    fetchAllMembers()
      .then((next) => {
        if (active) setAccounts(next);
      })
      .catch((error: unknown) => {
        if (active) toast.error(failure(error));
      });
    return () => {
      active = false;
    };
  }, [classId, failure]);

  const progressText = (accountId: string, total: number) => {
    const mine = progress.filter((p) => p.accountId === accountId);
    if (mine.length === 0) return t('admin.classes.progress.none');
    const done = mine.filter((p) => p.doneAt !== null).length;
    const last = mine.reduce((latest, p) => (p.updatedAt > latest ? p.updatedAt : latest), '');
    return `${t('admin.classes.progress.summary', { done, total })} · ${t('admin.classes.progress.last', { date: day(last, locale) })}`;
  };

  const inClass = new Set((members ?? []).map((m) => m.accountId));
  const needle = query.trim().toLowerCase();
  const candidates = (accounts ?? [])
    .filter(
      (a) => !inClass.has(a.id) && (needle === '' || a.username.toLowerCase().includes(needle)),
    )
    .sort((a, b) => a.username.localeCompare(b.username));

  const add = async (account: MemberRow) => {
    if (!classId) return;
    setAdding(account.id);
    try {
      await addClassMember(classId, account.id);
      toast.success(t('admin.classes.addMember.added', { username: account.username }));
    } catch (error) {
      toast.error(failure(error));
    } finally {
      setAdding(null);
    }
    await load();
    await onChanged();
  };

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('admin.classes.membersOf', { name: row?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('admin.classes.membersDescription')}</DialogDescription>
        </DialogHeader>
        {members === null ? (
          <p className="text-sm text-muted-foreground">{t('admin.table.loading')}</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.classes.noMembers')}</p>
        ) : (
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
            {members.map((m) => (
              <li key={m.accountId} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{m.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {t('admin.classes.joined', { date: day(m.joinedAt, locale) })}
                    {row && row.courseIds.length > 0
                      ? ` · ${progressText(m.accountId, row.courseIds.length)}`
                      : ''}
                  </span>
                </div>
                <ConfirmButton
                  icon={false}
                  label={t('admin.classes.removeMember')}
                  title={t('admin.classes.removeMemberTitle', {
                    username: m.username,
                    name: row?.name ?? '',
                  })}
                  description={t('admin.classes.removeMemberDescription')}
                  confirm={t('admin.classes.removeMember')}
                  onConfirm={async () => {
                    try {
                      await removeClassMember(classId!, m.accountId);
                      toast.success(t('admin.classes.memberRemoved', { username: m.username }));
                    } catch (error) {
                      toast.error(failure(error));
                    }
                    await load();
                    await onChanged();
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <section className="flex flex-col gap-2 border-t pt-4">
          <h3 className="text-sm font-semibold">{t('admin.classes.addMember.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('admin.classes.addMember.description')}
          </p>
          <Input
            aria-label={t('admin.classes.addMember.search')}
            placeholder={t('admin.classes.addMember.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {accounts === null ? (
            <p className="text-sm text-muted-foreground">{t('admin.table.loading')}</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('admin.classes.addMember.empty')}</p>
          ) : (
            <ul className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-lg border">
              {candidates.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{a.username}</span>
                    {a.membership?.active ? null : (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {t('admin.classes.addMember.noMembership')}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={adding !== null}
                    onClick={() => void add(a)}
                  >
                    {t('admin.classes.addMember.add')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Picks the courses of one class: every course with a search box, what it is (attached, can be
 * attached, or private and waiting to be shared) and a button to attach or detach it. Replaces
 * copying course IDs by hand.
 */
function ClassCoursesDialog({
  row,
  courses,
  onClose,
  onAttach,
  onDetach,
}: {
  row: ClassRow | null;
  courses: CourseEntry[] | null;
  onClose: () => void;
  onAttach: (courseId: string, title: string) => Promise<unknown>;
  onDetach: (courseId: string, title: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const attached = new Set(row?.courseIds ?? []);
  const needle = query.trim().toLowerCase();
  const rank = (c: CourseEntry) => (attached.has(c.courseId) ? 0 : c.attachable ? 1 : 2);
  const list = (courses ?? [])
    .filter(
      (c) =>
        needle === '' ||
        c.title.toLowerCase().includes(needle) ||
        (c.owner ?? '').toLowerCase().includes(needle),
    )
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));

  const run = async (courseId: string, change: () => Promise<unknown>) => {
    setBusy(courseId);
    try {
      await change();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          setQuery('');
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('admin.classes.coursesDialog.title', { name: row?.name ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('admin.classes.coursesDialog.description')}</DialogDescription>
        </DialogHeader>
        <Input
          aria-label={t('admin.classes.coursesDialog.search')}
          placeholder={t('admin.classes.coursesDialog.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {courses === null ? (
          <p className="text-sm text-muted-foreground">{t('admin.table.loading')}</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.classes.coursesDialog.empty')}</p>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-lg border">
            {list.map((c) => {
              const isAttached = attached.has(c.courseId);
              return (
                <li key={c.courseId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">
                      <CourseLink courseId={c.courseId}>{c.title}</CourseLink>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t('admin.classes.coursesDialog.owner', {
                        name: c.owner ?? t('admin.courses.anonymous'),
                      })}
                    </span>
                  </div>
                  {isAttached ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">
                        {t('admin.classes.coursesDialog.isAttached')}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() => void run(c.courseId, () => onDetach(c.courseId, c.title))}
                      >
                        {t('admin.classes.coursesDialog.detach')}
                      </Button>
                    </div>
                  ) : c.attachable ? (
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={busy !== null}
                      onClick={() => void run(c.courseId, () => onAttach(c.courseId, c.title))}
                    >
                      {t('admin.classes.coursesDialog.attach')}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t('admin.classes.coursesDialog.private')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ClassesPanel() {
  const { t } = useI18n();
  const { rows, reload } = useRows(fetchClasses);
  const { rows: courses } = useRows(fetchCourses);
  const titles = new Map((courses ?? []).map((c) => [c.courseId, c.title]));
  const act = useAction(reload);
  const [name, setName] = useState('');
  // The join code of the class just created or given a new code. The server shows it only once.
  const [joinCode, setJoinCode] = useState<{ name: string; code: string } | null>(null);
  // The class whose course picker is open, by id, so the dialog follows reloads of its row.
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ row: ClassRow; name: string } | null>(null);
  const [viewing, setViewing] = useState<ClassRow | null>(null);
  const failure = useFailureMessage();

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed === '') return;
    try {
      const created = await createClass(trimmed);
      setName('');
      setJoinCode({ name: created.name, code: created.joinCode });
    } catch (error) {
      toast.error(failure(error));
    }
    await reload();
  };

  const choosing = rows?.find((r) => r.id === choosingId) ?? null;

  // A learner who opens this lands on the catalog with the code filled in; they still press Join.
  const inviteLink = (code: string) =>
    `${window.location.origin}/catalog?join=${encodeURIComponent(code)}`;
  const copy = (text: string, done: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t(done)),
      () => toast.error(t('admin.classes.copyFailed')),
    );
  };

  const columns: Column<ClassRow>[] = [
    {
      id: 'name',
      header: t('admin.classes.name'),
      sort: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      id: 'members',
      header: t('admin.classes.columns.members'),
      align: 'right',
      sort: (r) => r.memberCount,
      cell: (r) => (
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          aria-label={t('admin.classes.membersOf', { name: r.name })}
          onClick={() => setViewing(r)}
        >
          <Users />
          {t('admin.classes.manageMembers', { count: r.memberCount })}
        </Button>
      ),
    },
    {
      id: 'courses',
      header: t('admin.classes.columns.courses'),
      sort: (r) => r.courseIds.length,
      className: 'min-w-64',
      cell: (r) => (
        <div className="flex flex-col gap-1.5">
          {r.courseIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {r.courseIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
                  title={id}
                >
                  <CourseLink courseId={id}>{titles.get(id) ?? id}</CourseLink>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    aria-label={t('admin.classes.detach', { id })}
                    title={t('admin.classes.detach', { id })}
                    onClick={() => void act(() => detachCourse(r.id, id))}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-7 self-start"
            onClick={() => setChoosingId(r.id)}
          >
            <ListPlus />
            {t('admin.classes.manageCourses')}
          </Button>
        </div>
      ),
    },
    {
      id: 'actions',
      header: t('admin.table.actions'),
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setRenaming({ row: r, name: r.name })}>
            <Pencil />
            {t('admin.table.edit')}
          </Button>
          <ConfirmButton
            icon={false}
            label={t('admin.classes.newCode')}
            title={t('admin.classes.newCodeTitle', { name: r.name })}
            description={t('admin.classes.newCodeDescription')}
            confirm={t('admin.classes.newCode')}
            onConfirm={() =>
              act(async () => {
                const rotated = await rotateJoinCode(r.id);
                setJoinCode({ name: r.name, code: rotated.joinCode });
              })
            }
          />
          <ConfirmButton
            label={t('admin.table.delete')}
            title={t('admin.classes.deleteTitle', { name: r.name })}
            description={t('admin.classes.deleteDescription', { count: r.memberCount })}
            confirm={t('admin.table.delete')}
            onConfirm={() =>
              act(() => deleteClass(r.id), t('admin.classes.deleted', { name: r.name }))
            }
          />
        </div>
      ),
    },
  ];

  return (
    <Section
      id="ops-classes"
      title={t('admin.classes.title')}
      description={t('admin.classes.description')}
    >
      <ol className="flex list-decimal flex-col gap-1 rounded-md border bg-muted/30 py-3 pl-8 pr-4 text-sm text-muted-foreground">
        <li>{t('admin.classes.steps.create')}</li>
        <li>{t('admin.classes.steps.share')}</li>
        <li>{t('admin.classes.steps.attach')}</li>
      </ol>
      {joinCode ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium">
              {t('admin.classes.joinCodeTitle', { name: joinCode.name })}
            </span>
            <span className="text-muted-foreground">{t('admin.classes.joinCodeHint')}</span>
            <span className="select-all break-all font-mono text-xs text-muted-foreground">
              {inviteLink(joinCode.code)}
            </span>
          </div>
          <code className="select-all rounded bg-background px-3 py-1.5 font-mono text-lg font-semibold tracking-widest">
            {joinCode.code}
          </code>
          <Button
            size="sm"
            onClick={() => copy(inviteLink(joinCode.code), 'admin.classes.linkCopied')}
          >
            <Link2 />
            {t('admin.classes.copyLink')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(joinCode.code, 'admin.classes.codeCopied')}
          >
            <Copy />
            {t('admin.classes.copyCode')}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            aria-label={t('admin.classes.closeCode')}
            title={t('admin.classes.closeCode')}
            onClick={() => setJoinCode(null)}
          >
            <X />
          </Button>
        </div>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.name} ${r.courseIds.join(' ')}`}
        initialSort={{ id: 'name', dir: 'asc' }}
        empty={t('admin.classes.empty')}
        toolbar={
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Input
              aria-label={t('admin.classes.name')}
              placeholder={t('admin.classes.name')}
              className="h-8 w-48"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="sm">
              {t('admin.classes.create')}
            </Button>
          </form>
        }
      />
      <ClassCoursesDialog
        row={choosing}
        courses={courses}
        onClose={() => setChoosingId(null)}
        onAttach={(courseId, title) =>
          act(
            () => attachCourse(choosing!.id, courseId),
            t('admin.classes.coursesDialog.attached', { title }),
          )
        }
        onDetach={(courseId, title) =>
          act(
            () => detachCourse(choosing!.id, courseId),
            t('admin.classes.coursesDialog.detached', { title }),
          )
        }
      />
      <ClassMembersDialog
        key={viewing?.id ?? 'none'}
        row={viewing}
        onClose={() => setViewing(null)}
        onChanged={reload}
      />
      <EditDialog
        open={renaming !== null}
        onOpenChange={(next) => !next && setRenaming(null)}
        title={t('admin.classes.renameTitle')}
        onSave={async () => {
          const next = renaming?.name.trim() ?? '';
          if (!renaming || next === '') return false;
          if (next !== renaming.row.name) {
            await act(() => renameClass(renaming.row.id, next), t('admin.classes.renamed'));
          }
          return true;
        }}
      >
        <Field label={t('admin.classes.name')}>
          <Input
            value={renaming?.name ?? ''}
            maxLength={80}
            onChange={(e) => renaming && setRenaming({ ...renaming, name: e.target.value })}
          />
        </Field>
      </EditDialog>
    </Section>
  );
}

// ── Audit log ───────────────────────────────────────────────────────────────

/** The first part of an action (`class:attach:<id>` → `class`); `list` is a view, not a change. */
function category(action: string): string {
  return action.split(':')[0]!;
}

const CATEGORIES = [
  'membership',
  'access',
  'share',
  'preview',
  'course',
  'class',
  'set_role',
  'disable',
  'enable',
  'password_reset',
];

function actionLabel(action: string, t: (key: string) => string): string {
  // `class:attach:<classId>` reads as "class:attach"; the class is in the target column.
  const key = `admin.audit.actions.${action.split(':').slice(0, 2).join('_')}`;
  const text = t(key);
  return text === key ? action : text;
}

export function AuditPanel() {
  const { t, locale } = useI18n();
  const { rows } = useRows(fetchAudit);

  const columns: Column<AuditRow>[] = [
    {
      id: 'time',
      header: t('admin.audit.columns.time'),
      sort: (r) => r.id,
      className: 'whitespace-nowrap',
      cell: (r) => (
        <span className="tabular-nums">{new Date(r.createdAt).toLocaleString(locale)}</span>
      ),
    },
    {
      id: 'actor',
      header: t('admin.audit.columns.actor'),
      sort: (r) => r.actorName ?? r.actorId,
      cell: (r) => r.actorName ?? <span className="font-mono text-xs">{r.actorId}</span>,
    },
    {
      id: 'action',
      header: t('admin.audit.columns.action'),
      sort: (r) => r.action,
      cell: (r) => (
        <Badge variant="outline" title={r.action}>
          {actionLabel(r.action, t)}
        </Badge>
      ),
    },
    {
      id: 'target',
      header: t('admin.audit.columns.target'),
      sort: (r) => r.targetName ?? r.targetId,
      cell: (r) =>
        r.targetName ?? <span className="break-all font-mono text-xs">{r.targetId}</span>,
    },
    {
      id: 'reason',
      header: t('admin.audit.columns.details'),
      className: 'max-w-xs',
      cell: (r) => (r.reason ? <span className="break-words">{r.reason}</span> : '—'),
    },
  ];

  return (
    <Section
      id="ops-audit"
      title={t('admin.audit.title')}
      description={t('admin.audit.description', { max: AUDIT_MAX })}
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => String(r.id)}
        searchText={(r) =>
          [r.actorName, r.actorId, r.targetName, r.targetId, r.action, r.reason].join(' ')
        }
        filters={[
          {
            id: 'category',
            label: t('admin.audit.columns.action'),
            options: [
              { value: 'changes', label: t('admin.audit.categories.changes') },
              ...CATEGORIES.map((c) => ({ value: c, label: t(`admin.audit.categories.${c}`) })),
              { value: 'list', label: t('admin.audit.categories.list') },
            ],
            // Viewing the account list is logged too; it is noise next to the changes.
            initial: 'changes',
            test: (r, v) =>
              v === 'changes' ? category(r.action) !== 'list' : category(r.action) === v,
          },
        ]}
        initialSort={{ id: 'time', dir: 'desc' }}
        empty={t('admin.audit.empty')}
      />
    </Section>
  );
}

/** Which providers the server manages. Read-only: they are set in the server configuration, never here. */
export function ProviderStatusPanel() {
  const { t } = useI18n();
  const [ids, setIds] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchServerProviders()
      .then((byKind) => {
        if (active) setIds([...new Set(Object.values(byKind).flat())]);
      })
      .catch(() => {
        // Without the list the panel shows its empty line.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Section
      id="ops-providers"
      title={t('account.adminPage.providers.title')}
      description={t('account.adminPage.providers.description')}
    >
      {ids === null || ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('account.adminPage.providers.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => (
            <Badge key={id} variant="outline">
              {id}
            </Badge>
          ))}
        </div>
      )}
    </Section>
  );
}
