import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import LoginPage from '@/app/login/page';
import { messages } from '@/components/accounts/messages';
import { AccountShell } from '@/components/accounts/shell';

// A focus ring at partial opacity (ring-ring/50) is under the 3:1 that a focus indicator needs.
const PARTIAL_FOCUS_RING = /(^|\s)(dark:)?focus-visible:ring-[\w-]+\/\d+/;

// AccountShell uses no hooks, so it can be called as a plain function.
function renderShell(showHomeLink?: boolean): string {
  return renderToStaticMarkup(AccountShell({ title: 'Test', showHomeLink, children: 'Body' }));
}

describe('the account page header', () => {
  it('links back to the home page by default', () => {
    expect(renderShell()).toContain(messages.goHome);
  });

  it('drops the home link when showHomeLink is off', () => {
    expect(renderShell(false)).not.toContain(messages.goHome);
  });

  it('has no home link on the sign-in page', async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({}) });
    expect(renderToStaticMarkup(page)).not.toContain(messages.goHome);
  });

  it('draws the app name focus ring fully opaque in the ring colour', () => {
    const link = renderShell().match(/<a\b[^>]*>OpenMAIC<\/a>/)?.[0] ?? '';
    const classes = link.match(/class="([^"]*)"/)?.[1] ?? '';
    expect(classes.split(/\s+/)).toContain('focus-visible:ring-ring');
    expect(classes).not.toMatch(PARTIAL_FOCUS_RING);
  });
});
