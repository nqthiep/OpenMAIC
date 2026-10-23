'use client';

import { useCallback, useEffect, useState } from 'react';
import { Network } from 'lucide-react';
import { toast } from 'sonner';

import { setOmniRouteMode, useOmniRouteMode } from '@/components/settings/omniroute-mode';
import { StageRoutingCards } from '@/components/settings/server-credential-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/hooks/use-i18n';
import type {
  ConnectRequest,
  ConnectResponse,
  DisconnectResponse,
  ModelGroup,
  ModelsResponse,
  OmniRouteOverview,
  OmniRouteState,
  OpenRequest,
  OpenResponse,
  OverviewResponse,
  PresetId,
  RoleChoice,
  RoleId,
  Roles,
  RolesRequest,
  RolesResponse,
  RotateRequest,
  TestRequest,
  TestResponse,
} from '@/lib/server/omniroute/contract';
import { cn } from '@/lib/utils';

/** Base of every route this panel talks to; same origin, so the session cookie rides along. */
const API = '/api/admin/omniroute';

/** The four roles in display order; `ROLE_IDS` in the contract is a value, and only types may be imported. */
const ROLE_ORDER: readonly RoleId[] = ['generate', 'chat', 'grade', 'utility'];
const PRESET_ORDER: readonly PresetId[] = ['balanced', 'economy', 'quality'];
const GROUP_ORDER: readonly ModelGroup[] = ['auto', 'combo', 'model'];

/** States in the order the steps need them: `reached('no-key')` is true from `no-key` on. */
const STATE_ORDER: readonly OmniRouteState[] = [
  'unconfigured',
  'unreachable',
  'no-providers',
  'no-key',
  'ready',
];
const STATE_LABEL: Record<OmniRouteState, string> = {
  unconfigured: 'unconfigured',
  unreachable: 'unreachable',
  'no-providers': 'noProviders',
  'no-key': 'noKey',
  ready: 'ready',
};
const STATE_STYLE: Record<OmniRouteState, string> = {
  ready: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  unconfigured: 'border-red-500/50 text-red-700 dark:text-red-300',
  unreachable: 'border-red-500/50 text-red-700 dark:text-red-300',
  'no-providers': 'border-amber-500/50 text-amber-700 dark:text-amber-300',
  'no-key': 'border-amber-500/50 text-amber-700 dark:text-amber-300',
};
const PRESET_LABEL: Record<PresetId, string> = {
  balanced: 'presetBalanced',
  economy: 'presetEconomy',
  quality: 'presetQuality',
};

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

/** A failure body: `{ success: false, errorCode, error, details? }`. */
type FailureBody = { errorCode?: string; error?: string; details?: string };

/** Everything the panel needs to know about a failed call: the HTTP status and the body, if any. */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: FailureBody | null,
  ) {
    super(`omniroute api: HTTP ${status}`);
  }
}

/**
 * One call to `/api/admin/omniroute/*`. Throws `ApiError` for every failure — a refused network
 * included — so callers never branch on the transport. Success bodies are `{ success: true, ... }`.
 */
async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const options: RequestInit = {};
  if (init?.method) options.method = init.method;
  if (init?.body !== undefined) {
    options.body = JSON.stringify(init.body);
    options.headers = { 'content-type': 'application/json' };
  }
  let response: Response;
  try {
    response = await fetch(`${API}/${path}`, options);
  } catch {
    throw new ApiError(0, null);
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // No body to read; the status alone decides below.
  }
  if (!response.ok || (body as { success?: boolean } | null)?.success === false)
    throw new ApiError(response.status, body as FailureBody | null);
  return body as T;
}

/** The toast key of a failed call: the `no-connections` detail, and 400 on `connect`, name the
 * unticked-connections case; everything else is the generic retry message. */
function errorKey(error: unknown, isConnect = false): string {
  if (error instanceof ApiError) {
    if (error.body?.details === 'no-connections') return 'admin.omniroute.error.noConnections';
    if (isConnect && error.status === 400) return 'admin.omniroute.error.noConnections';
  }
  return 'admin.omniroute.error.generic';
}

