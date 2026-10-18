/**
 * Brand configuration.
 *
 * The reference (live deployment) resolves the brand per vendor from the
 * desktop shell's User-Agent token. This workspace has no vendor shell: the
 * product ships with its own single brand, so the config is static and the
 * desktop flag is always off. The shape is kept so surfaces that read the
 * brand (home hero, workspace rail, site header) keep one source of truth.
 */

export interface BrandConfig {
  /** Full product name (page titles, logo alt text). */
  productName: string;
  /** Short name for space-constrained spots. */
  shortName: string;
  /** Public domain, written exactly like this (guidelines, section 4). */
  domain: string;
  /** One sentence for `<meta name="description">`. */
  description: string;
  /** Horizontal logo asset under `public/`. */
  logoSrc: string;
  /** Whether `logoSrc` already carries the product wordmark. */
  logoHasWordmark: boolean;
  /** Square brand mark under `public/` (favicon, workspace header). */
  markSrc: string;
  /** Browser theme color (`<meta name="theme-color">` / PWA). */
  themeColor: string;
}

/** The default brand: ÔN THI (guidelines v1.0), with no vendor overrides. */
export const DEFAULT_BRAND: BrandConfig = {
  productName: 'ÔN THI',
  shortName: 'ÔN THI',
  domain: 'onthi.ap.vn',
  description:
    'Nền tảng học tập và luyện thi trực tuyến: hiểu chắc kiến thức, vững bước vào kỳ thi.',
  logoSrc: '/brand/logo-horizontal.png',
  logoHasWordmark: true,
  markSrc: '/brand/mark.png',
  themeColor: '#2563EB',
};
