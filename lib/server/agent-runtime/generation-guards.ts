import type { Scene as DslScene } from '@openmaic/dsl';
import type { Action } from '@/lib/types/action';
import type { Scene } from '@/lib/types/stage';
import { isCodeWidgetAllowed, isTutorModerationEnabled } from '@/lib/config/feature-flags';
import { resolveLocale } from '@/lib/tutor/locale';
import { assertScenePolicy, isWalkthroughScene } from '@/lib/widgets/policy';
import { widgetRegistry } from '@/lib/widgets';
import { moderateScene } from './content-moderation';

/**
 * Tutor-specific guards for the page tools in `generation-tools.ts`. Kept out of
 * that file so upstream's tool bodies carry one call per guard, not the logic.
 */

/** A refusal the tool returns to the agent: the message and the details it gets. */
export interface GuardRejection {
  message: string;
  details: Record<string, unknown>;
}

const WALKTHROUGH_STALE_HINT = 'call generate_walkthrough to rebuild this page';

type Language = Parameters<typeof resolveLocale>[0];

function walkthroughProvider(scene: Scene) {
  return widgetRegistry.providerForScene(scene as unknown as DslScene);
}

/** generate_scene must not mint a walkthrough: those come from generate_walkthrough. */
export function walkthroughOutlineRejection(widgetOutline: unknown): GuardRejection | undefined {
  const walkthroughId = (widgetOutline as { walkthroughId?: unknown } | undefined)?.walkthroughId;
  if (walkthroughId === undefined) return undefined;
  return {
    message: 'Walkthrough pages are built by generate_walkthrough, not generate_scene.',
    details: { error: 'use-generate-walkthrough', validIds: widgetRegistry.walkthroughIds() },
  };
}

/**
 * Policy and content filter for a page generate_scene is about to write. Drops a
 * `kind` the LLM put in a walkthrough config, so only generate_walkthrough mints one.
 */
export async function screenNewScene(
  scene: Scene,
  languageDirective: Language,
): Promise<GuardRejection | undefined> {
  if (isWalkthroughScene(scene)) {
    delete (scene.content as unknown as { widgetConfig: { kind?: unknown } }).widgetConfig.kind;
  }
  const blocked = assertScenePolicy(scene, { codeAllowed: isCodeWidgetAllowed() });
  if (blocked) {
    return {
      message: 'Widget "code" is blocked; nothing was written.',
      details: { ...blocked },
    };
  }
  return contentFilter(scene, languageDirective);
}

/** Policy check for a page duplicate_scene is about to copy. */
export function screenCopiedScene(template: Scene): GuardRejection | undefined {
  const blocked = assertScenePolicy(template, { codeAllowed: isCodeWidgetAllowed() });
  if (!blocked) return undefined;
  return {
    message: 'Widget "code" is blocked; nothing was copied.',
    details: { ...blocked },
  };
}

/** A walkthrough page whose catalog entry has changed must be rebuilt before its actions. */
export function walkthroughStaleRejection(scene: Scene): GuardRejection | undefined {
  const provider = walkthroughProvider(scene);
  if (!provider?.isStale?.(scene as unknown as DslScene)) return undefined;
  return {
    message: 'This page no longer matches the catalog; nothing was written.',
    details: { error: 'walkthrough-stale', hint: WALKTHROUGH_STALE_HINT },
  };
}

/** Walkthrough actions come from the catalog (undefined for other pages). */
export function walkthroughActions(scene: Scene): Action[] | undefined {
  const provider = walkthroughProvider(scene);
  // the scene's own locale wins inside the provider; en-US only backs a missing one
  return provider?.actions(scene as unknown as DslScene, { locale: 'en-US' }) as
    | Action[]
    | undefined;
}

/**
 * Content filter for actions generate_actions produced. Walkthrough actions come
 * from the catalog, not the model, so they are not screened.
 */
export async function screenGeneratedActions(
  scene: Scene,
  languageDirective: Language,
): Promise<GuardRejection | undefined> {
  if (walkthroughProvider(scene)) return undefined;
  return contentFilter(scene, languageDirective);
}

/**
 * Actions for a duplicated page. A walkthrough copy keeps its narration: the
 * actions are rebuilt from the catalog when current, else the old ones are kept
 * (never the new catalog mixed with old html). Other pages get none.
 */
export function copiedActions(template: Scene): Action[] {
  const provider = walkthroughProvider(template);
  if (!provider) return [];
  if (provider.isStale?.(template as unknown as DslScene)) {
    return structuredClone(template.actions ?? []);
  }
  return provider.actions(template as unknown as DslScene, { locale: 'en-US' }) as Action[];
}

async function contentFilter(
  scene: Scene,
  languageDirective: Language,
): Promise<GuardRejection | undefined> {
  if (!isTutorModerationEnabled()) return undefined;
  const flagged = await moderateScene(scene, { locale: resolveLocale(languageDirective) });
  if (!flagged) return undefined;
  return {
    message: 'Generated text was blocked by the content filter; nothing was written.',
    details: { ...flagged },
  };
}
