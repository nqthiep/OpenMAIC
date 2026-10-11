import { describe, expect, it, vi } from 'vitest';

import { hashPassword, verifyPassword } from '@/lib/accounts/password';

/** What the wrapped scrypt reports: derivations in flight, the most seen at once, and failures still to inject. */
const probe = vi.hoisted(() => ({ active: 0, peak: 0, failures: 0 }));

// Each derivation still runs the real scrypt; the wrapper only counts them.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  type Scrypt = (...args: unknown[]) => void;
  const counted = (...args: unknown[]) => {
    const done = args.pop() as (error: Error | null, key: Buffer) => void;
    probe.active += 1;
    probe.peak = Math.max(probe.peak, probe.active);
    const finish = (error: Error | null, key: Buffer) => {
      probe.active -= 1;
      done(error, key);
    };
    if (probe.failures > 0) {
      probe.failures -= 1;
      process.nextTick(finish, new Error('boom'), Buffer.alloc(0));
      return;
    }
    (actual.scrypt as unknown as Scrypt)(...args, finish);
  };
  return { ...actual, scrypt: counted };
});

describe('password derivations', () => {
  it('runs two at a time, and every caller gets its own result', async () => {
    probe.peak = 0;
    const passwords = Array.from({ length: 8 }, (_, index) => `password number ${index}`);
    const hashes = await Promise.all(passwords.map((password) => hashPassword(password)));

    expect(probe.peak).toBe(2);
    expect(probe.active).toBe(0);
    for (const [index, hash] of hashes.entries()) {
      expect(await verifyPassword(passwords[index]!, hash)).toBe(true);
    }
  });

  it('frees the slot of a derivation that fails, so later ones still run', async () => {
    probe.failures = 2;
    await expect(hashPassword('first failing one')).rejects.toThrow('boom');
    await expect(hashPassword('second failing one')).rejects.toThrow('boom');

    // With two slots leaked, these would wait forever.
    const hashes = await Promise.all([hashPassword('third one'), hashPassword('fourth one')]);
    expect(hashes).toHaveLength(2);
  });
});
