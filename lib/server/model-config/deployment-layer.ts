/**
 * The deployment layer for slot resolution (RFC #1701, tracked in #1725).
 *
 * `openmaic.yml` (or the file named by OPENMAIC_CONFIG) is the deployment
 * layer when it exists. KHAITAM patch point: otherwise the layer is built from
 * the provider store, which an administrator edits in the settings popup (see
 * provider-store-layer.ts): the providers, the default model as a server
 * default, and the stage routes as locked slots. The legacy provider variables,
 * DEFAULT_MODEL and MODEL_ROUTES are not read.
 */
import { translateProviderSnapshot } from '@/lib/server/model-config/provider-store-layer';
import { currentSnapshot, isProviderSnapshotLoaded } from '@/lib/server/provider-store/snapshot';
import { loadModelConfigFile, type SlotAssignment } from '@/lib/server/model-config/openmaic-yml';
import type { ModelConfigLayer } from '@/lib/server/model-config/resolve-slot';
import type { LlmStage } from '@/lib/server/model-routes';

export interface DeploymentLayer {
  /** Providers, server defaults and locks: openmaic.yml, or the legacy configuration. */
  layer: ModelConfigLayer | null;
  /**
   * The layer was translated from the legacy variables: media routes keep
   * applying the legacy model pins to what it assigns.
   */
  legacy: boolean;
  /**
   * KHAITAM patch point: the deployment layer as one stage sees it, for a stage whose own route
   * differs from the route of another stage on the same slot (see provider-store-layer.ts).
   */
  stageLayers?: Partial<Record<LlmStage, ModelConfigLayer>>;
  /** How the layer was built, and what did not carry over. */
  notices: string[];
}

export class LegacyRoutesError extends Error {
  constructor() {
    super(
      'MODEL_ROUTES does not carry over to the model configuration: write the per-stage models as slots in openmaic.yml (or the file named by OPENMAIC_CONFIG) and remove MODEL_ROUTES',
    );
    this.name = 'LegacyRoutesError';
  }
}

/** Whether the provider store holds anything: a provider, a switch, a default model or a route. */
function storeHasConfiguration(): boolean {
  const { config: server, routing } = currentSnapshot();
  const sections = [
    server.providers,
    server.tts,
    server.asr,
    server.pdf,
    server.image,
    server.video,
    server.webSearch,
  ];
  return (
    sections.some((section) => Object.keys(section).length > 0) ||
    Object.values(server.disabled).some((ids) => ids.size > 0) ||
    !!routing.defaultModel ||
    Object.keys(routing.routes).length > 0
  );
}

/**
 * KHAITAM patch point: the legacy variables (providers, DEFAULT_MODEL, MODEL_ROUTES, MODEL_FALLBACK)
 * are not read. The deployment's configuration is openmaic.yml when the file exists, else the
 * provider store (see provider-store-layer.ts). Reading the store throws ProviderConfigNotReady
 * while a configured database is not loaded yet; the result is not cached then (see runtime.ts).
 */
export function loadDeploymentLayer(): DeploymentLayer {
  const file = loadModelConfigFile();
  if (file) {
    return {
      layer: { source: 'deployment', config: file },
      legacy: false,
      notices:
        isProviderSnapshotLoaded() && storeHasConfiguration()
          ? [
              'openmaic.yml is present, so slot resolution uses it and not the providers and routes saved in the settings',
            ]
          : [],
    };
  }
  if (!storeHasConfiguration()) return { layer: null, legacy: false, notices: [] };
  const { config, routeSlots, stageOverrides, notices } =
    translateProviderSnapshot(currentSnapshot());
  const providers = config.providers;
  const hasRoutes = Object.keys(routeSlots).length > 0;
  // The administrator's routes are fixed for everyone (`lock`); the default model and the first
  // provider of each media capability are server defaults. Only an administrator configures
  // providers (decision D3), in the settings popup, so users may not add keys of their own.
  const layerWith = (routed: Record<string, SlotAssignment>): ModelConfigLayer => {
    const slots = { ...config.slots, ...routed };
    return {
      source: 'deployment',
      config: {
        ...(providers ? { providers } : {}),
        ...(Object.keys(slots).length ? { slots } : {}),
        ...(Object.keys(routed).length ? { lock: Object.keys(routed) } : {}),
        allowUserKeys: false,
      },
    };
  };
  const layer = providers || hasRoutes ? layerWith(routeSlots) : null;
  const stageLayers: Partial<Record<LlmStage, ModelConfigLayer>> = {};
  for (const [stage, override] of Object.entries(stageOverrides)) {
    stageLayers[stage as LlmStage] = layerWith({
      ...routeSlots,
      [override.slot]: override.assignment,
    });
  }
  return {
    layer,
    legacy: false,
    ...(Object.keys(stageLayers).length ? { stageLayers } : {}),
    notices,
  };
}
