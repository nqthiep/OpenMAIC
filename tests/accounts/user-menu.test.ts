/**
 * The account menu: which items a signed-in account sees, and how the trigger
 * names the account. The interactive parts need a DOM, which this suite does not
 * load, so the menu is checked as markup and its item list directly.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  AccountMenu,
  menuEntries,
  type MenuAccount,
  UserMenu,
} from '@/components/accounts/user-menu';
import { messages } from '@/components/accounts/messages';

const user: MenuAccount = {
  id: '0c3e9b1e-7a4d-4f5e-9b2a-1d2c3e4f5a6b',
  username: 'thiep',
  displayName: 'Nguyễn Thiệp',
  role: 'user',
  mustChangePassword: false,
};
const admin: MenuAccount = { ...user, role: 'admin' };

describe('menuEntries', () => {
  it('offers the account page and sign-out to a user', () => {
    expect(menuEntries(user)).toEqual([
      { kind: 'link', href: '/account', label: 'Tài khoản' },
      { kind: 'sign-out', label: 'Đăng xuất' },
    ]);
  });

  it('adds the admin page for an administrator', () => {
    const hrefs = menuEntries(admin).map((entry) =>
      entry.kind === 'link' ? entry.href : 'sign-out',
    );
    expect(hrefs).toEqual(['/account', '/admin', 'sign-out']);
  });

  it('withholds the admin page while the password must change first', () => {
    const entries = menuEntries({ ...admin, mustChangePassword: true });
    expect(entries.some((entry) => entry.kind === 'link' && entry.href === '/admin')).toBe(false);
  });
});

describe('AccountMenu', () => {
  it('names the account on the trigger and keeps the items closed until opened', () => {
    const html = renderToStaticMarkup(
      createElement(AccountMenu, { account: admin, onSignOut: () => {} }),
    );

    expect(html).toContain(`aria-label="${messages.userMenu.trigger('Nguyễn Thiệp')}"`);
    expect(html).toContain('fixed bottom-4 left-4');
    expect(html).toContain('>N<');
    expect(html).not.toContain(messages.userMenu.signOut);
    expect(html).not.toContain(messages.userMenu.admin);
  });
});

describe('UserMenu', () => {
  it('renders nothing without a session cookie', () => {
    expect(renderToStaticMarkup(createElement(UserMenu, { hasSessionCookie: false }))).toBe('');
  });
});
