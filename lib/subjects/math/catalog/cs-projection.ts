/**
 * Walkthrough entry: Cauchy–Schwarz by projection (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-inequality-classic`.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, boundsOf, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { ux: number; uy: number; vx: number; vy: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    ux: { kind: 'int', range: [-9, 9] },
    uy: { kind: 'int', range: [-9, 9] },
    vx: { kind: 'int', range: [-9, 9] },
    vy: { kind: 'int', range: [-9, 9] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Hai vectơ', 'Two vectors'),
    narration: m(
      'Ta vẽ hai vectơ u và v khác không, xuất phát từ gốc toạ độ. Ta muốn so tích vô hướng của chúng với tích hai độ dài. Nhớ rằng độ dài của u là căn của ux bình phương cộng uy bình phương.',
      'We draw two non-zero vectors u and v from the origin. We want to compare their dot product with the product of the two lengths. Remember the length of u is the root of ux squared plus uy squared.',
    ),
    hints: [
      m(
        'Tích vô hướng tính từ toạ độ thế nào?',
        'How is the dot product computed from coordinates?',
      ),
      m(
        'Nhân hai toạ độ x với nhau, hai toạ độ y với nhau, rồi cộng.',
        'Multiply the two x coordinates, the two y coordinates, then add.',
      ),
      m(
        'u·v = ux·vx + uy·vy, và độ dài là căn của tổng bình phương.',
        'u·v = ux·vx + uy·vy, and a length is the root of a sum of squares.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bất đẳng thức chỉ đúng với vectơ có toạ độ dương: nó đúng với mọi vectơ.',
        'Thinking the inequality holds only for vectors with positive coordinates: it holds for all vectors.',
      ),
    ],
  },
  {
    id: 'projection',
    label: m('Hình chiếu', 'The projection'),
    narration: m(
      'Ta hạ từ đầu mút của v một đường vuông góc xuống đường thẳng chứa u. Đoạn từ gốc tới chân đường vuông góc là hình chiếu của v lên u. Độ dài hình chiếu bằng giá trị tuyệt đối của u chấm v chia cho độ dài u.',
      'From the tip of v we drop a perpendicular onto the line of u. The piece from the origin to the foot is the projection of v onto u. The length of the projection is the absolute value of u dot v divided by the length of u.',
    ),
    ask: {
      text: m(
        'Theo em, hình chiếu của v lên u có thể dài hơn chính v không?',
        'Can the projection of v onto u be longer than v itself?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có thể', 'It can'), m('Không bao giờ', 'Never')],
        // OF is a leg of a right triangle whose hypotenuse is OV
        answer: () => 1,
      },
    },
    hints: [
      m('Hình chiếu của v lên u được dựng thế nào?', 'How is the projection of v onto u drawn?'),
      m(
        'Hạ đường vuông góc từ đầu mút v xuống đường thẳng của u.',
        'Drop the perpendicular from the tip of v onto the line of u.',
      ),
      m(
        'Độ dài hình chiếu là |v| nhân giá trị tuyệt đối của cosin góc, tức |u·v| / |u|.',
        'Its length is |v| times the absolute cosine of the angle, that is |u·v| / |u|.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hình chiếu có thể âm: độ dài thì không âm; dấu của u·v chỉ cho biết hướng.',
        'Thinking the projection can be negative: a length is not; the sign of u·v only gives the direction.',
      ),
    ],
  },
  {
    id: 'inequality',
    label: m('Bất đẳng thức', 'The inequality'),
    narration: m(
      'Hình chiếu là một cạnh góc vuông của tam giác có v làm cạnh huyền, tam giác này suy biến khi hình chiếu bằng 0 hoặc dài bằng v. Cạnh góc vuông không dài hơn cạnh huyền. Vậy giá trị tuyệt đối của u chấm v chia cho độ dài u nhỏ hơn hoặc bằng độ dài v. Nhân hai vế với độ dài u ta được bất đẳng thức.',
      'The projection is a leg of a right triangle whose hypotenuse is v, and the triangle degenerates when the projection is 0 or as long as v. A leg is never longer than the hypotenuse. So the absolute value of u dot v over the length of u is at most the length of v. Multiplying by the length of u gives the inequality.',
    ),
    ask: {
      text: m(
        'Khi nào thì hình chiếu dài đúng bằng v?',
        'When is the projection exactly as long as v?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Khi u ⊥ v', 'When u ⊥ v'),
          m('Khi u ∥ v', 'When u ∥ v'),
          m('Khi |u| = |v|', 'When |u| = |v|'),
        ],
        // the foot is the tip of v exactly when v lies on the line of u
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Trong một tam giác vuông, cạnh nào dài nhất?',
        'In a right triangle, which side is the longest?',
      ),
      m(
        'Cạnh huyền, nên hình chiếu không dài hơn v.',
        'The hypotenuse, so the projection is no longer than v.',
      ),
      m(
        'proj ≤ |v|, nhân hai vế với |u| thì được |u·v| ≤ |u||v|.',
        'proj ≤ |v|, multiply both sides by |u| to get |u·v| ≤ |u||v|.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dấu bằng chỉ khi u = v: chỉ cần hai vectơ cùng phương (kể cả ngược hướng hoặc khác độ dài).',
        'Thinking equality needs u = v: parallel vectors suffice (even opposite or of different length).',
      ),
    ],
  },
  {
    id: 'equality',
    label: m('Dấu bằng', 'Equality'),
    narration: m(
      'Ta quay v dần về phía đường thẳng của u và xem hình chiếu so với v. Nếu hai vectơ đã song song từ đầu thì không cần quay. Khi v song song với u, cùng hay ngược hướng, hình chiếu dài bằng v và dấu bằng xảy ra. Điều kiện là tích có hướng ux nhân vy trừ uy nhân vx bằng 0.',
      'We turn v gradually toward the line of u and watch the projection against v. If the vectors are already parallel, no turning is needed. When v is parallel to u, in the same or the opposite direction, the projection is as long as v and equality holds. The condition is the cross product ux times vy minus uy times vx equals 0.',
    ),
    hints: [
      m(
        'Hình chiếu dài bằng v khi v nằm ở đâu so với u?',
        'Where must v lie for the projection to be as long as v?',
      ),
      m(
        'Khi v nằm trên đường thẳng chứa u, tức hai vectơ cùng phương.',
        'On the line holding u, that is the vectors are parallel.',
      ),
      m(
        'Cùng phương nghĩa là tích có hướng ux·vy − uy·vx = 0.',
        'Parallel means the cross product ux·vy − uy·vx = 0.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng vuông góc cũng cho dấu bằng: khi vuông góc u·v = 0, hình chiếu bằng 0, xa dấu bằng nhất.',
        'Thinking perpendicular also gives equality: when perpendicular u·v = 0 and the projection is 0, the farthest from equality.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Vậy |u·v| ≤ |u||v|: hình chiếu không bao giờ dài hơn vectơ, và chỉ bằng nó khi hai vectơ cùng phương. Thử các mẫu khác, kể cả khi u ⊥ v.',
      'So |u·v| ≤ |u||v|: a projection is never longer than the vector, and equals it only when the vectors are parallel. Try the other presets, including u ⊥ v.',
    ),
    hints: [
      m('Bất đẳng thức nói gì về |u·v|?', 'What does the inequality say about |u·v|?'),
      m('|u·v| không vượt tích hai độ dài.', '|u·v| never exceeds the product of the two lengths.'),
      m(
        'Dấu bằng chỉ xảy ra khi v nằm trên đường thẳng của u (tích có hướng bằng 0).',
        'Equality holds only when v lies on the line of u (the cross product is 0).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dấu bằng cần |u| = |v|: chỉ cần hai vectơ cùng phương, độ dài tuỳ ý.',
        'Thinking equality needs |u| = |v|: it only needs the vectors to be parallel, with any lengths.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Hai vectơ khác không u = ({ux}, {uy}) và v = ({vx}, {vy}) cùng xuất phát từ gốc O.',
    'Two non-zero vectors u = ({ux}, {uy}) and v = ({vx}, {vy}) start at the origin O.',
  ),
  projection: m(
    'Hạ từ đầu mút của v một đường vuông góc xuống đường thẳng của u, chân F. OF là hình chiếu, dài |u·v|/|u| với u·v = {dot}.',
    'Drop a perpendicular from the tip of v to the line of u, foot F. OF is the projection, of length |u·v|/|u| with u·v = {dot}.',
  ),
  triangle: m(
    'OFV vuông tại F, cạnh huyền OV = |v|, nên OF ≤ OV. Bình phương và nhân với |u|²: (u·v)² = {dot2} ≤ {n2} = |u|²|v|².',
    'OFV is right-angled at F with hypotenuse OV = |v|, so OF ≤ OV. Squared and times |u|²: (u·v)² = {dot2} ≤ {n2} = |u|²|v|².',
  ),
  perp: m(
    'Ở đây u ⊥ v: u·v = 0, hình chiếu OF bằng 0, và (u·v)² = {dot2} ≤ {n2} = |u|²|v|² hiển nhiên.',
    'Here u ⊥ v: u·v = 0, the projection OF is 0, and (u·v)² = {dot2} ≤ {n2} = |u|²|v|² is clear.',
  ),
  turn: m(
    'Quay v về phía đường thẳng của u (bước {k}/{parts}): hình chiếu OF dài dần lên, tiến tới bằng OV.',
    'Turn v toward the line of u (step {k}/{parts}): the projection OF grows and approaches OV.',
  ),
  equality: m(
    'v được quay về song song với u: F trùng đầu mút của v, OF = OV, dấu bằng. Ban đầu ux·vy − uy·vx = {cross} ≠ 0 nên v đã được quay.',
    'v has been turned parallel to u: F is the tip of v, OF = OV, equality. Initially ux·vy − uy·vx = {cross} ≠ 0, so v was turned.',
  ),
  degenerate: m(
    'F trùng đầu mút V: OF = OV, tam giác OFV suy biến nên không có góc vuông. (u·v)² = {dot2} = {n2} = |u|²|v|², bất đẳng thức thành đẳng thức.',
    'F is the tip V: OF = OV and triangle OFV is degenerate, with no right angle. (u·v)² = {dot2} = {n2} = |u|²|v|², so the inequality becomes an equality.',
  ),
  equalityParallel: m(
    'v đã song song với u từ đầu: F trùng V, OF = OV, dấu bằng. Có ux·vy − uy·vx = {cross} = 0 nên không cần quay.',
    'v is already parallel to u: F is V, OF = OV, equality holds. Here ux·vy − uy·vx = {cross} = 0, so no turning is needed.',
  ),
  done: m(
    'Vậy |u·v| ≤ |u||v|, dấu bằng khi và chỉ khi u, v cùng phương. Với dữ liệu này (u·v)² = {dot2} và |u|²|v|² = {n2}.',
    'So |u·v| ≤ |u||v|, with equality if and only if u and v are parallel. For this data (u·v)² = {dot2} and |u|²|v|² = {n2}.',
  ),
};

const STEPS = 4;

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const u: Pt = [input.ux, input.uy];
  const v: Pt = [input.vx, input.vy];
  const nu2 = u[0] * u[0] + u[1] * u[1];
  const nv2 = v[0] * v[0] + v[1] * v[1];
  const nu = Math.sqrt(nu2);
  const nv = Math.sqrt(nv2);
  const dot = u[0] * v[0] + u[1] * v[1];
  const cross = u[0] * v[1] - u[1] * v[0];
  const n2 = nu2 * nv2;
  const sign = dot >= 0 ? 1 : -1; // v turns to the nearer direction along the line of u
  const target: Pt = [(sign * u[0]) / nu, (sign * u[1]) / nu];
  /** v turned a fraction t of the way: the unit blend of its direction and the target, with its own length */
  const turned = (t: number): Pt => {
    const bx = (1 - t) * (v[0] / nv) + t * target[0];
    const by = (1 - t) * (v[1] / nv) + t * target[1];
    const len = Math.sqrt(bx * bx + by * by);
    return [(nv * bx) / len, (nv * by) / len];
  };
  const footOf = (w: Pt): Pt => {
    const k = (w[0] * u[0] + w[1] * u[1]) / nu2;
    return [k * u[0], k * u[1]];
  };
  const shown: Pt[] = [[0, 0], u, v, footOf(v), ...[1, 2, 3, 4].map((k) => turned(k / STEPS))];
  const bounds = boundsOf(shown, 1.2);
  const fig = (w: Pt, opts: { foot: boolean; tri: boolean }): Figure => {
    const f = new Figure(bounds)
      .point('O', [0, 0])
      .point('U', u, 'u')
      .point('V', w, 'v')
      .seg('Ou', 'O', 'U', { arrow: true })
      .seg('Ov', 'O', 'V', { arrow: true });
    if (opts.foot) {
      const F = footOf(w);
      f.line('lu', 'O', 'U').point('F', F, 'F');
      if (Math.hypot(w[0] - F[0], w[1] - F[1]) > 1e-9) f.seg('VF', 'V', 'F', { dashed: true });
      if (Math.hypot(F[0], F[1]) > 1e-9) f.seg('OF', 'O', 'F');
      if (
        opts.tri &&
        Math.hypot(w[0] - F[0], w[1] - F[1]) > 1e-9 &&
        Math.hypot(F[0], F[1]) > 1e-9
      ) {
        f.anchor('t0', [0, 0]).anchor('t1', F).anchor('t2', w).polygon('tri', ['t0', 't1', 't2']);
      }
    }
    return f;
  };
  const put = (
    text: Messages,
    codeLine: number,
    f: Figure,
    vars: Record<string, number>,
    tag: string | undefined,
    marks: Record<string, HighlightKind>,
  ): void =>
    emit(f.snapshot(), {
      explanation: fill(msg(text, ctx.locale), vars),
      codeLine,
      highlights: { Ou: 'group-0', Ov: 'group-1', ...marks },
      vars,
      ...(tag ? { tags: [`beat:${tag}`] } : {}),
    });
  const base = { ux: u[0], uy: u[1], vx: v[0], vy: v[1] };

  put(EX.start, 1, fig(v, { foot: false, tri: false }), base, 'start', {});
  put(EX.projection, 2, fig(v, { foot: true, tri: false }), { dot }, 'projection', {
    OF: 'result',
    VF: 'compare',
    lu: 'visited',
  });
  // cross = 0: v is already on the line of u, F is its tip (OFV is degenerate), so nothing turns
  const parallel = cross === 0;
  put(
    dot === 0 ? EX.perp : parallel ? EX.degenerate : EX.triangle,
    3,
    fig(v, { foot: true, tri: true }),
    { dot2: dot * dot, n2 },
    'inequality',
    { OF: 'result', tri: 'group-2', lu: 'visited' },
  );
  if (parallel) {
    put(EX.equalityParallel, 4, fig(v, { foot: true, tri: true }), { cross }, 'equality', {
      OF: 'result',
      tri: 'group-2',
      lu: 'visited',
    });
  } else {
    for (let k = 1; k <= STEPS; k++) {
      const w = turned(k / STEPS);
      const last = k === STEPS;
      put(
        last ? EX.equality : EX.turn,
        4,
        fig(w, { foot: true, tri: true }),
        last ? { cross } : { k, parts: STEPS },
        last ? 'equality' : undefined,
        { OF: 'result', tri: 'group-2', lu: 'visited' },
      );
    }
  }
  put(EX.done, 4, fig(v, { foot: true, tri: true }), { dot2: dot * dot, n2 }, 'done', {
    OF: 'result',
    tri: 'group-2',
  });
}

