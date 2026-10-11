// @vitest-environment jsdom
/**
 * The data notice under the name field is set at 14 px, the same size as the
 * text beside it. The name field stops at the length the server keeps.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnDoor } from '@/app/learn/learn-door';
import type { DoorItem } from '@/lib/tutor/door/catalog';
import { cleanNickname } from '@/lib/tutor/door/lesson';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ locale: 'vi-VN' }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lesson = (id: string): DoorItem => ({
  id,
  subject: 'cp',
  title: { 'vi-VN': `Bài ${id}`, 'en-US': `Lesson ${id}` },
  topic: null,
  tier: 1,
  difficulty: 1,
  tracks: [],
  presets: 3,
  order: 0,
  practice: false,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(createElement(LearnDoor, { items: [lesson('cp-1')], enabled: true }));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

describe('the /learn data notice and name field', () => {
  it('sets the notice at 14 px (text-sm), not 12 px', () => {
    const notice = document.getElementById('learn-data-notice');
    const classes = notice?.className.split(/\s+/) ?? [];

    expect(classes).toContain('text-sm');
    expect(classes).not.toContain('text-xs');
  });

  it('stops the name at the 40 characters the server keeps', () => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-describedby="learn-data-notice"]',
    );

    expect(input?.maxLength).toBe(40);
    expect(cleanNickname('x'.repeat(500))).toHaveLength(input!.maxLength);
  });
});
