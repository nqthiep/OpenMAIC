'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Medal, Pencil, Plus, Sparkles, ThumbsUp, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyPane, JoinHint, RichText } from '@/components/community/community';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { useFailureToast } from '@/components/support/support-inbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createChallenge,
  fetchAppSettings,
  fetchChallenge,
  fetchChallenges,
  setAppSetting,
  setEntryHidden,
  submitEntry,
  updateChallenge,
  voteEntry,
  type ChallengeInput,
  type ChallengePhase,
  type ChallengeRow,
  type EntryRow,
  type LeaderRow,
} from '@/components/learning/learning-api';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const BODY_MAX = 8000;
const DEFAULT_REWARDS: [number, number, number] = [5000, 3000, 1000];
const DAY = 86_400_000;

const PHASE_BADGE: Record<ChallengePhase, string> = {
  upcoming: 'border-slate-300 text-slate-600 dark:text-slate-300',
  open: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300',
  voting:
    'border-violet-300 bg-violet-50 text-violet-800 dark:bg-violet-500/10 dark:text-violet-300',
  finished: 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
};

const MEDAL = ['text-amber-500', 'text-slate-400', 'text-orange-700'];

function PhaseBadge({ phase }: { phase: ChallengePhase }) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={cn('shrink-0', PHASE_BADGE[phase])}>
      {t(`challenge.phase.${phase}`)}
    </Badge>
  );
}

/** What the current phase means for the reader, with its deadline. */
function phaseLine(
  challenge: ChallengeRow,
  t: (key: string, values?: Record<string, string>) => string,
  locale: string,
) {
  const at = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
  switch (challenge.phase) {
    case 'upcoming':
      return t('challenge.when.upcoming', { date: at(challenge.opensAt) });
    case 'open':
      return t('challenge.when.open', { date: at(challenge.closesAt) });
    case 'voting':
      return t('challenge.when.voting', { date: at(challenge.votingEndsAt) });
    default:
      return t('challenge.when.finished', { date: at(challenge.votingEndsAt) });
  }
}

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2 rounded-2xl border p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Trophy className="size-4 text-amber-500" aria-hidden="true" />
        {t('challenge.leaderboard.title')}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('challenge.leaderboard.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {rows.map((row, index) => (
            <li key={row.username} className="flex items-center gap-2">
              <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.username}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('challenge.leaderboard.points', { count: row.points })}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] text-muted-foreground">{t('challenge.leaderboard.rule')}</p>
    </div>
  );
}

