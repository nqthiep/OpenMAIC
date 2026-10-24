/**
 * The owner a model call is charged to. requireSpender sets it for the rest of the request, so
 * usage records carry the owner without every LLM call site passing one through.
 *
 * `enterWith` affects the async chain that calls it and the work that chain starts afterwards.
 * Background jobs must set it again at their own start (see classroom-job-runner).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const spend = new AsyncLocalStorage<{ ownerId: string }>();

export function enterSpendOwner(ownerId: string): void {
  spend.enterWith({ ownerId });
}

/**
 * Runs `work` with `ownerId` as the spend owner, for it and what it starts, and for nothing else.
 * Background work that serves several owners from one loop (the generation runs) uses this: with
 * `enterSpendOwner` the owner would leak into the loop's next iteration.
 */
export function runWithSpendOwner<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  return spend.run({ ownerId }, work);
}

export function currentSpendOwner(): string | undefined {
  return spend.getStore()?.ownerId;
}
