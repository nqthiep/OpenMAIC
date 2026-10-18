'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, GraduationCap, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAccountSession } from '@/components/account/account-api';
import { AccountDialog } from '@/components/account/account-dialog';
import { CourseCard } from '@/components/home/course-card';
import { AccessRequest } from '@/components/home/access-request';
import { MyClasses } from '@/components/home/my-classes';
import { GLASS, Reveal, SiteShell } from '@/components/home/site-shell';
import {
  fetchCatalog,
  fetchProgress,
  joinClass,
  LearningRequestError,
  type CatalogEntry,
  type ProgressRow,
} from '@/components/learning/learning-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import { useMembershipStatus } from '@/lib/home/use-membership-status';
import { cn } from '@/lib/utils';
import { catalogClassroomHref } from '@/lib/workbench/classroom-exit';

/**
 * The catalog: free previews for everyone, and for an active member the shared courses and the
 * courses of their classes. A member joins a class with the code it was given. It shares its frame
 * and its course cards with the home, so the two read as one product.
 */
export default function CatalogPage() {
  const { t } = useI18n();
  useDocumentTitle(t('catalog.title'));
  const [courses, setCourses] = useState<CatalogEntry[] | null>(null);
  // Where the signed-in learner stopped, by course id; the grid shows it on each card.
  const [progress, setProgress] = useState<Map<string, ProgressRow>>(new Map());
  const [member, setMember] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [joins, setJoins] = useState(0);
  const membershipStatus = useMembershipStatus();
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  // Set when the page was opened from an invite link (/catalog?join=CODE).
  const [invited, setInvited] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // Reads everything the page shows, without touching state. Callers apply the result.
  const readAll = async () => {
    const catalog = await fetchCatalog();
    const session = await fetchAccountSession();
    // The class courses are shown by MyClasses, which reads their progress itself.
    const gridIds = catalog.courses.filter((c) => c.kind !== 'class').map((c) => c.courseId);
    const rows =
      session.authenticated && gridIds.length > 0
        ? await fetchProgress(gridIds).catch(() => [])
        : [];
    return {
      progress: new Map(rows.map((row) => [row.courseId, row])),
      courses: catalog.courses,
      member: catalog.member,
      signedIn: session.authenticated,
      registrationOpen: session.registrationOpen,
    };
  };

  const apply = (data: Awaited<ReturnType<typeof readAll>>) => {
    setCourses(data.courses);
    setProgress(data.progress);
    setMember(data.member);
    setSignedIn(data.signedIn);
    setRegistrationOpen(data.registrationOpen);
  };

  const failed = (error: unknown) => {
    if (error instanceof LearningRequestError && error.status === 404) setUnavailable(true);
    else toast.error(t('learning.errors.generic'));
  };

  useEffect(() => {
    let active = true;
    readAll()
      .then((data) => {
        if (active) apply(data);
      })
      .catch((error: unknown) => {
        if (active) failed(error);
      });
    return () => {
      active = false;
    };
    // readAll and apply are plain functions of the same state setters; the effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An invite link fills the code; the learner still presses Join, so nobody is added by a click on a link.
  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get('join')?.trim();
    if (fromLink) {
      setCode(fromLink);
      setInvited(true);
    }
  }, []);

  // The home links here as /catalog#join and invites as ?join=; the card renders after the catalog loads.
  // ponytail: fixed delay for MyClasses (its own fetch) to push the card down; observe layout if it misses.
  useEffect(() => {
    if (!member || (window.location.hash !== '#join' && !invited)) return;
    const timer = window.setTimeout(() => {
      document.getElementById('join')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [member, invited]);

  const join = async () => {
    const trimmed = code.trim();
    if (trimmed === '') return;
    setJoinError(null);
    try {
      const joined = await joinClass(trimmed);
      setCode('');
      if (invited) {
        // Drop the code from the address so a reload or a shared screenshot does not carry it.
        window.history.replaceState(null, '', '/catalog');
        setInvited(false);
      }
      toast.success(t('catalog.join.done', { name: joined.class.name }));
      setJoins((count) => count + 1);
      apply(await readAll());
    } catch (error) {
      // Shown at the field: a toast at the top of the page is out of sight from the card below.
      const errorCode = error instanceof LearningRequestError ? error.errorCode : undefined;
      const key =
        errorCode === 'NOT_FOUND'
          ? 'catalog.join.notFound'
          : errorCode
            ? `learning.errors.${errorCode}`
            : 'learning.errors.generic';
      const text = t(key);
      setJoinError(text === key ? t('learning.errors.generic') : text);
      document.getElementById('join')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const openSignIn = (event: React.MouseEvent<HTMLElement>) => {
    returnFocusTo.current = event.currentTarget;
    setDialogOpen(true);
  };

  if (unavailable) {
    return (
      <SiteShell mainClassName="pb-20 pt-16">
        <div
          className={cn(
            'mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-2xl p-8 text-center',
            GLASS,
          )}
        >
          <BookOpen className="size-8 text-violet-600 dark:text-violet-300" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{t('catalog.unavailable')}</p>
          <Button asChild variant="outline" size="sm" className="cursor-pointer">
            <Link href="/">{t('workspace.homeAria')}</Link>
          </Button>
        </div>
      </SiteShell>
    );
  }

  // A member sees it after their classes; a learner without membership sees it before the request.
  const courseGrid = (
    <section>
      {courses === null ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((slot) => (
            <div key={slot} className="h-52 rounded-2xl bg-muted/60 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-white/40 px-6 py-14 text-center dark:bg-white/[0.02]">
          <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30">
            <BookOpen className="size-6 text-violet-600 dark:text-violet-300" aria-hidden="true" />
          </span>
          <p className="text-sm text-muted-foreground">{t('catalog.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* Class courses are listed once, under their class in MyClasses above. */}
          {courses
            .filter((entry) => entry.kind !== 'class')
            .map((entry, index) => (
              <Reveal key={entry.courseId} delay={(index % 3) * 0.06}>
                <CourseCard
                  entry={entry}
                  index={index}
                  href={catalogClassroomHref(entry.courseId)}
                  progress={progress.get(entry.courseId)}
                />
              </Reveal>
            ))}
        </div>
      )}
    </section>
  );

  return (
    <SiteShell mainClassName="gap-10 pb-20 pt-10 md:pt-14" bandClassName="h-[300px] md:h-[320px]">
      <Reveal className="flex flex-col gap-3">
        <h1 className="pb-1 text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          {t('catalog.title')}
        </h1>
        <p className="max-w-2xl text-sm text-white/85 md:text-base">
          {member
            ? t('catalog.description.member')
            : signedIn
              ? t('catalog.description.signedIn')
              : t('catalog.description.guest')}
        </p>
      </Reveal>

      {courses !== null && !signedIn ? (
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
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{t('catalog.signInToSee')}</p>
                <p className="text-sm text-muted-foreground">
                  {t(invited ? 'catalog.join.invited' : 'catalog.join.needsMembership')}
                </p>
              </div>
            </div>
            <Button onClick={openSignIn} className="cursor-pointer">
              {t('home.guest.signIn')}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </Reveal>
      ) : null}

      {courses !== null && signedIn && !member ? courseGrid : null}

      {courses !== null && signedIn && !member ? (
        <Reveal>
          <AccessRequest kind={membershipStatus.notice.kind} reason={t('catalog.membersOnly')} />
          <p className="mt-3 flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <GraduationCap className="size-4 shrink-0" aria-hidden="true" />
            {t(invited ? 'catalog.join.invited' : 'catalog.join.needsMembership')}
          </p>
        </Reveal>
      ) : null}

      {/* Each class with its courses as links; read again after a join. */}
      {member ? <MyClasses key={joins} courseHref={catalogClassroomHref} /> : null}

      {member || !signedIn ? courseGrid : null}

      {/* Joining a class is optional: self-study needs none. The card sits last and says so. */}
      {member ? (
        <section
          id="join"
          className={cn(
            'flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-dashed border-border bg-white/40 p-5 dark:bg-white/[0.02]',
            invited && 'border-solid border-primary ring-2 ring-primary/30',
          )}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
              <GraduationCap className="size-4" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold">{t('catalog.join.title')}</h2>
              <p className="text-sm text-muted-foreground">
                {t(invited ? 'catalog.join.invitedMember' : 'catalog.join.description')}
              </p>
            </div>
          </div>
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void join();
            }}
          >
            <Input
              aria-label={t('catalog.join.code')}
              placeholder={t('catalog.join.code')}
              className="h-9 max-w-xs bg-white/70 font-mono uppercase dark:bg-slate-900/50"
              value={code}
              aria-invalid={joinError ? true : undefined}
              aria-describedby={joinError ? 'join-error' : undefined}
              onChange={(event) => {
                setCode(event.target.value);
                setJoinError(null);
              }}
            />
            <Button
              type="submit"
              variant={invited ? 'default' : 'outline'}
              size="sm"
              className="cursor-pointer"
            >
              {t('catalog.join.submit')}
            </Button>
            {joinError ? (
              <p id="join-error" role="alert" className="w-full text-sm text-destructive">
                {joinError}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        registrationOpen={registrationOpen}
        returnFocusTo={returnFocusTo}
      />
    </SiteShell>
  );
}
