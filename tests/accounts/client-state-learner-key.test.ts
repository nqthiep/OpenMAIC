/**
 * With accounts on, the browser's runtime learner key (the tutor's partition) is
 * the signed-in account's owner, as the server reports it. A new page resolves
 * it again, so an account that changed is never served the previous key.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { configureRuntimeStorage, resetRuntimeStorageForTests } from '@/lib/runtime/config';
import { getLearnerKey } from '@/lib/runtime/learner-key';

afterEach(() => {
  resetRuntimeStorageForTests();
});

describe('runtime learner key with accounts on', () => {
  it("is the signed-in account's owner, as the server reports it", async () => {
    configureRuntimeStorage({ learnerKey: () => 'acct_0c3e9b1e-7a4d-4f5e-9b2a-1d2c3e4f5a6b' });

    await expect(getLearnerKey()).resolves.toBe('acct_0c3e9b1e-7a4d-4f5e-9b2a-1d2c3e4f5a6b');
  });

  it('is resolved again on a new page, so another account never reuses the old key', async () => {
    configureRuntimeStorage({ learnerKey: () => 'acct_first' });
    await expect(getLearnerKey()).resolves.toBe('acct_first');

    // A new page starts with nothing of the previous one kept in memory.
    resetRuntimeStorageForTests();
    configureRuntimeStorage({ learnerKey: () => 'acct_second' });
    await expect(getLearnerKey()).resolves.toBe('acct_second');
  });

  it('is refused rather than minted when the account key is not configured', async () => {
    await expect(getLearnerKey()).rejects.toThrow(/not configured/);
  });
});
