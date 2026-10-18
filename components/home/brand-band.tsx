import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const SPARKLE = 'M12 0C12 7 17 12 24 12C17 12 12 17 12 24C12 17 7 12 0 12C7 12 12 7 12 0Z';

function Sparkle({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('absolute', className)} aria-hidden="true">
      <path d={SPARKLE} fill="currentColor" />
    </svg>
  );
}

/**
 * The decoration of a blue brand surface: soft rings, a dotted patch, a yellow sun and sparkles
 * (guidelines, section 8: blue leads, yellow is the accent). Everything is absolutely placed in
 * percentages, so the parent must be `relative overflow-hidden` and put its own content above it.
 * `compact` is for short bars.
 */
export function BrandDecor({ compact = false }: { compact?: boolean }) {
  if (compact) {
    // A short bar whose content spans the width (page header, dialog header): the sun and the
    // sparkles keep to the gaps between the text on the left and the control on the right.
    return (
      <>
        <div className="absolute -right-16 -top-24 size-72 rounded-full border-[2.5rem] border-white/[0.06]" />
        <div className="absolute right-[36%] top-1/2 size-10 -translate-y-1/2 rounded-full bg-brand-yellow shadow-[0_0_40px_8px_rgba(251,191,36,0.4)] ring-4 ring-brand-yellow/20" />
        <Sparkle className="left-[42%] top-[14%] size-4 text-white/70" />
        <Sparkle className="bottom-[16%] right-[10%] size-4 text-brand-yellow" />
        <Sparkle className="bottom-[20%] left-[64%] size-3 text-white/60" />
      </>
    );
  }
  return (
    <>
      <div className="absolute -right-24 -top-28 size-[28rem] rounded-full border-[3.5rem] border-white/[0.06]" />
      <div className="absolute -left-24 bottom-6 size-72 rounded-full bg-white/[0.05]" />
      <div className="absolute bottom-[18%] right-[5%] hidden size-28 bg-[radial-gradient(circle,rgba(255,255,255,0.4)_1.5px,transparent_1.5px)] bg-[size:14px_14px] md:block" />
      <div className="absolute right-[13%] top-[26%] size-14 rounded-full bg-brand-yellow shadow-[0_0_70px_14px_rgba(251,191,36,0.4)] ring-8 ring-brand-yellow/20" />
      <Sparkle className="right-[27%] top-[16%] hidden size-6 text-brand-yellow lg:block" />
      <Sparkle className="left-[47%] top-[7%] size-4 text-white/70" />
      <Sparkle className="right-[7%] bottom-[34%] size-3.5 text-white/60" />
      <Sparkle className="left-[3%] top-[58%] size-5 text-brand-yellow/80" />
    </>
  );
}

/** The gradient of a blue brand surface, light and dark. */
export const BRAND_GRADIENT =
  'bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800 dark:from-brand-900 dark:via-brand-950 dark:to-[#0b1220]';

/**
 * The brand's blue band: the gradient and its decoration, with a wave that melts into the page.
 * Purely decorative. The caller positions and sizes it, and it sits behind whatever its positioned
 * parent holds.
 */
export function BrandBand({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute overflow-hidden', BRAND_GRADIENT, className)}
    >
      <BrandDecor />
      <svg
        viewBox="0 0 1440 40"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-8 w-full md:h-10"
      >
        <path d="M0 24C240 0 480 0 720 14S1200 40 1440 16V40H0Z" className="fill-background" />
      </svg>
    </div>
  );
}

/**
 * The top of the learner's home: a full-width blue band behind the logo, the slogan and the status
 * strip. Whatever comes next in the column rises 3rem over the band's lower edge, which is what
 * lifts the composer off the page. The band is a negative-index child, so it needs no z-index on
 * anything that follows.
 */
export function HomeHero({ children }: { children: ReactNode }) {
  return (
    <div className="relative -mb-12 flex w-full flex-col items-center pb-20">
      {/* The hero starts 6vh below the top bar; the band reaches up to the bar. */}
      <BrandBand className="-z-10 -top-[6vh] bottom-0 left-1/2 w-screen -translate-x-1/2" />
      {children}
    </div>
  );
}

/**
 * The slogan the brand is known by, "first half · second half": the second half in the accent
 * yellow on the band. A slogan without the separator is shown whole.
 */
export function Slogan({ text }: { text: string }) {
  const [head, ...rest] = text.split(' · ');
  if (rest.length === 0) return <>{text}</>;
  return (
    <>
      {head}
      <span className="mt-1 block text-brand-yellow">{rest.join(' · ')}</span>
    </>
  );
}
