/**
 * Turns stored provider rows into the config every provider lookup reads. Pure: no database, no
 * environment. A row only becomes a server-managed provider when it is complete (see
 * `isCredentialComplete`), the same activation rule the environment loader used to apply.
 */
import {
  emptyServerConfig,
  isCapabilitySection,
  type CredentialRecord,
  type ProviderSection,
  type ProviderSnapshot,
  type ServerConfig,
} from './types';

/** Providers that work with no API key: a base URL alone (or, for Bedrock, just the row) is enough. */
const KEYLESS_PROVIDERS: Partial<Record<ProviderSection, ReadonlySet<string>>> = {
  providers: new Set(['ollama', 'lemonade', 'bedrock']),
  tts: new Set(['voxcpm-tts', 'lemonade-tts']),
  asr: new Set(['funasr-asr', 'lemonade-asr']),
  image: new Set(['lemonade']),
  webSearch: new Set(['brave', 'searxng']),
};

/** PDF providers need a base URL, except these, which have a default endpoint. */
const PDF_BASE_URL_OPTIONAL = new Set(['mineru-cloud']);

/** Providers whose credentials are an Aliyun AccessKey pair rather than one API key. */
const ACCESS_KEY_PAIR_PROVIDERS = new Set(['alidocmind']);

export function isKeylessProvider(section: ProviderSection, providerId: string): boolean {
  return KEYLESS_PROVIDERS[section]?.has(providerId) ?? false;
}

/** Whether a row has what its provider needs to be served. */
export function isCredentialComplete(
  record: Pick<CredentialRecord, 'section' | 'providerId' | 'baseUrl' | 'secret'>,
): boolean {
  const { section, providerId, baseUrl, secret } = record;
  if (section === 'pdf') {
    if (ACCESS_KEY_PAIR_PROVIDERS.has(providerId)) {
      return !!secret.accessKeyId && !!secret.accessKeySecret;
    }
    return PDF_BASE_URL_OPTIONAL.has(providerId) ? !!secret.apiKey : !!baseUrl;
  }
  if (providerId === 'bedrock' && section === 'providers') return true;
  return !!secret.apiKey || (!!baseUrl && isKeylessProvider(section, providerId));
}

/** A model list with blanks and surrounding spaces removed, or undefined when nothing is left. */
export function normalizeModels(models: readonly string[] | undefined): string[] | undefined {
  const parsed = models?.map((model) => model.trim()).filter(Boolean);
  return parsed && parsed.length > 0 ? parsed : undefined;
}

export interface RoutingRow {
  stage: string;
  value: unknown;
}

/** The stage name that holds the default model. Not a routable stage, so it cannot collide. */
export const DEFAULT_MODEL_STAGE = 'default';

function defaultModelOf(value: unknown): string | undefined {
  const model =
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? (value as { model?: unknown }).model
        : undefined;
  return typeof model === 'string' && model.trim() ? model.trim() : undefined;
}

export function buildSnapshot(
  records: readonly CredentialRecord[],
  routing: readonly RoutingRow[],
  unreadable: ProviderSnapshot['unreadable'] = [],
): ProviderSnapshot {
  const config: ServerConfig = emptyServerConfig();
  const blocked = new Set(unreadable.map((row) => `${row.section}/${row.providerId}`));
  for (const record of records) {
    // A secret this server cannot read is never half-served: its proxy would be lost and a client
    // key could take its place. A switchable provider is switched off; any other stays managed,
    // with no key, so a request to it fails instead of falling back to a client's key.
    if (blocked.has(`${record.section}/${record.providerId}`)) {
      if (isCapabilitySection(record.section))
        config.disabled[record.section].add(record.providerId);
      else config[record.section][record.providerId] = { apiKey: '' };
      continue;
    }
    if (isCapabilitySection(record.section) && !record.enabled) {
      config.disabled[record.section].add(record.providerId);
    }
    if (!isCredentialComplete(record)) continue;
    config[record.section][record.providerId] = {
      apiKey: record.secret.apiKey ?? '',
      baseUrl: record.baseUrl,
      models: normalizeModels(record.models),
      proxy: record.secret.proxy,
      ...(record.secret.accessKeyId ? { accessKeyId: record.secret.accessKeyId } : {}),
      ...(record.secret.accessKeySecret ? { accessKeySecret: record.secret.accessKeySecret } : {}),
    };
  }

  const routes: Record<string, unknown> = {};
  let defaultModel: string | undefined;
  for (const row of routing) {
    if (row.stage === DEFAULT_MODEL_STAGE) defaultModel = defaultModelOf(row.value);
    else routes[row.stage] = row.value;
  }
  return { config, routing: { defaultModel, routes }, unreadable: [...unreadable] };
}
