'use client';

import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAccountSession } from '@/components/account/account-api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  fetchCourseShare,
  requestCourseShare,
  withdrawCourseShare,
} from '@/components/learning/learning-api';
import { buildClassroomExportZip } from '@/lib/export/use-export-classroom';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useStageStore } from '@/lib/store';

function rejectedText(
  t: (key: string, vars?: Record<string, string>) => string,
  why: string | null,
) {
  return why ? t('courseShare.rejectedWithReason', { reason: why }) : t('courseShare.rejected');
}

type ShareState = 'private' | 'pending' | 'shared' | 'rejected';

/**
 * The owner's control for sharing a course with members. Shows nothing unless accounts are on,
 * the visitor is signed in, and the visitor owns the course. Sharing sends the course as it is
 * now (with every edit and its media); readers get it once an operator approves, and every later
 * update goes back to an operator first. A pending request can be withdrawn, and a refusal is
 * announced once (with the reason).
 */
export function CourseShareButton({ courseId }: { courseId: string | undefined }) {
  const { t } = useI18n();
  const [owner, setOwner] = useState(false);
  const [state, setState] = useState<ShareState>('private');
  const [updatePending, setUpdatePending] = useState(false);
  const [updateRejected, setUpdateRejected] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    (async () => {
      try {
        const session = await fetchAccountSession();
        if (!session.enabled || !session.authenticated) return;
        const share = await fetchCourseShare(courseId);
        if (!active) return;
        setOwner(share.owner);
        setState(share.state);
        setUpdatePending(share.updatePending === true);
        if (share.rejection) {
          setReason(share.rejection.reason);
          setUpdateRejected(share.state === 'shared');
          // Announced once per refusal, so reopening the course does not repeat it.
          const seen = `openmaic:shareRejectionSeen:${courseId}`;
          try {
            if (localStorage.getItem(seen) !== share.rejection.rejectedAt) {
              localStorage.setItem(seen, share.rejection.rejectedAt);
              toast.warning(rejectedText(t, share.rejection.reason));
            }
          } catch {
            // Storage blocked: the menu still says it.
          }
        }
      } catch {
        // Not shown when the status cannot be read.
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId, t]);

  if (!courseId || !owner) return null;

  /** Packs the course as edited now and sends it for review. */
  const send = async () => {
    const { stage, scenes } = useStageStore.getState();
    if (!stage || stage.id !== courseId || scenes.length === 0) return;
    setBusy(true);
    const toastId = toast.loading(t('courseShare.packing'));
    try {
      const { zip } = await buildClassroomExportZip(stage, scenes);
      const result = await requestCourseShare(courseId, zip);
      const next: ShareState = result.state === 'shared' ? 'shared' : 'pending';
      setState(next);
      setUpdatePending(result.updatePending === true);
      setReason(null);
      setUpdateRejected(false);
      toast.success(next === 'shared' ? t('courseShare.updateSent') : t('courseShare.requested'), {
        id: toastId,
      });
    } catch {
      toast.error(t('courseShare.failed'), { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      await withdrawCourseShare(courseId);
      toast.success(
        state === 'pending' ? t('courseShare.requestWithdrawn') : t('courseShare.withdrawn'),
      );
      setState('private');
      setUpdatePending(false);
    } catch {
      toast.error(t('courseShare.failed'));
    } finally {
      setBusy(false);
    }
  };

  const status =
    state === 'shared'
      ? updatePending
        ? t('courseShare.updatePending')
        : updateRejected
          ? t('courseShare.updateRejected', { reason: reason ?? '—' })
          : t('courseShare.sharedStatus')
      : state === 'pending'
        ? t('courseShare.pendingStatus')
        : state === 'rejected'
          ? rejectedText(t, reason)
          : t('courseShare.privateStatus');

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          title={t('courseShare.menu')}
          aria-label={`${t('courseShare.menu')}: ${status}`}
          className="relative shrink-0 rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          {state === 'pending' || state === 'rejected' || updatePending ? (
            <span
              aria-hidden="true"
              className={`absolute right-1 top-1 size-2 rounded-full ${state === 'rejected' ? 'bg-red-500' : 'bg-amber-400'}`}
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
        <DropdownMenuLabel className="text-xs font-normal whitespace-normal text-muted-foreground">
          {status}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {state === 'shared' ? (
          <>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void send()}
              className="cursor-pointer"
            >
              {t('courseShare.update')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void withdraw()}
              className="cursor-pointer"
            >
              {t('courseShare.stop')}
            </DropdownMenuItem>
          </>
        ) : state === 'pending' ? (
          <>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void send()}
              className="cursor-pointer"
            >
              {t('courseShare.resend')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={busy}
              onSelect={() => void withdraw()}
              className="cursor-pointer"
            >
              {t('courseShare.withdraw')}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem disabled={busy} onSelect={() => void send()} className="cursor-pointer">
            {t('courseShare.request')}
          </DropdownMenuItem>
        )}
        <DropdownMenuLabel className="text-[11px] font-normal whitespace-normal text-muted-foreground">
          {t('courseShare.reviewNote')}
        </DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
