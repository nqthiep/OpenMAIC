// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LearnDoor } from '@/app/learn/learn-door';
import type { DoorItem } from '@/lib/tutor/door/catalog';

// fetch and the router are mocked: the start route writes to the database and must not run here
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ locale: 'vi-VN' }) }));

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

const render = (props: { items: DoorItem[]; enabled?: boolean }) =>
  act(() => {
    root.render(createElement(LearnDoor, { items: props.items, enabled: props.enabled ?? true }));
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
const titles = () =>
  [...container.querySelectorAll('li')].map((li) => li.querySelector('.font-medium')?.textContent);
const ok = (body: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as unknown as Response);

beforeEach(() => {
  router.push.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('/learn door (jsdom)', () => {
  it('choosing Toán drops the Thi vào 10 track, so the math lessons show again', async () => {
    render({ items });
    await press(chip('Tin học'));
    await press(chip('Thi vào 10 chuyên'));
    expect(titles()).toEqual(['Bài cp-ts']);

    await press(chip('Toán'));
    expect(titles()).toEqual(['Bài math-1']);
    expect(chip('Thi vào 10 chuyên')).toBeNull();
    expect(container.textContent).not.toContain('Chưa có bài nào khớp.');

    await press(chip('Tin học'));
    expect(titles()).toEqual(['Bài cp-ts']);
  });

  it('a second press while the course is opening does not start a second course', async () => {
    const fetchMock = ok({ stageId: 'stage-1', url: '/classroom/stage-1' });
    vi.stubGlobal('fetch', fetchMock);
    render({ items });

    await press(startButton('math-1'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/classroom/stage-1');
    expect(startButton('math-1').disabled).toBe(true);

    await press(startButton('math-1'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed start shows the note inside the card that was pressed, and unlocks it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    );
    render({ items });

    await press(startButton('math-1'));
    expect(card('math-1')!.querySelector('[role=alert]')!.textContent).toContain(
      'Chưa mở được bài',
    );
    expect(card('cp-ts')!.querySelector('[role=alert]')).toBeNull();
    expect(startButton('math-1').disabled).toBe(false);
  });

  it('a missing access code points to the home page from the card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401 }) as unknown as Response),
    );
    render({ items });

    await press(startButton('math-1'));
    const note = card('math-1')!.querySelector('[role=alert]')!;
    expect(note.textContent).toContain('Cần nhập mã truy cập');
    expect(note.querySelector('a')!.getAttribute('href')).toBe('/?classic=1');
  });

  it('when the page does not leave after 10 s, the button unlocks and says so', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', ok({ stageId: 'stage-1', url: '/classroom/stage-1' }));
    render({ items });

    await press(startButton('math-1'));
    expect(router.push).toHaveBeenCalledWith('/classroom/stage-1');
    expect(startButton('math-1').disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(startButton('math-1').disabled).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(startButton('math-1').disabled).toBe(false);
    expect(card('math-1')!.querySelector('[role=alert]')!.textContent).toContain(
      'Chưa chuyển được sang trang học, thử lại',
    );
  });

  it('the opening state is announced through a live region', () => {
    let finish!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
    );
    render({ items });

    act(() => startButton('math-1').click());
    expect(container.querySelector('[aria-live="polite"]')!.textContent).toBe('Đang mở…');

    act(() => finish({ ok: false, status: 500 } as Response));
  });

  it('the data notice sits under the name field and is linked to it', () => {
    render({ items });
    const input = container.querySelector('input')!;
    const notice = document.getElementById(input.getAttribute('aria-describedby')!)!;

    expect(input.closest('label')!.nextElementSibling).toBe(notice);
    const text = notice.textContent!;
    for (const phrase of [
      'tên hoặc biệt danh',
      'bài làm luyện tập',
      'tiến độ học',
      'Giáo viên có mã truy cập của trường',
      'chưa có cách xoá theo yêu cầu',
      'người quản trị',
      'không nhập họ tên thật',
    ]) {
      expect(text).toContain(phrase);
    }
    // consent is not ours to claim: the notice must not say that anyone agreed
    expect(text).not.toMatch(/đồng ý|phụ huynh/i);
  });

  it('a closed page names no database and no environment variable', () => {
    render({ items, enabled: false });
    expect(container.textContent).toContain('Trang này chưa sẵn sàng');
    expect(container.textContent).not.toMatch(/cơ sở dữ liệu|[A-Z]+_[A-Z_]+/);
  });

  it('the lesson line says ví dụ, and the Vietnamese page has no Chinese characters', () => {
    render({ items });
    expect(container.textContent).toContain('· 3 ví dụ');
    expect(container.textContent).not.toContain('bộ dữ liệu');
    expect(container.textContent).not.toMatch(/[㐀-鿿]/);
  });

  it('the subtitle for Toán does not mention algorithms', async () => {
    render({ items });
    const sub = () => container.querySelector('p.mt-1')!.textContent;
    expect(sub()).toContain('thuật toán');

    await press(chip('Toán'));
    expect(sub()).not.toContain('thuật toán');
    expect(sub()).toContain('Xem cách giải');
  });
});
