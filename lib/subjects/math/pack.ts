import { algIdentityAreaEntry } from '@/lib/subjects/math/catalog/alg-identity-area';
import { amgmSemicircleEntry } from '@/lib/subjects/math/catalog/amgm-semicircle';
import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { csProjectionEntry } from '@/lib/subjects/math/catalog/cs-projection';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { triangleAltitudeEntry } from '@/lib/subjects/math/catalog/triangle-altitude';
import { euclidRectangleEntry } from '@/lib/subjects/math/catalog/euclid-rectangle';
import { figurateSumsEntry } from '@/lib/subjects/math/catalog/figurate-sums';
import { geometricSeriesAreaEntry } from '@/lib/subjects/math/catalog/geometric-series-area';
import { pythagorasDissectionEntry } from '@/lib/subjects/math/catalog/pythagoras-dissection';
import { inclusionExclusionEntry } from '@/lib/subjects/math/catalog/inclusion-exclusion';
import { inscribedAngleEntry } from '@/lib/subjects/math/catalog/inscribed-angle';
import { concurrencyDynamicEntry } from '@/lib/subjects/math/catalog/concurrency-dynamic';
import { planeTransformEntry } from '@/lib/subjects/math/catalog/plane-transform';
import { powerOfPointEntry } from '@/lib/subjects/math/catalog/power-of-point';
import { riemannIntegralEntry } from '@/lib/subjects/math/catalog/riemann-integral';
import { graphTransformEntry } from '@/lib/subjects/math/catalog/graph-transform';
import { convexChordEntry } from '@/lib/subjects/math/catalog/convex-chord';
import { secantTangentEntry } from '@/lib/subjects/math/catalog/secant-tangent';
import type { SubjectPack } from '@/lib/widgets/types';

export const mathPack: SubjectPack = {
  id: 'math',
  skillId: 'olympiad-math',
  walkthroughs: [
    cauchySchwarzEntry,
    triangleAltitudeEntry,
    curveSketchingEntry,
    amgmSemicircleEntry,
    csProjectionEntry,
    secantTangentEntry,
    convexChordEntry,
    graphTransformEntry,
    riemannIntegralEntry,
    inscribedAngleEntry,
    powerOfPointEntry,
    planeTransformEntry,
    concurrencyDynamicEntry,
    figurateSumsEntry,
    inclusionExclusionEntry,
    algIdentityAreaEntry,
    pythagorasDissectionEntry,
    euclidRectangleEntry,
    geometricSeriesAreaEntry,
  ],
  // The Manim clips (lib/subjects/math/clips) are switched off, ADR 0015: the minh hoạ are walkthroughs now.
};
