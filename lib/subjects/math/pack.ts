import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import type { SubjectPack } from '@/lib/widgets/types';

export const mathPack: SubjectPack = {
  id: 'math',
  skillId: 'olympiad-math',
  walkthroughs: [cauchySchwarzEntry],
};
