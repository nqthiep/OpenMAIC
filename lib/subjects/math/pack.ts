import { algIdentityAreaEntry } from '@/lib/subjects/math/catalog/alg-identity-area';
import { amgmSemicircleEntry } from '@/lib/subjects/math/catalog/amgm-semicircle';
import { cauchySchwarzEntry } from '@/lib/subjects/math/catalog/cauchy-schwarz';
import { csProjectionEntry } from '@/lib/subjects/math/catalog/cs-projection';
import { curveSketchingEntry } from '@/lib/subjects/math/catalog/curve-sketching';
import { triangleAltitudeEntry } from '@/lib/subjects/math/catalog/triangle-altitude';
import { euclidRectangleEntry } from '@/lib/subjects/math/catalog/euclid-rectangle';
import { geometricSeriesAreaEntry } from '@/lib/subjects/math/catalog/geometric-series-area';
import { pythagorasDissectionEntry } from '@/lib/subjects/math/catalog/pythagoras-dissection';
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
    algIdentityAreaEntry,
    pythagorasDissectionEntry,
    euclidRectangleEntry,
    geometricSeriesAreaEntry,
  ],
  // The Manim clips (lib/subjects/math/clips) are switched off, ADR 0015: the minh hoạ are walkthroughs now.
};
