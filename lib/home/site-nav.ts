import type { AccountSession } from '@/components/account/account-api';

export interface SiteNavLink {
  readonly href: string;
  readonly labelKey: string;
}

const CATALOG: SiteNavLink = { href: '/catalog', labelKey: 'catalog.title' };
const COMMUNITY: SiteNavLink = { href: '/community', labelKey: 'community.title' };
const HOME: SiteNavLink = { href: '/', labelKey: 'nav.home' };

const isStaff = (session: AccountSession | null | undefined) =>
  session?.role === 'operator' || session?.role === 'admin';

/**
 * The top bar's main links for this visitor. Places live here; the account menu keeps only
 * account actions. Empty until the session is known, so no link flashes in and out.
 */
export function siteNavLinks(session: AccountSession | null | undefined): SiteNavLink[] {
  if (session === undefined) return [];
  // Accounts off (single-user) or a failed check: the open pages only.
  if (!session?.enabled) return [HOME, CATALOG];
  // The community asks guests to sign in, so it is not offered to them.
  if (!session.authenticated) return [CATALOG];
  if (isStaff(session)) {
    return [
      { href: '/admin', labelKey: 'account.adminPage.title' },
      { href: '/?learn=1', labelKey: 'account.adminPage.learn' },
      CATALOG,
      COMMUNITY,
    ];
  }
  return [HOME, CATALOG, COMMUNITY];
}

/** Where the logo leads: the operations dashboard for staff, the home for everyone else. */
export function siteHomeHref(session: AccountSession | null | undefined): string {
  return isStaff(session) ? '/admin' : '/';
}

/** True when `pathname` is the page a link opens; `/` matches only itself. */
export function isActiveNavLink(href: string, pathname: string): boolean {
  const path = href.split(/[?#]/)[0];
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);
}
