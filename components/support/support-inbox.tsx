'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, LifeBuoy, Plus, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LearningRequestError,
  fetchSupportThread,
  fetchSupportThreads,
  openSupportThread,
  replySupportThread,
  setSupportThreadState,
  type SupportMessageRow,
  type SupportThreadRow,
} from '@/components/learning/learning-api';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { useI18n } from '@/lib/hooks/use-i18n';
import { cn } from '@/lib/utils';

const SUBJECT_MAX = 120;
const BODY_MAX = 4000;

/** Opens the learner's support dialog from anywhere, optionally with a subject filled in. */
export const SUPPORT_OPEN_EVENT = 'openmaic:support-open';
/** Fired after a support change, so unread counts read again. */
export const SUPPORT_CHANGED_EVENT = 'openmaic:support-changed';

export function openSupport(subject?: string): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_OPEN_EVENT, { detail: { subject } }));
}

function supportChanged(): void {
  window.dispatchEvent(new Event(SUPPORT_CHANGED_EVENT));
}

/** A translated error toast for a failed learning request. */
export function useFailureToast() {
  const { t } = useI18n();
  return useCallback(
    (error: unknown) => {
      const code = error instanceof LearningRequestError ? error.errorCode : undefined;
      const key = code ? `learning.errors.${code}` : 'learning.errors.generic';
      const text = t(key);
      toast.error(text === key ? t('learning.errors.generic') : text);
    },
    [t],
  );
}

/** "Contact the admin" for a signed-in learner; renders nothing for anyone else. */
export function ContactAdminButton({
  subject,
  className,
  quiet,
}: {
  subject?: string;
  className?: string;
  /** A plain link, for a place where another button is the main action. */
  quiet?: boolean;
}) {
  const { t } = useI18n();
  const session = useAccountSession();
  if (!session?.authenticated || session.role === 'operator' || session.role === 'admin') {
    return null;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant={quiet ? 'link' : 'outline'}
      onClick={() => openSupport(subject)}
      className={cn('shrink-0 cursor-pointer gap-1.5', className)}
    >
      <LifeBuoy className="size-3.5" aria-hidden="true" />
      {t('support.contact')}
    </Button>
  );
}

/** Unread replies for the signed-in learner, refreshed on focus and after every support change. */
export function useSupportUnread(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () =>
      fetchSupportThreads()
        .then((threads) => {
          if (active) setCount(threads.filter((thread) => thread.unread).length);
        })
        .catch(() => undefined);
    load();
    window.addEventListener(SUPPORT_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      active = false;
      window.removeEventListener(SUPPORT_CHANGED_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [enabled]);
  return count;
}

function NewThreadForm({
  staff,
  initialSubject,
  onCreated,
}: {
  staff: boolean;
  initialSubject?: string;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [subject, setSubject] = useState(initialSubject ?? '');
  const [username, setUsername] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { id } = await openSupportThread({
        subject: subject.trim(),
        body: body.trim(),
        ...(staff ? { username: username.trim() } : {}),
      });
      toast.success(t('support.sent'));
      supportChanged();
      onCreated(id);
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {staff ? (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">{t('support.username')}</span>
          <Input required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
      ) : null}
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('support.subject')}</span>
        <Input
          required
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('support.body')}</span>
        <Textarea
          required
          rows={6}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        disabled={busy || subject.trim() === '' || body.trim() === ''}
        className="self-end"
      >
        <Send className="size-4" aria-hidden="true" />
        {t('support.send')}
      </Button>
    </form>
  );
}

