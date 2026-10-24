import { describe, expect, it } from 'vitest';

import {
  currentSpendOwner,
  enterSpendOwner,
  runWithSpendOwner,
} from '@/lib/server/authz/spend-context';

/**
 * The generation run worker serves several owners from one loop: each run must be charged to its
 * own owner, and nothing it sets may reach the loop's next run.
 */
describe('runWithSpendOwner', () => {
  it('charges the work, and what it starts later, to the given owner only', async () => {
    const seen = await runWithSpendOwner('acct:a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return currentSpendOwner();
    });
    expect(seen).toBe('acct:a');
    expect(currentSpendOwner()).toBeUndefined();
  });

  it('keeps two runs in flight at once apart', async () => {
    const run = (owner: string, delay: number) =>
      runWithSpendOwner(owner, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return currentSpendOwner();
      });
    const [a, b] = await Promise.all([run('acct:a', 20), run('acct:b', 5)]);
    expect([a, b]).toEqual(['acct:a', 'acct:b']);
  });

  it('is not undone by a request-style enterSpendOwner inside it', async () => {
    const seen = await runWithSpendOwner('acct:a', async () => {
      enterSpendOwner('acct:b');
      return currentSpendOwner();
    });
    expect(seen).toBe('acct:b');
    expect(currentSpendOwner()).toBeUndefined();
  });
});
