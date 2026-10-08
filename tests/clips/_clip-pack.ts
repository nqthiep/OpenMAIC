import { mathClipModules } from '@/lib/subjects/math/clips';
import { mathPack } from '@/lib/subjects/math/pack';
import type { SubjectPack } from '@/lib/widgets/types';

/**
 * The math pack with the (switched-off, ADR 0015) clips registered again: the tests of the clip subsystem need a pack that
 * carries them, and the product pack does not.
 */
export const mathClipPack: SubjectPack = {
  ...mathPack,
  clips: mathClipModules.map((m) => m.entry),
};
