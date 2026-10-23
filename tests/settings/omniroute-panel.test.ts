// @vitest-environment jsdom

/**
 * The OmniRoute panel of the Settings popup: three admin steps over `/api/admin/omniroute/*`,
 * mocked by URL and method. The one-time ticket inside the open URL is never shown on the page,
 * and the page falls back to the generic provider form when the routes say "not this account".
 */
import { act, createElement, type ComponentType, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ModelsResponse,
  OmniRouteConnection,
  OmniRouteOverview,
  OmniRouteState,
} from '@/lib/server/omniroute/contract';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  open: vi.fn(),
  confirm: vi.fn(),
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

// Radix's Switch and the collapsible measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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
const ok = (body: unknown) => ({ status: 200, body });
const failed = (status: number, details?: string) => ({
  status,
  body: { success: false, errorCode: 'OMNIROUTE', error: 'no', ...(details ? { details } : {}) },
});

/** The tab `window.open` hands back: `location.href`, `opener` and `close` are watched. */
const fakeWindow = () => ({
  opener: {} as unknown,
  location: { href: '' },
  close: vi.fn(),
});

/** Lets every queued microtask and React commit run (several real timer ticks). */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  });

const DEEP_LINKS = {
  providers: '/dashboard/providers',
  combos: '/dashboard/combos',
  keys: '/dashboard/api-manager',
  health: '/dashboard/health',
};

const CONNECTIONS: OmniRouteConnection[] = [
  {
    id: 'conn-openai',
    name: 'OpenAI of the team',
    provider: 'openai',
    authType: 'apikey',
    active: true,
    subscription: false,
    allowed: false,
  },
  {
    id: 'conn-claude',
    name: 'Claude personal',
    provider: 'claude',
    authType: 'oauth',
    active: true,
    subscription: true,
    allowed: false,
  },
  {
    id: 'conn-glm',
    name: 'GLM spare',
    provider: 'glm',
    authType: 'apikey',
    active: false,
    subscription: false,
    allowed: false,
  },
];

function overview(
  state: OmniRouteState,
  extra: Partial<OmniRouteOverview> = {},
): OmniRouteOverview {
  return {
    state,
    missingEnv: [],
    connections: CONNECTIONS,
    key: null,
    roles: {},
    deepLinks: DEEP_LINKS,
    ...extra,
  };
}

const KEY = {
  hint: 'a1b2',
  createdAt: '2026-10-23T10:00:00Z',
  noLog: false,
  dailyLimitUsd: 5,
  connectionIds: ['conn-openai'],
};

const READY = overview('ready', {
  key: KEY,
  connections: CONNECTIONS.map((connection) => ({
    ...connection,
    allowed: connection.id === 'conn-openai',
  })),
});

function modelsAnswer(extra: Partial<ModelsResponse> = {}): ModelsResponse {
  return {
    success: true,
    items: [
      {
        id: 'auto/best-chat',
        name: 'Best chat',
        group: 'auto',
        owner: 'combo',
        vision: null,
        tools: null,
        contextWindow: null,
        outputWindow: null,
      },
      {
        id: 'auto/best-vision',
        name: 'Best vision',
        group: 'auto',
        owner: 'combo',
        vision: null,
        tools: null,
        contextWindow: null,
        outputWindow: null,
      },
      {
        id: 'combo/premium',
        name: 'Premium combo',
        group: 'combo',
        owner: 'combo',
        vision: null,
        tools: null,
        contextWindow: null,
        outputWindow: null,
      },
      {
        id: 'openai/gpt-5',
        name: 'GPT-5',
        group: 'model',
        owner: 'openai',
        vision: true,
        tools: true,
        contextWindow: 131072,
        outputWindow: 32768,
      },
      {
        id: 'glm/glm-5',
        name: 'GLM 5',
        group: 'model',
        owner: 'glm',
        vision: false,
        tools: true,
        contextWindow: 65536,
        outputWindow: 8192,
      },
    ],
    presets: {},
    ...extra,
  };
}

