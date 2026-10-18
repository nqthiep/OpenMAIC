'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { GitFork, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFailureToast } from '@/components/support/support-inbox';
import { SectionTitle } from '@/components/home/section-title';
import { GLASS } from '@/components/home/site-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchAppSettings,
  fetchRemixInfo,
  setAppSetting,
  LearningRequestError,
  recordRemix,
  type RemixInfo,
} from '@/components/learning/learning-api';
import { useAccountSession } from '@/lib/capabilities/use-capabilities';
import { buildClassroomExportZip } from '@/lib/export/use-export-classroom';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useImportClassroom } from '@/lib/import/use-import-classroom';
import { useStageStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const CHIP =
  'inline-flex max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200';

/**
 * Remix controls in the classroom header: where this course was remixed from, its shared remixes,
 * and the Remix action. Remixing copies the course as the viewer sees it (the same package the
 * ZIP export makes), imports it as a new course of their own, records where it came from, and
 * opens it. Shows nothing to signed-out visitors.
 */
export function RemixControls() {
  const { t } = useI18n();
  const failure = useFailureToast();
  const session = useAccountSession();
  const courseId = useStageStore((s) => s.stage?.id);
  const [info, setInfo] = useState<RemixInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const { importFile } = useImportClassroom();
  const signedIn = session?.authenticated === true;

  useEffect(() => {
    if (!signedIn || !courseId) return;
    let active = true;
    fetchRemixInfo(courseId)
      .then((next) => {
        if (active) setInfo(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [signedIn, courseId]);

  if (!info || !courseId) return null;

  const remix = async () => {
    const { stage, scenes } = useStageStore.getState();
    if (!stage || stage.id !== courseId || scenes.length === 0) return;
    setBusy(true);
    try {
      // Checked again right before copying: the limit may have been reached in another tab.
      const fresh = await fetchRemixInfo(courseId);
      if (!fresh.canRemix) {
        setInfo(fresh);
        toast.error(t(`remix.refused.${fresh.reason ?? 'FORBIDDEN'}`));
        return;
      }
      const { zip } = await buildClassroomExportZip(stage, scenes);
      const newId = await importFile(zip);
      if (!newId) return;
      await recordRemix(newId, courseId);
      const name = `${stage.name} (remix)`;
      // The copy keeps the original's name until renamed; the remix marks itself as one.
      await fetch(`/api/stages/${encodeURIComponent(newId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).catch(() => undefined);
      toast.success(t('remix.created'));
      window.location.assign(`/classroom/${encodeURIComponent(newId)}`);
    } catch (error) {
      if (error instanceof LearningRequestError && error.errorCode === 'RATE_LIMITED') {
        toast.error(t('remix.refused.RATE_LIMITED'));
      } else {
        failure(error);
      }
    } finally {
      setBusy(false);
    }
  };

  const showMenu = info.canRemix || info.remixes.length > 0;
  return (
    <>
      {info.remixOf ? (
        <a
          href={`/classroom/${encodeURIComponent(info.remixOf.courseId)}`}
          className={CHIP}
          title={t('remix.of', { title: info.remixOf.title, author: info.remixOf.author ?? '—' })}
        >
          <GitFork className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {t('remix.of', { title: info.remixOf.title, author: info.remixOf.author ?? '—' })}
          </span>
        </a>
      ) : null}
      {showMenu ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              title={t('remix.menu')}
              aria-label={`${t('remix.menu')} (${info.remixes.length})`}
              className="relative shrink-0 rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <GitFork className="size-4" aria-hidden="true" />
              {info.remixes.length > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white tabular-nums">
                  {info.remixes.length}
                </span>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-72">
            {info.canRemix ? (
              <>
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => void remix()}
                  className="cursor-pointer gap-2"
                >
                  <GitFork className="size-4" aria-hidden="true" />
                  {busy ? t('remix.creating') : t('remix.action')}
                </DropdownMenuItem>
                <DropdownMenuLabel className="text-[11px] font-normal whitespace-normal text-muted-foreground">
                  {t('remix.note')}
                </DropdownMenuLabel>
              </>
            ) : null}
            {info.remixes.length > 0 ? (
              <>
                {info.canRemix ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs">
                  <Layers className="size-3.5" aria-hidden="true" />
                  {t('remix.list', { count: info.remixes.length })}
                </DropdownMenuLabel>
                {info.remixes.map((item) => (
                  <DropdownMenuItem
                    key={item.courseId}
                    onSelect={() =>
                      window.location.assign(`/classroom/${encodeURIComponent(item.courseId)}`)
                    }
                    className="cursor-pointer flex-col items-start gap-0"
                  >
                    <span className="text-sm">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.author}</span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

const REMIX_SETTINGS = [
  { key: 'remix.royaltyPercent', min: 0, max: 100 },
  { key: 'remix.dailyLimit', min: 0, max: 100 },
] as const;

/** Staff settings for remixes: the original author's share of reader rewards and the daily limit. */
export function RemixSettingsPanel() {
  const { t } = useI18n();
  const failure = useFailureToast();
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const [changeable, setChangeable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAppSettings()
      .then((next) => {
        if (!active) return;
        setValues(
          Object.fromEntries(
            REMIX_SETTINGS.map(({ key }) => [key, String(next.settings[key] ?? '')]),
          ),
        );
        setChangeable(REMIX_SETTINGS.every(({ key }) => next.changeable?.[key] === true));
      })
      .catch((error: unknown) => {
        if (active) failure(error);
      });
    return () => {
      active = false;
    };
  }, [failure]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;
    setBusy(true);
    try {
      for (const { key } of REMIX_SETTINGS) await setAppSetting(key, Number(values[key]));
      toast.success(t('challenge.settings.saved'));
    } catch (error) {
      failure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="ops-remix-settings"
      className={cn('flex scroll-mt-6 flex-col gap-4 rounded-3xl p-6', GLASS)}
    >
      <div className="flex flex-col gap-1.5">
        <SectionTitle>{t('remix.settings.title')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('remix.settings.description')}</p>
      </div>
      {values === null ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <form onSubmit={save} className="flex flex-wrap items-end gap-4">
          {REMIX_SETTINGS.map(({ key, min, max }) => (
            <label key={key} className="flex w-56 flex-col gap-1.5 text-sm">
              <span className="font-medium">{t(`remix.settings.${key.split('.')[1]}`)}</span>
              <Input
                type="number"
                min={min}
                max={max}
                step={1}
                required
                disabled={!changeable}
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
              />
            </label>
          ))}
          <Button type="submit" disabled={busy || !changeable}>
            {t('admin.table.save')}
          </Button>
        </form>
      )}
    </section>
  );
}
