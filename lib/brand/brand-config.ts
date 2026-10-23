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
  /** Public domain, written exactly like this. */
  domain: string;
  /**
   * Where a visitor writes for help, to renew a membership, or to get a password reset. The
   * owner's own address for now; an address under the domain replaces it here, in one place.
   */
  contactEmail: string;
  /** One sentence for `<meta name="description">`. */
  description: string;
  /** Horizontal logo asset under `public/`, for light surfaces. */
  logoSrc: string;
  /** The same logo for dark surfaces (the navy hero band, the dark theme). */
  logoSrcOnDark: string;
  /** Whether `logoSrc` already carries the product wordmark. */
  logoHasWordmark: boolean;
  /** Square brand mark under `public/` (favicon, workspace header), for light surfaces. */
  markSrc: string;
  /** The mark for dark surfaces. */
  markSrcOnDark: string;
  /** Browser theme color (`<meta name="theme-color">` / PWA). */
  themeColor: string;
}

/** The default brand: KHAITAM, with no vendor overrides. */
export const DEFAULT_BRAND: BrandConfig = {
  productName: 'KHAITAM',
  shortName: 'KHAITAM',
  domain: 'khaitam.ai.vn',
  contactEmail: 'nqthiep@gmail.com',
  description:
    'Học và ôn tập Toán, Tin học, Vật lí, Hoá học cho học sinh lớp 5, lớp 9 và lớp 12 qua bài giảng tương tác: nghe giảng, xem slide, làm câu hỏi kiểm tra ngay trong bài. Học thử miễn phí, không cần tài khoản.',
  logoSrc: '/brand/logo-horizontal.svg',
  logoSrcOnDark: '/brand/logo-horizontal-dark.svg',
  logoHasWordmark: true,
  markSrc: '/brand/mark.svg',
  markSrcOnDark: '/brand/mark-dark.svg',
  themeColor: '#102541',
};
