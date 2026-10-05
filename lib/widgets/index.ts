/**
 * The app's widget registry: the `walkthrough` provider over every subject pack (ADR 0013 decision 1).
 * Server-side only: the provider hashes with node:crypto.
 */
import { SUBJECT_PACKS } from '@/lib/subjects';
import { createWalkthroughProvider, getTutorLabels } from '@/lib/tutor/provider';
import { createWidgetRegistry, type WidgetRegistry } from '@/lib/widgets/registry';

export const walkthroughProvider = createWalkthroughProvider({
  // the registry builds the id map; looked up lazily because the provider is an input to it
  findWalkthrough: (id) => widgetRegistry.findWalkthrough(id),
  getLabels: getTutorLabels,
});

export const widgetRegistry: WidgetRegistry = createWidgetRegistry({
  providers: [walkthroughProvider],
  packs: SUBJECT_PACKS,
});

export { describeWalkthrough } from '@/lib/widgets/describe';
export * from '@/lib/widgets/policy';
export { createWidgetRegistry, type WidgetRegistry } from '@/lib/widgets/registry';
export type * from '@/lib/widgets/types';
