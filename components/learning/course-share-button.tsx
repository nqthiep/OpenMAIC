'use client';

import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchAccountSession } from '@/components/account/account-api';
import {
  fetchCourseShare,
  requestCourseShare,
  withdrawCourseShare,
} from '@/components/learning/learning-api';
import { useI18n } from '@/lib/hooks/use-i18n';

/**
 * The owner's control for sharing a course with members. Shows nothing unless accounts are on,
 * the visitor is signed in, and the visitor owns the course. Sharing waits for an operator.
 */
export function CourseShareButton({ courseId }: { courseId: string | undefined }) {
  const { t } = useI18n();
  const [owner, setOwner] = useState(false);
  const [state, setState] = useState<'private' | 'pending' | 'shared'>('private');
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
      } catch {
        // Not shown when the status cannot be read.
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  if (!courseId || !owner) return null;

  const run = async () => {
    setBusy(true);
    try {
      if (state === 'shared') {
        await withdrawCourseShare(courseId);
        setState('private');
        toast.success(t('courseShare.withdrawn'));
      } else if (state === 'private') {
        const result = await requestCourseShare(courseId);
        setState(result.state === 'shared' ? 'shared' : 'pending');
        toast.success(t('courseShare.requested'));
      }
    } catch {
      toast.error(t('courseShare.failed'));
    } finally {
      setBusy(false);
    }
  };

  const label =
    state === 'shared'
      ? t('courseShare.stop')
      : state === 'pending'
        ? t('courseShare.pending')
        : t('courseShare.request');

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy || state === 'pending'}
      title={label}
      aria-label={label}
      className="shrink-0 rounded-full p-2 text-gray-400 transition-all hover:bg-white hover:text-gray-800 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200"
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
