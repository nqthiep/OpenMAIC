import { activitySelectionEntry } from '@/lib/subjects/cp/catalog/activity-selection';
import { bfsEntry } from '@/lib/subjects/cp/catalog/bfs';
import { binarySearchEntry } from '@/lib/subjects/cp/catalog/binary-search';
import { bitSubsetsEntry } from '@/lib/subjects/cp/catalog/bit-subsets';
import { bsAnswerEntry } from '@/lib/subjects/cp/catalog/bs-answer';
import { bsAnswerMiniEntry } from '@/lib/subjects/cp/catalog/bs-answer-mini';
import { dfsEntry } from '@/lib/subjects/cp/catalog/dfs';
import { dijkstraEntry } from '@/lib/subjects/cp/catalog/dijkstra';
import { dijkstraCouponEntry } from '@/lib/subjects/cp/catalog/dijkstra-coupon';
import { dpBitmaskEntry } from '@/lib/subjects/cp/catalog/dp-bitmask';
import { dpTreeEntry } from '@/lib/subjects/cp/catalog/dp-tree';
import { dsuEntry } from '@/lib/subjects/cp/catalog/dsu';
import { euclidGcdEntry } from '@/lib/subjects/cp/catalog/euclid-gcd';
import { fenwickEntry } from '@/lib/subjects/cp/catalog/fenwick';
import { fibRecursionTreeEntry } from '@/lib/subjects/cp/catalog/fib-recursion-tree';
import { hashCountEntry } from '@/lib/subjects/cp/catalog/hash-count';
import { knapsack01Entry } from '@/lib/subjects/cp/catalog/knapsack-01';
import { kruskalEntry } from '@/lib/subjects/cp/catalog/kruskal';
import { lcsEntry } from '@/lib/subjects/cp/catalog/lcs';
import { lisEntry } from '@/lib/subjects/cp/catalog/lis';
import { mergeSortEntry } from '@/lib/subjects/cp/catalog/merge-sort';
import { minTotalWaitEntry } from '@/lib/subjects/cp/catalog/min-total-wait';
import { nQueensEntry } from '@/lib/subjects/cp/catalog/n-queens';
import { prefixSumEntry } from '@/lib/subjects/cp/catalog/prefix-sum';
import { quickSortEntry } from '@/lib/subjects/cp/catalog/quick-sort';
import { segmentTreeEntry } from '@/lib/subjects/cp/catalog/segment-tree';
import { sieveEntry } from '@/lib/subjects/cp/catalog/sieve';
import { stackQueueEntry } from '@/lib/subjects/cp/catalog/stack-queue';
import { stringScanEntry } from '@/lib/subjects/cp/catalog/string-scan';
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
    sieveEntry,
    euclidGcdEntry,
    bitSubsetsEntry,
    activitySelectionEntry,
    stringScanEntry,
    hashCountEntry,
    bfsEntry,
    dfsEntry,
    knapsack01Entry,
    lcsEntry,
    lisEntry,
    minTotalWaitEntry,
    dsuEntry,
    kruskalEntry,
    dijkstraEntry,
    segmentTreeEntry,
    fenwickEntry,
    dpTreeEntry,
    dpBitmaskEntry,
    dijkstraCouponEntry,
  ],
};
