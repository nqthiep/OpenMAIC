// @vitest-environment jsdom

/**
 * The OmniRoute area of the shared server credential card: nothing until the server says OmniRoute
 * is set up, the tab is asked for before the request so the browser will not block it, and the
 * one-time ticket in the URL is never shown on this page.
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  open: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  fetchSettings: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  saveRoute: vi.fn(),
  removeRoute: vi.fn(),
  verify: vi.fn(),
  refreshStore: vi.fn(),
  t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock('@/lib/hooks/use-i18n', () => ({ useI18n: () => ({ locale: 'en-US', t: mocks.t }) }));
vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: { getState: () => ({ fetchServerProviders: mocks.refreshStore }) },
}));
vi.mock('@/components/learning/learning-api', () => ({
  fetchProviderSettings: mocks.fetchSettings,
  saveProvider: mocks.save,
  removeProvider: mocks.remove,
  saveModelRoute: mocks.saveRoute,
  removeModelRoute: mocks.removeRoute,
  verifyProvider: mocks.verify,
  VERIFIABLE_KINDS: ['providers', 'image', 'video', 'pdf'],
  LearningRequestError: class extends Error {
    constructor(
      readonly status: number,
      readonly errorCode?: string,
    ) {
      super('failed');
    }
  },
}));

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** A `fetch` answer: `ok` for 2xx, with a JSON body. */
const reply = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

/** The tab `window.open` hands back: `location.href`, `opener` and `close` are watched. */
const fakeWindow = () => ({
  opener: {} as unknown,
  location: { href: '' },
  close: vi.fn(),
});

/** Lets every queued microtask run before the next assertion (one real timer tick). */
const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

/** Mounts one element on a clean page and lets its effects settle. */
async function render(node: ReactElement) {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
  });
  await flush();
}

const buttonIn = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

