/**
 * The app's clip registry and provider over every subject pack (ARCHITECTURE §8b).
 * Server-side only: the provider hashes with node:crypto.
 */
import { createClipProvider } from '@/lib/clips/provider';
import { createClipRegistry, type ClipRegistry } from '@/lib/clips/registry';
import { SUBJECT_PACKS } from '@/lib/subjects';

export const clipRegistry: ClipRegistry = createClipRegistry(SUBJECT_PACKS);
export const clipProvider = createClipProvider({ findClip: (id) => clipRegistry.findClip(id) });
