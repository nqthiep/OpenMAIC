/**
 * Runs `onSignal` once when the process is asked to stop (SIGTERM or SIGINT).
 *
 * Node-only. `instrumentation.ts` imports this module dynamically inside its Node branch, so
 * the Edge analysis of `instrumentation.ts` never sees `process.once` (B55).
 */
export function onShutdownSignal(onSignal: () => void): void {
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}
