'use client';

import { Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';

const PROMPT_KEYS = ['home.starter.one', 'home.starter.two', 'home.starter.three'] as const;

/**
 * Three ways to begin, for a learner whose library is empty. Picking one fills the composer;
 * the bracketed word is the topic to replace. The prompts name no subject because the profile
 * holds none yet.
 */
export function StarterPrompts({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="mt-4 flex w-full flex-col gap-2.5 px-1">
      <p className="text-sm font-medium text-brand-800 dark:text-brand-100">
        {t('home.starter.title')}
      </p>
      <div className="flex flex-wrap gap-2">
        {PROMPT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onPick(t(key))}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-brand-200 bg-white px-4 py-2 text-sm text-brand-800 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 dark:border-white/15 dark:bg-white/5 dark:text-brand-100 dark:hover:bg-white/10"
          >
            <Sparkles className="size-3.5 shrink-0 text-brand-yellow" aria-hidden="true" />
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}
