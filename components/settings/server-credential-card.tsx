'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import {
  fetchProviderSettings,
  LearningRequestError,
  removeModelRoute,
  removeProvider,
  saveModelRoute,
  saveProvider,
  verifyProvider,
  VERIFIABLE_KINDS,
  type ModelRouteRow,
  type ProviderCatalogEntry,
  type ProviderChange,
  type ProviderKind,
  type ProviderRow,
  type ProviderSettings,
} from '@/components/learning/learning-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { cn } from '@/lib/utils';

/** The Settings popup's section ids, and the kind of provider each one lists. */
const KIND_OF_SECTION: Record<string, ProviderKind> = {
  providers: 'providers',
  tts: 'tts',
  asr: 'asr',
  pdf: 'pdf',
  image: 'image',
  video: 'video',
  'web-search': 'webSearch',
};

// One read of the settings is shared by every card the popup shows; a save drops it.
let cached: Promise<ProviderSettings> | null = null;
const loadSettings = () =>
  (cached ??= fetchProviderSettings().catch((error: unknown) => {
    cached = null;
    throw error;
  }));

type Status = 'active' | 'off' | 'incomplete' | 'unreadable' | 'unset';

/** Kinds whose providers can be switched off without deleting their key. */
const SWITCHABLE: readonly ProviderKind[] = ['tts', 'asr', 'image', 'video', 'webSearch'];

const STATUS_STYLE: Record<Status, string> = {
  active: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  off: 'border-muted-foreground/40 text-muted-foreground',
  incomplete: 'border-amber-500/50 text-amber-700 dark:text-amber-300',
  unreadable: 'border-red-500/50 text-red-700 dark:text-red-300',
  unset: 'border-border text-muted-foreground',
};

function statusOf(row: ProviderRow | undefined): Status {
  if (!row) return 'unset';
  if (!row.readable) return 'unreadable';
  if (!row.enabled) return 'off';
  return row.complete ? 'active' : 'incomplete';
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

/** The model of a stored route: the string itself, or the `model` of an object. */
function routeModel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const model = (value as { model?: unknown }).model;
    if (typeof model === 'string') return model;
  }
  return '';
}

function parseModels(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((model) => model.trim())
    .filter(Boolean);
}

function useErrorText() {
  const { t } = useI18n();
  return (error: unknown): string => {
    if (error instanceof LearningRequestError) {
      if (error.errorCode === 'VERSION_CONFLICT') return t('admin.providers.errors.conflict');
      if (error.errorCode === 'MASTER_KEY_MISSING') return t('admin.providers.errors.masterKey');
      if (error.errorCode === 'SECRET_UNREADABLE') return t('admin.providers.errors.unreadable');
      if (error.status === 400) return t('admin.providers.errors.invalid');
    }
    return t('admin.providers.errors.generic');
  };
}

/**
 * The shared server credential of the provider selected in the Settings popup, for an
 * administrator: the key, base URL and allowed models every learner's AI request uses, stored
 * encrypted in the database. The popup's own fields keep the administrator's personal key, which
 * stays in this browser. Renders nothing for a section without providers, for a provider the
 * server has no entry for (a custom one), or when the settings cannot be read (no database, or
 * not an administrator). `providerIds` holds the selected provider of each section.
 */
