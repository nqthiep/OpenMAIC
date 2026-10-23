import { describe, expect, it } from 'vitest';
import type { AccountSession } from '@/components/account/account-api';
import {
  GUEST_SECTIONS,
  guestSectionLinks,
  isActiveNavLink,
  siteHomeHref,
  siteNavLinks,
} from '@/lib/home/site-nav';

const session = (extra: Partial<AccountSession>): AccountSession => ({
  enabled: true,
  registrationOpen: true,
  authenticated: true,
  ...extra,
});
const hrefs = (s: AccountSession | null | undefined) => siteNavLinks(s).map((link) => link.href);

describe('siteNavLinks', () => {
  it('shows nothing until the session is known', () => {
    expect(hrefs(undefined)).toEqual([]);
  });

  it('gives a guest the catalog only', () => {
    expect(hrefs(session({ authenticated: false }))).toEqual(['/catalog']);
  });

  it('gives a learner home, catalog and community', () => {
    expect(hrefs(session({ role: 'learner' }))).toEqual(['/', '/catalog', '/community']);
  });

  it('gives staff the dashboard and the learning home first', () => {
    for (const role of ['operator', 'admin'] as const) {
      expect(hrefs(session({ role }))).toEqual(['/admin', '/?learn=1', '/catalog', '/community']);
    }
  });

  it('keeps the open pages when accounts are off or the check failed', () => {
    expect(hrefs(session({ enabled: false, authenticated: false }))).toEqual(['/', '/catalog']);
    expect(hrefs(null)).toEqual(['/', '/catalog']);
  });
});

describe('siteHomeHref', () => {
  it('sends staff to the dashboard and others home', () => {
    expect(siteHomeHref(session({ role: 'admin' }))).toBe('/admin');
    expect(siteHomeHref(session({ role: 'learner' }))).toBe('/');
    expect(siteHomeHref(undefined)).toBe('/');
  });
});

describe('isActiveNavLink', () => {
  it('matches the page and its subpages, and home only on itself', () => {
    expect(isActiveNavLink('/', '/')).toBe(true);
    expect(isActiveNavLink('/', '/catalog')).toBe(false);
    expect(isActiveNavLink('/?learn=1', '/')).toBe(true);
    expect(isActiveNavLink('/catalog', '/catalog')).toBe(true);
    expect(isActiveNavLink('/admin', '/admin/x')).toBe(true);
    expect(isActiveNavLink('/admin', '/administer')).toBe(false);
  });
});

describe('guestSectionLinks', () => {
  it('are anchors in the page on the home', () => {
    expect(guestSectionLinks('/').map((l) => l.href)).toEqual(GUEST_SECTIONS.map((id) => `#${id}`));
  });

  it('lead back to the same sections of the home from any other page, so the bar keeps its links', () => {
    for (const path of ['/catalog', '/community', '/classroom/x']) {
      expect(guestSectionLinks(path).map((l) => l.href)).toEqual(
        GUEST_SECTIONS.map((id) => `/#${id}`),
      );
    }
  });

  it('use the labels of the home sections', () => {
    expect(guestSectionLinks('/').map((l) => l.labelKey)).toEqual(
      GUEST_SECTIONS.map((id) => `home.guest.nav.${id}`),
    );
  });
});
