/**
 * Widget registry (ADR 0013 decision 1): one provider per scene, unique walkthrough ids.
 * Throws at creation on duplicates so a bad pack fails at startup, not at first use.
 */
import type { Scene } from '@openmaic/dsl';
import type { AnyWalkthroughEntry, SubjectPack, WidgetProvider } from '@/lib/widgets/types';

export interface WidgetRegistry {
  /** null when no provider claims the scene; throws when more than one does. */
  providerForScene(scene: Scene): WidgetProvider | null;
  findWalkthrough(id: string): AnyWalkthroughEntry | undefined;
  walkthroughIds(): string[];
}

export function createWidgetRegistry(opts: {
  providers: readonly WidgetProvider[];
  packs: readonly SubjectPack[];
}): WidgetRegistry {
  const providerIds = new Set<string>();
  for (const p of opts.providers) {
    if (providerIds.has(p.id)) throw new Error(`duplicate widget provider id: ${p.id}`);
    providerIds.add(p.id);
  }

  const walkthroughs = new Map<string, { entry: AnyWalkthroughEntry; packId: string }>();
  for (const pack of opts.packs) {
    for (const entry of pack.walkthroughs) {
      const prev = walkthroughs.get(entry.id);
      if (prev) {
        throw new Error(
          `duplicate walkthroughId "${entry.id}" in packs "${prev.packId}" and "${pack.id}"`,
        );
      }
      walkthroughs.set(entry.id, { entry, packId: pack.id });
    }
  }

  return {
    providerForScene(scene) {
      const claimers = opts.providers.filter((p) => p.claimsScene(scene));
      if (claimers.length > 1) {
        throw new Error(
          `scene "${scene.id}" claimed by multiple providers: ${claimers.map((p) => p.id).join(', ')}`,
        );
      }
      return claimers[0] ?? null;
    },
    findWalkthrough: (id) => walkthroughs.get(id)?.entry,
    walkthroughIds: () => [...walkthroughs.keys()],
  };
}
