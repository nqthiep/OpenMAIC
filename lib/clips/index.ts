/**
 * The app's clip registry and provider over every subject pack (ARCHITECTURE §8b). With the review gate on, only the
 * clips whose signed panel review is on disk are known, exactly like the walkthroughs.
 * Server-side only: the provider hashes with node:crypto.
 */
import { createClipProvider } from '@/lib/clips/provider';
import { createClipRegistry, type ClipRegistry } from '@/lib/clips/registry';
import { isReviewRequired } from '@/lib/config/feature-flags';
import { SUBJECT_PACKS } from '@/lib/subjects';
import { releasedPacks } from '@/lib/subjects/release';

export const clipRegistry: ClipRegistry = createClipRegistry(
  isReviewRequired() ? releasedPacks(SUBJECT_PACKS) : SUBJECT_PACKS,
);
export const clipProvider = createClipProvider({ findClip: (id) => clipRegistry.findClip(id) });
