/**
 * Widget policy: pure helpers deciding whether "code" widgets may be shown or generated.
 * No env access; never throws on unexpected data.
 */

export const CODE_WIDGET_HINT =
  'Widget "code" is blocked on this deployment (no student code editor). Use generate_walkthrough for algorithm traces, or simulation/diagram/game/visualization3d.';

export interface PolicyError {
  readonly error: 'code-widget-blocked';
  readonly hint: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function isInteractive(content: unknown): Record<string, unknown> | null {
  const c = asRecord(content);
  return c && c.type === 'interactive' ? c : null;
}

export function isCodeWidget(content: unknown): boolean {
  const c = isInteractive(content);
  if (!c) return false;
  return c.widgetType === 'code' || asRecord(c.widgetConfig)?.type === 'code';
}

export function isWalkthroughContent(content: unknown): boolean {
  const c = isInteractive(content);
  return !!c && asRecord(c.widgetConfig)?.kind === 'walkthrough';
}

export function isWalkthroughScene(scene: unknown): boolean {
  return isWalkthroughContent(asRecord(scene)?.content);
}

export function assertScenePolicy(
  scene: unknown,
  opts: { codeAllowed: boolean },
): PolicyError | null {
  if (opts.codeAllowed) return null;
  if (isCodeWidget(asRecord(scene)?.content)) {
    return { error: 'code-widget-blocked', hint: CODE_WIDGET_HINT };
  }
  return null;
}

export function decideInteractiveMount(
  content: unknown,
  codeAllowed: boolean | undefined,
): 'mount' | 'blocked' {
  return isCodeWidget(content) && codeAllowed !== true ? 'blocked' : 'mount';
}

export function coerceCodeWidgetType(t: string): string {
  return t === 'code' ? 'simulation' : t;
}
