import { algIdentityAreaEntry } from '@/lib/subjects/math/clips/alg-identity-area';
import { amgmSemicircleEntry } from '@/lib/subjects/math/clips/amgm-semicircle';
import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { csProjectionEntry } from '@/lib/subjects/math/clips/cs-projection';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { figurateSumsEntry } from '@/lib/subjects/math/clips/figurate-sums';
import { secantTangentEntry } from '@/lib/subjects/math/clips/secant-tangent';
import { triangleAltitudeEntry } from '@/lib/subjects/math/catalog/triangle-altitude';
import type { SubjectPack } from '@/lib/widgets/types';

export const mathPack: SubjectPack = {
  id: 'math',
  skillId: 'olympiad-math',
  walkthroughs: [cauchySchwarzEntry, triangleAltitudeEntry, curveSketchingEntry],
  clips: [
    algIdentityAreaEntry,
    amgmSemicircleEntry,
    csProjectionEntry,
    figurateSumsEntry,
    secantTangentEntry,
  ],
};