function EntryCard({
  entry,
  phase,
  own,
  canVote,
  staff,
  onVote,
  onHide,
}: {
  entry: EntryRow;
  phase: ChallengePhase;
  own: boolean;
  canVote: boolean;
  staff: boolean;
  onVote: () => void;
  onHide: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-3',
        entry.rank === 1 && 'border-amber-400 bg-amber-500/5',
        entry.hidden && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {entry.rank ? (
          <span className={cn('flex items-center gap-1 font-semibold', MEDAL[entry.rank - 1])}>
            <Medal className="size-4" aria-hidden="true" />
            {t('challenge.rank', { rank: entry.rank })}
          </span>
        ) : null}
        <span className="font-medium text-foreground">{entry.username}</span>
        {own ? <Badge variant="secondary">{t('challenge.yours')}</Badge> : null}
        <span>· {new Date(entry.updatedAt).toLocaleString(locale)}</span>
        {entry.aiScore !== null ? (
          <span className="flex items-center gap-1 text-violet-700 dark:text-violet-300">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t('challenge.aiScore', { score: entry.aiScore })}
          </span>
        ) : null}
        {entry.reward > 0 ? (
          <span>· {t('challenge.reward', { tokens: entry.reward.toLocaleString(locale) })}</span>
        ) : null}
        {entry.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
      </div>
      <RichText text={entry.body} />
      {entry.aiFeedback ? (
        <div className="rounded-xl border border-violet-200 bg-violet-500/5 p-2 text-sm dark:border-violet-400/20">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t('challenge.aiFeedback')}
          </p>
          <RichText text={entry.aiFeedback} />
        </div>
      ) : null}
      {phase !== 'open' || staff ? (
        <div className="flex flex-wrap items-center gap-1">
          {phase !== 'open' ? (
            <Button
              type="button"
              size="sm"
              variant={entry.voted ? 'secondary' : 'ghost'}
              aria-pressed={entry.voted}
              disabled={!canVote || own || phase !== 'voting'}
              onClick={onVote}
              className="h-7 gap-1 px-2 text-xs"
              aria-label={t('challenge.vote', { count: entry.votes })}
            >
              <ThumbsUp className="size-3.5" aria-hidden="true" />
              <span className="tabular-nums">{entry.votes}</span>
            </Button>
          ) : null}
          {staff && entry.rank === null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onHide}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            >
              {entry.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {entry.hidden ? t('community.mod.show') : t('community.mod.hide')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ChallengeDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const failure = useFailureToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchChallenge>> | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReference, setShowReference] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchChallenge(id));
    } catch (error) {
      failure(error);
    }
  }, [id, failure]);

  // The parent keys this component by challenge, so it starts empty for each one.
  useEffect(() => {
    let active = true;
    fetchChallenge(id)
      .then((next) => {
        if (!active) return;
        setData(next);
        // Opening a finished challenge may have settled it after the list was read; read the list
        // (and its leaderboard) again so the places show.
        if (next.challenge.phase === 'finished') onChanged();
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [id, failure, onChanged]);

  if (!data) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  const { challenge, entries, viewer } = data;
  const mine = entries.find((entry) => entry.accountId === viewer.accountId);
  const text = draft ?? mine?.body ?? '';

  const run = async (change: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await change();
      await load();
      onChanged();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await submitEntry(challenge.id, text.trim());
      setDraft(null);
      if (result.graded) toast.success(t('challenge.submitted'));
      else
        toast(t(`challenge.notGraded.${result.reason === 'QUOTA_EXCEEDED' ? 'quota' : 'failed'}`));
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 text-lg font-semibold">{challenge.title}</h3>
          <PhaseBadge phase={challenge.phase} />
          {challenge.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {phaseLine(challenge, t, locale)} ·{' '}
          {t('challenge.entries', { count: challenge.entryCount })}
        </p>
        {challenge.rewards.some((r) => r > 0) ? (
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <Trophy className="size-3.5 text-amber-500" aria-hidden="true" />
            {challenge.rewards.map((tokens, index) =>
              tokens > 0 ? (
                <span key={index} className="rounded-full border px-2 py-0.5">
                  {t('challenge.prize', { rank: index + 1, tokens: tokens.toLocaleString(locale) })}
                </span>
              ) : null,
            )}
            <span className="text-muted-foreground">{t('challenge.prizeBadge')}</span>
          </p>
        ) : null}
        <div className="rounded-2xl border p-3">
          <RichText text={challenge.statement} />
        </div>
      </div>

      {challenge.phase === 'open' ? (
        viewer.canPost ? (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium">
                {mine ? t('challenge.editEntry') : t('challenge.yourEntry')}
              </span>
              <Textarea
                rows={6}
                maxLength={BODY_MAX}
                value={text}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('challenge.entryPlaceholder')}
              />
            </label>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5 text-violet-500" aria-hidden="true" />
              {t('challenge.gradeNote')}
            </p>
            <Button type="submit" disabled={busy || text.trim() === ''} className="self-end">
              {busy
                ? t('challenge.grading')
                : mine
                  ? t('challenge.resubmit')
                  : t('challenge.submit')}
            </Button>
          </form>
        ) : (
          <JoinHint />
        )
      ) : null}

      {challenge.referenceSolution && challenge.phase !== 'open' ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowReference((v) => !v)}
            className="self-start"
            aria-expanded={showReference}
          >
            {showReference ? t('challenge.hideReference') : t('challenge.showReference')}
          </Button>
          {showReference ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-500/5 p-3">
              <RichText text={challenge.referenceSolution} />
            </div>
          ) : null}
        </div>
      ) : null}

      {entries.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">
            {challenge.phase === 'open' && !viewer.staff
              ? t('challenge.yourEntry')
              : challenge.phase === 'finished'
                ? t('challenge.results')
                : t('challenge.allEntries')}
          </p>
          {challenge.phase === 'voting' ? (
            <p className="text-xs text-muted-foreground">{t('challenge.voteHint')}</p>
          ) : null}
          <ol className="flex flex-col gap-3">
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                phase={challenge.phase}
                own={entry.accountId === viewer.accountId}
                canVote={viewer.canPost}
                staff={viewer.staff}
                onVote={() => run(() => voteEntry(entry.id))}
                onHide={() => run(() => setEntryHidden(entry.id, !entry.hidden))}
              />
            ))}
          </ol>
        </div>
      ) : challenge.phase !== 'open' ? (
        <p className="text-sm text-muted-foreground">{t('challenge.noEntries')}</p>
      ) : null}
    </div>
  );
}

