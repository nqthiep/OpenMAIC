/**
 * Process-scoped startup work.
 *
 * Next calls `register` once per server instance, before it serves a request.
 * That makes it the only place in this app where a background schedule can
 * live: a route module has no such guarantee — it can be instantiated more than
 * once and gets no shutdown hook — so anything periodic started from one is
 * really started per instantiation.
 *
 * `register` must return before the server is ready, so nothing here may block
 * on I/O. Starting a timer does not.
 */
export async function register(): Promise<void> {
  // Also invoked for the Edge runtime, which has neither `pg` nor timers we
  // want; the persistence stack is Node-only.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Owner identity: a signed-in account is KHAITAM's own owner auth method. Registered first, so
  // it answers before the anonymous cookie; the shared-team method stays last so that
  // PERSISTENCE_SHARED_OWNER_ID keeps working (and fails startup only when it is malformed).
  const { configureOwnerAuthentication, sharedTeamAuthMethod } =
    await import('@/lib/server/identity');
  const { ownerAuthenticationIsConfigured } = await import('@/lib/server/identity/registry');
  if (!ownerAuthenticationIsConfigured()) {
    const { accountSessionAuthMethod } = await import('@/lib/server/identity/host/account-session');
    configureOwnerAuthentication({
      methods: [
        accountSessionAuthMethod,
        ...(process.env.PERSISTENCE_SHARED_OWNER_ID?.trim() ? [sharedTeamAuthMethod()] : []),
      ],
    });
  }

  const { warnIfAccessCodeIsUnset } = await import('@/lib/server/access-code-warning');
  warnIfAccessCodeIsUnset(process.env.ACCESS_CODE);

  // The asset quota, read here rather than at the first persistence request.
  // The provider that consumes it is lazy and memoised, so a malformed ceiling
  // would otherwise let the process boot, pass its health check, and then fail
  // every persistence request -- documents and runtime included -- until it was
  // fixed and the process restarted. `register` runs before the server is
  // ready, so throwing here is what makes a misconfigured deployment fail to
  // start instead of failing to work. First, so the throw cannot skip the
  // teardown registration for something this function has already started.
  const { resolveAssetQuotaBytes } = await import('@/lib/persistence/asset-quota');
  resolveAssetQuotaBytes();

  // The pending-allocation window, for the same reason and at the same moment.
  // Too short is worse than malformed: it silently expires allocations whose
  // document write was still coming, so it must fail the process rather than
  // the request that discovers it.
  const { resolveAssetPendingTtlMs } = await import('@/lib/persistence/asset-pending-ttl');
  resolveAssetPendingTtlMs();

  // Owner identity, for the same reason and at the same moment. A malformed
  // PERSISTENCE_SHARED_OWNER_ID, or one a host registration would ignore,
  // would otherwise boot, pass its health check, and then fail (or silently
  // mis-identify) every owner-scoped request — and an operator has no way to
  // tell from the outside that their setting was not accepted. An empty value
  // is treated as unset, so this only rejects values that are present and
  // unusable.
  //
  // A host that brings its own identity registers its owner auth methods
  // here, in the order they are asked, before validation and before the
  // server serves a request, and with them any host extension hooks (course
  // creation, library listing, upload admission, the asset byte store):
  //
  //   const { configureOwnerAuthentication } = await import('@/lib/server/identity');
  //   configureOwnerAuthentication({ methods: [myOwnerAuthMethod] });
  //   const { configurePersistenceHooks, configureAssetByteStore } =
  //     await import('@/lib/server/persistence-hooks');
  //   configurePersistenceHooks(myPersistenceHooks);
  //   configureAssetByteStore(myAssetByteStore);
  const { validateOwnerIdentityConfiguration } = await import('@/lib/server/identity/registry');
  validateOwnerIdentityConfiguration();

  // The registered hooks, for the same reason and at the same moment: a host
  // byte store that cannot sign under ASSET_BYTE_EGRESS=redirect would
  // otherwise be discovered by the first asset read.
  const { validatePersistenceHooksConfiguration } =
    await import('@/lib/server/persistence-hooks/registry');
  validatePersistenceHooksConfiguration();

  // Imported dynamically so the Edge bundle never pulls in `pg`.
  const { startAssetCollectorSchedule } =
    await import('@/lib/persistence/asset-collector-schedule');
  const assetSchedule = startAssetCollectorSchedule();

  // The AI provider settings live in the database. They are loaded here, bounded by a timeout, so
  // the first request does not meet an unloaded config; a database that is down at boot is retried
  // in the background and meanwhile provider lookups answer 503 (ProviderConfigNotReady). This is
  // the one place `register` waits on I/O: without these settings no AI route can work. Imported
  // dynamically so the Edge bundle never pulls in `pg`.
  const { startProviderSnapshot } = await import('@/lib/server/provider-store/boot');
  const stopProviderSnapshot = await startProviderSnapshot();

  // Warn-first boot-time validation of the provider settings (default model, model
  // routes, master key) and leftover environment config. Cheap and non-throwing:
  // broken config surfaces here as [config] warnings instead of failing at request
  // time. Imported dynamically so the Edge bundle never pulls in `fs`.
  const { validateServerConfig } = await import('@/lib/server/config-validation');
  validateServerConfig();

  let runner: import('@/lib/server/agent-runtime/runner').AgentRunnerHandle | undefined;
  let extractionRunner:
    | import('@/lib/server/material-extraction/runner').MaterialExtractionRunnerHandle
    | undefined;
  let stopAgentEventNotifyBus: (() => Promise<void>) | null = null;
  try {
    const { isAgentRuntimeConfigured } = await import('@/lib/config/feature-flags');
    if (isAgentRuntimeConfigured()) {
      // One dedicated LISTEN connection per application instance. The HTTP
      // SSE routes and the runner share its in-process fanout registry; it is
      // not a pool client and never scales with the number of streams.
      const { startAgentEventNotifyBus } =
        await import('@/lib/server/agent-runtime/event-notify-bus');
      const eventNotifyBus = startAgentEventNotifyBus();
      stopAgentEventNotifyBus = () => eventNotifyBus.stop();
      // startAgentRunner only installs a timer. Store/schema initialization is
      // retained behind the store's lazy promise and never blocks register().
      const runtime = await import('@/lib/server/agent-runtime/runner');
      runner = runtime.startAgentRunner();
      const extraction = await import('@/lib/server/material-extraction/runner');
      extractionRunner = extraction.startMaterialExtractionRunner();
    }
  } catch (error) {
    console.error('[instrumentation] Agent runtime startup failed', error);
  }

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    shutdownPromise ??= (async () => {
      // Park sessions before any pool they use is closed. This preserves the
      // last durable entry-tree checkpoint for immediate takeover.
      try {
        await extractionRunner?.stop();
      } catch (error) {
        console.error('[instrumentation] Material extraction runner drain failed', error);
      }
      try {
        await runner?.stop();
      } catch (error) {
        console.error('[instrumentation] Agent runner drain failed', error);
      }
      try {
        await stopAgentEventNotifyBus?.();
      } catch (error) {
        console.error('[instrumentation] Agent event notify bus drain failed', error);
      }
      try {
        await assetSchedule?.stop();
      } catch (error) {
        console.error('[instrumentation] Asset collector drain failed', error);
      }
      stopProviderSnapshot();
      const connectionString = process.env.DATABASE_URL?.trim();
      if (connectionString) {
        try {
          const { getServerPersistenceProvider } =
            await import('@/lib/persistence/server-provider');
          const { pool } = await getServerPersistenceProvider(connectionString);
          await pool.end();
        } catch (error) {
          console.error('[instrumentation] Persistence pool shutdown failed', error);
        }
      }
    })();
    return shutdownPromise;
  };

  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
