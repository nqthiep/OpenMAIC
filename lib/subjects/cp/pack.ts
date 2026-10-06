import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import { bsAnswerEntry } from '@/lib/subjects/cp/catalog/bs-answer';
import { bsAnswerMiniEntry } from '@/lib/subjects/cp/catalog/bs-answer-mini';
import { fibRecursionTreeEntry } from '@/lib/subjects/cp/catalog/fib-recursion-tree';
import { mergeSortEntry } from '@/lib/subjects/cp/catalog/merge-sort';
import { nQueensEntry } from '@/lib/subjects/cp/catalog/n-queens';
import { prefixSumEntry } from '@/lib/subjects/cp/catalog/prefix-sum';
import { quickSortEntry } from '@/lib/subjects/cp/catalog/quick-sort';
import { stackQueueEntry } from '@/lib/subjects/cp/catalog/stack-queue';
import { subsetGenEntry } from '@/lib/subjects/cp/catalog/subset-gen';
import { twoPointersEntry } from '@/lib/subjects/cp/catalog/two-pointers';
import type { SubjectPack } from '@/lib/widgets/types';

export const cpPack: SubjectPack = {
  id: 'cp',
  skillId: 'competitive-programming',
  walkthroughs: [
    binarySearchEntry,
    bsAnswerMiniEntry,
    prefixSumEntry,
    twoPointersEntry,
    stackQueueEntry,
    fibRecursionTreeEntry,
    quickSortEntry,
    mergeSortEntry,
    subsetGenEntry,
    nQueensEntry,
    bsAnswerEntry,
  ],
};