const BALANCED = {
  balanced: {
    generate: { model: 'auto/best-vision', vision: true, tools: false },
    chat: { model: 'auto/best-chat', vision: false, tools: true },
    grade: { model: 'combo/premium', vision: false, tools: false },
    utility: { model: 'glm/glm-5', vision: false, tools: false },
  },
};

/** Settings for the shared server credential card, with an `omniroute` catalog entry. */
function cardSettings() {
  const entry = (id: string, name: string) => ({
    id,
    name,
    requiresApiKey: true,
    keyless: false,
    baseUrlRequired: false,
    accessKeyPair: false,
    models: [{ id: `${id}-m1`, name: 'M1' }],
  });
  return {
    canManage: true,
    masterKey: 'ok',
    rows: [],
    routing: [],
    stages: ['scene-content'],
    catalog: { providers: [entry('omniroute', 'OmniRoute'), entry('openai', 'OpenAI')] },
  };
}

/** Answers every route from a table of zero-argument getters (so answers can change over time);
 * routes left out answer 404. */
function installRoutes(routes: {
  overview: () => { status: number; body: unknown };
  models?: () => { status: number; body: unknown };
  connect?: (init: { method?: string }) => { status: number; body: unknown };
  roles?: () => { status: number; body: unknown };
  test?: () => { status: number; body: unknown };
  open?: () => { status: number; body: unknown };
}) {
  mocks.fetch.mockImplementation(async (url: string, init: { method?: string }) => {
    const answer =
      url === '/api/admin/omniroute/overview'
        ? routes.overview()
        : url === '/api/admin/omniroute/models'
          ? (routes.models?.() ?? failed(404))
          : url === '/api/admin/omniroute/connect'
            ? (routes.connect?.(init) ?? failed(404))
            : url === '/api/admin/omniroute/roles'
              ? (routes.roles?.() ?? failed(404))
              : url === '/api/admin/omniroute/test'
                ? (routes.test?.() ?? failed(404))
                : url === '/api/admin/omniroute/open'
                  ? (routes.open?.() ?? failed(404))
                  : failed(404);
    return reply(answer.status, answer.body);
  });
}

/** How many times `fetch` was called with a given URL. */
const callsTo = (url: string) => mocks.fetch.mock.calls.filter(([called]) => called === url).length;

/** Fresh module registry (the mode store and the card's shared settings read are module state). */
async function fresh() {
  vi.resetModules();
  const [panelModule, cardModule, modeModule] = await Promise.all([
    import('@/components/settings/omniroute-panel'),
    import('@/components/settings/server-credential-card'),
    import('@/components/settings/omniroute-mode'),
  ]);
  return {
    OmniRoutePanel: panelModule.OmniRoutePanel,
    ServerCredentialCard: cardModule.ServerCredentialCard,
    setOmniRouteMode: modeModule.setOmniRouteMode,
  };
}