export function ServerCredentialCard({
  section,
  providerIds,
}: {
  section: string;
  providerIds: Record<string, string>;
}) {
  const kind = KIND_OF_SECTION[section];
  const providerId = providerIds[section];
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    loadSettings()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch(() => {
        if (active) setSettings(null);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const reload = useCallback(() => {
    cached = null;
    setVersion((n) => n + 1);
    // The popup's own list of server-managed providers follows what was just saved.
    void useSettingsStore.getState().fetchServerProviders();
  }, []);

  const entry = useMemo(
    () => (kind ? settings?.catalog[kind].find((item) => item.id === providerId) : undefined),
    [settings, kind, providerId],
  );
  if (!kind || !settings || !settings.canManage || !entry) return null;
  const row = settings.rows.find((item) => item.section === kind && item.providerId === entry.id);

  return (
    <div className="mb-6 flex max-w-3xl flex-col gap-4">
      {settings.masterKey !== 'ok' ? <MasterKeyWarning status={settings.masterKey} /> : null}
      <CredentialForm
        key={`${kind}/${entry.id}/${row?.version ?? 0}`}
        kind={kind}
        entry={entry}
        row={row}
        onChanged={reload}
      />
      {kind === 'providers' ? (
        <>
          <DefaultModelCard settings={settings} onChange={setSettings} onStale={reload} />
          <RoutesCard settings={settings} onChange={setSettings} onStale={reload} />
        </>
      ) : null}
    </div>
  );
}

function MasterKeyWarning({ status }: { status: 'missing' | 'invalid' }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
    >
      {t(`admin.providers.masterKey.${status}`)}
    </div>
  );
}

function CredentialForm({
  kind,
  entry,
  row,
  onChanged,
}: {
  kind: ProviderKind;
  entry: ProviderCatalogEntry;
  row: ProviderRow | undefined;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [accessKeyId, setAccessKeyId] = useState('');
  const [accessKeySecret, setAccessKeySecret] = useState('');
  const [baseUrl, setBaseUrl] = useState(row?.baseUrl ?? '');
  const [models, setModels] = useState((row?.models ?? []).join(', '));
  const [proxy, setProxy] = useState('');
  const [clearProxy, setClearProxy] = useState(false);
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const switchable = SWITCHABLE.includes(kind);
  const change = useMemo<ProviderChange>(() => {
    const next: ProviderChange = { expectedVersion: row?.version ?? 0 };
    const secret: NonNullable<ProviderChange['secret']> = {};
    if (clearKey) secret.apiKey = null;
    else if (apiKey.trim()) secret.apiKey = apiKey.trim();
    if (accessKeyId.trim()) secret.accessKeyId = accessKeyId.trim();
    if (accessKeySecret.trim()) secret.accessKeySecret = accessKeySecret.trim();
    if (clearProxy) secret.proxy = null;
    else if (proxy.trim()) secret.proxy = proxy.trim();
    if (Object.keys(secret).length > 0) next.secret = secret;
    const url = baseUrl.trim();
    if ((url || undefined) !== row?.baseUrl) next.baseUrl = url || null;
    const list = parseModels(models);
    if (JSON.stringify(list) !== JSON.stringify(row?.models ?? []))
      next.models = list.length > 0 ? list : null;
    if (switchable && enabled !== (row?.enabled ?? true)) next.enabled = enabled;
    return next;
  }, [
    row,
    clearKey,
    apiKey,
    accessKeyId,
    accessKeySecret,
    clearProxy,
    proxy,
    baseUrl,
    models,
    enabled,
    switchable,
  ]);
  const dirty = Object.keys(change).length > 1;
  // A keyless provider (Amazon Bedrock) is switched on by saving the row, with nothing to fill in.
  const canSave = dirty || (!row && entry.keyless);

  const run = async (action: 'save' | 'remove', work: () => Promise<unknown>, done: string) => {
    setBusy(action);
    setError(null);
    try {
      await work();
      toast.success(done);
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
      if (failure instanceof LearningRequestError && failure.errorCode === 'VERSION_CONFLICT')
        onChanged();
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setError(null);
    try {
      const model = row?.models?.[0] ?? entry.models[0]?.id;
      const ok = await verifyProvider(kind, entry.id, model);
      if (ok) toast.success(t('admin.providers.toast.testOk'));
      else setError(t('admin.providers.toast.testFailed'));
    } catch {
      setError(t('admin.providers.toast.testFailed'));
    } finally {
      setBusy(null);
    }
  };

  const canTest =
    !!row && row.complete && row.readable && VERIFIABLE_KINDS.includes(kind) && !dirty;
  const field = (id: string, label: string, control: ReactNode, hint?: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{t('admin.providers.card.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('admin.providers.card.description')}</p>
        </div>
        <Badge variant="outline" className={STATUS_STYLE[statusOf(row)]}>
          {t(`admin.providers.status.${statusOf(row)}`)}
          {row?.keyHint ? ` · ${t('admin.providers.keyHint', { hint: row.keyHint })}` : ''}
        </Badge>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            'save',
            () => saveProvider(kind, entry.id, change),
            t('admin.providers.toast.saved'),
          );
        }}
      >
        {entry.accessKeyPair ? (
          <>
            {field(
              'pv-akid',
              t('admin.providers.form.accessKeyId'),
              <Input
                id="pv-akid"
                type="password"
                autoComplete="off"
                value={accessKeyId}
                placeholder={row?.has.accessKeyId ? t('admin.providers.form.apiKeyKeep') : ''}
                onChange={(event) => setAccessKeyId(event.target.value)}
              />,
            )}
            {field(
              'pv-aksecret',
              t('admin.providers.form.accessKeySecret'),
              <Input
                id="pv-aksecret"
                type="password"
                autoComplete="off"
                value={accessKeySecret}
                placeholder={row?.has.accessKeySecret ? t('admin.providers.form.apiKeyKeep') : ''}
                onChange={(event) => setAccessKeySecret(event.target.value)}
              />,
            )}
          </>
        ) : (
          <>
            {field(
              'pv-key',
              t('admin.providers.form.apiKey'),
              <Input
                id="pv-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                disabled={clearKey}
                placeholder={
                  row?.has.apiKey
                    ? t('admin.providers.form.apiKeyKeep')
                    : entry.requiresApiKey
                      ? ''
                      : 'sk-…'
                }
                onChange={(event) => setApiKey(event.target.value)}
              />,
            )}
            {row?.has.apiKey ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(event) => setClearKey(event.target.checked)}
                />
                {t('admin.providers.form.clearKey')}
              </label>
            ) : null}
          </>
        )}

        {field(
          'pv-url',
          t('admin.providers.form.baseUrl'),
          <Input
            id="pv-url"
            type="url"
            inputMode="url"
            value={baseUrl}
            placeholder={entry.defaultBaseUrl ?? 'https://'}
            onChange={(event) => setBaseUrl(event.target.value)}
          />,
          entry.baseUrlRequired
            ? t('admin.providers.form.baseUrlRequired')
            : entry.defaultBaseUrl
              ? t('admin.providers.form.baseUrlDefault', { url: entry.defaultBaseUrl })
              : undefined,
        )}

        {field(
          'pv-models',
          t('admin.providers.form.models'),
          <Input
            id="pv-models"
            value={models}
            onChange={(event) => setModels(event.target.value)}
          />,
          t('admin.providers.form.modelsHint'),
        )}
        {entry.models.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t('admin.providers.form.suggestions')}:
            </span>
            {entry.models.slice(0, 10).map((model) => {
              const chosen = parseModels(models).includes(model.id);
              return (
                <button
                  key={model.id}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() =>
                    setModels(
                      (chosen
                        ? parseModels(models).filter((id) => id !== model.id)
                        : [...parseModels(models), model.id]
                      ).join(', '),
                    )
                  }
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs',
                    chosen
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {model.id}
                </button>
              );
            })}
          </div>
        ) : null}

        {switchable ? (
          <div className="flex items-start justify-between gap-4 rounded-xl border p-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="pv-enabled">{t('admin.providers.form.enabled')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('admin.providers.form.enabledHint')}
              </p>
            </div>
            <Switch id="pv-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
        ) : null}

        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t('admin.providers.form.advanced')}
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {field(
              'pv-proxy',
              t('admin.providers.form.proxy'),
              <Input
                id="pv-proxy"
                type="password"
                autoComplete="off"
                value={proxy}
                disabled={clearProxy}
                placeholder={row?.has.proxy ? t('admin.providers.form.apiKeyKeep') : 'http://'}
                onChange={(event) => setProxy(event.target.value)}
              />,
              t('admin.providers.form.proxyHint'),
            )}
            {row?.has.proxy ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearProxy}
                  onChange={(event) => setClearProxy(event.target.checked)}
                />
                {t('admin.providers.actions.remove')} {t('admin.providers.form.proxy')}
              </label>
            ) : null}
          </div>
        </details>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {row ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(t('admin.providers.confirmRemove', { name: entry.name })))
                    return;
                  void run(
                    'remove',
                    () => removeProvider(kind, entry.id, row.version),
                    t('admin.providers.toast.removed'),
                  );
                }}
              >
                {t('admin.providers.actions.remove')}
              </Button>
            ) : null}
            {canTest ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void test()}
              >
                {busy === 'test'
                  ? t('admin.providers.actions.testing')
                  : t('admin.providers.actions.test')}
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!canSave || busy !== null}>
              {busy === 'save'
                ? t('admin.providers.actions.saving')
                : t('admin.providers.actions.save')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function DefaultModelCard({
  settings,
  onChange,
  onStale,
}: {
  settings: ProviderSettings;
  onChange: (settings: ProviderSettings) => void;
  /** Asks the panel to load the settings again, after someone else changed them. */
  onStale: () => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const current = settings.routing.find((route) => route.stage === 'default');
  const currentModel = routeModel(current?.value);
  const colon = currentModel.indexOf(':');
  const [provider, setProvider] = useState(colon > 0 ? currentModel.slice(0, colon) : '');
  const [model, setModel] = useState(colon > 0 ? currentModel.slice(colon + 1) : '');
  const [busy, setBusy] = useState(false);

  const served = settings.catalog.providers.filter((entry) =>
    settings.rows.some(
      (row) => row.section === 'providers' && row.providerId === entry.id && row.complete,
    ),
  );
  const options =
    provider && !served.some((entry) => entry.id === provider)
      ? [...served, ...settings.catalog.providers.filter((entry) => entry.id === provider)]
      : served;
  const known = settings.catalog.providers.find((entry) => entry.id === provider)?.models ?? [];
  const pinned =
    settings.rows.find((row) => row.section === 'providers' && row.providerId === provider)
      ?.models ?? [];
  const suggestions = pinned.length > 0 ? pinned.map((id) => ({ id, name: id })) : known;
  const notServed = !!provider && !served.some((entry) => entry.id === provider);
  const next = provider && model.trim() ? `${provider}:${model.trim()}` : '';

  const save = async () => {
    setBusy(true);
    try {
      const result = await saveModelRoute('default', next, current?.version ?? 0);
      onChange({ ...settings, routing: result.routing });
      toast.success(t('admin.providers.toast.saved'));
    } catch (error) {
      toast.error(errorText(error));
      if (error instanceof LearningRequestError && error.errorCode === 'VERSION_CONFLICT')
        onStale();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('admin.providers.default.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('admin.providers.default.description')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dm-provider">{t('admin.providers.default.provider')}</Label>
          <select
            id="dm-provider"
            className={SELECT_CLASS}
            value={provider}
            disabled={!settings.canManage}
            onChange={(event) => {
              setProvider(event.target.value);
              setModel('');
            }}
          >
            <option value="" />
            {options.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dm-model">{t('admin.providers.default.model')}</Label>
          <Input
            id="dm-model"
            list="dm-models"
            value={model}
            disabled={!settings.canManage || !provider}
            onChange={(event) => setModel(event.target.value)}
          />
          <datalist id="dm-models">
            {suggestions.map((entry) => (
              <option key={entry.id} value={entry.id} />
            ))}
          </datalist>
        </div>
        {settings.canManage ? (
          <Button disabled={busy || !next || next === currentModel} onClick={() => void save()}>
            {t('admin.providers.default.save')}
          </Button>
        ) : null}
      </div>
      {!currentModel ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('admin.providers.default.none')}
        </p>
      ) : notServed ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t('admin.providers.default.notServed')}
        </p>
      ) : null}
    </div>
  );
}

function RoutesCard({
  settings,
  onChange,
  onStale,
}: {
  settings: ProviderSettings;
  onChange: (settings: ProviderSettings) => void;
  onStale: () => void;
}) {
  const { t } = useI18n();
  return (
    <details className="rounded-2xl border p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {t('admin.providers.routes.title')}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('admin.providers.routes.description')}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {settings.stages.map((stage) => (
          <RouteRow
            key={stage}
            stage={stage}
            route={settings.routing.find((route) => route.stage === stage)}
            canManage={settings.canManage}
            onChange={(routing) => onChange({ ...settings, routing })}
            onStale={onStale}
          />
        ))}
      </ul>
    </details>
  );
}

