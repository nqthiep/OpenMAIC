'use client';

import { useBrand } from '@/lib/brand/brand-context';
import { cn } from '@/lib/utils';

/**
 * The brand logo or mark, in the file that suits the surface it sits on.
 *
 * - `surface="auto"` (default): the page follows the theme, so both files are
 *   rendered and CSS shows one (`dark:` variant). No theme state, no flash.
 * - `surface="dark"`: the image sits on a navy band whatever the theme is
 *   (hero, dialog header), so only the dark file is rendered.
 *
 * A CSS filter would flatten the logo to one color and lose the gold dot.
 */
export function BrandImage({
  kind,
  surface = 'auto',
  alt,
  className,
}: {
  kind: 'logo' | 'mark';
  surface?: 'auto' | 'dark';
  alt: string;
  className?: string;
}) {
  const brand = useBrand();
  const light = kind === 'logo' ? brand.logoSrc : brand.markSrc;
  const dark = kind === 'logo' ? brand.logoSrcOnDark : brand.markSrcOnDark;
  if (surface === 'dark') return <img src={dark} alt={alt} className={className} />;
  return (
    <>
      <img src={light} alt={alt} className={cn('dark:hidden', className)} />
      <img src={dark} alt={alt} className={cn('hidden dark:block', className)} />
    </>
  );
}
