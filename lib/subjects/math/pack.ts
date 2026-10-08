import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { triangleAltitudeEntry } from '@/lib/subjects/math/catalog/triangle-altitude';
import type { SubjectPack } from '@/lib/widgets/types';

export const mathPack: SubjectPack = {
  id: 'math',
  skillId: 'olympiad-math',
  walkthroughs: [cauchySchwarzEntry, triangleAltitudeEntry, curveSketchingEntry],
  // The Manim clips (lib/subjects/math/clips) are switched off, ADR 0015: the minh hoạ are walkthroughs now.
};