/** The challenges tab of the community: list and monthly leaderboard on the left, one challenge on the right. */
export function ChallengeBoard() {
  const { t, locale } = useI18n();
  const failure = useFailureToast();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchChallenges>> | null>(null);
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('challenge'),
  );

  const reload = useCallback(async () => {
    try {
      setData(await fetchChallenges());
    } catch (error) {
      failure(error);
    }
  }, [failure]);

  useEffect(() => {
    let active = true;
    fetchChallenges()
      .then((next) => {
        if (!active) return;
        setData(next);
        // Open the running challenge by default.
        setSelected(
          (current) =>
            current ??
            next.challenges.find((c) => c.phase === 'open')?.id ??
            next.challenges.find((c) => c.phase === 'voting')?.id ??
            next.challenges[0]?.id ??
            null,
        );
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [failure]);

  return (
    <div className={cn('grid min-h-[32rem] grid-cols-[22rem_1fr] gap-6 rounded-2xl p-6', GLASS)}>
      <div className="flex min-h-0 flex-col gap-4 border-r pr-6">
        {data === null ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : data.challenges.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('challenge.none')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {data.challenges.map((challenge) => (
              <li key={challenge.id}>
                <button
                  type="button"
                  onClick={() => setSelected(challenge.id)}
                  aria-current={selected === challenge.id ? 'true' : undefined}
                  className={cn(
                    'flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                    selected === challenge.id ? 'border-primary bg-muted' : 'border-transparent',
                  )}
                >
                  <span className="flex items-start gap-2">
                    <span className="min-w-0 flex-1 font-medium">{challenge.title}</span>
                    <PhaseBadge phase={challenge.phase} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(challenge.opensAt).toLocaleDateString(locale)} ·{' '}
                    {t('challenge.entries', { count: challenge.entryCount })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data ? <Leaderboard rows={data.leaderboard} /> : null}
      </div>
      <div className="flex min-w-0 flex-col">
        {selected ? (
          <ChallengeDetail key={selected} id={selected} onChanged={reload} />
        ) : (
          <EmptyPane
            icon={Trophy}
            lines={[data?.challenges.length === 0 ? t('challenge.none') : t('challenge.pick')]}
          />
        )}
      </div>
    </div>
  );
}

/** `YYYY-MM-DDTHH:mm` in the viewer's time zone, the value a `datetime-local` input shows. */
function localDateTime(date: Date): string {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

interface FormState {
  title: string;
  statement: string;
  referenceSolution: string;
  opensAt: string;
  submissionDays: string;
  votingDays: string;
  rewards: [string, string, string];
  hidden: boolean;
}

function formFor(challenge?: ChallengeRow): FormState {
  if (!challenge) {
    return {
      title: '',
      statement: '',
      referenceSolution: '',
      opensAt: localDateTime(new Date()),
      submissionDays: '7',
      votingDays: '3',
      rewards: DEFAULT_REWARDS.map(String) as [string, string, string],
      hidden: false,
    };
  }
  const opens = new Date(challenge.opensAt).getTime();
  const closes = new Date(challenge.closesAt).getTime();
  const votingEnds = new Date(challenge.votingEndsAt).getTime();
  return {
    title: challenge.title,
    statement: challenge.statement,
    referenceSolution: challenge.referenceSolution,
    opensAt: localDateTime(new Date(opens)),
    submissionDays: String(Math.round((closes - opens) / DAY)),
    votingDays: String(Math.round((votingEnds - closes) / DAY)),
    rewards: challenge.rewards.map(String) as [string, string, string],
    hidden: challenge.hidden,
  };
}

function ChallengeForm({
  challenge,
  open,
  onOpenChange,
  onSaved,
}: {
  challenge?: ChallengeRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [form, setForm] = useState<FormState>(() => formFor(challenge));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const input: ChallengeInput = {
      title: form.title,
      statement: form.statement,
      referenceSolution: form.referenceSolution,
      opensAt: new Date(form.opensAt).toISOString(),
      submissionDays: Number(form.submissionDays),
      votingDays: Number(form.votingDays),
      rewards: form.rewards.map(Number) as [number, number, number],
      hidden: form.hidden,
    };
    setBusy(true);
    try {
      if (challenge) await updateChallenge(challenge.id, input);
      else await createChallenge(input);
      toast.success(t('challenge.admin.saved'));
      onOpenChange(false);
      onSaved();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  };

  const field = 'flex flex-col gap-1.5 text-sm';
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {challenge ? t('challenge.admin.edit') : t('challenge.admin.create')}
            </DialogTitle>
          </DialogHeader>
          <label className={field}>
            <span className="font-medium">{t('challenge.admin.title')}</span>
            <Input
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </label>
          <label className={field}>
            <span className="font-medium">{t('challenge.admin.statement')}</span>
            <Textarea
              required
              rows={5}
              value={form.statement}
              onChange={(e) => set('statement', e.target.value)}
              placeholder={t('challenge.admin.markdownHint')}
            />
          </label>
          <label className={field}>
            <span className="font-medium">{t('challenge.admin.reference')}</span>
            <Textarea
              rows={4}
              value={form.referenceSolution}
              onChange={(e) => set('referenceSolution', e.target.value)}
              placeholder={t('challenge.admin.referenceHint')}
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className={field}>
              <span className="font-medium">{t('challenge.admin.opensAt')}</span>
              <Input
                required
                type="datetime-local"
                value={form.opensAt}
                onChange={(e) => set('opensAt', e.target.value)}
              />
            </label>
            <label className={field}>
              <span className="font-medium">{t('challenge.admin.submissionDays')}</span>
              <Input
                required
                type="number"
                min={1}
                max={30}
                value={form.submissionDays}
                onChange={(e) => set('submissionDays', e.target.value)}
              />
            </label>
            <label className={field}>
              <span className="font-medium">{t('challenge.admin.votingDays')}</span>
              <Input
                required
                type="number"
                min={0}
                max={30}
                value={form.votingDays}
                onChange={(e) => set('votingDays', e.target.value)}
              />
            </label>
          </div>
          <fieldset className="grid grid-cols-3 gap-3">
            <legend className="mb-1.5 text-sm font-medium">{t('challenge.admin.rewards')}</legend>
            {form.rewards.map((value, index) => (
              <label key={index} className={field}>
                <span className="text-xs text-muted-foreground">
                  {t('challenge.rank', { rank: index + 1 })}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  step={500}
                  value={value}
                  onChange={(e) => {
                    const next = [...form.rewards] as [string, string, string];
                    next[index] = e.target.value;
                    set('rewards', next);
                  }}
                />
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-muted-foreground">{t('challenge.admin.rewardsHint')}</p>
          {challenge ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hidden}
                onChange={(e) => set('hidden', e.target.checked)}
              />
              {t('challenge.admin.hidden')}
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('admin.table.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Staff list of every challenge, with create and edit. */
export function ChallengeAdminPanel() {
  const { t, locale } = useI18n();
  const failure = useFailureToast();
  const [rows, setRows] = useState<ChallengeRow[] | null>(null);
  const [editing, setEditing] = useState<{ challenge?: ChallengeRow } | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows((await fetchChallenges()).challenges);
    } catch (error) {
      failure(error);
    }
  }, [failure]);

  useEffect(() => {
    let active = true;
    fetchChallenges()
      .then((next) => {
        if (active) setRows(next.challenges);
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [failure]);

  return (
    <section
      id="ops-challenges"
      className={cn('flex scroll-mt-6 flex-col gap-4 rounded-3xl p-6', GLASS)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t('challenge.admin.panelTitle')}</SectionTitle>
          <p className="text-sm text-muted-foreground">{t('challenge.admin.panelDescription')}</p>
        </div>
        <Button size="sm" onClick={() => setEditing({})} className="shrink-0 gap-1.5">
          <Plus className="size-4" aria-hidden="true" />
          {t('challenge.admin.create')}
        </Button>
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('challenge.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm"
            >
              <span className="min-w-0 flex-1 font-medium">{row.title}</span>
              <PhaseBadge phase={row.phase} />
              {row.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
              <span className="text-xs text-muted-foreground">
                {new Date(row.opensAt).toLocaleDateString(locale)} →{' '}
                {new Date(row.votingEndsAt).toLocaleDateString(locale)} ·{' '}
                {t('challenge.entries', { count: row.entryCount })}
              </span>
              <Button asChild size="sm" variant="outline">
                <a href={`/community?tab=challenges&challenge=${encodeURIComponent(row.id)}`}>
                  {t('community.reports.open')}
                </a>
              </Button>
              {!row.settled ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ challenge: row })}
                  className="gap-1"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  {t('challenge.admin.edit')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ChallengeForm
          key={editing.challenge?.id ?? 'new'}
          challenge={editing.challenge}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </section>
  );
}

/** The administrator's switch for who pays the AI grading of challenge entries. */
export function ChallengeSettingsPanel() {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [state, setState] = useState<{ value: string; canChange: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    fetchAppSettings()
      .then((next) => {
        if (active) {
          setState({
            value: String(next.settings['challenge.aiGradingPaidBy'] ?? 'submitter'),
            canChange: next.canChange,
          });
        }
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const choose = async (value: string) => {
    try {
      await setAppSetting('challenge.aiGradingPaidBy', value);
      setState((current) => (current ? { ...current, value } : current));
      toast.success(t('challenge.settings.saved'));
    } catch (error) {
      failure(error);
    }
  };

  return (
    <section
      id="ops-settings"
      className={cn('flex scroll-mt-6 flex-col gap-4 rounded-3xl p-6', GLASS)}
    >
      <div className="flex flex-col gap-1.5">
        <SectionTitle>{t('challenge.settings.title')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('challenge.settings.description')}</p>
      </div>
      {state === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <fieldset className="flex flex-col gap-2" disabled={!state.canChange}>
          <legend className="mb-1 text-sm font-medium">{t('challenge.settings.paidBy')}</legend>
          {(['submitter', 'system'] as const).map((value) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="challenge-ai-paid-by"
                className="mt-1"
                checked={state.value === value}
                onChange={() => choose(value)}
              />
              <span className="flex flex-col">
                <span className="font-medium">{t(`challenge.settings.${value}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`challenge.settings.${value}Hint`)}
                </span>
              </span>
            </label>
          ))}
          {!state.canChange ? (
            <p className="text-xs text-muted-foreground">{t('challenge.settings.adminOnly')}</p>
          ) : null}
        </fieldset>
      )}
    </section>
  );
}
