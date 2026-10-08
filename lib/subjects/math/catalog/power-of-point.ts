/**
 * Walkthrough entry: The power of a point (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-circle-power`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import {
  Figure,
  boundsOf,
  frac,
  framePut,
  type FigState,
  type Pt,
} from '@/lib/subjects/math/figure';

type In = { R: number; px: number; py: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    R: { kind: 'int', range: [2, 6] },
    px: { kind: 'int', range: [-9, 9] },
    py: { kind: 'int', range: [-9, 9] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đường tròn và điểm P', 'The circle and the point P'),
    narration: m(
      'Ta có một đường tròn tâm O bán kính R và một điểm P, ở ngoài, ở trong hoặc ngay trên đường tròn. Ta sẽ vẽ các đường thẳng đi qua P và cắt đường tròn.',
      'We have a circle with centre O and radius R and a point P, outside, inside or right on the circle. We will draw lines through P that cut the circle.',
    ),
    hints: [
      m(
        'Điểm P có thể ở những vị trí nào so với đường tròn?',
        'Where can P lie relative to the circle?',
      ),
      m('Ngoài, trong hoặc trên đường tròn.', 'Outside, inside or on it.'),
      m(
        'So OP với R: OP > R là ngoài, OP < R là trong, OP = R là trên đường tròn.',
        'Compare OP with R: OP > R outside, OP < R inside, OP = R on the circle.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phương tích luôn dương: nó âm khi P ở trong, bằng 0 khi P trên đường tròn.',
        'Thinking the power is always positive: it is negative when P is inside and 0 when P is on the circle.',
      ),
    ],
  },
  {
    id: 'secant-1',
    label: m('Cát tuyến thứ nhất', 'The first secant'),
    narration: m(
      'Một đường thẳng qua P cắt đường tròn tại hai điểm A và B. Ta đo PA và PB. Ta nhân hai độ dài lại với nhau.',
      'A line through P meets the circle at two points A and B. We measure PA and PB. We multiply the two lengths together.',
    ),
    ask: {
      text: m(
        'Theo em, tích PA nhân PB bằng biểu thức nào?',
        'Which expression do you think the product PA times PB equals?',
      ),
      predict: {
        kind: 'choice',
        options: [m('|OP² − R²|', '|OP² − R²|'), m('OP² + R²', 'OP² + R²'), m('OP · R', 'OP · R')],
        answer: () => 0,
      },
    },
    hints: [
      m('PA và PB đo từ đâu?', 'From where are PA and PB measured?'),
      m('Từ P tới hai giao điểm A và B.', 'From P to the two intersection points A and B.'),
      m(
        'Nếu P ở trong, A và B ở hai phía của P; nếu P ở ngoài, cùng một phía.',
        'If P is inside, A and B lie on opposite sides of P; if outside, on the same side.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tích PA·PB phụ thuộc vào hướng của đường thẳng: nó không phụ thuộc.',
        'Thinking the product PA·PB depends on the direction of the line: it does not.',
      ),
    ],
  },
  {
    id: 'secant-2',
    label: m('Cát tuyến khác', 'Another secant'),
    narration: m(
      'Ta quay đường thẳng quanh P và đo lại tích PA nhân PB ở nhiều vị trí. Các độ dài PA và PB thay đổi, nhưng tích của chúng thì không.',
      'We turn the line about P and measure the product PA times PB again in many positions. The lengths PA and PB change, but their product does not.',
    ),
    ask: {
      text: m(
        'Khi quay cát tuyến quanh P, tích PA nhân PB có đổi không?',
        'As the secant turns about P, does the product PA times PB change?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Không đổi', 'It stays the same'), m('Thay đổi', 'It changes')],
        answer: () => 0,
      },
    },
    hints: [
      m('Khi PA dài ra, PB sẽ ra sao?', 'When PA gets longer, what happens to PB?'),
      m('PB ngắn lại, vì tích không đổi.', 'PB gets shorter, because the product is constant.'),
      m(
        'Tích luôn bằng |OP² − R²|, một số chỉ phụ thuộc vị trí của P.',
        'The product always equals |OP² − R²|, a number that depends only on the position of P.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng quay cát tuyến làm tích tăng hoặc giảm: PA tăng thì PB giảm vừa đủ để tích giữ nguyên.',
        'Thinking turning the secant raises or lowers the product: when PA grows PB shrinks just enough to keep it.',
      ),
    ],
  },
  {
    id: 'tangent',
    label: m('Tiếp tuyến', 'The tangent'),
    narration: m(
      'Nếu P ở ngoài, một cát tuyến quay tới vị trí tiếp xúc tại T. Lúc đó A và B trùng nhau. Vậy tích bằng PT bình phương, và cũng bằng OP bình phương trừ R bình phương. Nếu P không ở ngoài thì không có tiếp tuyến.',
      'If P is outside, one secant turns to the position that touches the circle at T. Then A and B coincide. So the product equals PT squared, and also OP squared minus R squared. If P is not outside there is no tangent.',
    ),
    hints: [
      m('Khi A và B trùng nhau, PA·PB bằng gì?', 'When A and B coincide, what is PA·PB?'),
      m('Bằng PT², vì PA = PB = PT.', 'PT², since PA = PB = PT.'),
      m(
        'Nên PT² = OP² − R², cũng là định lý Pythagore trong tam giác vuông OTP.',
        'So PT² = OP² − R², which is also Pythagoras in the right triangle OTP.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng từ điểm ở trong cũng kẻ được tiếp tuyến: chỉ từ điểm ở ngoài hoặc trên đường tròn.',
        'Thinking a tangent can be drawn from an inside point: only from an outside point or one on the circle.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Với mọi cát tuyến qua P, PA·PB = |OP² − R²|, gọi là phương tích của P đối với đường tròn; từ điểm ở ngoài nó bằng PT². Thử ba vị trí của P: ngoài, trong, trên đường tròn.',
      'For every secant through P, PA·PB = |OP² − R²|, the power of P with respect to the circle; from an outside point it equals PT². Try the three positions of P: outside, inside, on the circle.',
    ),
    hints: [
      m(
        'PA·PB phụ thuộc vào cát tuyến hay vào điểm P?',
        'Does PA·PB depend on the secant or on the point P?',
      ),
      m(
        'Chỉ vào điểm P và đường tròn, không phụ thuộc hướng cát tuyến.',
        'Only on the point P and the circle, not on the direction of the secant.',
      ),
      m(
        'Nó bằng |OP² − R²|; từ điểm ngoài thì bằng PT² với PT là tiếp tuyến.',
        'It equals |OP² − R²|; from an outside point it equals PT² with PT the tangent.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng PA·PB bằng PT·PT chỉ khi cát tuyến đặc biệt: hệ thức đúng với mọi cát tuyến, tiếp tuyến chỉ là trường hợp A trùng B.',
        'Thinking PA·PB equals PT·PT only for a special secant: it holds for every secant, and the tangent is just the case A = B.',
      ),
    ],
  },
];

const EX = {
  startOut: m(
    'Đường tròn tâm O bán kính R = {R} và điểm P = ({px}, {py}): OP² = {op2}, R² = {r2}, OP² − R² = {p} > 0, nên P ở ngoài đường tròn.',
    'A circle with centre O and radius R = {R} and the point P = ({px}, {py}): OP² = {op2}, R² = {r2}, OP² − R² = {p} > 0, so P is outside the circle.',
  ),
  startIn: m(
    'Đường tròn tâm O bán kính R = {R} và điểm P = ({px}, {py}): OP² = {op2}, R² = {r2}, OP² − R² = {p} < 0, nên P ở trong đường tròn.',
    'A circle with centre O and radius R = {R} and the point P = ({px}, {py}): OP² = {op2}, R² = {r2}, OP² − R² = {p} < 0, so P is inside the circle.',
  ),
  startOn: m(
    'Đường tròn tâm O bán kính R = {R} và điểm P = ({px}, {py}): OP² = {op2} = R², OP² − R² = 0, nên P nằm trên đường tròn.',
    'A circle with centre O and radius R = {R} and the point P = ({px}, {py}): OP² = {op2} = R², OP² − R² = 0, so P is on the circle.',
  ),
  secant1: m(
    'Cát tuyến qua P cắt đường tròn tại A và B: PA² = {pa2}, PB² = {pb2}. Nhân lại, (PA·PB)² = {p2}, nên PA·PB = {pabs}.',
    'A secant through P meets the circle at A and B: PA² = {pa2}, PB² = {pb2}. Multiplying, (PA·PB)² = {p2}, so PA·PB = {pabs}.',
  ),
  secant2: m(
    'Quay cát tuyến: PA² = {pa2}, PB² = {pb2}, (PA·PB)² = {p2}; tích PA·PB vẫn bằng {pabs}.',
    'Turn the secant: PA² = {pa2}, PB² = {pb2}, (PA·PB)² = {p2}; the product PA·PB is still {pabs}.',
  ),
  tangent: m(
    'Cát tuyến quay tới vị trí tiếp xúc tại T, A và B trùng nhau. OT ⊥ PT nên PT² = OP² − R² = {op2} − {r2} = {p}.',
    'The secant turns to touch the circle at T, so A and B coincide. OT ⊥ PT, hence PT² = OP² − R² = {op2} − {r2} = {p}.',
  ),
  tangentOn: m(
    'P nằm trên đường tròn nên một giao điểm của cát tuyến là chính P: PA·PB = 0, đúng bằng phương tích {p}.',
    'P is on the circle, so one point of the secant is P itself: PA·PB = 0, exactly the power {p}.',
  ),
  tangentIn: m(
    'P ở trong đường tròn nên không có tiếp tuyến nào qua P. Phương tích là {p}, âm; độ dài tích PA·PB vẫn là {pabs}.',
    'P is inside the circle, so no tangent passes through P. The power is {p}, negative; the product PA·PB is still {pabs} in size.',
  ),
  done: m(
    'Với mọi cát tuyến qua P, PA·PB = |OP² − R²| = {pabs}, và từ điểm ngoài bằng PT² = {p}.',
    'For every secant through P, PA·PB = |OP² − R²| = {pabs}, and from an outside point it equals PT² = {p}.',
  ),
  doneNoTangent: m(
    'Với mọi cát tuyến qua P, PA·PB = |OP² − R²| = {pabs}, không phụ thuộc hướng cát tuyến.',
    'For every secant through P, PA·PB = |OP² − R²| = {pabs}, whatever the direction of the secant.',
  ),
};

/** the slopes of the sample secants through the circle's point (b² − a², 2ab)/(a² + b²) (rational parametrisation, no trigonometry) */
const PARAMS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 2],
  [1, 1],
  [2, 1],
  [-1, 2],
  [-1, 1],
];

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { R, px, py } = input;
  const op2 = px * px + py * py;
  const r2 = R * R;
  const p = op2 - r2;
  const pabs = Math.abs(p);
  const P: Pt = [px, py];
  const bounds = boundsOf([[-R, -R], [R, R], P], 1.5);
  /**
   * The secant through P and the circle point Q = R·(qx, qy)/d (d = a² + b²): A = Q, and B = P + t·(Q − P) with t = p/|Q − P|², so
   * PA² = N/d² with N = |R·(qx, qy) − d·P|² and PB² = p²·d²/N (the product PA·PB is |p|). Null when P is Q itself.
   */
  const secant = (a: number, b: number) => {
    const d = a * a + b * b;
    const qx = b * b - a * a;
    const qy = 2 * a * b;
    const N = (R * qx - d * px) ** 2 + (R * qy - d * py) ** 2;
    if (N === 0) return null;
    const A: Pt = [(R * qx) / d, (R * qy) / d];
    const t = (p * d * d) / N;
    const B: Pt = [px + t * (A[0] - px), py + t * (A[1] - py)];
    return { A, B, pa2: frac(N, d * d), pb2: frac(p * p * d * d, N) };
  };
  const secants = PARAMS.map(([a, b]) => secant(a, b)).filter((s) => s !== null);
  const base = (): Figure =>
    new Figure(bounds).point('O', [0, 0], 'O').circle('c', 'O', R).point('P', P, 'P');
  const drawSecant = (s: NonNullable<ReturnType<typeof secant>>): Figure => {
    const fig = base().point('A', s.A, 'A');
    if (p !== 0) fig.point('B', s.B, 'B');
    return fig.line('sec', 'P', 'A');
  };
  const put = framePut(emit, ctx.locale);
  const loc = { R, px, py, op2, r2, p };
  put(p > 0 ? EX.startOut : p < 0 ? EX.startIn : EX.startOn, 1, base(), loc, 'start', {
    P: 'active',
  });

  secants.slice(0, 5).forEach((s, i) => {
    const fig = drawSecant(s);
    put(
      i === 0 ? EX.secant1 : EX.secant2,
      i === 0 ? 2 : 3,
      fig,
      { pa2: s.pa2, pb2: s.pb2, p2: p * p, pabs },
      i === 0 ? 'secant-1' : i === 1 ? 'secant-2' : undefined,
      { sec: 'active', A: 'result', P: 'active', ...(p !== 0 ? { B: 'result' as const } : {}) },
    );
  });

  if (p > 0) {
    // the tangent points: T = (R²·P ± R·√p·P⊥)/|P|², P⊥ = (−py, px)
    const k = R * Math.sqrt(p);
    const T: Pt = [(r2 * px - k * py) / op2, (r2 * py + k * px) / op2];
    const fig = base()
      .point('T', T, 'T')
      .seg('PT', 'P', 'T')
      .seg('OT', 'O', 'T')
      .angle('rt', 'T', 'O', 'P', '90°');
    put(EX.tangent, 4, fig, { op2, r2, p }, 'tangent', {
      PT: 'result',
      OT: 'active',
      T: 'result',
      rt: 'result',
    });
    put(EX.done, 4, fig, { pabs, p }, 'done', { PT: 'result', T: 'result', rt: 'result' });
  } else {
    const fig = drawSecant(secants[0]!);
    put(p === 0 ? EX.tangentOn : EX.tangentIn, 4, fig, { p, pabs }, 'tangent', {
      sec: 'active',
      A: 'result',
      P: 'active',
    });
    put(EX.doneNoTangent, 4, fig, { pabs }, 'done', { sec: 'active', A: 'result', P: 'active' });
  }
}

