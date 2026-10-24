'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Slide } from '@openmaic/dsl';
import { ArrowRight, BookOpen } from 'lucide-react';
import { GLASS } from '@/components/home/site-shell';
import {
  fetchCatalog,
  fetchProgress,
  type CatalogEntry,
  type ProgressRow,
} from '@/components/learning/learning-api';
import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { accessDocument, loadCurrentScene } from '@/lib/document-store';
import { pickRemoteContinue } from '@/lib/home/course-progress';
import { pickContinue } from '@/lib/home/learner-status';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { StageListItem } from '@/lib/utils/stage-storage';
import { cn } from '@/lib/utils';

const THUMBNAIL_WIDTH = 192;

interface Position {
  readonly at: number;
  readonly sceneId: string | null;
}

/**
 * The course the learner studied last, with where they stopped. The position of the learner's own
 * courses lives on this device only, so on another device the card falls back to the course
 * changed last. A class, shared or preview course keeps its position on the server, so it is
 * offered on any device when it was studied after the best own course. Renders nothing while the
 * positions are being read, and when no course has a scene yet.
 */
export function ContinueCard({
  classrooms,
  thumbnails,
}: {
  classrooms: readonly StageListItem[];
  thumbnails: Readonly<Record<string, Slide | null>>;
}) {
  const { t } = useI18n();
  const [positions, setPositions] = useState<Map<string, Position> | null>(null);
  const [progress, setProgress] = useState<{ id: string; current: number; total: number } | null>(
    null,
  );
  const signedIn = useAccountSession()?.authenticated === true;
  const [remote, setRemote] = useState<{
    rows: ProgressRow[];
    catalog: Map<string, CatalogEntry>;
  } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    Promise.all([fetchProgress(), fetchCatalog()])
      .then(([rows, catalog]) => {
        if (current)
          setRemote({ rows, catalog: new Map(catalog.courses.map((c) => [c.courseId, c])) });
      })
      .catch(() => {
        // The card works with the courses on this device alone.
      });
    return () => {
      current = false;
    };
  }, [signedIn]);

  useEffect(() => {
    let current = true;
    Promise.all(
      classrooms.map(async (course): Promise<[string, Position] | null> => {
        try {
          const saved = await loadCurrentScene(course.id);
          return saved
            ? [course.id, { at: Date.parse(saved.updatedAt), sceneId: saved.sceneId }]
            : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (current) setPositions(new Map(entries.filter((entry) => entry !== null)));
    });
    return () => {
      current = false;
    };
  }, [classrooms]);

  const local = positions
    ? pickContinue(classrooms, new Map([...positions].map(([id, position]) => [id, position.at])))
    : undefined;
  const localAt = local ? positions?.get(local.id)?.at : undefined;
  const server =
    positions && remote
      ? pickRemoteContinue(remote.rows, new Set(classrooms.map((c) => c.id)), remote.catalog)
      : undefined;
  // A studied own course competes on time; one only "changed last" never beats a studied one.
  const useServer = server !== undefined && (localAt === undefined || server.at > localAt);
  const pick = useServer ? undefined : local;
  const pickId = pick?.id;
  const sceneId = pickId ? positions?.get(pickId)?.sceneId : undefined;

  useEffect(() => {
    if (!pickId) return;
    let current = true;
    accessDocument(pickId)
      .then(({ document }) => {
        if (!current || !document) return;
        const index = sceneId ? document.scenes.findIndex((scene) => scene.id === sceneId) : -1;
        setProgress({ id: pickId, current: index + 1 || 1, total: document.scenes.length });
      })
      .catch(() => {
        // The card works without the progress bar.
      });
    return () => {
      current = false;
    };
  }, [pickId, sceneId]);

  if (!pick && !server) return null;
  const target = useServer
    ? { id: server.courseId, name: server.title, slide: undefined, shown: server }
    : {
        id: pick!.id,
        name: pick!.name,
        slide: thumbnails[pick!.id] ?? undefined,
        shown: progress?.id === pick!.id ? progress : null,
      };
  const { slide, shown } = target;

  return (
    <Link
      href={`/classroom/${target.id}`}
      className={cn(
        GLASS,
        'group mb-4 flex w-full items-center gap-5 rounded-3xl p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-brand-800/15',
      )}
    >
      <div
        className="relative aspect-video shrink-0 overflow-hidden rounded-2xl bg-brand-50 dark:bg-slate-800/80"
        style={{ width: THUMBNAIL_WIDTH }}
      >
        {slide ? (
          <SlideThumbnail
            slide={slide}
            size={THUMBNAIL_WIDTH}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : (
          // A course whose first scene is not a slide has no thumbnail; the library card shows the same stand-in.
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/30">
              <BookOpen className="size-6" aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-yellow" />
          {t('home.continue.title')}
        </span>
        <span className="truncate text-lg font-bold text-brand-800 dark:text-white">
          {target.name}
        </span>
        {shown && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="shrink-0 tabular-nums">
              {t('home.continue.progress', { current: shown.current, total: shown.total })}
            </span>
            <div className="h-2 w-40 overflow-hidden rounded-full bg-brand-100 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
                style={{ width: `${Math.round((shown.current / shown.total) * 100)}%` }}
              />
            </div>
            <span className="font-semibold tabular-nums text-brand-700 dark:text-brand-300">
              {Math.round((shown.current / shown.total) * 100)}%
            </span>
          </div>
        )}
      </div>
      <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-brand-600/30 transition-opacity group-hover:opacity-90">
        {t('home.continue.button')}
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
