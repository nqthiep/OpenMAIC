import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import { bsAnswerMiniEntry } from '@/lib/subjects/cp/catalog/bs-answer-mini';
import type { SubjectPack } from '@/lib/widgets/types';

export const cpPack: SubjectPack = {
  id: 'cp',
  skillId: 'competitive-programming',
  walkthroughs: [binarySearchEntry, bsAnswerMiniEntry],
};
