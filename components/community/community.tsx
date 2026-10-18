'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  EyeOff,
  Eye,
  Flag,
  Lock,
  LockOpen,
  MessageCircleQuestion,
  Plus,
  Search,
  Sparkles,
  ThumbsUp,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createMathPlugin } from '@streamdown/math';
import { Streamdown } from 'streamdown';
import { useFailureToast } from '@/components/support/support-inbox';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  answerQuestion,
  askQuestion,
  fetchQuestion,
  fetchCommunityBans,
  fetchQuestions,
  fetchReports,
  reportContent,
  requestAiAnswer,
  resolveReport,
  setAnswerHidden,
  setCommunityBan,
  updateQuestion,
  voteAnswer,
  type AnswerRow,
  type BanRow,
  type QuestionDetail,
  type QuestionRow,
  type ReportRow,
} from '@/components/learning/learning-api';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { normalizeMathDelimiters } from '@/lib/utils/math-delimiters';

const TITLE_MAX = 160;
const BODY_MAX = 4000;
const REASON_MAX = 300;

const MATH = { math: createMathPlugin({ singleDollarTextMath: true }) } as const;
// Member-written text: no images, so a post cannot load a tracking pixel for every reader.
const TEXT_COMPONENTS = { img: () => null } as const;

/** Markdown with formulas, for questions and answers. Raw HTML is sanitized by Streamdown. */
export function RichText({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-p:my-1.5">
      <Streamdown plugins={MATH} controls={{ table: false }} components={TEXT_COMPONENTS}>
        {normalizeMathDelimiters(text)}
      </Streamdown>
    </div>
  );
}

/** Where a question lives, for links from the feed and the admin queue. */
export function questionHref(question: { id: string; courseId: string; sceneId: string | null }) {
  const query = new URLSearchParams({ question: question.id });
  if (question.sceneId) query.set('scene', question.sceneId);
  return `/classroom/${encodeURIComponent(question.courseId)}?${query}`;
}

/** What a non-member sees where the post controls would be. */
export function JoinHint() {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-violet-200/70 bg-violet-500/5 p-4 text-sm dark:border-violet-400/20">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
        <Lock className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-medium">{t('community.join.title')}</p>
        <p className="text-muted-foreground">{t('community.join.body')}</p>
        <Button asChild size="sm" className="self-start cursor-pointer">
          <Link href="/community">{t('community.join.cta')}</Link>
        </Button>
      </div>
    </div>
  );
}