/** Mounts one element on a clean page and lets its effects settle. */
async function mount(node: ReactElement) {
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

const mountPanel = async (Panel: ComponentType) => mount(createElement(Panel));

const buttonIn = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

const checkboxOfRow = (name: string) => {
  const row = [...document.querySelectorAll('li')].find((li) => li.textContent?.includes(name))!;
  return row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
};

/** The vision or tools tick box of a role row (shown when OmniRoute says nothing about it). */
const toggleOfRow = (role: string, key: string) => {
  const select = document.querySelector<HTMLSelectElement>(`#omni-role-${role}`)!;
  const label = [...select.parentElement!.querySelectorAll('label')].find((el) =>
    el.textContent?.includes(key),
  )!;
  return label.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
};

function typeInto(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function choose(select: HTMLSelectElement, value: string): void {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('open', mocks.open);
  vi.stubGlobal('confirm', mocks.confirm);
  mocks.fetchSettings.mockResolvedValue(cardSettings());
  mocks.open.mockReturnValue(fakeWindow());
  mocks.confirm.mockReturnValue(true);
  mocks.fetch.mockImplementation(async () => reply(404, { success: false }));
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('the OmniRoute panel', () => {
  it('shows the loading line until the overview answers', async () => {
    const { OmniRoutePanel } = await fresh();
    mocks.fetch.mockImplementation(() => new Promise<Response>(() => {}));
    await mountPanel(OmniRoutePanel);
    expect(document.body.textContent).toBe('admin.omniroute.loading');
    expect(callsTo('/api/admin/omniroute/overview')).toBe(1);
  });

  it('lists the missing environment names when OmniRoute is not set up, and no steps', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () =>
        ok({
          overview: overview('unconfigured', {
            missingEnv: ['OMNIROUTE_ADMIN_PASSWORD', 'OMNIROUTE_PUBLIC_URL'],
          }),
        }),
    });
    await mountPanel(OmniRoutePanel);
    expect(document.body.textContent).toContain('admin.omniroute.title');
    expect(document.body.textContent).toContain('admin.omniroute.state.unconfigured');
    expect(document.body.textContent).toContain('admin.omniroute.unconfigured.title');
    expect([...document.querySelectorAll('code')].map((code) => code.textContent)).toEqual([
      'OMNIROUTE_ADMIN_PASSWORD',
      'OMNIROUTE_PUBLIC_URL',
    ]);
    expect(document.body.textContent).not.toContain('admin.omniroute.step1.title');
  });

  it('shows the unreachable card and asks the overview again on retry', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({ overview: () => ok({ overview: overview('unreachable') }) });
    await mountPanel(OmniRoutePanel);
    expect(document.body.textContent).toContain('admin.omniroute.unreachable.title');
    expect(document.body.textContent).toContain('admin.omniroute.unreachable.body');
    expect(document.body.textContent).not.toContain('admin.omniroute.step1.title');

    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.retry')!.click();
    });
    await flush();
    expect(callsTo('/api/admin/omniroute/overview')).toBe(2);
  });

  it('shows a failure card with a retry when the overview errors, without a toast', async () => {
    const { OmniRoutePanel } = await fresh();
    let broken = true;
    installRoutes({
      overview: () =>
        broken ? failed(500) : ok({ overview: overview('no-providers', { connections: [] }) }),
    });
    await mountPanel(OmniRoutePanel);
    expect(document.body.textContent).toContain('admin.omniroute.loadFailed');
    expect(mocks.error).not.toHaveBeenCalled();

    broken = false;
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.retry')!.click();
    });
    await flush();
    expect(document.body.textContent).not.toContain('admin.omniroute.loadFailed');
    expect(document.body.textContent).toContain('admin.omniroute.step1.empty');
  });

  it('step 1 only, with the empty note and no Connect button, before any provider', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () => ok({ overview: overview('no-providers', { connections: [] }) }),
    });
    await mountPanel(OmniRoutePanel);
    expect(document.body.textContent).toContain('admin.omniroute.state.noProviders');
    expect(document.body.textContent).toContain('admin.omniroute.step1.title');
    expect(document.body.textContent).toContain('admin.omniroute.step1.empty');
    expect(buttonIn(document.body, 'admin.omniroute.step1.open')).toBeTruthy();
    expect(buttonIn(document.body, 'admin.omniroute.step1.refresh')).toBeTruthy();
    expect(buttonIn(document.body, 'admin.omniroute.step2.connect')).toBeUndefined();
    expect(document.body.textContent).not.toContain('admin.omniroute.step3.locked');
  });

  it('pre-ticks the safe connections, sends nothing without a tick, and posts the chosen ones', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () => ok({ overview: overview('no-key') }),
      connect: () => ok({ key: KEY }),
    });
    await mountPanel(OmniRoutePanel);

    // Ticks follow the safe default: active without a subscription, never an inactive one.
    expect(checkboxOfRow('OpenAI of the team').checked).toBe(true);
    expect(checkboxOfRow('Claude personal').checked).toBe(false); // a subscription plan
    expect(checkboxOfRow('GLM spare').checked).toBe(false);
    expect(checkboxOfRow('GLM spare').disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#omni-nolog')!.checked).toBe(true);

    // Nothing ticked: nothing is sent, the inline error says so.
    await act(async () => {
      checkboxOfRow('OpenAI of the team').click();
    });
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.connect')!.click();
    });
    await flush();
    expect(callsTo('/api/admin/omniroute/connect')).toBe(0);
    expect(document.querySelector('p[role="alert"]')!.textContent).toBe(
      'admin.omniroute.step2.needConnection',
    );

    // One tick again: the POST carries the ids, noLog and the limit (an invalid limit reads as none).
    await act(async () => {
      checkboxOfRow('OpenAI of the team').click();
    });
    typeInto(document.querySelector<HTMLInputElement>('#omni-limit')!, '-5');
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.connect')!.click();
    });
    await flush();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/connect', {
      method: 'POST',
      body: JSON.stringify({ connectionIds: ['conn-openai'], noLog: true, dailyLimitUsd: null }),
      headers: { 'content-type': 'application/json' },
    });
    expect(mocks.success).toHaveBeenCalledWith('admin.omniroute.step2.connected');

    // A valid limit is sent as a number.
    typeInto(document.querySelector<HTMLInputElement>('#omni-limit')!, '5');
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.connect')!.click();
    });
    await flush();
    const last = mocks.fetch.mock.calls
      .filter(([url]) => url === '/api/admin/omniroute/connect')
      .at(-1)!;
    expect(JSON.parse(last[1].body as string).dailyLimitUsd).toBe(5);
  });

  it('a 400 or a no-connections answer is the "tick a connection" toast', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () => ok({ overview: overview('no-key') }),
      connect: () => failed(400),
    });
    await mountPanel(OmniRoutePanel);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.connect')!.click();
    });
    await flush();
    expect(mocks.error).toHaveBeenCalledWith('admin.omniroute.error.noConnections');

    mocks.fetch.mockClear();
    installRoutes({
      overview: () => ok({ overview: overview('no-key') }),
      connect: () => failed(502, 'no-connections'),
    });
    await mountPanel(OmniRoutePanel);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.connect')!.click();
    });
    await flush();
    expect(mocks.error).toHaveBeenLastCalledWith('admin.omniroute.error.noConnections');
  });

  it('ready: shows the key hint, updates with the chosen values, rotates and disconnects on confirm', async () => {
    const { OmniRoutePanel } = await fresh();
    let current = READY;
    installRoutes({
      overview: () => ok({ overview: current }),
      models: () => ok(modelsAnswer()),
      connect: (init) => {
        if (init.method === 'DELETE') {
          current = overview('no-key');
          return ok({ clearedStages: ['scene-content'] });
        }
        return ok({ key: KEY });
      },
    });
    await mountPanel(OmniRoutePanel);

    // The stored key fills the form: its hint and date, its own noLog and limit.
    expect(document.body.textContent).toContain(
      'admin.omniroute.step2.keyInfo {"hint":"a1b2","date":"10/23/2026"}',
    );
    expect(document.querySelector<HTMLInputElement>('#omni-nolog')!.checked).toBe(false);
    expect(document.querySelector<HTMLInputElement>('#omni-limit')!.value).toBe('5');
    expect(buttonIn(document.body, 'admin.omniroute.step2.connect')).toBeUndefined();
    expect(checkboxOfRow('OpenAI of the team').checked).toBe(true); // follows `allowed`

    // Update sends what is on screen now.
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.update')!.click();
    });
    await flush();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/connect', {
      method: 'POST',
      body: JSON.stringify({ connectionIds: ['conn-openai'], noLog: false, dailyLimitUsd: 5 }),
      headers: { 'content-type': 'application/json' },
    });

    // Rotate asks first: no answer, no request; then the rotate body is exactly { rotate: true }.
    mocks.confirm.mockReturnValue(false);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.rotate')!.click();
    });
    await flush();
    expect(mocks.confirm).toHaveBeenCalledWith('admin.omniroute.step2.confirmRotate');
    expect(
      mocks.fetch.mock.calls.filter(([url]) => url === '/api/admin/omniroute/connect'),
    ).toHaveLength(1);
    mocks.confirm.mockReturnValue(true);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.rotate')!.click();
    });
    await flush();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/connect', {
      method: 'POST',
      body: JSON.stringify({ rotate: true }),
      headers: { 'content-type': 'application/json' },
    });

    // Disconnect asks, deletes, toasts, and the reloaded overview is back to step 2.
    mocks.confirm.mockReturnValue(false);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.disconnect')!.click();
    });
    await flush();
    expect(mocks.confirm).toHaveBeenCalledWith('admin.omniroute.step2.confirmDisconnect');
    mocks.confirm.mockReturnValue(true);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step2.disconnect')!.click();
    });
    await flush();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/connect', {
      method: 'DELETE',
    });
    expect(mocks.success).toHaveBeenCalledWith('admin.omniroute.step2.disconnected');
    expect(document.body.textContent).toContain('admin.omniroute.step2.connect');
    expect(document.body.textContent).not.toContain('admin.omniroute.step2.keyInfo');
  });

  it('step 3: three grouped selects, a kept model, and the preset fills all four rows', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () =>
        ok({
          overview: overview('ready', {
            key: KEY,
            roles: {
              chat: { model: 'openai/gpt-5', vision: true, tools: true },
              generate: { model: 'retired/model-x', vision: false, tools: false },
            },
          }),
        }),
      models: () => ok(modelsAnswer({ presets: BALANCED })),
    });
    await mountPanel(OmniRoutePanel);
    expect(callsTo('/api/admin/omniroute/models')).toBe(1);

    const chat = document.querySelector<HTMLSelectElement>('#omni-role-chat')!;
    expect(chat.value).toBe('openai/gpt-5');
    const groups = [...chat.querySelectorAll('optgroup')];
    expect(groups.map((group) => group.getAttribute('label'))).toEqual([
      'admin.omniroute.group.auto',
      'admin.omniroute.group.combo',
      'admin.omniroute.group.model',
    ]);
    expect(groups[0].querySelectorAll('option').length).toBe(2);
    expect(groups[2].querySelectorAll('option').length).toBe(2);
    const first = chat.querySelector('option')!;
    expect(first.value).toBe('');
    expect(first.textContent).toBe('admin.omniroute.step3.none');

    // A stored model the list no longer knows stays as an option of its own.
    const generate = document.querySelector<HTMLSelectElement>('#omni-role-generate')!;
    expect(generate.value).toBe('retired/model-x');
    expect([...generate.querySelectorAll('option')].map((option) => option.value)).toContain(
      'retired/model-x',
    );

    // Chips for what OmniRoute knows, a tick box where it does not.
    expect(chat.parentElement!.textContent).toContain('admin.omniroute.chip.vision');
    expect(chat.parentElement!.textContent).toContain('admin.omniroute.chip.tools');
    expect(generate.parentElement!.textContent).toContain('admin.omniroute.chip.visionToggle');
    expect(toggleOfRow('generate', 'admin.omniroute.chip.visionToggle').checked).toBe(false);

    // The preset fills all four rows, without saving anything yet.
    choose(document.querySelector<HTMLSelectElement>('#omni-preset')!, 'balanced');
    for (const role of ['generate', 'chat', 'grade', 'utility']) {
      expect(document.querySelector<HTMLSelectElement>(`#omni-role-${role}`)!.value).toBe(
        BALANCED.balanced[role as 'chat'].model,
      );
    }
    expect(toggleOfRow('generate', 'admin.omniroute.chip.visionToggle').checked).toBe(true);
    expect(callsTo('/api/admin/omniroute/roles')).toBe(0);
  });

  it('step 3: saves all four roles with the flags and context window, or blocks an empty row', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () => ok({ overview: overview('ready', { key: KEY }) }),
      models: () => ok(modelsAnswer({ presets: BALANCED })),
      roles: () => ok({ roles: BALANCED.balanced }),
    });
    await mountPanel(OmniRoutePanel);

    // Nothing chosen: the button sends nothing and every row says so.
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step3.save')!.click();
    });
    await flush();
    expect(callsTo('/api/admin/omniroute/roles')).toBe(0);
    expect(document.querySelectorAll('p[role="alert"]').length).toBe(4);

    // The preset fills the rows; one row is emptied again to block the request.
    choose(document.querySelector<HTMLSelectElement>('#omni-preset')!, 'balanced');
    choose(document.querySelector<HTMLSelectElement>('#omni-role-utility')!, '');
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step3.save')!.click();
    });
    await flush();
    expect(callsTo('/api/admin/omniroute/roles')).toBe(0);
    expect(document.querySelectorAll('p[role="alert"]').length).toBe(1);

    // The full save: preset flags, a manual change to a known model, an unticked vision box.
    choose(document.querySelector<HTMLSelectElement>('#omni-role-utility')!, 'glm/glm-5');
    choose(document.querySelector<HTMLSelectElement>('#omni-role-chat')!, 'openai/gpt-5');
    await act(async () => {
      toggleOfRow('generate', 'admin.omniroute.chip.visionToggle').click();
    });
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step3.save')!.click();
    });
    await flush();
    const call = mocks.fetch.mock.calls.find(([url]) => url === '/api/admin/omniroute/roles')!;
    expect(call[1].method).toBe('PUT');
    expect(JSON.parse(call[1].body as string)).toEqual({
      roles: {
        generate: { model: 'auto/best-vision', vision: false, tools: false },
        chat: { model: 'openai/gpt-5', vision: true, tools: true, contextWindow: 131072 },
        grade: { model: 'combo/premium', vision: false, tools: false },
        utility: { model: 'glm/glm-5', vision: false, tools: true, contextWindow: 65536 },
      },
    });
    expect(mocks.success).toHaveBeenCalledWith('admin.omniroute.step3.saved');
  });

  it('step 3: a saved row can be tested, showing the latency or the failure', async () => {
    const { OmniRoutePanel } = await fresh();
    let healthy = true;
    installRoutes({
      overview: () =>
        ok({
          overview: overview('ready', {
            key: KEY,
            roles: { chat: { model: 'openai/gpt-5', vision: true, tools: true } },
          }),
        }),
      models: () => ok(modelsAnswer()),
      test: () => (healthy ? ok({ model: 'openai/gpt-5', latencyMs: 123 }) : failed(502)),
    });
    await mountPanel(OmniRoutePanel);

    // Only the saved row has a Test button.
    const testButtons = [...document.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'admin.omniroute.test.run',
    );
    expect(testButtons).toHaveLength(1);
    expect(testButtons[0].closest('div')!.textContent).toContain('admin.omniroute.role.chat');

    await act(async () => {
      testButtons[0].click();
    });
    await flush();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/test', {
      method: 'POST',
      body: JSON.stringify({ role: 'chat' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(document.body.textContent).toContain('admin.omniroute.test.ok {"ms":123}');

    healthy = false;
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.test.run')!.click();
    });
    await flush();
    expect(document.body.textContent).toContain('admin.omniroute.test.failed');
    expect(mocks.error).not.toHaveBeenCalled(); // the row itself says it
  });

  it('opens OmniRoute in a tab asked for before the request, and never shows the ticket here', async () => {
    const { OmniRoutePanel } = await fresh();
    const ticket = 'https://omniroute.example/dashboard/providers#ticket=one-time';
    let openedBeforeTheRequest = false;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === '/api/admin/omniroute/overview')
        return reply(200, { success: true, overview: overview('no-key') });
      if (url === '/api/admin/omniroute/open') {
        openedBeforeTheRequest = mocks.open.mock.calls.length === 1;
        return reply(200, { success: true, url: ticket });
      }
      return reply(404, { success: false });
    });
    const win = fakeWindow();
    mocks.open.mockReturnValue(win);
    await mountPanel(OmniRoutePanel);

    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step1.open')!.click();
    });
    await flush();
    expect(mocks.open).toHaveBeenCalledWith('', '_blank');
    expect(openedBeforeTheRequest).toBe(true);
    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/omniroute/open', {
      method: 'POST',
      body: JSON.stringify({ path: '/dashboard/providers' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(win.location.href).toBe(ticket);
    expect(win.opener).toBeNull();
    expect(win.close).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('one-time'); // the ticket stays in the tab

    // The browser blocked the tab: nothing is asked of the server.
    mocks.open.mockReturnValue(null);
    await act(async () => {
      buttonIn(document.body, 'admin.omniroute.step1.open')!.click();
    });
    await flush();
    expect(mocks.error).toHaveBeenCalledWith('admin.omniroute.open.failed');
    expect(callsTo('/api/admin/omniroute/open')).toBe(1);
  });

  it('403 (or 404): the panel renders nothing and the generic card takes the page', async () => {
    for (const status of [403, 404]) {
      const { OmniRoutePanel, ServerCredentialCard } = await fresh();
      installRoutes({ overview: () => failed(status) });
      await mountPanel(OmniRoutePanel);
      expect(document.body.textContent).toBe('');

      // Mode "generic": the shared credential card is back for this provider.
      await mount(
        createElement(ServerCredentialCard, {
          section: 'providers',
          providerIds: { providers: 'omniroute' },
        }),
      );
      expect(document.body.textContent).toContain('admin.providers.card.title');

      for (const root of roots.splice(0)) act(() => root.unmount());
      document.body.innerHTML = '';
    }
  });

  it('the shared credential card stays out of the way until the mode is generic', async () => {
    const { ServerCredentialCard, setOmniRouteMode } = await fresh();
    const renderCard = async () => {
      await mount(
        createElement(ServerCredentialCard, {
          section: 'providers',
          providerIds: { providers: 'omniroute' },
        }),
      );
    };

    await renderCard(); // still loading
    expect(document.body.textContent).toBe('');

    setOmniRouteMode('panel');
    await renderCard();
    expect(document.body.textContent).toBe('');

    setOmniRouteMode('generic');
    await renderCard();
    expect(document.body.textContent).toContain('admin.providers.card.title');
  });

  it('the advanced area loads the stage route cards on open and reloads the overview on close', async () => {
    const { OmniRoutePanel } = await fresh();
    installRoutes({
      overview: () => ok({ overview: overview('ready', { key: KEY }) }),
      models: () => ok(modelsAnswer()),
    });
    await mountPanel(OmniRoutePanel);
    expect(mocks.fetchSettings).not.toHaveBeenCalled(); // closed by default: nothing is loaded

    const advanced = buttonIn(document.body, 'admin.omniroute.step3.advanced')!;
    await act(async () => {
      advanced.click();
    });
    await flush();
    expect(mocks.fetchSettings).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('admin.providers.default.title');
    expect(document.body.textContent).toContain('admin.providers.routes.title');
    expect(callsTo('/api/admin/omniroute/overview')).toBe(1);

    await act(async () => {
      advanced.click(); // close
    });
    await flush();
    expect(callsTo('/api/admin/omniroute/overview')).toBe(2);
    expect(mocks.fetchSettings).toHaveBeenCalledTimes(1);
  });
});
