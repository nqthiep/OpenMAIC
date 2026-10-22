// @vitest-environment jsdom

/**
 * The shared server credential card in the Settings popup: only an administrator sees it, only for
 * a provider the server knows, and a key goes to the server once, never back to the browser.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  saveRoute: vi.fn(),
  removeRoute: vi.fn(),
  verify: vi.fn(),
  refreshStore: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
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

// Radix's Switch measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const roots: Root[] = [];
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTIONS = ['providers', 'tts', 'asr', 'pdf', 'image', 'video', 'webSearch'];
const entry = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  requiresApiKey: true,
  keyless: false,
  baseUrlRequired: false,
  accessKeyPair: false,
  models: [{ id: `${id}-m1`, name: 'M1' }],
  ...extra,
});

function settings(overrides: Record<string, unknown> = {}) {
  return {
    canManage: true,
    masterKey: 'ok',
    rows: [
      {
        section: 'providers',
        providerId: 'deepseek',
        enabled: true,
        has: { apiKey: true, accessKeyId: false, accessKeySecret: false, proxy: false },
        keyHint: 'a1b2',
        readable: true,
        complete: true,
        version: 3,
        updatedBy: 'root',
        updatedAt: '2026-10-22T00:00:00Z',
      },
    ],
    routing: [],
    stages: ['scene-content'],
    catalog: Object.fromEntries(
      SECTIONS.map((section) => [
        section,
        section === 'providers'
          ? [entry('openai', 'OpenAI'), entry('deepseek', 'DeepSeek')]
          : [entry(`${section}-one`, `${section} one`)],
      ]),
    ),
    ...overrides,
  };
}

const IDS = {
  providers: 'deepseek',
  pdf: 'pdf-one',
  'web-search': 'webSearch-one',
  image: 'image-one',
  video: 'video-one',
  tts: 'tts-one',
  asr: 'asr-one',
};

async function render(section = 'providers', providerIds: Record<string, string> = IDS) {
  vi.resetModules(); // the card keeps one shared read of the settings; each test starts without it
  const { ServerCredentialCard } = await import('@/components/settings/server-credential-card');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(createElement(ServerCredentialCard, { section, providerIds }));
  });
  await act(async () => {});
}

const buttonIn = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

function typeInto(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  mocks.fetchSettings.mockResolvedValue(settings());
  mocks.save.mockResolvedValue({ row: {} });
  mocks.saveRoute.mockResolvedValue({ routing: [] });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('shared server credential card', () => {
  it('shows nothing to someone who cannot manage, for a custom provider, or in a section without providers', async () => {
    mocks.fetchSettings.mockResolvedValue(settings({ canManage: false }));
    await render();
    expect(document.body.textContent).toBe('');

    mocks.fetchSettings.mockResolvedValue(settings());
    await render('providers', { ...IDS, providers: 'my-custom-provider' });
    expect(document.body.textContent).toBe('');

    await render('general');
    expect(document.body.textContent).toBe('');

    mocks.fetchSettings.mockRejectedValue(new Error('404'));
    await render();
    expect(document.body.textContent).toBe('');
  });

  it('shows the status and key hint of the selected provider, never the key', async () => {
    await render();
    const text = document.body.textContent ?? '';
    expect(text).toContain('admin.providers.card.title');
    expect(text).toContain('admin.providers.status.active');
    expect(text).toContain('admin.providers.keyHint {"hint":"a1b2"}');
    const key = document.querySelector<HTMLInputElement>('#pv-key')!;
    expect(key.value).toBe('');
    expect(key.placeholder).toBe('admin.providers.form.apiKeyKeep');
  });

  it('saves a key once, sends only what changed, and refreshes the popup’s provider list', async () => {
    await render('providers', { ...IDS, providers: 'openai' });
    expect(document.body.textContent).toContain('admin.providers.status.unset');
    const save = buttonIn(document.body, 'admin.providers.actions.save')!;
    expect(save.disabled).toBe(true);

    typeInto(document.querySelector<HTMLInputElement>('#pv-key')!, '  sk-new-0123456789  ');
    await act(async () => save.click());

    expect(mocks.save).toHaveBeenCalledWith('providers', 'openai', {
      expectedVersion: 0,
      secret: { apiKey: 'sk-new-0123456789' },
    });
    expect(mocks.refreshStore).toHaveBeenCalled();
  });

  it('edits an existing provider without resending its key, and can remove the saved key', async () => {
    await render();
    typeInto(
      document.querySelector<HTMLInputElement>('#pv-models')!,
      'deepseek-flash, deepseek-pro',
    );
    await act(async () => buttonIn(document.body, 'admin.providers.actions.save')!.click());
    expect(mocks.save).toHaveBeenLastCalledWith('providers', 'deepseek', {
      expectedVersion: 3,
      models: ['deepseek-flash', 'deepseek-pro'],
    });

    // Saving makes the server bump the version, which remounts the form; here it is mounted afresh.
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    await render();
    const clear = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => clear.click());
    await act(async () => buttonIn(document.body, 'admin.providers.actions.save')!.click());
    expect(mocks.save).toHaveBeenLastCalledWith('providers', 'deepseek', {
      expectedVersion: 3,
      secret: { apiKey: null },
    });
  });

  it('shows the default model and stage routes only for language models, and saves provider:model', async () => {
    await render('tts', IDS);
    expect(document.querySelector('#dm-provider')).toBeNull();

    await render('providers', IDS);
    const provider = document.querySelector<HTMLSelectElement>('#dm-provider')!;
    expect([...provider.options].map((o) => o.textContent)).toEqual(['', 'DeepSeek']);
    await act(async () => {
      provider.value = 'deepseek';
      provider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    typeInto(document.querySelector<HTMLInputElement>('#dm-model')!, 'deepseek-flash');
    await act(async () => buttonIn(document.body, 'admin.providers.default.save')!.click());
    expect(mocks.saveRoute).toHaveBeenCalledWith('default', 'deepseek:deepseek-flash', 0);
  });

  it('warns when the server cannot store keys', async () => {
    mocks.fetchSettings.mockResolvedValue(settings({ masterKey: 'missing' }));
    await render();
    expect(document.body.textContent).toContain('admin.providers.masterKey.missing');
  });
});
