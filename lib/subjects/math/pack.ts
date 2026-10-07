import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { triangleAltitudeEntry } from '@/lib/subjects/math/catalog/triangle-altitude';
import { mathClipModules } from '@/lib/subjects/math/clips';
import type { SubjectPack } from '@/lib/widgets/types';

export const mathPack: SubjectPack = {
  id: 'math',
  skillId: 'olympiad-math',
  walkthroughs: [cauchySchwarzEntry, triangleAltitudeEntry, curveSketchingEntry],
  clips: mathClipModules.map((m) => m.entry),
};