function Conversation({ threadId, onChanged }: { threadId: string; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const failure = useFailureToast();
  const [data, setData] = useState<{
    thread: SupportThreadRow;
    messages: SupportMessageRow[];
    own: boolean;
  } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchSupportThread(threadId));
      supportChanged();
    } catch (error) {
      failure(error);
    }
  }, [threadId, failure]);

  // The parent keys this component by thread, so a new thread starts from an empty state.
  useEffect(() => {
    let active = true;
    fetchSupportThread(threadId)
      .then((next) => {
        if (!active) return;
        setData(next);
        supportChanged();
        // A learner opening their thread has just read it: the list drops its unread mark.
        if (next.own) onChanged();
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [threadId, failure, onChanged]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [data?.messages.length]);

  if (!data) return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  // The learner the thread is about writes as themself; anyone else here is staff.
  const { thread, messages, own: viewerIsLearner } = data;

  const run = async (change: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await change();
      await load();
      onChanged();
      return true;
    } catch (error) {
      failure(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => replySupportThread(threadId, reply.trim()))) setReply('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{thread.subject}</p>
          <p className="text-xs text-muted-foreground">
            {thread.username} · {t(`support.state.${thread.state}`)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(() => setSupportThreadState(threadId, thread.state === 'open' ? 'closed' : 'open'))
          }
          className="shrink-0 gap-1.5"
        >
          {thread.state === 'open' ? (
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
          ) : (
            <RotateCcw className="size-3.5" aria-hidden="true" />
          )}
          {thread.state === 'open' ? t('support.close') : t('support.reopen')}
        </Button>
      </div>
      <ol className="flex max-h-[45vh] min-h-40 flex-col gap-3 overflow-y-auto rounded-2xl bg-muted/40 p-3">
        {messages.map((message) => {
          const mine = message.fromStaff !== viewerIsLearner;
          return (
            <li
              key={message.id}
              className={cn('flex max-w-[85%] flex-col gap-1', mine ? 'self-end items-end' : '')}
            >
              <span className="text-xs text-muted-foreground">
                {message.fromStaff
                  ? `${message.authorName} · ${t('support.staff')}`
                  : message.authorName}{' '}
                · {new Date(message.createdAt).toLocaleString(locale)}
              </span>
              <p
                className={cn(
                  'whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
                  mine ? 'bg-primary text-primary-foreground' : 'bg-background shadow-sm',
                )}
              >
                {message.body}
              </p>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>
      <form onSubmit={send} className="flex items-end gap-2">
        <Textarea
          rows={2}
          maxLength={BODY_MAX}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder={t('support.replyPlaceholder')}
          aria-label={t('support.reply')}
          className="min-h-0 flex-1"
        />
        <Button type="submit" disabled={busy || reply.trim() === ''} className="gap-1.5">
          <Send className="size-4" aria-hidden="true" />
          {t('support.reply')}
        </Button>
      </form>
    </div>
  );
}

function ThreadList({
  threads,
  selected,
  onSelect,
  staff,
}: {
  threads: SupportThreadRow[] | null;
  selected: string | null;
  onSelect: (id: string) => void;
  staff: boolean;
}) {
  const { t, locale } = useI18n();
  if (threads === null)
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (threads.length === 0)
    return <p className="text-sm text-muted-foreground">{t('support.empty')}</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {threads.map((thread) => {
        const flag = staff ? thread.waiting : thread.unread;
        return (
          <li key={thread.id}>
            <button
              type="button"
              onClick={() => onSelect(thread.id)}
              aria-current={selected === thread.id ? 'true' : undefined}
              className={cn(
                'flex w-full cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                selected === thread.id ? 'border-primary bg-muted' : 'border-transparent',
              )}
            >
              <span className="flex items-center gap-2">
                <span className={cn('min-w-0 flex-1 truncate', flag && 'font-semibold')}>
                  {thread.subject}
                </span>
                {flag ? (
                  <Badge variant="default" className="shrink-0">
                    {staff ? t('support.waiting') : t('support.unread')}
                  </Badge>
                ) : null}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {staff ? `${thread.username} · ` : ''}
                {t(`support.state.${thread.state}`)} ·{' '}
                {new Date(thread.lastMessageAt).toLocaleDateString(locale)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** List on the left, the chosen thread or the new-request form on the right. */
function Inbox({ staff, initialSubject }: { staff: boolean; initialSubject?: string }) {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [threads, setThreads] = useState<SupportThreadRow[] | null>(null);
  // null: the new-request form.
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(initialSubject !== undefined);

  const reload = useCallback(async () => {
    try {
      setThreads(await fetchSupportThreads(staff ? { state: filter } : {}));
    } catch (error) {
      failure(error);
    }
  }, [staff, filter, failure]);

  useEffect(() => {
    let active = true;
    fetchSupportThreads(staff ? { state: filter } : {})
      .then((next) => {
        if (active) setThreads(next);
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [staff, filter, failure]);

  // A learner with no thread yet goes straight to the form.
  const showForm = composing || (!staff && threads?.length === 0 && selected === null);

  return (
    <div className="grid min-h-[24rem] grid-cols-[16rem_1fr] gap-4">
      <div className="flex min-h-0 flex-col gap-3 border-r pr-4">
        {/* The form is already open on the right, so a button for it would do nothing. */}
        {showForm ? null : (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setSelected(null);
              setComposing(true);
            }}
            className="gap-1.5"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('support.new')}
          </Button>
        )}
        {staff ? (
          <div className="flex gap-1" role="group" aria-label={t('support.filter.label')}>
            {(['open', 'closed'] as const).map((state) => (
              <Button
                key={state}
                type="button"
                size="sm"
                variant={filter === state ? 'secondary' : 'ghost'}
                aria-pressed={filter === state}
                onClick={() => setFilter(state)}
              >
                {t(`support.state.${state}`)}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 overflow-y-auto">
          <ThreadList
            threads={threads}
            selected={selected}
            staff={staff}
            onSelect={(id) => {
              setComposing(false);
              setSelected(id);
            }}
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col">
        {showForm ? (
          <NewThreadForm
            staff={staff}
            initialSubject={initialSubject}
            onCreated={(id) => {
              setComposing(false);
              setSelected(id);
              void reload();
            }}
          />
        ) : selected ? (
          <Conversation key={selected} threadId={selected} onChanged={reload} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('support.pick')}</p>
        )}
      </div>
    </div>
  );
}

/** The learner's support dialog. Mounted once in the account control; opened by `openSupport`. */
export function SupportDialog({
  open,
  onOpenChange,
  initialSubject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSubject?: string;
}) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('support.title')}</DialogTitle>
          <DialogDescription>{t('support.description')}</DialogDescription>
        </DialogHeader>
        {open ? <Inbox staff={false} initialSubject={initialSubject} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** The staff inbox in the operations page: waiting threads first, reply, close, write first. */
export function SupportInboxPanel() {
  const { t } = useI18n();
  return (
    <section
      id="ops-support"
      className={cn('flex scroll-mt-6 flex-col gap-4 rounded-3xl p-6', GLASS)}
    >
      <div className="flex flex-col gap-1.5">
        <SectionTitle>{t('support.panelTitle')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('support.panelDescription')}</p>
      </div>
      <Inbox staff />
    </section>
  );
}
