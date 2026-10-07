/**
 * Clip registry (ARCHITECTURE §8b): clip ids are unique across every pack, so a bad pack fails at
 * startup and not at first use (same rule as the walkthrough registry).
 */
import type { AnyClipEntry } from '@/lib/clips/types';
import type { SubjectPack } from '@/lib/widgets/types';

export interface ClipRegistry {
  findClip(id: string): AnyClipEntry | undefined;
  clipIds(): string[];
  /** ids of the clips that have been rendered (at least one preset has its files); only those can be inserted */
  prebuiltIds(): string[];
}

export function createClipRegistry(
  packs: readonly Pick<SubjectPack, 'id' | 'clips'>[],
): ClipRegistry {
  const clips = new Map<string, { entry: AnyClipEntry; packId: string }>();
  for (const pack of packs) {
    for (const entry of pack.clips ?? []) {
      const prev = clips.get(entry.id);
      if (prev) {
        throw new Error(
          `duplicate clipId "${entry.id}" in packs "${prev.packId}" and "${pack.id}"`,
        );
      }
      clips.set(entry.id, { entry, packId: pack.id });
    }
  }
  return {
    findClip: (id) => clips.get(id)?.entry,
    clipIds: () => [...clips.keys()],
    prebuiltIds: () =>
      [...clips.values()]
        .filter(({ entry }) => entry.presets.some((p) => entry.asset(p.input, 'vi-VN') !== null))
        .map(({ entry }) => entry.id),
  };
}