/** The daily-limit box as the contract wants it: a non-negative number, null for "no limit".
 * Anything the server would not accept reads as empty. */
function parseDailyLimit(text: string): number | null {
  const value = text.trim();
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : null;
}

/** One role's editable choice: the model id plus the two flags the app should assume. */
type Draft = { model: string; vision: boolean; tools: boolean };

/** A draft from a stored choice; a role never chosen starts empty: no images, tools assumed. */
function draftOf(choice: RoleChoice | undefined): Draft {
  return {
    model: choice?.model ?? '',
    vision: choice?.vision ?? false,
    tools: choice?.tools ?? true,
  };
}

/** `apikey` and `oauth` have their own labels; any other kind OmniRoute reports is shown as-is. */
function authTypeLabel(authType: string, t: (key: string) => string): string {
  if (authType === 'apikey') return t('admin.omniroute.connection.apikey');
  if (authType === 'oauth') return t('admin.omniroute.connection.oauth');
  return authType;
}

/** The select's groups (empty ones dropped) plus the role's current model kept as an extra option
 * at the end when the list no longer knows it, so a saved choice is never silently lost. */
function selectOptions(models: ModelsResponse | null, current: string) {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: (models?.items ?? []).filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
  const known = grouped.some((entry) => entry.items.some((item) => item.id === current));
  const kept = current && !known ? [{ id: current, name: current }] : [];
  return { grouped, kept };
}

/**
 * The provider page of OmniRoute in the Settings popup, for an administrator: three steps that
 * follow how OmniRoute is meant to be used — tick the provider connections the app's key may use,
 * let the app mint that key itself, then pick a model per role. Non-administrators (401/403/404 on
 * the overview) render nothing and hand the page back through `useOmniRouteMode`. Keys, ticketed
 * URLs and passwords never appear here: the server answers with a key hint and one-time URLs only.
 */