function RouteRow({
  stage,
  route,
  canManage,
  onChange,
  onStale,
}: {
  stage: string;
  route: ModelRouteRow | undefined;
  canManage: boolean;
  onChange: (routing: ModelRouteRow[]) => void;
  onStale: () => void;
}) {
  const { t } = useI18n();
  const errorText = useErrorText();
  const stored = routeModel(route?.value);
  const [value, setValue] = useState(stored);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(stored), [stored]);
  const advanced =
    !!route &&
    typeof route.value === 'object' &&
    route.value !== null &&
    Object.keys(route.value).length > 1;

  const run = async (work: () => Promise<{ routing: ModelRouteRow[] }>) => {
    setBusy(true);
    try {
      onChange((await work()).routing);
      toast.success(t('admin.providers.toast.saved'));
    } catch (error) {
      toast.error(errorText(error));
      if (error instanceof LearningRequestError && error.errorCode === 'VERSION_CONFLICT')
        onStale();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="grid items-center gap-2 sm:grid-cols-[14rem_1fr_auto]">
      <code className="truncate text-xs">{stage}</code>
      <div className="flex flex-col gap-1">
        <Input
          value={value}
          disabled={!canManage}
          placeholder={t('admin.providers.routes.placeholder')}
          aria-label={stage}
          onChange={(event) => setValue(event.target.value)}
        />
        {advanced ? (
          <p className="text-xs text-muted-foreground">{t('admin.providers.routes.kept')}</p>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy || !value.trim() || value.trim() === stored}
            onClick={() =>
              void run(() =>
                saveModelRoute(
                  stage,
                  advanced ? { ...(route!.value as object), model: value.trim() } : value.trim(),
                  route?.version ?? 0,
                ),
              )
            }
          >
            {t('admin.providers.actions.save')}
          </Button>
          {route ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(() => removeModelRoute(stage, route.version))}
            >
              {t('admin.providers.routes.clear')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
