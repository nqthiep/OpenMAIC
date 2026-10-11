// @vitest-environment jsdom
/**
 * The notifications region is announced in Vietnamese, with the hotkey the
 * toaster keeps for it.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toaster } from '@/components/ui/sonner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

beforeEach(() => {
  // jsdom has no matchMedia; the toaster reads the colour scheme through it
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
});

describe('the toaster region', () => {
  it('is named "Thông báo" followed by the hotkey, not the English default', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(Toaster)));

    const region = container.querySelector('section[aria-label]');
    expect(region?.getAttribute('aria-label')).toBe('Thông báo alt+T');
  });
});
