/**
 * L3 of the code-widget block (ADR 0010 decision 5): classic generation never
 * emits a `code` widget while the deployment blocks it.
 *
 * Lives next to the outline route (not inside route.ts: Next.js route modules
 * may only export handlers/config) and is shared with `scene-content`, whose
 * outline comes from the client.
 */

import { isCodeWidgetAllowed } from '@/lib/config/feature-flags';
import type { SceneOutline, WidgetOutline } from '@/lib/types/generation';
import type { WidgetType } from '@/lib/types/widgets';
import { coerceCodeWidgetType } from '@/lib/widgets/policy';

// Mirrors the first two rules of `inferWidgetType` in
// packages/@openmaic/generation/src/scene-generator.ts (not exported), which
// turns a legacy `interactiveConfig` outline into `code` at generation time.
const LEGACY_SIMULATION_RE =
  /physics|chemistry|力学|化学|运动|反应|force|motion|equilibrium|wave|电路|circuit/;
const LEGACY_CODE_RE = /programming|code|algorithm|编程|算法|python|javascript|function|代码/;

function legacyConfigInfersCode(config: NonNullable<SceneOutline['interactiveConfig']>): boolean {
  const text = (
    (config.subject || '') +
    ' ' +
    config.conceptName +
    ' ' +
    (config.designIdea || '')
  ).toLowerCase();
  return !LEGACY_SIMULATION_RE.test(text) && LEGACY_CODE_RE.test(text);
}

/**
 * While `code` is blocked, turn an outline that would generate a `code` widget
 * into a `simulation` one. Never returns `null`; an outline that is not
 * affected (or any outline when the flag is on) is returned as-is.
 */
export function coerceCodeOutline(outline: SceneOutline): SceneOutline {
  if (isCodeWidgetAllowed()) return outline;

  const widgetOutline = outline.widgetOutline as
    | (WidgetOutline & { widgetType?: string })
    | undefined;
  const target = coerceCodeWidgetType('code') as WidgetType;
  const outerCode = outline.widgetType === 'code';
  const legacyCode =
    outline.type === 'interactive' &&
    !outline.widgetType &&
    !!outline.interactiveConfig &&
    legacyConfigInfersCode(outline.interactiveConfig);

  if (outerCode || legacyCode) {
    // Keep only the shared field, like the outline editor does on a kind change:
    // code-only fields (language, challengeType) must not leak into the new kind.
    const concept =
      widgetOutline?.concept ?? outline.interactiveConfig?.conceptName ?? outline.title;
    return { ...outline, widgetType: target, widgetOutline: { concept } };
  }
  if (widgetOutline?.widgetType === 'code') {
    return {
      ...outline,
      widgetOutline: { ...widgetOutline, widgetType: target } as WidgetOutline,
    };
  }
  return outline;
}
