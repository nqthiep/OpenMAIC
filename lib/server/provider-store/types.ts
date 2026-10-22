/**
 * Shapes shared by the provider store: what one provider needs to be served, and the in-memory
 * snapshot every synchronous provider lookup reads. No imports from the rest of the server, so
 * `provider-config.ts` and the store can both depend on this file.
 */

export const PROVIDER_SECTIONS = [
  'providers',
  'tts',
  'asr',
  'pdf',
  'image',
  'video',
  'webSearch',
] as const;

/** A kind of AI service. `providers` is the language models (LLM). */
export type ProviderSection = (typeof PROVIDER_SECTIONS)[number];

/** Sections whose providers an operator can switch off without deleting the key. */
export type CapabilitySection = 'tts' | 'asr' | 'image' | 'video' | 'webSearch';

export function isProviderSection(value: unknown): value is ProviderSection {
  return typeof value === 'string' && (PROVIDER_SECTIONS as readonly string[]).includes(value);
}

export function isCapabilitySection(section: ProviderSection): section is CapabilitySection {
  return section !== 'providers' && section !== 'pdf';
}

export interface ServerProviderEntry {
  apiKey: string;
  baseUrl?: string;
  models?: string[];
  proxy?: string;
  /** Aliyun AccessKey ID (AliDocMind uses AK/SK instead of a single apiKey). */
  accessKeyId?: string;
  /** Aliyun AccessKey Secret (AliDocMind). */
  accessKeySecret?: string;
}

export interface ServerConfig {
  providers: Record<string, ServerProviderEntry>;
  tts: Record<string, ServerProviderEntry>;
  asr: Record<string, ServerProviderEntry>;
  pdf: Record<string, ServerProviderEntry>;
  image: Record<string, ServerProviderEntry>;
  video: Record<string, ServerProviderEntry>;
  webSearch: Record<string, ServerProviderEntry>;
  /** Provider ids the operator switched off, per capability section. */
  disabled: Record<CapabilitySection, Set<string>>;
}

/** The model for each routable stage and the default model, as stored (parsed by model-routes). */
export interface RoutingConfig {
  defaultModel?: string;
  /** Stage -> the stored value: a model string, or `{ model, api, contextWindow, thinking }`. */
  routes: Record<string, unknown>;
}

export interface ProviderSnapshot {
  config: ServerConfig;
  routing: RoutingConfig;
  /** Rows that could not be read (wrong or missing master key). Shown to the administrator. */
  unreadable: { section: ProviderSection; providerId: string }[];
}

/** The values kept encrypted. Every field is optional: a provider needs only some of them. */
export interface ProviderSecret {
  apiKey?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  /** May carry `user:password@`, so it is a secret. */
  proxy?: string;
}

export const SECRET_FIELDS = ['apiKey', 'accessKeyId', 'accessKeySecret', 'proxy'] as const;

/** One stored provider row, with its secret already decrypted (or absent). */
export interface CredentialRecord {
  section: ProviderSection;
  providerId: string;
  enabled: boolean;
  baseUrl?: string;
  models?: string[];
  secret: ProviderSecret;
  keyHint?: string;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export function emptyServerConfig(): ServerConfig {
  return {
    providers: {},
    tts: {},
    asr: {},
    pdf: {},
    image: {},
    video: {},
    webSearch: {},
    disabled: {
      tts: new Set(),
      asr: new Set(),
      image: new Set(),
      video: new Set(),
      webSearch: new Set(),
    },
  };
}

export function emptySnapshot(): ProviderSnapshot {
  return { config: emptyServerConfig(), routing: { routes: {} }, unreadable: [] };
}