/** An empty pane: an icon tile and a line or two, as the catalog's panels show it. */
export function EmptyPane({ icon: Icon, lines }: { icon: typeof Lock; lines: string[] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      {lines.map((line) => (
        <p key={line} className="max-w-sm text-sm text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

function ReportButton({
  kind,
  targetId,
}: {
  kind: 'question' | 'answer';
  targetId: string | number;
}) {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await reportContent(kind, targetId, reason.trim());
      toast.success(t('community.report.done'));
      setOpen(false);
      setReason('');
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        {t('community.report.action')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t('community.report.title')}</DialogTitle>
              <DialogDescription>{t('community.report.description')}</DialogDescription>
            </DialogHeader>
            <Textarea
              required
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-label={t('community.report.reason')}
              placeholder={t('community.report.reason')}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={busy || reason.trim() === ''}>
                {t('community.report.send')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnswerCard({
  answer,
  detail,
  best,
  onVote,
  onBest,
  onHide,
}: {
  answer: AnswerRow;
  detail: QuestionDetail;
  best: boolean;
  onVote: () => void;
  onBest: () => void;
  onHide: () => void;
}) {
  const { t, locale } = useI18n();
  const own = answer.authorId !== null && answer.authorId === detail.viewer.accountId;
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-3',
        best ? 'border-emerald-400 bg-emerald-500/5' : 'border-border',
        answer.fromAi && !best && 'border-violet-200 bg-violet-500/5 dark:border-violet-400/20',
        answer.hidden && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {answer.fromAi ? (
          <span className="flex items-center gap-1 font-medium text-violet-700 dark:text-violet-300">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {t('community.ai.name')}
          </span>
        ) : (
          <span className="font-medium text-foreground">{answer.authorName}</span>
        )}
        <span>· {new Date(answer.createdAt).toLocaleString(locale)}</span>
        {best ? (
          <Badge className="gap-1 bg-emerald-600 text-white">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            {t('community.best')}
          </Badge>
        ) : null}
        {answer.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
      </div>
      <RichText text={answer.body} />
      <div className="flex flex-wrap items-center gap-1">
        {!answer.fromAi ? (
          <Button
            type="button"
            size="sm"
            variant={answer.voted ? 'secondary' : 'ghost'}
            aria-pressed={answer.voted}
            disabled={!detail.viewer.canPost || own}
            onClick={onVote}
            className="h-7 gap-1 px-2 text-xs"
            aria-label={t('community.vote', { count: answer.votes })}
          >
            <ThumbsUp className="size-3.5" aria-hidden="true" />
            <span className="tabular-nums">{answer.votes}</span>
          </Button>
        ) : null}
        {detail.viewer.canAccept && !best && !answer.hidden ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onBest}
            className="h-7 gap-1 px-2 text-xs"
          >
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {t('community.markBest')}
          </Button>
        ) : null}
        {!own && !answer.fromAi ? <ReportButton kind="answer" targetId={answer.id} /> : null}
        {detail.viewer.moderator ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onHide}
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          >
            {answer.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            {answer.hidden ? t('community.mod.show') : t('community.mod.hide')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** One question with its answers, and every action the viewer may take on them. */
export function QuestionThread({
  questionId,
  onChanged,
  showLink = false,
}: {
  questionId: string;
  onChanged?: () => void;
  /** Link to the slide the question is pinned to (from the feed, not from inside the course). */
  showLink?: boolean;
}) {
  const { t, locale } = useI18n();
  const failure = useFailureToast();
  const [detail, setDetail] = useState<QuestionDetail | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiState, setAiState] = useState<'idle' | 'writing' | 'failed'>('idle');
  const aiAsked = useRef(false);

  const load = useCallback(async () => {
    try {
      setDetail(await fetchQuestion(questionId));
    } catch (error) {
      failure(error);
    }
  }, [questionId, failure]);

  // The parent keys this component by question, so it starts empty for each one.
  useEffect(() => {
    let active = true;
    fetchQuestion(questionId)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [questionId, failure]);

  const askAi = useCallback(async () => {
    setAiState('writing');
    try {
      await requestAiAnswer(questionId);
      setAiState('idle');
      await load();
      onChanged?.();
    } catch (error) {
      setAiState('failed');
      failure(error);
    }
  }, [questionId, load, onChanged, failure]);

  // The asker's question gets its AI answer as soon as it is opened without one.
  const isAsker = detail !== null && detail.question.authorId === detail.viewer.accountId;
  const missingAi = detail !== null && !detail.answers.some((answer) => answer.fromAi);
  useEffect(() => {
    if (!isAsker || !missingAi || aiAsked.current || !detail?.viewer.canPost) return;
    aiAsked.current = true;
    void askAi();
  }, [isAsker, missingAi, detail?.viewer.canPost, askAi]);

  if (!detail) return <p className="p-4 text-sm text-muted-foreground">{t('common.loading')}</p>;
  const { question, answers, viewer } = detail;

  const run = async (change: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await change();
      await load();
      onChanged?.();
      return true;
    } catch (error) {
      failure(error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const markBest = (answer: AnswerRow) =>
    run(async () => {
      const { reward } = await updateQuestion(question.id, { bestAnswerId: answer.id });
      toast.success(
        reward > 0
          ? t('community.bestRewarded', {
              name: answer.authorName ?? '',
              tokens: reward.toLocaleString(locale),
            })
          : t('community.bestMarked'),
      );
    });

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => answerQuestion(question.id, reply.trim()))) setReply('');
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 text-base font-semibold">{question.title}</h3>
          {question.bestAnswerId !== null ? (
            <Badge className="bg-emerald-600 text-white">{t('community.solved')}</Badge>
          ) : null}
          {question.locked ? (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" aria-hidden="true" />
              {t('community.locked')}
            </Badge>
          ) : null}
          {question.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {question.authorName} · {new Date(question.createdAt).toLocaleString(locale)} ·{' '}
          {question.courseTitle}
          {question.sceneTitle ? ` › ${question.sceneTitle}` : ''}
          {showLink ? (
            <>
              {' · '}
              <a href={questionHref(question)} className="font-medium text-primary hover:underline">
                {t('community.openSlide')}
              </a>
            </>
          ) : null}
        </p>
        {question.body ? <RichText text={question.body} /> : null}
        <div className="flex flex-wrap items-center gap-1">
          {!isAsker ? <ReportButton kind="question" targetId={question.id} /> : null}
          {viewer.moderator ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => updateQuestion(question.id, { locked: !question.locked }))}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              >
                {question.locked ? (
                  <LockOpen className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                {question.locked ? t('community.mod.unlock') : t('community.mod.lock')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => updateQuestion(question.id, { hidden: !question.hidden }))}
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              >
                {question.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                {question.hidden ? t('community.mod.show') : t('community.mod.hide')}
              </Button>
              {!isAsker ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await setCommunityBan({ accountId: question.authorId }, true);
                      toast.success(t('community.mod.banned', { name: question.authorName }));
                    })
                  }
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                >
                  <Ban className="size-3.5" aria-hidden="true" />
                  {t('community.mod.ban')}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <ol
        className="flex flex-col gap-3"
        aria-label={t('community.answers', { count: answers.length })}
      >
        {aiState === 'writing' ? (
          <li className="flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-500/5 p-3 text-sm text-violet-700 dark:border-violet-400/20 dark:text-violet-300">
            <Sparkles className="size-4 animate-pulse" aria-hidden="true" />
            {t('community.ai.writing')}
          </li>
        ) : null}
        {answers.map((answer) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            detail={detail}
            best={answer.id === question.bestAnswerId}
            onVote={() => run(() => voteAnswer(answer.id))}
            onBest={() => markBest(answer)}
            onHide={() => run(() => setAnswerHidden(answer.id, !answer.hidden))}
          />
        ))}
      </ol>
      {isAsker && missingAi && aiState === 'failed' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={askAi}
          className="self-start gap-1.5"
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t('community.ai.retry')}
        </Button>
      ) : null}

      {question.locked ? (
        <p className="text-sm text-muted-foreground">{t('community.lockedHint')}</p>
      ) : viewer.canPost ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <Textarea
            rows={3}
            maxLength={BODY_MAX}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t('community.answerPlaceholder')}
            aria-label={t('community.answer')}
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy || reply.trim() === ''}
            className="self-end"
          >
            {t('community.answer')}
          </Button>
        </form>
      ) : (
        <JoinHint />
      )}
    </div>
  );
}

function AskForm({
  courseId,
  sceneId,
  sceneTitle,
  onAsked,
}: {
  courseId: string;
  sceneId: string | null;
  sceneTitle: string | null;
  onAsked: (id: string) => void;
}) {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { id } = await askQuestion({
        courseId,
        ...(sceneId ? { sceneId } : {}),
        title: title.trim(),
        body: body.trim(),
      });
      onAsked(id);
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {sceneTitle
          ? t('community.ask.onScene', { scene: sceneTitle })
          : t('community.ask.onCourse')}
      </p>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('community.ask.title')}</span>
        <Input
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('community.ask.titlePlaceholder')}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">{t('community.ask.body')}</span>
        <Textarea
          rows={5}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('community.ask.bodyPlaceholder')}
        />
      </label>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 text-violet-500" aria-hidden="true" />
        {t('community.ask.aiNote')}
      </p>
      <Button type="submit" disabled={busy || title.trim() === ''} className="self-end">
        {t('community.ask.submit')}
      </Button>
    </form>
  );
}

