'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LEARNING_FOCUS_MAX } from '@/lib/home/learning-focus';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useUserProfileStore } from '@/lib/store/user-profile';

/**
 * One line under the composer: what the learner studies, or a prompt to say so. Editing is in
 * place. The words are free text; they travel with the profile and go to the course generator.
 */
export function LearningFocus() {
  const { t } = useI18n();
  const subject = useUserProfileStore((s) => s.learningSubject);
  const level = useUserProfileStore((s) => s.learningLevel);
  const setFocus = useUserProfileStore((s) => s.setLearningFocus);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: '', level: '' });

  const open = () => {
    setDraft({ subject, level });
    setEditing(true);
  };
  const save = () => {
    setFocus(draft.subject.trim(), draft.level.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <form
        className="mt-3 flex w-full flex-wrap items-center gap-2 px-1"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Input
          autoFocus
          value={draft.subject}
          maxLength={LEARNING_FOCUS_MAX}
          placeholder={t('home.focus.subjectPlaceholder')}
          aria-label={t('home.focus.subjectPlaceholder')}
          className="h-8 w-48 text-xs"
          onChange={(event) => setDraft((d) => ({ ...d, subject: event.target.value }))}
        />
        <Input
          value={draft.level}
          maxLength={LEARNING_FOCUS_MAX}
          placeholder={t('home.focus.levelPlaceholder')}
          aria-label={t('home.focus.levelPlaceholder')}
          className="h-8 w-48 text-xs"
          onChange={(event) => setDraft((d) => ({ ...d, level: event.target.value }))}
        />
        <Button type="submit" size="sm" className="cursor-pointer">
          {t('home.focus.save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="cursor-pointer"
          onClick={() => setEditing(false)}
        >
          {t('common.cancel')}
        </Button>
      </form>
    );
  }

  const focus = [subject, level].filter(Boolean).join(' · ');
  return (
    <div className="mt-4 flex w-full items-center px-1 text-sm text-muted-foreground">
      <button
        type="button"
        onClick={open}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1.5 font-medium text-brand-800 transition-colors hover:bg-brand-100 dark:bg-white/10 dark:text-brand-100 dark:hover:bg-white/15"
      >
        {focus ? (
          <>
            <Pencil className="size-3" aria-hidden="true" />
            {t('home.focus.summary', { focus })}
          </>
        ) : (
          <>
            <Plus className="size-3" aria-hidden="true" />
            {t('home.focus.add')}
          </>
        )}
      </button>
    </div>
  );
}
