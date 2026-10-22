import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { redactLogSecrets } from '@/lib/log-secrets';

import {
  keyHint,
  open,
  parseKeyRing,
  ProviderKeyError,
  seal,
} from '@/lib/server/provider-store/crypto';

const key = () => randomBytes(32).toString('base64');

describe('parseKeyRing', () => {
  it('is undefined when the variable is unset or blank', () => {
    expect(parseKeyRing(undefined)).toBeUndefined();
    expect(parseKeyRing('  ')).toBeUndefined();
  });

  it('reads a bare key as id 1', () => {
    const ring = parseKeyRing(key());
    expect(ring?.current.id).toBe(1);
  });

  it('writes with the first key and reads with all of them', () => {
    const ring = parseKeyRing(`2:${key()},1:${key()}`)!;
    expect(ring.current.id).toBe(2);
    expect([...ring.byId.keys()].sort()).toEqual([1, 2]);
  });

  it.each([
    ['a key of the wrong length', `1:${Buffer.alloc(16).toString('base64')}`],
    ['an id that is not a number', `x:${key()}`],
    ['an id of zero', `0:${key()}`],
    ['a repeated id', `1:${key()},1:${key()}`],
    ['a second key without an id', `1:${key()},${key()}`],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseKeyRing(raw)).toThrow(ProviderKeyError);
  });

  it('keeps a master key out of log lines once it is parsed', () => {
    const encoded = key();
    parseKeyRing(`3:${encoded}`);
    expect(redactLogSecrets(`loaded ${encoded}`)).not.toContain(encoded);
  });

  it('does not put the key in the error message', () => {
    const bad = Buffer.alloc(16, 7).toString('base64');
    try {
      parseKeyRing(`1:${bad}`);
    } catch (error) {
      expect((error as Error).message).not.toContain(bad);
    }
  });
});

describe('seal / open', () => {
  const ring = parseKeyRing(`1:${key()}`)!;
  const secret = { apiKey: 'sk-live-0123456789', proxy: 'http://user:pw@proxy:8080' };

  it('round-trips a secret', () => {
    const { enc, keyId } = seal(secret, 'tts/openai-tts', ring);
    expect(open(enc, keyId, 'tts/openai-tts', ring)).toEqual(secret);
  });

  it('writes different bytes each time and never the plaintext', () => {
    const a = seal(secret, 'x/y', ring).enc;
    const b = seal(secret, 'x/y', ring).enc;
    expect(a.equals(b)).toBe(false);
    expect(a.toString('utf8')).not.toContain('sk-live');
  });

  it('refuses a ciphertext moved to another row', () => {
    const { enc, keyId } = seal(secret, 'tts/openai-tts', ring);
    expect(() => open(enc, keyId, 'tts/other', ring)).toThrow(ProviderKeyError);
  });

  it('refuses a changed ciphertext', () => {
    const { enc, keyId } = seal(secret, 'a/b', ring);
    enc[enc.length - 1] ^= 1;
    expect(() => open(enc, keyId, 'a/b', ring)).toThrow(ProviderKeyError);
  });

  it('refuses a wrong key and an unknown key id', () => {
    const { enc, keyId } = seal(secret, 'a/b', ring);
    expect(() => open(enc, keyId, 'a/b', parseKeyRing(`1:${key()}`)!)).toThrow(ProviderKeyError);
    expect(() => open(enc, 9, 'a/b', ring)).toThrow(/key with id 9/);
  });

  it('opens what an older key wrote after a new key is put in front', () => {
    const old = parseKeyRing(`1:${key()}`)!;
    const { enc, keyId } = seal(secret, 'a/b', old);
    const rotated = parseKeyRing(`2:${key()},1:${old.current.key.toString('base64')}`)!;
    expect(open(enc, keyId, 'a/b', rotated)).toEqual(secret);
    expect(seal(secret, 'a/b', rotated).keyId).toBe(2);
  });
});

describe('keyHint', () => {
  it('shows the last four characters of a long key', () => {
    expect(keyHint({ apiKey: 'sk-live-0123456789' })).toBe('6789');
  });

  it('shows nothing for a short key', () => {
    expect(keyHint({ apiKey: 'short' })).toBeUndefined();
    expect(keyHint({})).toBeUndefined();
  });
});
