/**
 * Installs a provider snapshot for a test, in place of the database. A test names the providers it
 * wants managed; everything else is unmanaged, as on a fresh server.
 *
 *   useProviders({ providers: { openai: { apiKey: 'sk-x' } }, tts: { 'openai-tts': {} } });
 *   useProviders({ image: { seedream: { apiKey: 'k' } }, disabled: { image: ['seedream'] } });
 */
import { resetProviderSnapshot, setProviderSnapshot } from '@/lib/server/provider-store/snapshot';
import {
  emptyServerConfig,
  emptySnapshot,
  type CapabilitySection,
  type ProviderSection,
  type ServerProviderEntry,
} from '@/lib/server/provider-store/types';

type SectionSpec = Record<string, Partial<ServerProviderEntry>>;

export interface ProviderSpec {
  providers?: SectionSpec;
  tts?: SectionSpec;
  asr?: SectionSpec;
  pdf?: SectionSpec;
  image?: SectionSpec;
  video?: SectionSpec;
  webSearch?: SectionSpec;
  disabled?: Partial<Record<CapabilitySection, string[]>>;
  defaultModel?: string;
  routes?: Record<string, unknown>;
}

const SECTIONS: ProviderSection[] = [
  'providers',
  'tts',
  'asr',
  'pdf',
  'image',
  'video',
  'webSearch',
];

export function useProviders(spec: ProviderSpec = {}): void {
  const snapshot = emptySnapshot();
  const config = emptyServerConfig();
  for (const section of SECTIONS) {
    for (const [id, entry] of Object.entries(spec[section] ?? {})) {
      config[section][id] = { apiKey: '', ...entry };
    }
  }
  for (const [section, ids] of Object.entries(spec.disabled ?? {})) {
    for (const id of ids ?? []) config.disabled[section as CapabilitySection].add(id);
  }
  setProviderSnapshot({
    ...snapshot,
    config,
    routing: { defaultModel: spec.defaultModel, routes: spec.routes ?? {} },
  });
}

/** Back to "nothing loaded". With no DATABASE_URL set that reads as no managed providers. */
export function clearProviders(): void {
  resetProviderSnapshot();
}
