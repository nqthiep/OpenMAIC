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
 * The decoration of a navy brand surface, after the brand board: a gold sun with a soft glow and
 * thin rings, three ridges of mountains (teal, then two navies) and a few sparkles. Navy leads and
 * gold is the accent. Everything is absolutely placed in percentages, so the parent must be
 * `relative overflow-hidden` and put its own content above it. `compact` is for short bars: a
 * ring and sparkles, no sun.
 */
export function BrandDecor({ compact = false }: { compact?: boolean }) {
  if (compact) {
    // A short bar whose content spans the width (page header, dialog header, operator header):
    // no sun, since a title or a control can sit anywhere along it, and white text on the gold
    // disc would not read. A ring and a few sparkles in the gaps.
    return (
      <>
        <div className="absolute -right-16 -top-24 size-72 rounded-full border-[2.5rem] border-white/[0.05]" />
        <Sparkle className="left-[44%] top-[14%] size-4 text-white/70" />
        <Sparkle className="bottom-[16%] right-[10%] size-4 text-brand-yellow" />
        <Sparkle className="bottom-[20%] left-[56%] size-3 text-white/60" />
      </>
    );
  }
  return (
    <>
      {/* The glow around the sun, then the sun with two thin rings. The sun sits in the top
          right corner, above the hero text and the card, whatever the width. */}
      <div className="absolute -right-[8%] -top-[28%] size-[38rem] rounded-full bg-[radial-gradient(circle,rgba(244,198,109,0.2),transparent_65%)]" />
      <div className="absolute -bottom-[30%] -left-[10%] size-[42rem] rounded-full bg-[radial-gradient(circle,rgba(46,130,120,0.22),transparent_65%)]" />
      <div className="absolute right-[7%] top-[7%] size-14 rounded-full bg-brand-yellow shadow-[0_0_70px_14px_rgba(244,198,109,0.4)]">
        <div className="absolute -inset-5 rounded-full border border-brand-yellow/25" />
        <div className="absolute -inset-12 rounded-full border border-white/10" />
      </div>
      <Sparkle className="right-[27%] top-[16%] hidden size-6 text-brand-yellow lg:block" />
      <Sparkle className="left-[47%] top-[7%] size-4 text-white/70" />
      <Sparkle className="left-[3%] top-[58%] size-5 text-brand-yellow/80" />
      {/* Ridges, back to front. They take the bottom of the band and the page-colored wave of
          `BrandBand` is drawn over their feet. */}
      <svg
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-[44%] w-full"
      >
        <path
          className="fill-brand-teal/30"
          d="M0,200 C80,150 140,120 220,150 S340,210 430,170 S560,90 660,130 S800,200 900,160 S1060,80 1160,120 S1340,190 1440,150 V320 H0Z"
        />
        <path
          className="fill-brand-700/45"
          d="M0,250 C100,210 180,190 280,215 S420,270 520,235 S680,170 790,205 S960,265 1060,230 S1250,180 1340,210 S1410,230 1440,225 V320 H0Z"
        />
        <path
          className="fill-brand-950/85"
          d="M0,290 C120,265 220,255 330,275 S520,305 640,285 S860,250 980,272 S1200,310 1320,285 S1420,270 1440,272 V320 H0Z"
        />
      </svg>
    </>
  );
}

/** The gradient of a navy brand surface: night navy toward a near-black blue, the same in both themes. */
export const BRAND_GRADIENT = 'bg-gradient-to-br from-brand-900 via-brand-950 to-[#04101e]';

/**
 * The brand's navy band: the gradient and its decoration, with a wave that melts into the page.
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
 * The top of the learner's home: a full-width navy band behind the logo, the slogan and the status
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

/**
 * The "khai mở" motif of the brand board: a doorway whose right half is lit gold, with the light
 * spilling over the top and two thin rings around it. A drawing, so it takes the color of the
 * surface behind it; size it with `className`.
 */
export function BrandArch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 300" aria-hidden="true" className={cn('text-white', className)}>
      <defs>
        <linearGradient id="brand-arch-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4c66d" stopOpacity="0.95" />
          <stop offset="1" stopColor="#f4c66d" stopOpacity="0.08" />
        </linearGradient>
        <radialGradient id="brand-arch-glow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#f4c66d" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f4c66d" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="120" cy="120" r="118" fill="url(#brand-arch-glow)" />
      <circle cx="120" cy="120" r="100" fill="none" stroke="currentColor" strokeOpacity="0.12" />
      <circle cx="120" cy="120" r="84" fill="none" stroke="#f4c66d" strokeOpacity="0.25" />
      <path d="M120 40a80 80 0 0 1 80 80v180H120Z" fill="url(#brand-arch-light)" />
      <path
        d="M40 300V120a80 80 0 0 1 160 0v180"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <path d="M120 40v260" stroke="#f4c66d" strokeWidth="1.5" strokeOpacity="0.8" />
    </svg>
  );
}
