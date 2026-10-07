/**
 * Every math clip template (the TypeScript half). The render script (task 3A-07) needs the modules, not only the
 * entries, because it checks the numbers a scene draws against `expectedDisplay`.
 */
import type { ClipModule } from '@/lib/clips/types';
import algIdentityArea from '@/lib/subjects/math/clips/alg-identity-area';
import amgmSemicircle from '@/lib/subjects/math/clips/amgm-semicircle';
import concurrencyDynamic from '@/lib/subjects/math/clips/concurrency-dynamic';
import convexChord from '@/lib/subjects/math/clips/convex-chord';
import csProjection from '@/lib/subjects/math/clips/cs-projection';
import euclidRectangle from '@/lib/subjects/math/clips/euclid-rectangle';
import figurateSums from '@/lib/subjects/math/clips/figurate-sums';
import geometricSeriesArea from '@/lib/subjects/math/clips/geometric-series-area';
import graphTransform from '@/lib/subjects/math/clips/graph-transform';
import inclusionExclusion from '@/lib/subjects/math/clips/inclusion-exclusion';
import inductionFallacy from '@/lib/subjects/math/clips/induction-fallacy';
import inscribedAngle from '@/lib/subjects/math/clips/inscribed-angle';
import latticePaths from '@/lib/subjects/math/clips/lattice-paths';
import limitEpsilon from '@/lib/subjects/math/clips/limit-epsilon';
import modularClock from '@/lib/subjects/math/clips/modular-clock';
import planeTransform from '@/lib/subjects/math/clips/plane-transform';
import powerOfPoint from '@/lib/subjects/math/clips/power-of-point';
import pythagorasDissection from '@/lib/subjects/math/clips/pythagoras-dissection';
import riemannIntegral from '@/lib/subjects/math/clips/riemann-integral';
import secantTangent from '@/lib/subjects/math/clips/secant-tangent';
import tilingColoring from '@/lib/subjects/math/clips/tiling-coloring';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- modules with different inputs share one list
export const mathClipModules: readonly ClipModule<any>[] = [
  algIdentityArea,
  amgmSemicircle,
  concurrencyDynamic,
  convexChord,
  csProjection,
  euclidRectangle,
  figurateSums,
  geometricSeriesArea,
  graphTransform,
  inclusionExclusion,
  inductionFallacy,
  inscribedAngle,
  latticePaths,
  limitEpsilon,
  modularClock,
  planeTransform,
  powerOfPoint,
  pythagorasDissection,
  riemannIntegral,
  secantTangent,
  tilingColoring,
];
