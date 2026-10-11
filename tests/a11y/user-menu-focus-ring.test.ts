import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AccountMenu, type MenuAccount } from '@/components/accounts/user-menu';

// A focus ring at partial opacity (ring-ring/50) is under the 3:1 that a focus indicator needs.
const PARTIAL_FOCUS_RING = /(^|\s)(dark:)?focus-visible:ring-[\w-]+\/\d+/;

const user: MenuAccount = {
  id: '0c3e9b1e-7a4d-4f5e-9b2a-1d2c3e4f5a6b',
  username: 'thiep',
  displayName: 'Nguyễn Thiệp',
  role: 'user',
  mustChangePassword: false,
};

describe('the account menu trigger', () => {
  it('shows a fully opaque focus ring in the ring colour', () => {
    const html = renderToStaticMarkup(
      createElement(AccountMenu, { account: user, onSignOut: () => {} }),
    );
    const classes = html.match(/<button[^>]*class="([^"]*)"/)![1];

    expect(classes.split(/\s+/)).toContain('focus-visible:ring-ring');
    expect(classes).not.toMatch(PARTIAL_FOCUS_RING);
  });
});