export function OmniRoutePanel() {
  const { t, locale } = useI18n();
  const mode = useOmniRouteMode();
  const [overview, setOverview] = useState<OmniRouteOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [version, setVersion] = useState(0);
  // Step 1 and 2 inputs, re-seeded whenever a fresh overview lands.
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [noLog, setNoLog] = useState(true);
  const [dailyLimit, setDailyLimit] = useState('');
  const [needConnection, setNeedConnection] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => {
    let active = true;
    request<OverviewResponse>('overview')
      .then((answer) => {
        if (!active) return;
        const next = answer.overview;
        setOverview(next);
        setLoadFailed(false);
        setNeedConnection(false);
        setOmniRouteMode('panel');
        // With a key the ticks follow what the key may use; without one the safe default: every
        // active, non-subscription connection pre-ticked.
        setSelection(
          Object.fromEntries(
            next.connections.map((connection) => [
              connection.id,
              next.key ? connection.allowed : connection.active && !connection.subscription,
            ]),
          ),
        );
        setNoLog(next.key?.noLog ?? true);
        setDailyLimit(next.key?.dailyLimitUsd != null ? String(next.key.dailyLimitUsd) : '');
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403 || error.status === 404)
        ) {
          // Not this panel's reader: the generic provider page takes over.
          setOmniRouteMode('generic');
          return;
        }
        setLoadFailed(true);
        setOmniRouteMode('panel');
      });
    return () => {
      active = false;
    };
  }, [version]);

  const reload = useCallback(() => {
    setLoadFailed(false);
    setVersion((n) => n + 1);
  }, []);

  /**
   * Opens one of OmniRoute's own pages. The tab is asked for inside the click, before the request,
   * so a popup blocker lets it through; the one-time URL never appears on this page, and a failed
   * request closes the tab it opened.
   */
  const openDeepLink = useCallback(
    async (path: string) => {
      const win = window.open('', '_blank');
      if (!win) {
        toast.error(t('admin.omniroute.open.failed'));
        return;
      }
      try {
        const answer = await request<OpenResponse>('open', {
          method: 'POST',
          body: { path } satisfies OpenRequest,
        });
        win.opener = null;
        win.location.href = answer.url;
      } catch {
        win.close();
        toast.error(t('admin.omniroute.open.failed'));
      }
    },
    [t],
  );

  const connect = useCallback(async () => {
    if (!overview) return;
    const connectionIds = overview.connections
      .filter((connection) => selection[connection.id])
      .map((connection) => connection.id);
    if (connectionIds.length === 0) {
      // Nothing to send: the key would allow every connection in OmniRoute.
      setNeedConnection(true);
      return;
    }
    const body: ConnectRequest = {
      connectionIds,
      noLog,
      dailyLimitUsd: parseDailyLimit(dailyLimit),
    };
    setKeyBusy(true);
    try {
      await request<ConnectResponse>('connect', { method: 'POST', body });
      toast.success(t('admin.omniroute.step2.connected'));
      reload();
    } catch (error) {
      toast.error(t(errorKey(error, true)));
    } finally {
      setKeyBusy(false);
    }
  }, [overview, selection, noLog, dailyLimit, t, reload]);

  const rotate = useCallback(async () => {
    if (!window.confirm(t('admin.omniroute.step2.confirmRotate'))) return;
    setKeyBusy(true);
    try {
      await request<ConnectResponse>('connect', {
        method: 'POST',
        body: { rotate: true } satisfies RotateRequest,
      });
      reload();
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setKeyBusy(false);
    }
  }, [t, reload]);

  const disconnect = useCallback(async () => {
    if (!window.confirm(t('admin.omniroute.step2.confirmDisconnect'))) return;
    setKeyBusy(true);
    try {
      await request<DisconnectResponse>('connect', { method: 'DELETE' });
      toast.success(t('admin.omniroute.step2.disconnected'));
      reload();
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setKeyBusy(false);
    }
  }, [t, reload]);

  if (mode === 'generic') return null;

  if (!overview) {
    // First answer still on its way.
    if (!loadFailed)
      return (
        <div className="mb-6 max-w-3xl">
          <p className="text-sm text-muted-foreground">{t('admin.omniroute.loading')}</p>
        </div>
      );
    return (
      <div className="mb-6 flex max-w-3xl flex-col gap-4">
        <div className="flex flex-col items-start gap-3 rounded-xl border p-4">
          <p className="text-sm">{t('admin.omniroute.loadFailed')}</p>
          <Button variant="outline" onClick={reload}>
            {t('admin.omniroute.retry')}
          </Button>
        </div>
      </div>
    );
  }

  const data = overview;
  const reached = (state: OmniRouteState) =>
    STATE_ORDER.indexOf(data.state) >= STATE_ORDER.indexOf(state);
  const hasActiveConnection = data.connections.some((connection) => connection.active);

  return (
    <div className="mb-6 flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Network className="h-8 w-8 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">{t('admin.omniroute.title')}</h3>
            <p className="text-xs text-muted-foreground">{t('admin.omniroute.subtitle')}</p>
          </div>
        </div>
        <Badge variant="outline" className={STATE_STYLE[data.state]}>
          {t(`admin.omniroute.state.${STATE_LABEL[data.state]}`)}
        </Badge>
      </div>

      {loadFailed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-sm">{t('admin.omniroute.loadFailed')}</p>
          <Button variant="outline" onClick={reload}>
            {t('admin.omniroute.retry')}
          </Button>
        </div>
      ) : null}

      {data.state === 'unconfigured' ? (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <h4 className="text-sm font-semibold">{t('admin.omniroute.unconfigured.title')}</h4>
          <p className="text-sm text-muted-foreground">{t('admin.omniroute.unconfigured.body')}</p>
          {data.missingEnv.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t('admin.omniroute.unconfigured.invalid')}
              </p>
              <ul className="flex flex-col gap-1">
                {data.missingEnv.map((name) => (
                  <li key={name}>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{name}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {data.state === 'unreachable' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <h4 className="text-sm font-semibold">{t('admin.omniroute.unreachable.title')}</h4>
            <p className="text-xs text-muted-foreground">{t('admin.omniroute.unreachable.body')}</p>
          </div>
          <Button variant="outline" onClick={reload}>
            {t('admin.omniroute.retry')}
          </Button>
        </div>
      ) : null}

      {reached('no-providers') ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t('admin.omniroute.step1.title')}</h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void openDeepLink(data.deepLinks.providers)}
              >
                {t('admin.omniroute.step1.open')}
              </Button>
              <Button variant="outline" size="sm" onClick={reload}>
                {t('admin.omniroute.step1.refresh')}
              </Button>
            </div>
          </div>
          {hasActiveConnection ? (
            <ul className="flex flex-col gap-2">
              {data.connections.map((connection) => (
                <li
                  key={connection.id}
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-lg border p-3',
                    !connection.active && 'opacity-60',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!!selection[connection.id]}
                    disabled={!connection.active}
                    aria-label={connection.name}
                    onChange={() => {
                      setNeedConnection(false);
                      setSelection((previous) => ({
                        ...previous,
                        [connection.id]: !previous[connection.id],
                      }));
                    }}
                  />
                  <span className="text-sm font-medium">{connection.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {connection.provider} · {authTypeLabel(connection.authType, t)}
                  </span>
                  <Badge variant="outline">
                    {t(
                      connection.active
                        ? 'admin.omniroute.connection.active'
                        : 'admin.omniroute.connection.inactive',
                    )}
                  </Badge>
                  {connection.subscription ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/50 text-amber-700 dark:text-amber-300"
                    >
                      {t('admin.omniroute.connection.subscription')}
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('admin.omniroute.step1.empty')}</p>
          )}
          <p className="text-xs text-muted-foreground">{t('admin.omniroute.step1.hint')}</p>
        </div>
      ) : null}

      {reached('no-key') ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <h4 className="text-sm font-semibold">{t('admin.omniroute.step2.title')}</h4>
          <label htmlFor="omni-nolog" className="flex items-center gap-2 text-sm">
            <input
              id="omni-nolog"
              type="checkbox"
              checked={noLog}
              onChange={(event) => setNoLog(event.target.checked)}
            />
            {t('admin.omniroute.step2.noLog')}
          </label>
          <div className="flex max-w-xs flex-col gap-1.5">
            <Label htmlFor="omni-limit">{t('admin.omniroute.step2.dailyLimit')}</Label>
            <Input
              id="omni-limit"
              type="number"
              min="0"
              step="any"
              value={dailyLimit}
              onChange={(event) => setDailyLimit(event.target.value)}
            />
          </div>
          {data.key ? (
            <p className="text-xs text-muted-foreground">
              {t('admin.omniroute.step2.keyInfo', {
                hint: data.key.hint,
                date: new Date(data.key.createdAt).toLocaleDateString(locale),
              })}
            </p>
          ) : null}
          {needConnection ? (
            <p role="alert" className="text-sm text-red-600">
              {t('admin.omniroute.step2.needConnection')}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {data.key ? (
              <>
                <Button disabled={keyBusy} onClick={() => void connect()}>
                  {t('admin.omniroute.step2.update')}
                </Button>
                <Button variant="outline" disabled={keyBusy} onClick={() => void rotate()}>
                  {t('admin.omniroute.step2.rotate')}
                </Button>
                <Button variant="outline" disabled={keyBusy} onClick={() => void disconnect()}>
                  {t('admin.omniroute.step2.disconnect')}
                </Button>
              </>
            ) : (
              <Button disabled={keyBusy} onClick={() => void connect()}>
                {t('admin.omniroute.step2.connect')}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {reached('no-key') ? (
        data.state === 'ready' ? (
          <Step3Roles key={version} overview={data} onReload={reload} />
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <h4 className="text-sm font-semibold">{t('admin.omniroute.step3.title')}</h4>
            <p className="text-xs text-muted-foreground">{t('admin.omniroute.step3.locked')}</p>
          </div>
        )
      ) : null}
    </div>
  );
}

/**
 * Step 3, mounted only while the overview is `ready`: the models OmniRoute offers this app's key,
 * one row per role. The model list is read once per mount (the panel remounts this step after
 * every overview reload); saving writes all four roles in one request, and a saved row can be
 * tested with a tiny request through its model.
 */
function Step3Roles({ overview, onReload }: { overview: OmniRouteOverview; onReload: () => void }) {
  const { t } = useI18n();
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preset, setPreset] = useState('');
  const [choices, setChoices] = useState<Record<RoleId, Draft>>(
    () =>
      Object.fromEntries(ROLE_ORDER.map((role) => [role, draftOf(overview.roles[role])])) as Record<
        RoleId,
        Draft
      >,
  );
  // Which rows have a stored model (and so a Test button); the save answer refreshes it.
  const [savedRoles, setSavedRoles] = useState<Roles>(overview.roles);
  const [missing, setMissing] = useState<RoleId[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<RoleId | null>(null);
  const [testResult, setTestResult] = useState<
    Partial<Record<RoleId, { ok: boolean; ms?: number }>>
  >({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    let active = true;
    request<ModelsResponse>('models')
      .then((answer) => {
        if (!active) return;
        setModels(answer);
        setModelsFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setModelsFailed(true);
        toast.error(t('admin.omniroute.error.generic'));
      });
    return () => {
      active = false;
    };
  }, [attempt, t]);

  if (!models && modelsFailed) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <h4 className="text-sm font-semibold">{t('admin.omniroute.step3.title')}</h4>
        <p className="text-sm text-muted-foreground">{t('admin.omniroute.error.generic')}</p>
        <div>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            {t('admin.omniroute.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (!models) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border p-4">
        <h4 className="text-sm font-semibold">{t('admin.omniroute.step3.title')}</h4>
        <p className="text-sm text-muted-foreground">{t('admin.omniroute.step3.loading')}</p>
      </div>
    );
  }

  const applyPreset = (id: string) => {
    setPreset(id);
    const chosen = id ? models.presets[id as PresetId] : undefined;
    if (!chosen) return;
    setChoices((previous) => {
      const next = { ...previous };
      for (const role of ROLE_ORDER) {
        const choice = chosen[role];
        if (choice) next[role] = draftOf(choice);
      }
      return next;
    });
    setMissing([]);
  };

  const pickModel = (role: RoleId, id: string) => {
    const item = id ? models.items.find((entry) => entry.id === id) : undefined;
    const stored = overview.roles[role];
    setChoices((previous) => ({
      ...previous,
      [role]: {
        model: id,
        // A model OmniRoute says nothing about keeps the row's stored flags (no images, tools assumed).
        vision: item?.vision ?? stored?.vision ?? false,
        tools: item?.tools ?? stored?.tools ?? true,
      },
    }));
    setMissing((previous) => previous.filter((missingRole) => missingRole !== role));
  };

  const save = async () => {
    const empty = ROLE_ORDER.filter((role) => !choices[role].model);
    if (empty.length > 0) {
      // One request carries all four roles, so an empty row blocks it and says so at its row.
      setMissing(empty);
      return;
    }
    setMissing([]);
    setBusy(true);
    try {
      const answer = await request<RolesResponse>('roles', {
        method: 'PUT',
        body: {
          roles: Object.fromEntries(
            ROLE_ORDER.map((role) => {
              const draft = choices[role];
              const item = models.items.find((entry) => entry.id === draft.model);
              const choice: RoleChoice = {
                model: draft.model,
                vision: draft.vision,
                tools: draft.tools,
              };
              if (item?.contextWindow != null) choice.contextWindow = item.contextWindow;
              return [role, choice];
            }),
          ) as Record<RoleId, RoleChoice>,
        } satisfies RolesRequest,
      });
      setSavedRoles(answer.roles);
      toast.success(t('admin.omniroute.step3.saved'));
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (role: RoleId) => {
    setTesting(role);
    try {
      const answer = await request<TestResponse>('test', {
        method: 'POST',
        body: { role } satisfies TestRequest,
      });
      setTestResult((previous) => ({ ...previous, [role]: { ok: true, ms: answer.latencyMs } }));
    } catch {
      setTestResult((previous) => ({ ...previous, [role]: { ok: false } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('admin.omniroute.step3.title')}</h4>
        <div className="flex items-center gap-2">
          <Label htmlFor="omni-preset">{t('admin.omniroute.step3.preset')}</Label>
          <select
            id="omni-preset"
            className={cn(SELECT_CLASS, 'w-40')}
            value={preset}
            onChange={(event) => applyPreset(event.target.value)}
          >
            <option value="">—</option>
            {PRESET_ORDER.filter((id) => models.presets[id]).map((id) => (
              <option key={id} value={id}>
                {t(`admin.omniroute.step3.${PRESET_LABEL[id]}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ROLE_ORDER.map((role) => {
        const draft = choices[role];
        const item = draft.model
          ? models.items.find((entry) => entry.id === draft.model)
          : undefined;
        const { grouped, kept } = selectOptions(models, draft.model);
        // true → a chip, false → nothing, null → OmniRoute does not say: a box the admin ticks.
        const vision = item ? item.vision : draft.model ? null : undefined;
        const tools = item?.tools;
        const result = testResult[role];
        return (
          <div key={role} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor={`omni-role-${role}`} className="w-44 shrink-0">
                {t(`admin.omniroute.role.${role}`)}
              </Label>
              <select
                id={`omni-role-${role}`}
                className={cn(SELECT_CLASS, 'min-w-44 max-w-64 flex-1')}
                value={draft.model}
                onChange={(event) => pickModel(role, event.target.value)}
              >
                <option value="">{t('admin.omniroute.step3.none')}</option>
                {grouped.map((entry) => (
                  <optgroup key={entry.group} label={t(`admin.omniroute.group.${entry.group}`)}>
                    {entry.items.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name === model.id ? model.id : `${model.name} · ${model.id}`}
                      </option>
                    ))}
                  </optgroup>
                ))}
                {kept.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.id}
                  </option>
                ))}
              </select>
              {vision === true ? (
                <Badge variant="outline">{t('admin.omniroute.chip.vision')}</Badge>
              ) : null}
              {tools === true ? (
                <Badge variant="outline">{t('admin.omniroute.chip.tools')}</Badge>
              ) : null}
              {vision === null ? (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={draft.vision}
                    onChange={(event) =>
                      setChoices((previous) => ({
                        ...previous,
                        [role]: { ...previous[role], vision: event.target.checked },
                      }))
                    }
                  />
                  {t('admin.omniroute.chip.visionToggle')}
                </label>
              ) : null}
              {savedRoles[role] ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || testing !== null}
                  onClick={() => void runTest(role)}
                >
                  {testing === role
                    ? t('admin.omniroute.test.running')
                    : t('admin.omniroute.test.run')}
                </Button>
              ) : null}
              {result ? (
                <span className="text-xs text-muted-foreground">
                  {result.ok
                    ? t('admin.omniroute.test.ok', { ms: result.ms })
                    : t('admin.omniroute.test.failed')}
                </span>
              ) : null}
            </div>
            {missing.includes(role) ? (
              <p role="alert" className="text-xs text-red-600">
                {t('admin.omniroute.step3.none')}
              </p>
            ) : null}
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground">{t('admin.omniroute.step3.defaultNote')}</p>
      <div>
        <Button disabled={busy || testing !== null} onClick={() => void save()}>
          {t('admin.omniroute.step3.save')}
        </Button>
      </div>

      <Collapsible
        open={advancedOpen}
        onOpenChange={(open) => {
          setAdvancedOpen(open);
          if (!open) onReload(); // the roles follow whatever the route cards just changed
        }}
      >
        <CollapsibleTrigger className="text-xs font-medium text-muted-foreground underline underline-offset-4">
          {t('admin.omniroute.step3.advanced')}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-col gap-4">
          <StageRoutingCards />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
