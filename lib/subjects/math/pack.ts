import { algIdentityAreaEntry } from '@/lib/subjects/math/clips/alg-identity-area';
import { amgmSemicircleEntry } from '@/lib/subjects/math/clips/amgm-semicircle';
import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { concurrencyDynamicEntry } from '@/lib/subjects/math/clips/concurrency-dynamic';
import { convexChordEntry } from '@/lib/subjects/math/clips/convex-chord';
import { csProjectionEntry } from '@/lib/subjects/math/clips/cs-projection';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { figurateSumsEntry } from '@/lib/subjects/math/clips/figurate-sums';
import { graphTransformEntry } from '@/lib/subjects/math/clips/graph-transform';
import { inscribedAngleEntry } from '@/lib/subjects/math/clips/inscribed-angle';
import { limitEpsilonEntry } from '@/lib/subjects/math/clips/limit-epsilon';
import { secantTangentEntry } from '@/lib/subjects/math/clips/secant-tangent';
import { tilingColoringEntry } from '@/lib/subjects/math/clips/tiling-coloring';
import { triangleAltitudeEntry } from '@/lib/subjects/math/catalog/triangle-altitude';
import type { SubjectPack } from '@/lib/widgets/types';

export const mathPack: SubjectPack = {
  id: 'math',
  skillId: 'olympiad-math',
  walkthroughs: [cauchySchwarzEntry, triangleAltitudeEntry, curveSketchingEntry],
  clips: [
    algIdentityAreaEntry,
    amgmSemicircleEntry,
    concurrencyDynamicEntry,
    convexChordEntry,
    csProjectionEntry,
    figurateSumsEntry,
    graphTransformEntry,
    inscribedAngleEntry,
    limitEpsilonEntry,
    secantTangentEntry,
    tilingColoringEntry,
  ],
};
