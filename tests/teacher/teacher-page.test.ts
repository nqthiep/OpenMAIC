// @vitest-environment jsdom

/**
 * The /teacher page driven through its fetch calls: what a wrong code, a rate limit, an unreachable
 * server, a closed gate, a cut report and a logout each show to the teacher.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'vi-VN',
    setLocale: () => {},
  }),
}));

import TeacherPage from '@/app/teacher/page';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount(element: ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
  return host;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function json(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Route each fetch by method and path; anything not listed answers 500. */
function stubFetch(
  routes: Record<string, () => Response | Promise<Response>>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const handler = routes[key];
    return handler ? handler() : json(500);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const unreachable = () => Promise.reject(new TypeError('Failed to fetch'));

function typeCode(host: HTMLElement, value: string): void {
  const input = host.querySelector<HTMLInputElement>('#teacher-code')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submitCode(host: HTMLElement): Promise<void> {
  await act(async () => {
    host
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await settle();
}

function buttonNamed(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
}

async function clickNamed(host: HTMLElement, text: string): Promise<void> {
  const button = buttonNamed(host, text);
  expect(button, `button "${text}"`).toBeDefined();
  await act(async () => {
    button!.click();
  });
  await settle();
}

const LOGIN = 'POST /api/teacher/login';
const PROGRESS = 'GET /api/teacher/progress';
const LOGOUT = 'POST /api/teacher/logout';

describe('teacher page: the code form', () => {
  it('asks for the teacher code when the report answers 401', async () => {
    stubFetch({ [PROGRESS]: () => json(401) });
    const host = mount(createElement(TeacherPage));
    await settle();
    expect(host.querySelector('#teacher-code')).not.toBeNull();
  });

  it('says the code is wrong on 401, and not that the server is busy', async () => {
    stubFetch({ [PROGRESS]: () => json(401), [LOGIN]: () => json(401) });
    const host = mount(createElement(TeacherPage));
    await settle();

    typeCode(host, 'not-the-code');
    await submitCode(host);
    expect(host.textContent).toContain('Mã chưa đúng.');
    expect(host.textContent).not.toContain('Nhập sai quá nhiều lần');
  });

  it('shows the wait time on 429 instead of the wrong-code message', async () => {
    stubFetch({
      [PROGRESS]: () => json(401),
      [LOGIN]: () => json(429, { errorCode: 'RATE_LIMITED' }, { 'Retry-After': '30' }),
    });
    const host = mount(createElement(TeacherPage));
    await settle();

    typeCode(host, 'not-the-code');
    await submitCode(host);
    expect(host.textContent).toContain('Chờ 30 giây rồi thử lại.');
    expect(host.textContent).not.toContain('Mã chưa đúng.');
  });

  it('shows a network message with a retry that sends the code again', async () => {
    let attempts = 0;
    const fetchMock = stubFetch({
      [PROGRESS]: () => json(401),
      [LOGIN]: () => {
        attempts += 1;
        return attempts === 1 ? unreachable() : json(401);
      },
    });
    const host = mount(createElement(TeacherPage));
    await settle();

    typeCode(host, 'not-the-code');
    await submitCode(host);
    expect(host.textContent).toContain('Không kết nối được máy chủ');

    await clickNamed(host, 'Thử lại');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/teacher/login')).toHaveLength(2);
    expect(host.textContent).toContain('Mã chưa đúng.');
  });

  it('says the page is not open on 403, without naming server settings', async () => {
    stubFetch({ [PROGRESS]: () => json(403) });
    const host = mount(createElement(TeacherPage));
    await settle();

    expect(host.textContent).toContain('Trang chưa mở');
    for (const name of ['TUTOR', 'ACCESS_CODE', 'OPENMAIC', '_CODE']) {
      expect(host.textContent).not.toContain(name);
    }
  });
});

describe('teacher page: the report', () => {
  it('retries the load after a network failure', async () => {
    let loads = 0;
    stubFetch({
      [PROGRESS]: () => {
        loads += 1;
        return loads === 1 ? unreachable() : json(200, emptyReport());
      },
    });
    const host = mount(createElement(TeacherPage));
    await settle();

    expect(host.textContent).toContain('Không kết nối được máy chủ');
    await clickNamed(host, 'Thử lại');
    expect(host.textContent).toContain('Chưa có số liệu.');
  });

  it('warns that the report is cut at the row limit', async () => {
    stubFetch({ [PROGRESS]: () => json(200, { ...emptyReport(), truncated: true }) });
    const host = mount(createElement(TeacherPage));
    await settle();

    expect(host.textContent).toContain('Báo cáo chỉ đọc 50 000 bản ghi học mới nhất.');
  });

  it('shows step names and the easy-to-follow average, never the raw step id', async () => {
    stubFetch({
      [PROGRESS]: () =>
        json(200, {
          ...emptyReport(),
          lessons: [
            {
              walkthroughId: 'binary-search',
              title: 'Tìm kiếm nhị phân',
              attempts: 3,
              predictionRate: 0,
              hintsPerAttempt: 0,
              practiceRate: null,
              easyAverage: 4.5,
              easyCount: 4,
              hardBeats: [{ beatId: 'go-right', label: 'Sang phải', answered: 3, rate: 0 }],
            },
          ],
        }),
    });
    const host = mount(createElement(TeacherPage));
    await settle();

    expect(host.textContent).toContain('Sang phải (0%)');
    expect(host.textContent).not.toContain('go-right');
    expect(host.textContent).toContain('4,5 / 5 (4)');
  });

  it('logs out: posts to the logout route and shows the code form again', async () => {
    const fetchMock = stubFetch({
      [PROGRESS]: () => json(200, emptyReport()),
      [LOGOUT]: () => json(200, { valid: false }),
    });
    const host = mount(createElement(TeacherPage));
    await settle();

    await clickNamed(host, 'Đăng xuất');
    expect(fetchMock).toHaveBeenCalledWith('/api/teacher/logout', { method: 'POST' });
    expect(host.querySelector('#teacher-code')).not.toBeNull();
    expect(host.textContent).not.toContain('Theo bài');
  });
});

function emptyReport() {
  return {
    generatedAt: '2026-10-10T08:00:00.000Z',
    truncated: false,
    attempts: [],
    lessons: [],
  };
}
