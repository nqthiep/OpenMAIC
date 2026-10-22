/**
 * Checks the body of a provider save before anything is stored. Returns the parts of a
 * `CredentialSave` the body supplies, or the message to send back with a 400.
 */
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';

import { isKnownProvider } from './catalog';
import type { CredentialSave } from './store';
import { isCapabilitySection, SECRET_FIELDS, type ProviderSection } from './types';

/** The version column is a 32-bit integer. */
export const MAX_VERSION = 2_147_483_647;
export const isVersion = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_VERSION;

const MAX_TEXT = 4096;
const MAX_MODELS = 100;
const MAX_MODEL_LENGTH = 200;
const MAX_PROVIDER_ID = 80;
const PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks:', 'socks4:', 'socks5:', 'socks5h:']);

type Parsed =
  | { ok: true; save: Omit<CredentialSave, 'actorId' | 'now'> }
  | { ok: false; message: string };

const fail = (message: string): Parsed => ({ ok: false, message });

/** Text with no control characters, so a pasted key cannot carry a newline into a header. */
function cleanText(
  value: unknown,
  name: string,
): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string') return { ok: false, message: `${name} must be text` };
  const text = value.trim();
  if (text.length > MAX_TEXT) return { ok: false, message: `${name} is too long` };
  if (/[\u0000-\u001f\u007f]/.test(text))
    return { ok: false, message: `${name} has invalid characters` };
  return { ok: true, value: text };
}

/**
 * An administrator's base URL is trusted (the same as one set by the operator before), so private
 * and local hosts are allowed: a compose service such as http://ollama:11434 is a normal value.
 * Only a non-http(s) URL and a cloud metadata address are refused.
 */
async function checkBaseUrl(url: string): Promise<string | undefined> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'baseUrl must be a full URL such as https://api.example.com/v1';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    return 'baseUrl must be http or https';
  if (parsed.username || parsed.password) return 'baseUrl must not contain a user name or password';
  const blocked = await validateUrlForSSRF(url);
  if (blocked && /metadata/i.test(blocked)) return blocked;
  return undefined;
}

export async function parseCredentialBody(
  section: ProviderSection,
  providerId: string,
  body: Record<string, unknown>,
): Promise<Parsed> {
  if (providerId.length > MAX_PROVIDER_ID || !isKnownProvider(section, providerId)) {
    return fail('Unknown provider for this section');
  }
  const { expectedVersion, enabled, baseUrl, models, secret } = body;
  if (!isVersion(expectedVersion)) {
    return fail('expectedVersion must be a whole number, 0 for a new provider');
  }
  const save: Omit<CredentialSave, 'actorId' | 'now'> = {
    section,
    providerId,
    expectedVersion: expectedVersion as number,
  };

  if (enabled !== undefined) {
    if (typeof enabled !== 'boolean') return fail('enabled must be true or false');
    if (!enabled && !isCapabilitySection(section)) {
      return fail('This kind of provider cannot be switched off; remove its key instead');
    }
    save.enabled = enabled;
  }

  if (baseUrl !== undefined) {
    if (baseUrl === null || baseUrl === '') save.baseUrl = null;
    else {
      const text = cleanText(baseUrl, 'baseUrl');
      if (!text.ok) return fail(text.message);
      const problem = await checkBaseUrl(text.value);
      if (problem) return fail(problem);
      save.baseUrl = text.value;
    }
  }

  if (models !== undefined) {
    if (models === null) save.models = null;
    else {
      if (!Array.isArray(models) || models.length > MAX_MODELS)
        return fail(`models must be a list of at most ${MAX_MODELS} names`);
      const list: string[] = [];
      for (const model of models) {
        const name = cleanText(model, 'Each model name');
        if (!name.ok || name.value.length > MAX_MODEL_LENGTH) {
          return fail('Each model name must be short text without control characters');
        }
        if (name.value) list.push(name.value);
      }
      save.models = list;
    }
  }

  if (secret !== undefined) {
    if (!secret || typeof secret !== 'object' || Array.isArray(secret))
      return fail('secret must be an object');
    const fields: NonNullable<CredentialSave['secret']> = {};
    for (const [name, value] of Object.entries(secret)) {
      if (!(SECRET_FIELDS as readonly string[]).includes(name))
        return fail(`Unknown secret field ${name}`);
      if (value === null) {
        fields[name as (typeof SECRET_FIELDS)[number]] = null;
        continue;
      }
      const text = cleanText(value, name);
      if (!text.ok) return fail(text.message);
      if (name === 'proxy' && text.value !== '') {
        try {
          if (!PROXY_PROTOCOLS.has(new URL(text.value).protocol))
            return fail('proxy must be an http, https or socks URL');
        } catch {
          return fail('proxy must be a full URL such as http://proxy.internal:8080');
        }
      }
      fields[name as (typeof SECRET_FIELDS)[number]] = text.value;
    }
    save.secret = fields;
  }
  return { ok: true, save };
}