function QuestionList({
  questions,
  selected,
  onSelect,
  showCourse,
}: {
  questions: QuestionRow[] | null;
  selected: string | null;
  onSelect: (id: string) => void;
  showCourse: boolean;
}) {
  const { t, locale } = useI18n();
  if (questions === null)
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('community.empty')}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {questions.map((question) => (
        <li key={question.id}>
          <button
            type="button"
            onClick={() => onSelect(question.id)}
            aria-current={selected === question.id ? 'true' : undefined}
            className={cn(
              'flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
              selected === question.id ? 'border-primary bg-muted' : 'border-transparent',
              question.hidden && 'opacity-60',
            )}
          >
            <span className="flex items-start gap-2">
              <span className="min-w-0 flex-1 font-medium">{question.title}</span>
              {question.bestAnswerId !== null ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-emerald-600"
                  aria-label={t('community.solved')}
                />
              ) : null}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {showCourse
                ? `${question.courseTitle}${question.sceneTitle ? ` › ${question.sceneTitle}` : ''} · `
                : question.sceneTitle
                  ? `${question.sceneTitle} · `
                  : ''}
              {t('community.answerCount', { count: question.answerCount })} ·{' '}
              {new Date(question.lastActivityAt).toLocaleDateString(locale)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The discussion button in the classroom header: the questions pinned to the current slide, and
 * the form to ask one. Shows only to a signed-in account, on a course open to the community. The
 * link `?scene=<id>&question=<id>` jumps to a slide and opens a question.
 */
export function SceneDiscussionButton() {
  const { t } = useI18n();
  const session = useAccountSession();
  const courseId = useStageStore((s) => s.stage?.id);
  const scenes = useStageStore((s) => s.scenes);
  const currentSceneId = useStageStore((s) => s.currentSceneId);
  const setCurrentSceneId = useStageStore((s) => s.setCurrentSceneId);
  const [data, setData] = useState<{ questions: QuestionRow[]; canPost: boolean } | null>(null);
  // A link from the feed (`?question=<id>`) opens that question as soon as the button shows.
  const [linked] = useState(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('question'),
  );
  const [open, setOpen] = useState(linked !== null);
  const [scope, setScope] = useState<'scene' | 'course'>(linked ? 'course' : 'scene');
  const [selected, setSelected] = useState<string | null>(linked);
  const [asking, setAsking] = useState(false);
  const deepLinked = useRef(false);

  const signedIn = session?.authenticated === true;
  const reload = useCallback(async () => {
    if (!courseId) return;
    const next = await fetchQuestions({ courseId }).catch(() => undefined);
    if (next) setData(next.open ? next : null);
  }, [courseId]);

  useEffect(() => {
    if (!signedIn || !courseId) return;
    let active = true;
    fetchQuestions({ courseId })
      .then((next) => {
        if (active) setData(next.open ? next : null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn, courseId]);

  // A link from the feed (`?scene=<id>`): jump to that slide once the scenes are there.
  useEffect(() => {
    if (deepLinked.current || scenes.length === 0) return;
    deepLinked.current = true;
    const scene = new URLSearchParams(window.location.search).get('scene');
    if (scene && scenes.some((s) => s.id === scene)) setCurrentSceneId(scene);
  }, [scenes, setCurrentSceneId]);

  if (!data || !courseId) return null;
  const scene = scenes.find((s) => s.id === currentSceneId);
  const onScene = data.questions.filter((q) => q.sceneId === currentSceneId);
  const shown = scope === 'scene' ? onScene : data.questions;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setScope('scene');
          setSelected(null);
          setAsking(false);
          setOpen(true);
        }}
        title={t('community.scene.button')}
        aria-label={`${t('community.scene.button')} (${onScene.length})`}
        className="relative shrink-0 rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
      >
        <MessageCircleQuestion className="size-4" aria-hidden="true" />
        {onScene.length > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold text-white tabular-nums">
            {onScene.length}
          </span>
        ) : null}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('community.scene.title')}</DialogTitle>
            <DialogDescription>
              {scope === 'scene' && scene ? scene.title : t('community.scene.wholeCourse')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-[24rem] grid-cols-[18rem_1fr] gap-4">
            <div className="flex min-h-0 flex-col gap-3 border-r pr-4">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setSelected(null);
                  setAsking(true);
                }}
                className="gap-1.5"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('community.ask.button')}
              </Button>
              <div className="flex gap-1" role="group" aria-label={t('community.scene.scope')}>
                {(['scene', 'course'] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={scope === value ? 'secondary' : 'ghost'}
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                  >
                    {value === 'scene'
                      ? t('community.scene.thisSlide')
                      : t('community.scene.wholeCourse')}
                  </Button>
                ))}
              </div>
              <QuestionList
                questions={shown}
                selected={selected}
                showCourse={false}
                onSelect={(id) => {
                  setAsking(false);
                  setSelected(id);
                }}
              />
            </div>
            <div className="flex min-w-0 flex-col">
              {asking ? (
                data.canPost ? (
                  <AskForm
                    courseId={courseId}
                    sceneId={scope === 'scene' ? (currentSceneId ?? null) : null}
                    sceneTitle={scope === 'scene' ? (scene?.title ?? null) : null}
                    onAsked={(id) => {
                      setAsking(false);
                      setSelected(id);
                      void reload();
                    }}
                  />
                ) : (
                  <JoinHint />
                )
              ) : selected ? (
                <QuestionThread key={selected} questionId={selected} onChanged={reload} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('community.scene.pick')}</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type FeedFilter = 'all' | 'unsolved' | 'mine';

/** The community page: every question, filtered and searched, with the chosen one on the right. */
export function CommunityFeed() {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ questions: QuestionRow[]; canPost: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(() =>
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('question'),
  );

  const load = useCallback(
    () =>
      fetchQuestions({
        unsolved: filter === 'unsolved',
        mine: filter === 'mine',
        q: query || undefined,
      }),
    [filter, query],
  );

  const reload = useCallback(async () => {
    try {
      setData(await load());
    } catch (error) {
      failure(error);
    }
  }, [load, failure]);

  useEffect(() => {
    let active = true;
    load()
      .then((next) => {
        if (active) setData(next);
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [load, failure]);

  return (
    <div className="flex flex-col gap-4">
      <div className={cn('grid min-h-[32rem] grid-cols-[22rem_1fr] gap-6 rounded-2xl p-6', GLASS)}>
        <div className="flex min-h-0 flex-col gap-3 border-r pr-6">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
            }}
            className="flex gap-2"
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('community.feed.search')}
              aria-label={t('community.feed.search')}
            />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              aria-label={t('community.feed.search')}
            >
              <Search className="size-4" />
            </Button>
          </form>
          <div className="flex gap-1" role="group" aria-label={t('community.feed.filter')}>
            {(['all', 'unsolved', 'mine'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? 'secondary' : 'ghost'}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(`community.feed.${value}`)}
              </Button>
            ))}
          </div>
          <div className="min-h-0 overflow-y-auto">
            <QuestionList
              questions={data?.questions ?? null}
              selected={selected}
              showCourse
              onSelect={setSelected}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          {selected ? (
            <QuestionThread key={selected} questionId={selected} onChanged={reload} showLink />
          ) : (
            <EmptyPane
              icon={MessageCircleQuestion}
              lines={[t('community.feed.pick'), t('community.feed.howToAsk')]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReportActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1">{children}</div>;
}

/** Staff queue of reported questions and answers: hide, dismiss, or block the author. */
export function CommunityReportsPanel() {
  const { t, locale } = useI18n();
  const failure = useFailureToast();
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [bans, setBans] = useState<BanRow[]>([]);

  const reload = useCallback(async () => {
    try {
      const [reports, banned] = await Promise.all([fetchReports(), fetchCommunityBans()]);
      setRows(reports);
      setBans(banned);
    } catch (error) {
      failure(error);
    }
  }, [failure]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchReports(), fetchCommunityBans()])
      .then(([reports, banned]) => {
        if (!active) return;
        setRows(reports);
        setBans(banned);
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const act = async (change: () => Promise<unknown>, done: string) => {
    try {
      await change();
      toast.success(done);
    } catch (error) {
      failure(error);
    }
    await reload();
  };

  return (
    <section
      id="ops-reports"
      className={cn('flex scroll-mt-6 flex-col gap-4 rounded-3xl p-6', GLASS)}
    >
      <div className="flex flex-col gap-1.5">
        <SectionTitle>{t('community.reports.title')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('community.reports.description')}</p>
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('community.reports.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.targetId}`}
              className="flex flex-col gap-2 rounded-2xl border p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{t(`community.reports.kind.${row.kind}`)}</Badge>
                <span className="font-medium text-foreground">
                  {row.authorName ?? t('community.ai.name')}
                </span>
                <span>· {row.questionTitle}</span>
                <span>· {t('community.reports.count', { count: row.reports })}</span>
                <span>· {new Date(row.firstReportedAt).toLocaleString(locale)}</span>
                {row.hidden ? <Badge variant="outline">{t('community.hidden')}</Badge> : null}
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-sm">{row.body}</p>
              <p className="text-xs text-muted-foreground">
                {t('community.reports.reasons')}: {row.reasons.join(' · ')}
              </p>
              <ReportActions>
                <Button asChild size="sm" variant="outline">
                  <a href={`/community?question=${encodeURIComponent(row.questionId)}`}>
                    {t('community.reports.open')}
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    act(
                      async () => {
                        if (row.kind === 'question') {
                          await updateQuestion(row.targetId, { hidden: !row.hidden });
                        } else {
                          await setAnswerHidden(Number(row.targetId), !row.hidden);
                        }
                        await resolveReport(row.kind, row.targetId);
                      },
                      row.hidden ? t('community.mod.shown') : t('community.mod.hidden'),
                    )
                  }
                >
                  {row.hidden ? t('community.mod.show') : t('community.mod.hide')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    act(
                      () => resolveReport(row.kind, row.targetId),
                      t('community.reports.dismissed'),
                    )
                  }
                >
                  {t('community.reports.dismiss')}
                </Button>
                {row.authorId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    onClick={() =>
                      act(
                        () => setCommunityBan({ accountId: row.authorId! }, true),
                        t('community.mod.banned', { name: row.authorName ?? '' }),
                      )
                    }
                  >
                    <Ban className="size-3.5" aria-hidden="true" />
                    {t('community.mod.ban')}
                  </Button>
                ) : null}
              </ReportActions>
            </li>
          ))}
        </ul>
      )}
      {bans.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('community.reports.banned')}</p>
          <ul className="flex flex-wrap gap-2">
            {bans.map((ban) => (
              <li
                key={ban.accountId}
                className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
              >
                <span>{ban.username}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={() =>
                    act(
                      () => setCommunityBan({ accountId: ban.accountId }, false),
                      t('community.mod.unbanned', { name: ban.username }),
                    )
                  }
                >
                  {t('community.mod.unban')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
