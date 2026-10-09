/**
 * The app's widget registry: the `walkthrough` provider over every subject pack (ADR 0013 decision 1).
 * Server-side only: the provider hashes with node:crypto.
 */
import { isReviewRequired } from '@/lib/config/feature-flags';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { releasedPacks } from '@/lib/subjects/release';
import { createWalkthroughProvider, getTutorLabels } from '@/lib/tutor/provider';
import { createWidgetRegistry, type WidgetRegistry } from '@/lib/widgets/registry';
import type { SubjectPack } from '@/lib/widgets/types';

/** A provider + registry over `packs` (a factory so the release filter is testable). */
export function createAppWidgetRegistry(packs: readonly SubjectPack[]) {
  const provider = createWalkthroughProvider({
    // the registry builds the id map; looked up lazily because the provider is an input to it
    findWalkthrough: (id) => registry.findWalkthrough(id),
    getLabels: getTutorLabels,
  });
  const registry: WidgetRegistry = createWidgetRegistry({
    providers: [provider],
    packs,
  });
  return { provider, registry };
}

// The release gate is read ONCE, when this module loads: the flag and the review files under lib/subjects/*/reviews/ are
// not looked at again, so a new review or a flipped OPENMAIC_REQUIRE_REVIEW takes effect after a restart (OPERATIONS §10).
const app = createAppWidgetRegistry(
  isReviewRequired() ? releasedPacks(SUBJECT_PACKS) : SUBJECT_PACKS,
);
export const walkthroughProvider = app.provider;
export const widgetRegistry: WidgetRegistry = app.registry;

export { describeWalkthrough } from '@/lib/widgets/describe';
export * from '@/lib/widgets/policy';
export { createWidgetRegistry, type WidgetRegistry } from '@/lib/widgets/registry';
export type * from '@/lib/widgets/types';