export const csProjectionEntry: WalkthroughEntry<In, S> = {
  id: 'cs-projection',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-inequality-classic'],
  title: m('Cauchy–Schwarz bằng hình chiếu', 'Cauchy–Schwarz by projection'),
  code: {
    pseudo: [
      'hai vectơ u và v vẽ từ gốc toạ độ',
      'hình chiếu của v lên đường thẳng chứa u, chân đường vuông góc',
      'tam giác vuông có v làm cạnh huyền và hình chiếu làm cạnh góc vuông',
      'v quay tới song song với u; hình chiếu dài dần tới độ dài v',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => [
    ...(i.ux === 0 && i.uy === 0 ? ['u-is-zero'] : []),
    ...(i.vx === 0 && i.vy === 0 ? ['v-is-zero'] : []),
  ],
  customInput: false,
  presets: [
    { id: 'generic', label: m('Tổng quát', 'Generic'), input: { ux: 3, uy: 1, vx: 1, vy: 2 } },
    { id: 'parallel', label: m('Cùng phương', 'Parallel'), input: { ux: 2, uy: 1, vx: 4, vy: 2 } },
    {
      id: 'perpendicular',
      label: m('Vuông góc', 'Perpendicular'),
      input: { ux: 1, uy: 0, vx: 0, vy: 1 },
    },
    {
      id: 'opposite',
      label: m('Ngược hướng', 'Opposite'),
      input: { ux: 1, uy: 1, vx: -2, vy: -2 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng bất đẳng thức chỉ đúng với vectơ có toạ độ dương: nó đúng với mọi vectơ.',
        'Thinking the inequality holds only for vectors with positive coordinates: it holds for all vectors.',
      ),
    },
    {
      beat: 'projection',
      text: m(
        'Nghĩ rằng hình chiếu có thể âm: độ dài thì không âm; dấu của u·v chỉ cho biết hướng.',
        'Thinking the projection can be negative: a length is not; the sign of u·v only gives the direction.',
      ),
    },
    {
      beat: 'inequality',
      text: m(
        'Nghĩ rằng dấu bằng chỉ khi u = v: chỉ cần hai vectơ cùng phương (kể cả ngược hướng hoặc khác độ dài).',
        'Thinking equality needs u = v: parallel vectors suffice (even opposite or of different length).',
      ),
    },
    {
      beat: 'equality',
      text: m(
        'Nghĩ rằng vuông góc cũng cho dấu bằng: khi vuông góc u·v = 0, hình chiếu bằng 0, xa dấu bằng nhất.',
        'Thinking perpendicular also gives equality: when perpendicular u·v = 0 and the projection is 0, the farthest from equality.',
      ),
    },
  ],
  maxFrames: 10,
  maxBytes: 200_000,
  run,
};