beforeEach(() => {
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('open', mocks.open);
  mocks.fetch.mockResolvedValue(reply(200, { enabled: true }));
  mocks.open.mockReturnValue(fakeWindow());
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('the OmniRoute area of the shared credential card', () => {
  it('renders nothing while the status is unknown, on 403, or when the request fails', async () => {
    const { OmniRouteLink } = await import('@/components/settings/omniroute-link');

    // No answer yet: nothing, not even an empty frame.
    mocks.fetch.mockImplementation(() => new Promise<Response>(() => {}));
    await render(createElement(OmniRouteLink));
    expect(document.body.textContent).toBe('');

    // Forbidden (someone who is not an administrator): nothing.
    mocks.fetch.mockResolvedValue(reply(403, { error: 'forbidden' }));
    await render(createElement(OmniRouteLink));
    expect(document.body.textContent).toBe('');

    // Offline: nothing, and no error toast (there is nothing the user can do about it).
    mocks.fetch.mockRejectedValue(new TypeError('network down'));
    await render(createElement(OmniRouteLink));
    expect(document.body.textContent).toBe('');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('asks the status once and shows only a dim note when OmniRoute is not set up', async () => {
    const { OmniRouteLink } = await import('@/components/settings/omniroute-link');
    mocks.fetch.mockResolvedValue(reply(200, { enabled: false }));
    await render(createElement(OmniRouteLink));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/status');
    expect(document.body.textContent).toContain('admin.providers.omniroute.notConfigured');
    expect(document.body.textContent).not.toContain('admin.providers.omniroute.title');
    expect(document.querySelector('button')).toBeNull();
  });

  it('opens the dashboard in a tab asked for before the request, and never shows the ticket here', async () => {
    const { OmniRouteLink } = await import('@/components/settings/omniroute-link');
    const ticket = 'https://omniroute.example/settings#ticket=one-time';
    // When the request for the ticket starts, the tab must already be open: that is what keeps
    // the browser from blocking it.
    let openedBeforeTheRequest = false;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === '/api/admin/omniroute/open') {
        openedBeforeTheRequest = mocks.open.mock.calls.length === 1;
        return reply(200, { url: ticket });
      }
      return reply(200, { enabled: true });
    });
    const win = fakeWindow();
    mocks.open.mockReturnValue(win);
    await render(createElement(OmniRouteLink));

    expect(document.body.textContent).toContain('admin.providers.omniroute.title');
    expect(document.body.textContent).toContain('admin.providers.omniroute.description');
    const openOmniRoute = buttonIn(document.body, 'admin.providers.omniroute.open')!;
    expect(openOmniRoute.disabled).toBe(false);

    await act(async () => {
      openOmniRoute.click();
    });
    await flush();

    expect(mocks.open).toHaveBeenCalledWith('', '_blank');
    expect(openedBeforeTheRequest).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/open', { method: 'POST' });
    expect(win.location.href).toBe(ticket);
    expect(win.opener).toBeNull();
    expect(win.close).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('one-time'); // the ticket stays in the tab
  });

  it('disables the button and says Opening while the request runs', async () => {
    const { OmniRouteLink } = await import('@/components/settings/omniroute-link');
    const url = 'https://omniroute.example/settings';
    const win = fakeWindow();
    mocks.open.mockReturnValue(win);
    let grant!: () => void;
    const waiting = new Promise<void>((resolve) => {
      grant = () => resolve();
    });
    mocks.fetch.mockImplementation(async (input: string) =>
      input === '/api/admin/omniroute/status'
        ? reply(200, { enabled: true })
        : waiting.then(() => reply(200, { url })),
    );
    await render(createElement(OmniRouteLink));
    const openOmniRoute = buttonIn(document.body, 'admin.providers.omniroute.open')!;

    await act(async () => {
      openOmniRoute.click();
    });
    expect(mocks.open).toHaveBeenCalledWith('', '_blank');
    expect(openOmniRoute.textContent).toContain('admin.providers.omniroute.opening');
    expect(openOmniRoute.disabled).toBe(true);
    expect(win.location.href).toBe(''); // not navigated yet
    openOmniRoute.click(); // a second click while it runs asks for nothing
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      grant();
    });
    await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(2); // still one request for the ticket
    expect(win.location.href).toBe(url);
    expect(win.opener).toBeNull();
    expect(openOmniRoute.disabled).toBe(false);
    expect(openOmniRoute.textContent).toContain('admin.providers.omniroute.open');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('closes the tab and shows an error when the ticket request fails, and when the tab was blocked', async () => {
    const { OmniRouteLink } = await import('@/components/settings/omniroute-link');
    const win = fakeWindow();
    mocks.open.mockReturnValue(win);
    mocks.fetch.mockImplementation(async (input: string) =>
      input === '/api/admin/omniroute/status'
        ? reply(200, { enabled: true })
        : reply(500, { error: 'boom' }),
    );
    await render(createElement(OmniRouteLink));
    await act(async () => {
      buttonIn(document.body, 'admin.providers.omniroute.open')!.click();
    });
    await flush();
    expect(win.close).toHaveBeenCalled();
    expect(win.location.href).toBe(''); // the failed tab never went anywhere
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith('admin.providers.omniroute.openFailed');

    // The browser blocked the tab: the request may even succeed, but there is nowhere to go.
    mocks.open.mockReturnValue(null);
    mocks.fetch.mockImplementation(async (input: string) =>
      input === '/api/admin/omniroute/status'
        ? reply(200, { enabled: true })
        : reply(200, { url: 'https://omniroute.example/settings' }),
    );
    await render(createElement(OmniRouteLink));
    await act(async () => {
      buttonIn(document.body, 'admin.providers.omniroute.open')!.click();
    });
    await flush();
    expect(mocks.error).toHaveBeenCalledTimes(2);
    expect(mocks.error).toHaveBeenLastCalledWith('admin.providers.omniroute.openFailed');
  });

  it('the shared credential card shows it only for the omniroute provider', async () => {
    const entry = (id: string, name: string) => ({
      id,
      name,
      requiresApiKey: true,
      keyless: false,
      baseUrlRequired: false,
      accessKeyPair: false,
      models: [{ id: `${id}-m1`, name: 'M1' }],
    });
    mocks.fetchSettings.mockResolvedValue({
      canManage: true,
      masterKey: 'ok',
      rows: [],
      routing: [],
      stages: [],
      catalog: { providers: [entry('openai', 'OpenAI'), entry('omniroute', 'OmniRoute')] },
    });
    const renderCard = async (providerId: string) => {
      vi.resetModules(); // the card keeps one shared read of the settings; each render starts fresh
      const { ServerCredentialCard } = await import('@/components/settings/server-credential-card');
      await render(
        createElement(ServerCredentialCard, {
          section: 'providers',
          providerIds: { providers: providerId },
        }),
      );
    };

    await renderCard('omniroute');
    expect(document.body.textContent).toContain('admin.providers.card.title');
    expect(document.body.textContent).toContain('admin.providers.omniroute.title');
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/status');

    mocks.fetch.mockClear();
    await renderCard('openai');
    expect(document.body.textContent).toContain('admin.providers.card.title');
    expect(document.body.textContent).not.toContain('admin.providers.omniroute.title');
    expect(mocks.fetch).not.toHaveBeenCalled(); // another provider asks for no OmniRoute status
  });
});