export const powerOfPointEntry: WalkthroughEntry<In, S> = {
  id: 'power-of-point',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-circle-power'],
  title: m('Phương tích của một điểm', 'The power of a point'),
  code: {
    pseudo: [
      'đường tròn tâm O, điểm P ở một trong ba vị trí',
      'đường thẳng qua P cắt đường tròn tại A và B; PA², PB² và tích của chúng được ghi',
      'đường thẳng quay quanh P qua bốn vị trí; tích PA·PB không đổi',
      'cát tuyến thành tiếp tuyến PT; hoặc dòng "không có tiếp tuyến" khi P không ở ngoài',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    {
      id: 'outside',
      label: m('P ở ngoài đường tròn', 'P outside the circle'),
      input: { R: 5, px: 8, py: 0 },
    },
    {
      id: 'inside',
      label: m('P ở trong đường tròn', 'P inside the circle'),
      input: { R: 5, px: 1, py: 2 },
    },
    {
      id: 'on-circle',
      label: m('P nằm trên đường tròn (phương tích 0)', 'P on the circle (power 0)'),
      input: { R: 5, px: 3, py: 4 },
    },
    {
      id: 'far',
      label: m('P rất xa, đường tròn nhỏ', 'P far away, a small circle'),
      input: { R: 2, px: 9, py: 9 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng phương tích luôn dương: nó âm khi P ở trong, bằng 0 khi P trên đường tròn.',
        'Thinking the power is always positive: it is negative when P is inside and 0 when P is on the circle.',
      ),
    },
    {
      beat: 'secant-1',
      text: m(
        'Nghĩ rằng tích PA·PB phụ thuộc vào hướng của đường thẳng: nó không phụ thuộc.',
        'Thinking the product PA·PB depends on the direction of the line: it does not.',
      ),
    },
    {
      beat: 'secant-2',
      text: m(
        'Nghĩ rằng quay cát tuyến làm tích tăng hoặc giảm: PA tăng thì PB giảm vừa đủ để tích giữ nguyên.',
        'Thinking turning the secant raises or lowers the product: when PA grows PB shrinks just enough to keep it.',
      ),
    },
    {
      beat: 'tangent',
      text: m(
        'Nghĩ rằng từ điểm ở trong cũng kẻ được tiếp tuyến: chỉ từ điểm ở ngoài hoặc trên đường tròn.',
        'Thinking a tangent can be drawn from an inside point: only from an outside point or one on the circle.',
      ),
    },
  ],
  maxFrames: 9,
  maxBytes: 200_000,
  run,
};
