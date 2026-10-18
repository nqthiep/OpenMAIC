// @vitest-environment jsdom

/**
 * The Gate has three outcomes for the same capability: the children when it is granted, the
 * locked notice when it is not, and nothing when there is no notice. Nothing shows until the
 * session is known, so a locked control never flashes before the answer.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '@/lib/server/authz/capabilities';

const mocks = vi.hoisted(() => ({
  capabilities: undefined as Partial<Capabilities> | undefined,
}));

vi.mock('@/lib/capabilities/use-capabilities', () => ({
  useCapabilities: () => mocks.capabilities,
}));

import { Gate } from '@/components/capability/gate';

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  mocks.capabilities = undefined;
});

const LOCKED = createElement('p', null, 'Cần gói thành viên');
const CONTENT = createElement('button', null, 'Tạo bài');

describe('Gate', () => {
  it('shows nothing until the session is known', () => {
    mocks.capabilities = undefined;
    const container = render(
      createElement(Gate, { capability: 'generate', locked: LOCKED }, CONTENT),
    );
    expect(container.textContent).toBe('');
  });

  it('shows the children when the capability is granted', () => {
    mocks.capabilities = { generate: true };
    const container = render(
      createElement(Gate, { capability: 'generate', locked: LOCKED }, CONTENT),
    );
    expect(container.textContent).toBe('Tạo bài');
    expect(container.textContent).not.toContain('Cần gói thành viên');
  });

  it('shows the locked notice, and not the children, when the capability is refused', () => {
    mocks.capabilities = { generate: false };
    const container = render(
      createElement(Gate, { capability: 'generate', locked: LOCKED }, CONTENT),
    );
    expect(container.textContent).toBe('Cần gói thành viên');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows the blocked notice in place of the children when the capability is granted but blocked', () => {
    mocks.capabilities = { generate: true };
    const blocked = createElement('p', null, 'Hết hạn mức');
    const container = render(
      createElement(Gate, { capability: 'generate', locked: LOCKED, blocked }, CONTENT),
    );
    expect(container.textContent).toBe('Hết hạn mức');
    expect(container.querySelector('button')).toBeNull();
  });

  it('shows the locked notice, not the blocked one, when the capability is refused', () => {
    mocks.capabilities = { generate: false };
    const blocked = createElement('p', null, 'Hết hạn mức');
    const container = render(
      createElement(Gate, { capability: 'generate', locked: LOCKED, blocked }, CONTENT),
    );
    expect(container.textContent).toBe('Cần gói thành viên');
  });

  it('shows nothing when the capability is refused and there is no notice', () => {
    mocks.capabilities = { generate: false };
    const container = render(createElement(Gate, { capability: 'generate' }, CONTENT));
    expect(container.textContent).toBe('');
  });
});
