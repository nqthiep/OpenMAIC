/**
 * Feature flags. Public flags come from `NEXT_PUBLIC_*` env vars, which
 * Next.js inlines at build time so they are safe to read from client
 * components. Server-only flags must not use the `NEXT_PUBLIC_` prefix.
 *
 * Truthy values: `'true'` or `'1'`. Unless a flag documents a different
 * default, anything else (including unset) is treated as disabled.
 */

function readBoolean(envValue: string | undefined): boolean {
  return envValue === 'true' || envValue === '1';
}

function readDefaultOnBoolean(envValue: string | undefined): boolean {
  return envValue === undefined || envValue === '' || readBoolean(envValue);
}

/**
 * Tutor answer mode on walkthrough scenes (server-only: the chat prompts are built on the
 * server). Default ON: the teacher opens with a question or a hint and only states the answer
 * when the student asks for it (WALKTHROUGH_ANSWER_POLICY). `OPENMAIC_TUTOR_HINT_FIRST=false`
 * (or `0`) restores the generic "lead with the direct answer" behaviour. Other scene types are
 * unaffected either way.
 */
export function isTutorHintFirstEnabled(): boolean {
  return readDefaultOnBoolean(process.env.OPENMAIC_TUTOR_HINT_FIRST);
}

/**
 * Server-only gate for durable background agent execution. This is evaluated
 * at process runtime and is never exposed to the browser bundle.
 */
export function isAgentRuntimeEnabled(): boolean {
  return readBoolean(process.env.OPENMAIC_AGENT_RUNTIME_ENABLED);
}

/** The Node runtime can start the runner only with a non-empty database URL. */
export function isAgentRuntimeConfigured(): boolean {
  return isAgentRuntimeEnabled() && Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Server-side persistence is available: documents, runtime rows and assets are
 * durable and owner-scoped. This is the same condition the persistence route
 * itself keys on, and it is strictly weaker than
 * {@link isAgentRuntimeConfigured} — every deployment that runs the agent
 * runtime also has persistence, but persistence runs perfectly well without it.
 *
 * Anything that describes a persisted course (who owns it, whether it is
 * published) must gate on THIS, not on the agent runtime: the persistence
 * route resolves an owner for every request and the owner-bound document store
 * records one for every course, so those facts exist whether or not the runtime
 * is enabled.
 *
 * The course library and folder routes (`/api/stages/**`, `/api/folders/**`)
 * gate on this too: they need the database and nothing the runtime adds.
 */
export function isServerPersistenceConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Build-time workbench affordance. This public flag is separate from the
 * server runtime gate because Next.js inlines NEXT_PUBLIC values into client
 * bundles; both gates must be on before a workbench page is reachable.
 */
export function isProWorkbenchEnabled(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_PRO_WORKBENCH_ENABLED);
}

/**
 * MAIC Editor (Pro mode) gate. Default OFF — gates only the Pro toggle
 * affordance in `Header`. The `StageMode` type union is unaffected so
 * existing code paths typecheck identically with the flag in either
 * state.
 *
 * Implied by the Pro workbench flag: the workbench IS Pro mode, and a
 * workbench build without the editor toggle has no way to edit a course.
 * The standalone flag remains for deployments that want the classroom
 * editor without the workbench.
 */
export function isMaicEditorEnabled(): boolean {
  return isProWorkbenchEnabled() || readBoolean(process.env.NEXT_PUBLIC_MAIC_EDITOR_ENABLED);
}

/**
 * Experimental playback canvas renderer. Default OFF so classroom playback uses
 * the legacy in-app renderer unless explicitly enabled in `.env.local`.
 */
export function isPlaybackRendererEnabled(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_MAIC_PLAYBACK_RENDERER_ENABLED);
}

/**
 * Experimental Pro-mode slide editor renderer. Default OFF so professional
 * editing keeps using the legacy in-app editor canvas unless explicitly enabled
 * in `.env.local`.
 */
export function isEditorRendererEnabled(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_MAIC_EDITOR_RENDERER_ENABLED);
}

/**
 * Pi-based classroom chat runtime. Default ON. The same public flag selects
 * the client runtime and gates the corresponding server route. Operators can
 * set it to `false` or `0` and rebuild to roll back to the legacy runtime.
 * next.config.ts pins the default too, so runtime-only overrides cannot split
 * the built client's choice from the server route gate.
 */
export function isPiChatEnabled(): boolean {
  return readDefaultOnBoolean(process.env.NEXT_PUBLIC_PI_CHAT_ENABLED);
}

