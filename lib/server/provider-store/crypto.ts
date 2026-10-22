/**
 * Encryption of provider secrets at rest: AES-256-GCM, one random IV per write, and the row's
 * `section/provider_id` bound in as additional data, so a ciphertext copied to another row does
 * not open.
 *
 * The master keys come from `PROVIDER_SECRET_KEY`: a list `id:base64,id:base64`. The first key
 * writes, every key reads, so a key can be replaced without losing what it encrypted: add the new
 * key in front, re-save the rows, then drop the old one. A bare base64 value is key id 1.
 * Each key is 32 bytes, base64 encoded (`openssl rand -base64 32`).
 *
 * Errors here never contain key material or plaintext.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { registerLogSecret } from '@/lib/log-secrets';

import type { ProviderSecret } from './types';

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KEY_ID = 32767; // the key_id column is a smallint

export class ProviderKeyError extends Error {
  readonly code = 'PROVIDER_KEY_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'ProviderKeyError';
  }
}

export interface MasterKey {
  id: number;
  key: Buffer;
}

export interface KeyRing {
  /** The key new writes use. */
  current: MasterKey;
  byId: ReadonlyMap<number, MasterKey>;
}

/** Parses `PROVIDER_SECRET_KEY`. Undefined when it is not set. Throws `ProviderKeyError` when malformed. */
export function parseKeyRing(raw: string | undefined): KeyRing | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  const keys: MasterKey[] = [];
  for (const [index, part] of text.split(',').entries()) {
    const entry = part.trim();
    const colon = entry.indexOf(':');
    const idText = colon === -1 ? '1' : entry.slice(0, colon).trim();
    const encoded = colon === -1 ? entry : entry.slice(colon + 1).trim();
    const id = Number(idText);
    if (!Number.isInteger(id) || id < 1 || id > MAX_KEY_ID) {
      throw new ProviderKeyError(
        `PROVIDER_SECRET_KEY entry ${index + 1}: the key id must be a whole number from 1 to ${MAX_KEY_ID}.`,
      );
    }
    if (colon === -1 && index > 0) {
      throw new ProviderKeyError(
        `PROVIDER_SECRET_KEY entry ${index + 1}: give every key an id, as id:base64.`,
      );
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new ProviderKeyError(
        `PROVIDER_SECRET_KEY entry ${index + 1}: the key must be ${KEY_BYTES} bytes, base64 encoded (openssl rand -base64 32).`,
      );
    }
    if (keys.some((known) => known.id === id)) {
      throw new ProviderKeyError(
        `PROVIDER_SECRET_KEY entry ${index + 1}: key id ${id} is used twice.`,
      );
    }
    registerLogSecret(encoded, 'operator');
    keys.push({ id, key });
  }
  return { current: keys[0], byId: new Map(keys.map((key) => [key.id, key])) };
}

/** The key ring of this process, or undefined when `PROVIDER_SECRET_KEY` is not set. */
export function loadKeyRing(env: NodeJS.ProcessEnv = process.env): KeyRing | undefined {
  return parseKeyRing(env.PROVIDER_SECRET_KEY);
}

/** Encrypts `secret`. The result is `iv | tag | ciphertext`, with the id of the key that wrote it. */
export function seal(
  secret: ProviderSecret,
  aad: string,
  ring: KeyRing,
): { enc: Buffer; keyId: number } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', ring.current.key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()]);
  return { enc: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), keyId: ring.current.id };
}

/** Decrypts what `seal` wrote. Throws `ProviderKeyError` for an unknown key id, a wrong key or a changed value. */
export function open(enc: Buffer, keyId: number, aad: string, ring: KeyRing): ProviderSecret {
  const master = ring.byId.get(keyId);
  if (!master) throw new ProviderKeyError(`No master key with id ${keyId} in PROVIDER_SECRET_KEY.`);
  if (enc.length < IV_BYTES + TAG_BYTES) throw new ProviderKeyError('Stored secret is too short.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', master.key, enc.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(enc.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(enc.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
    const parsed: unknown = JSON.parse(plain);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ProviderKeyError('Stored secret is not an object.');
    }
    return parsed as ProviderSecret;
  } catch (error) {
    if (error instanceof ProviderKeyError) throw error;
    throw new ProviderKeyError(
      'Stored secret did not decrypt (wrong key, or the row was changed).',
    );
  }
}

/** The last four characters of a key, for the admin list. Empty for a key too short to show part of. */
export function keyHint(secret: ProviderSecret): string | undefined {
  const value = secret.apiKey || secret.accessKeyId;
  return value && value.length >= 12 ? value.slice(-4) : undefined;
}
