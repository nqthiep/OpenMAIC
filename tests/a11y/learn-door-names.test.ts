// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnDoor } from '@/app/learn/learn-door';
import i18n from '@/lib/i18n/config';
import { LocaleSwitch, saveLocaleChoice } from '@/lib/i18n/locale-switch';
import { RequestLocaleProvider } from '@/lib/i18n/request-locale-provider';
import type { Locale } from '@/lib/i18n/types';
import type { DoorItem } from '@/lib/tutor/door/catalog';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lesson = (id: string, over: Partial<DoorItem> = {}): DoorItem => ({
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
  ...over,
});

const items = [
  lesson('cp-ts', { tracks: ['ts10'] }),
  lesson('math-1', { subject: 'math', order: 1 }),
];

let container: HTMLDivElement;
let root: Root;

const renderDoor = (locale?: Locale) =>
  act(() => {
    const door = createElement(LearnDoor, { items, enabled: true });
    root.render(locale ? createElement(RequestLocaleProvider, { locale }, door) : door);
  });
const press = (el: HTMLElement | null) =>
  act(async () => {
    el!.click();
  });
const chip = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text) ?? null;
const card = (id: string) =>
  [...container.querySelectorAll('li')].find((li) => li.textContent?.includes(`Bài ${id}`)) ?? null;
const startButton = (id: string) => card(id)!.querySelector('button') as HTMLButtonElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  document.cookie = 'locale=; path=/; max-age=0';
});

describe('/learn names its controls for screen readers', () => {
  it('each start button carries its lesson title, so identical buttons are told apart', () => {
    renderDoor();
    expect(startButton('cp-ts').getAttribute('aria-label')).toBe('Bắt đầu học: Bài cp-ts');
    expect(startButton('math-1').getAttribute('aria-label')).toBe('Bắt đầu học: Bài math-1');
  });

  it('a lesson title is a heading inside its card', () => {
    renderDoor();
    expect(card('math-1')!.querySelector('h3')!.textContent).toBe('Bài math-1');
  });

  it('filter chips say which filter is on', async () => {
    renderDoor();
    expect(chip('Tin học')!.getAttribute('aria-pressed')).toBe('false');

    await press(chip('Tin học'));
    expect(chip('Tin học')!.getAttribute('aria-pressed')).toBe('true');

    await press(chip('Thi vào 10 chuyên'));
    expect(chip('Thi vào 10 chuyên')!.getAttribute('aria-pressed')).toBe('true');
    expect(chip('Tin học')!.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('/learn language follows the locale the server resolved', () => {
  it('defaults to Vietnamese when no locale is provided', () => {
    renderDoor();
    expect(container.querySelector('main')!.getAttribute('lang')).toBe('vi-VN');
    expect(container.querySelector('h1')!.textContent).toBe('Chọn bài để học');
    expect(container.querySelector('h2')!.textContent).toBe('Tin học · Bậc 1');
  });

  it('keeps <html lang> in step with the UI language after the user changes it', async () => {
    document.documentElement.lang = 'vi-VN';
    renderDoor('vi-VN');
    await act(async () => {
      await i18n.changeLanguage('en-US');
    });
    expect(document.documentElement.lang).toBe('en-US');
    await act(async () => {
      await i18n.changeLanguage('vi-VN');
    });
    document.documentElement.lang = '';
  });

  it('renders English on the first pass when the server chose English', () => {
    renderDoor('en-US');
    expect(container.querySelector('main')!.getAttribute('lang')).toBe('en-US');
    expect(container.querySelector('h1')!.textContent).toBe('Pick a lesson');
  });

  it('any locale without copy of its own gets Vietnamese', () => {
    renderDoor('ja-JP');
    expect(container.querySelector('main')!.getAttribute('lang')).toBe('vi-VN');
  });
});

describe('the language switch', () => {
  it('offers Vietnamese and English and marks the current one', () => {
    act(() => root.render(createElement(LocaleSwitch, { locale: 'en-US' })));
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Tiếng Việt', 'English']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('a saved choice goes to the cookie the server reads and the storage the app reads', () => {
    saveLocaleChoice('en-US');
    expect(document.cookie).toContain('locale=en-US');
    expect(localStorage.getItem('locale')).toBe('en-US');
  });
});
