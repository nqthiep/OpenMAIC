/**
 * The provider ids each section knows about, from the same registries the rest of the app uses.
 * An id outside them is refused when saving, so a typo cannot create a row nothing will read.
 */
import { TTS_PROVIDERS, ASR_PROVIDERS } from '@/lib/audio/constants';
import { PROVIDERS } from '@/lib/ai/providers';
import { IMAGE_PROVIDERS } from '@/lib/media/image-providers';
import { VIDEO_PROVIDERS } from '@/lib/media/video-providers';
import { PDF_PROVIDERS } from '@/lib/pdf/constants';
import { WEB_SEARCH_PROVIDERS } from '@/lib/web-search/constants';

import { isKeylessProvider } from './build-config';
import type { ProviderSection } from './types';

/** Providers that live only in the browser's catalog but can still be switched off for everyone. */
const EXTRA_IDS: Partial<Record<ProviderSection, readonly string[]>> = {
  image: ['comfyui-image'],
};

function idsOf(section: ProviderSection): string[] {
  switch (section) {
    case 'providers':
      return Object.keys(PROVIDERS);
    case 'tts':
      return Object.keys(TTS_PROVIDERS);
    case 'asr':
      return Object.keys(ASR_PROVIDERS);
    case 'pdf':
      return Object.keys(PDF_PROVIDERS);
    case 'image':
      return Object.keys(IMAGE_PROVIDERS);
    case 'video':
      return Object.keys(VIDEO_PROVIDERS);
    case 'webSearch':
      return Object.keys(WEB_SEARCH_PROVIDERS);
  }
}

export function knownProviderIds(section: ProviderSection): string[] {
  return [...new Set([...idsOf(section), ...(EXTRA_IDS[section] ?? [])])];
}

export function isKnownProvider(section: ProviderSection, providerId: string): boolean {
  return knownProviderIds(section).includes(providerId);
}

/** What the admin form needs to know about one provider. */
export interface CatalogEntry {
  id: string;
  name: string;
  /** Needs an API key to be served. */
  requiresApiKey: boolean;
  /** Served with a base URL alone (a local or self-hosted service). */
  keyless: boolean;
  /** A base URL must be given (self-hosted PDF parsers). */
  baseUrlRequired: boolean;
  /** Credentials are an AccessKey ID and Secret rather than one API key. */
  accessKeyPair: boolean;
  defaultBaseUrl?: string;
  /** Model ids the app knows, to suggest in the pinned-models field. */
  models: { id: string; name: string }[];
}

interface RawProvider {
  id?: string;
  name?: string;
  requiresApiKey?: boolean;
  defaultBaseUrl?: string;
  models?: { id: string; name?: string }[];
}

function rawEntries(section: ProviderSection): Record<string, RawProvider> {
  switch (section) {
    case 'providers':
      return PROVIDERS as unknown as Record<string, RawProvider>;
    case 'tts':
      return TTS_PROVIDERS as unknown as Record<string, RawProvider>;
    case 'asr':
      return ASR_PROVIDERS as unknown as Record<string, RawProvider>;
    case 'pdf':
      return PDF_PROVIDERS as unknown as Record<string, RawProvider>;
    case 'image':
      return IMAGE_PROVIDERS as unknown as Record<string, RawProvider>;
    case 'video':
      return VIDEO_PROVIDERS as unknown as Record<string, RawProvider>;
    case 'webSearch':
      return WEB_SEARCH_PROVIDERS as unknown as Record<string, RawProvider>;
  }
}

export function catalogFor(section: ProviderSection): CatalogEntry[] {
  const raw = rawEntries(section);
  return knownProviderIds(section).map((id) => {
    const entry = raw[id];
    const accessKeyPair = section === 'pdf' && id === 'alidocmind';
    return {
      id,
      name: entry?.name ?? id,
      requiresApiKey: !!entry?.requiresApiKey && !accessKeyPair,
      keyless: isKeylessProvider(section, id),
      baseUrlRequired: section === 'pdf' && !accessKeyPair && id !== 'mineru-cloud',
      accessKeyPair,
      defaultBaseUrl: entry?.defaultBaseUrl,
      models: (entry?.models ?? []).map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
      })),
    };
  });
}