/**
 * Unified playback courseware-reference gate for PPT and Interactive scenes.
 * Default OFF and independently disableable while Pi chat remains available.
 */
export function isCoursewareReferenceEnabled(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_COURSEWARE_REFERENCE_ENABLED);
}

/**
 * Server-only selector for the Pi Child execution harness. Default OFF keeps
 * the existing Legacy JSON-action Child runtime.
 */
export function isPiNativeChildRuntimeEnabled(): boolean {
  return readBoolean(process.env.OPENMAIC_ENABLE_PI_NATIVE_CHILD_RUNTIME);
}

/**
 * Server-only capability gate for Native Child Spotlight. This flag never
 * selects the Child runtime and has no effect while the Legacy harness is used.
 */
export function isPiNativeChildSpotlightEnabled(): boolean {
  return readBoolean(process.env.OPENMAIC_ENABLE_PI_NATIVE_CHILD_SPOTLIGHT);
}

/**
 * Server-authoritative gate for the vocational task-engine generation path.
 * Default OFF. When disabled, requests that include taskEngineMode must
 * silently fall back to the ordinary standard / interactive generation paths.
 */
export function isVocationalTaskEngineEnabled(): boolean {
  return readBoolean(process.env.OPENMAIC_ENABLE_VOCATIONAL);
}

export function resolveVocationalActive(
  requirements?: { taskEngineMode?: boolean } | null,
): boolean {
  return Boolean(requirements?.taskEngineMode) && isVocationalTaskEngineEnabled();
}

/**
 * Optional client-only affordance for exposing the experimental vocational
 * test toggle. This is not a security or routing gate.
 */
export function shouldShowVocationalTestUi(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_SHOW_VOCATIONAL_TEST_UI);
}

/**
 * Experimental classroom video export (Hyperframes composition ZIP, #865).
 * Default OFF — gates only the "Export Video" affordance in the export menu.
 * The emitter/compiler code paths are unaffected; this hides the UI entry
 * point until the render pipeline (#866) lands.
 */
export function isVideoExportEnabled(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_ENABLE_VIDEO_EXPORT);
}

/** Experimental PPTX import entry point. Default OFF. */
export function isPptxImportEnabled(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_ENABLE_PPTX_IMPORT);
}

/**
 * Server-only gate for the student-code widget ("code" widget type). Default
 * OFF: the widget is blocked on a deployment unless this is set explicitly.
 */
export function isCodeWidgetAllowed(): boolean {
  return readBoolean(process.env.OPENMAIC_ALLOW_CODE_WIDGET);
}

/**
 * Server-only gate for the tutor content filter on `/api/chat` (INTERFACES 8.1). Default OFF:
 * chat behaves exactly as before. When ON, every chat turn goes through the filter and it is
 * fail-closed (a missing `tutor-moderation` route blocks chat with a safe message). Tutor
 * deployments are dedicated deployments, so this is a per-deployment switch, not per-request.
 */
export function isTutorModerationEnabled(): boolean {
  return readBoolean(process.env.OPENMAIC_TUTOR_MODERATION);
}

/** Server-only kill-switch that disables all widget providers. Default OFF. */
export function isWidgetProvidersDisabled(): boolean {
  return readBoolean(process.env.OPENMAIC_DISABLE_WIDGET_PROVIDERS);
}

/**
 * Student deployment (`OPENMAIC_HOME=learn`), read on the server: `/` opens the lesson picker. Boot
 * checks the learner-facing settings (lib/server/config-validation.ts).
 */
export function isLearnHome(): boolean {
  return process.env.OPENMAIC_HOME === 'learn';
}

/**
 * The student deployment as built into the browser bundle. The Settings button is a client component
 * and cannot read `OPENMAIC_HOME`, so the build sets this too. Boot refuses a student deployment whose
 * build lacks it.
 */
export function isLearnHomeBuild(): boolean {
  return process.env.NEXT_PUBLIC_OPENMAIC_HOME === 'learn';
}

/**
 * Server-only release gate for subject catalog entries (INTERFACES 8.2). Default OFF: dev, tests and
 * e2e expose every entry. A release deployment sets it, and then only entries with a passing review
 * for their exact entryRev are exposed (`lib/subjects/release.ts`). A student deployment keeps it on
 * unless the flag is explicitly `false` or `0`; boot warns about that override.
 */
export function isReviewRequired(): boolean {
  const value = process.env.OPENMAIC_REQUIRE_REVIEW;
  if (isLearnHome()) return value !== 'false' && value !== '0';
  return readBoolean(value);
}
