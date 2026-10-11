// @vitest-environment jsdom
/**
 * Opening the "sign out of every device" confirmation moves the focus onto its
 * confirm button, so a keyboard user does not have to hunt for it.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountPanel } from '@/components/accounts/account-panel';
import { messages } from '@/components/accounts/messages';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function buttonNamed(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) throw new Error(`no button named ${text}`);
  return button;
}

describe('the sign-out-everywhere confirmation', () => {
  it('moves the focus to the confirm button when it opens', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(AccountPanel, {
          user: { username: 'thiep', displayName: 'Nguyễn Thiệp', role: 'user' },
        }),
      ),
    );

    act(() => buttonNamed(messages.account.signOutAll).click());

    const confirm = buttonNamed(messages.account.signOutAllConfirm);
    expect(document.activeElement).toBe(confirm);
    // the tinted destructive text is darkened so it keeps 4.5:1 (see destructive-action-contrast)
    expect(confirm.className.split(/\s+/)).toContain('text-red-800');
  });
});
