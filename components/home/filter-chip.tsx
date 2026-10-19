'use client';

import { cn } from '@/lib/utils';

/** A pressable pill for a filter value. Pressed means the value is chosen. */
export function Chip({
  pressed,
  onClick,
  disabled,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-50 border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pressed
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-brand-100 bg-white/70 text-foreground hover:bg-brand-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

export function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
