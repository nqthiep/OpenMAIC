import { cpPack } from '@/lib/subjects/cp/pack';
import { mathPack } from '@/lib/subjects/math/pack';
import type { SubjectPack } from '@/lib/widgets/types';

export const SUBJECT_PACKS: readonly SubjectPack[] = [cpPack, mathPack];
