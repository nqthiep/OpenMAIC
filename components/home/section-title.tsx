import type { ReactNode } from 'react';

/** The heading of a block on the learner's home: bold deep blue with a short yellow bar. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-brand-800 dark:text-white">
      <span aria-hidden="true" className="h-5 w-1.5 rounded-full bg-brand-yellow" />
      {children}
    </h2>
  );
}
