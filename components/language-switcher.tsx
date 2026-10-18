'use client';

import { useI18n } from '@/lib/hooks/use-i18n';
import { supportedLocales } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Unit n-pointed star (outer radius 1, point up), placed with a transform.
const star = (n: number, inner: number) =>
  Array.from({ length: 2 * n }, (_, i) => {
    const r = i % 2 ? inner : 1;
    const a = (i * Math.PI) / n;
    return `${(r * Math.sin(a)).toFixed(3)},${(-r * Math.cos(a)).toFixed(3)}`;
  }).join(' ');
const STAR = star(5, 0.382);

const stripes = (colors: string[], vertical = false) =>
  colors.map((fill, i) =>
    vertical ? (
      <rect
        key={i}
        x={(i * 30) / colors.length}
        width={30 / colors.length}
        height="20"
        fill={fill}
      />
    ) : (
      <rect
        key={i}
        y={(i * 20) / colors.length}
        width="30"
        height={20 / colors.length}
        fill={fill}
      />
    ),
  );

// Korean trigrams: centre on the diagonals, rotation of the bars (solid; the gaps are too
// small to see at 20 px).
const TRIGRAMS = [
  [8.76, 5.84, -56.31],
  [21.24, 14.16, -56.31],
  [21.24, 5.84, 56.31],
  [8.76, 14.16, 56.31],
];

// Inline SVG flags drawn at 3:2 and simplified to what reads at 20 px, not emoji: Windows
// shows emoji flags as two letters.
const FLAGS: Record<string, React.ReactNode> = {
  'vi-VN': (
    <>
      <rect width="30" height="20" fill="#DA251D" />
      <polygon points={STAR} fill="#FFFF00" transform="translate(15 10) scale(6)" />
    </>
  ),
  'en-US': (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
      ))}
      <rect width="12" height={(7 * 20) / 13} fill="#3C3B6E" />
    </>
  ),
  'zh-CN': (
    <>
      <rect width="30" height="20" fill="#EE1C25" />
      <polygon points={STAR} fill="#FFFF00" transform="translate(5 5) scale(3)" />
      {[
        [10, 2],
        [12, 4],
        [12, 7],
        [10, 9],
      ].map(([x, y]) => (
        <polygon key={y} points={STAR} fill="#FFFF00" transform={`translate(${x} ${y})`} />
      ))}
    </>
  ),
  'zh-TW': (
    <>
      <rect width="30" height="20" fill="#FE0000" />
      <rect width="15" height="10" fill="#000095" />
      <polygon points={star(12, 0.55)} fill="#FFFFFF" transform="translate(7.5 5) scale(3.6)" />
      <circle cx="7.5" cy="5" r="2.1" fill="#000095" />
      <circle cx="7.5" cy="5" r="1.8" fill="#FFFFFF" />
    </>
  ),
  'ja-JP': (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="6" fill="#BC002D" />
    </>
  ),
  'ru-RU': stripes(['#FFFFFF', '#0039A6', '#D52B1E']),
  'ar-SA': (
    <>
      <rect width="30" height="20" fill="#006C35" />
      <path d="M8 8.5q1.5-2.5 3 0t3 0t3 0t3 0t3 0" stroke="#FFFFFF" strokeWidth="1" fill="none" />
      <rect x="8" y="13" width="14" height="0.9" fill="#FFFFFF" />
    </>
  ),
  'pt-BR': (
    <>
      <rect width="30" height="20" fill="#009C3B" />
      <polygon points="3,10 15,2 27,10 15,18" fill="#FFDF00" />
      <circle cx="15" cy="10" r="5" fill="#002776" />
      <path d="M10.1 9A8 8 0 0 1 19.9 11" stroke="#FFFFFF" strokeWidth="0.9" fill="none" />
    </>
  ),
  'ko-KR': (
    <>
      <rect width="30" height="20" fill="#FFFFFF" />
      <g transform="translate(15 10) rotate(33.69) scale(5)">
        <circle r="1" fill="#0047A0" />
        <path d="M-1 0A1 1 0 0 1 1 0A.5 .5 0 0 0 0 0A.5 .5 0 0 1 -1 0Z" fill="#CD2E3A" />
      </g>
      {TRIGRAMS.map(([x, y, angle]) => (
        <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${angle})`} fill="#000000">
          {[-1.3, -0.27, 0.76].map((barY) => (
            <rect key={barY} x="-1.5" y={barY} width="3" height="0.55" />
          ))}
        </g>
      ))}
    </>
  ),
  'es-MX': (
    <>
      {stripes(['#006847', '#FFFFFF', '#CE1126'], true)}
      <circle cx="15" cy="10" r="2.6" fill="#8C5A2B" />
    </>
  ),
  'fr-FR': stripes(['#0055A4', '#FFFFFF', '#EF4135'], true),
  'de-DE': stripes(['#000000', '#DD0000', '#FFCE00']),
};

function Flag({ code }: { code: string }) {
  return (
    <svg
      viewBox="0 0 30 20"
      aria-hidden="true"
      className="h-3.5 w-5 shrink-0 rounded-[2px] ring-1 ring-black/10 dark:ring-white/20"
    >
      {FLAGS[code]}
    </svg>
  );
}

interface LanguageSwitcherProps {
  /** Called when the dropdown opens, so parent can close sibling dropdowns. */
  onOpen?: () => void;
}

/**
 * Locale picker pill. Backed by Radix DropdownMenu so its content is
 * portaled to `document.body` — important inside Pro mode's CommandBar
 * (which lives under an `overflow-hidden` canvas slot that would
 * otherwise clip the dropdown).
 */
export function LanguageSwitcher({ onOpen }: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n();
  const current = supportedLocales.find((l) => l.code === locale);

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) onOpen?.();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          aria-label={current?.label ?? locale}
          title={current?.label ?? locale}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
        >
          {current ? <Flag code={current.code} /> : locale}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[120px]">
        {supportedLocales.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLocale(l.code)}
            className={cn(
              'cursor-pointer gap-2',
              locale === l.code &&
                'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
            )}
          >
            <Flag code={l.code} />
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
