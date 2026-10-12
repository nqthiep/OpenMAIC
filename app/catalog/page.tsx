'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { fetchAccountSession } from '@/components/account/account-api';
import {
  fetchCatalog,
  fetchMyClasses,
  joinClass,
  LearningRequestError,
  type CatalogEntry,
  type ClassRow,
} from '@/components/learning/learning-api';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * The catalog: free previews for everyone, and for an active member the shared courses and the
 * courses of their classes. A member joins a class with the code it was given.
 */
export default function CatalogPage() {
  const { t } = useI18n();
  const [courses, setCourses] = useState<CatalogEntry[] | null>(null);
  const [member, setMember] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [code, setCode] = useState('');

  // Reads everything the page shows, without touching state. Callers apply the result.
  const readAll = async () => {
    const catalog = await fetchCatalog();
    const session = await fetchAccountSession();
    const mine = catalog.member ? await fetchMyClasses() : [];
    return {
      courses: catalog.courses,
      member: catalog.member,
      signedIn: session.authenticated,
      classes: mine,
    };
  };

  const apply = (data: Awaited<ReturnType<typeof readAll>>) => {
    setCourses(data.courses);
    setMember(data.member);
    setSignedIn(data.signedIn);
    setClasses(data.classes);
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

  const join = async () => {
    const trimmed = code.trim();
    if (trimmed === '') return;
    try {
      const joined = await joinClass(trimmed);
      setCode('');
      toast.success(t('catalog.join.done', { name: joined.class.name }));
      apply(await readAll());
    } catch (error) {
      const key =
        error instanceof LearningRequestError && error.errorCode
          ? `learning.errors.${error.errorCode}`
          : 'learning.errors.generic';
      const text = t(key);
      toast.error(text === key ? t('learning.errors.generic') : text);
    }
  };

  if (unavailable) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t('catalog.unavailable')}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t('catalog.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {member ? t('catalog.description.member') : t('catalog.description.guest')}
        </p>
        {!signedIn ? <p className="text-sm">{t('catalog.signInToSee')}</p> : null}
      </header>

      {member ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t('catalog.join.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={t('catalog.join.code')}
              placeholder={t('catalog.join.code')}
              className="h-9 max-w-xs font-mono uppercase"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => void join()}>
              {t('catalog.join.submit')}
            </Button>
          </div>
          {classes.length > 0 ? (
            <ul className="divide-y rounded-lg border">
              {classes.map((row) => (
                <li key={row.id} className="px-3 py-2.5 text-sm font-medium">
                  {row.name}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        {courses === null ? null : courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('catalog.empty')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {courses.map((entry) => (
              <li
                key={entry.courseId}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="break-words text-sm font-medium">{entry.title}</span>
                  <Badge variant="outline" className="w-fit">
                    {t(`catalog.kind.${entry.kind}`)}
                  </Badge>
                </div>
                <Link
                  href={`/classroom/${encodeURIComponent(entry.courseId)}`}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t('catalog.open')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
