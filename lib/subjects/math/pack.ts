import { algIdentityAreaEntry } from '@/lib/subjects/math/clips/alg-identity-area';
import { amgmSemicircleEntry } from '@/lib/subjects/math/clips/amgm-semicircle';
import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { concurrencyDynamicEntry } from '@/lib/subjects/math/clips/concurrency-dynamic';
import { convexChordEntry } from '@/lib/subjects/math/clips/convex-chord';
import { csProjectionEntry } from '@/lib/subjects/math/clips/cs-projection';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { euclidRectangleEntry } from '@/lib/subjects/math/clips/euclid-rectangle';
import { figurateSumsEntry } from '@/lib/subjects/math/clips/figurate-sums';
import { geometricSeriesAreaEntry } from '@/lib/subjects/math/clips/geometric-series-area';
import { graphTransformEntry } from '@/lib/subjects/math/clips/graph-transform';
import { inclusionExclusionEntry } from '@/lib/subjects/math/clips/inclusion-exclusion';
import { inductionFallacyEntry } from '@/lib/subjects/math/clips/induction-fallacy';
import { inscribedAngleEntry } from '@/lib/subjects/math/clips/inscribed-angle';
import { latticePathsEntry } from '@/lib/subjects/math/clips/lattice-paths';
import { limitEpsilonEntry } from '@/lib/subjects/math/clips/limit-epsilon';
import { modularClockEntry } from '@/lib/subjects/math/clips/modular-clock';
import { planeTransformEntry } from '@/lib/subjects/math/clips/plane-transform';
import { powerOfPointEntry } from '@/lib/subjects/math/clips/power-of-point';
import { pythagorasDissectionEntry } from '@/lib/subjects/math/clips/pythagoras-dissection';
import { riemannIntegralEntry } from '@/lib/subjects/math/clips/riemann-integral';
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
    euclidRectangleEntry,
    figurateSumsEntry,
    geometricSeriesAreaEntry,
    graphTransformEntry,
    inclusionExclusionEntry,
    inductionFallacyEntry,
    inscribedAngleEntry,
    latticePathsEntry,
    limitEpsilonEntry,
    modularClockEntry,
    planeTransformEntry,
    powerOfPointEntry,
    pythagorasDissectionEntry,
    riemannIntegralEntry,
    secantTangentEntry,
    tilingColoringEntry,
  ],
};
