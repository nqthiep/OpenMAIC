/**
 * Walkthrough entry: The chord of a convex graph (Jensen) (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-inequality-classic`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, curvePieces, frac, framePut, type FigState } from '@/lib/subjects/math/figure';

type Fn = 'x2' | 'abs' | 'x4';
/** t = tn/10, so every number on the page is an exact integer */
type In = { f: Fn; x1: number; x2: number; tn: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
/** t = 0, 2, …, 10 while the mixture slides from x₂ to x₁ */
const SCRUB = [0, 2, 4, 6, 8, 10];

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    f: { kind: 'enum', values: ['x2', 'abs', 'x4'] },
    x1: { kind: 'int', range: [-3, 3] },
    x2: { kind: 'int', range: [-3, 3] },
    tn: { kind: 'int', range: [0, 10] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đồ thị lồi', 'A convex graph'),
    narration: m(
      'Ta vẽ đồ thị của một hàm có hình chiếc bát. Hàm như thế gọi là lồi. Hãy chọn hai điểm x một và x hai trên trục hoành.',
      'We draw the graph of a function shaped like a bowl. Such a function is called convex. Pick two points x one and x two on the horizontal axis.',
    ),
    hints: [
      m('Hàm lồi trông như thế nào?', 'What does a convex function look like?'),
      m(
        'Như chiếc bát: nối hai điểm bất kỳ của đồ thị, đoạn nối nằm trên đồ thị.',
        'Like a bowl: join any two points of the graph and the segment lies above the graph.',
      ),
      m('x², |x| và x⁴ đều có dạng đó.', 'x², |x| and x⁴ are all like that.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bất đẳng thức Jensen đúng với mọi hàm: nó đúng cho hàm lồi; với hàm lõm chiều bất đẳng thức đảo lại.',
        'Thinking Jensen holds for every function: it holds for convex ones; for a concave function the inequality reverses.',
      ),
    ],
  },
  {
    id: 'chord',
    label: m('Dây cung', 'The chord'),
    narration: m(
      'Ta nối hai điểm tương ứng của đồ thị bằng một đoạn thẳng: dây cung. Giữa hai đầu mút, dây cung đi qua phía nào của đồ thị?',
      'We join the two matching points of the graph with a straight segment: the chord. Between the two ends, on which side of the graph does the chord run?',
    ),
    ask: {
      text: m(
        'Theo em, giữa hai đầu mút, dây cung nằm phía trên hay phía dưới đồ thị?',
        'Between the two ends, does the chord lie above or below the graph?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Phía trên (hoặc chạm) đồ thị', 'Above (or touching) the graph'),
          m('Phía dưới đồ thị', 'Below the graph'),
        ],
        // the functions here are convex: the chord is never below the graph
        answer: () => 0,
      },
    },
    hints: [
      m('Dây cung nối hai điểm nào?', 'Which two points does the chord join?'),
      m('Hai điểm của đồ thị ứng với x₁ và x₂.', 'The two points of the graph over x₁ and x₂.'),
      m(
        'Với hàm hình bát, đoạn nối hai điểm nằm trên đồ thị ở giữa.',
        'For a bowl-shaped function the segment lies above the graph in between.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dây cung nằm dưới đồ thị vì đồ thị uốn lên: hàm lồi có dây cung nằm trên.',
        'Thinking the chord is below the graph because the graph curves up: a convex function has its chord above.',
      ),
    ],
  },
  {
    id: 'point',
    label: m('Điểm chạy', 'The moving point'),
    narration: m(
      'Cho t chạy từ 0 đến 1. Điểm trộn t nhân x một cộng một trừ t nhân x hai chạy từ x hai tới x một. Tại mỗi t ta so điểm của đồ thị với điểm của dây cung ngay phía trên nó.',
      'Let t run from 0 to 1. The mixture t times x one plus one minus t times x two travels from x two to x one. At each t we compare the point of the graph with the point of the chord straight above it.',
    ),
    ask: {
      text: m(
        'Khi t = 0 hoặc t = 1, điểm trên dây cung và điểm trên đồ thị có trùng nhau không?',
        'When t = 0 or t = 1, do the point on the chord and the point on the graph coincide?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có, trùng nhau', 'Yes, they coincide'), m('Không trùng', 'No, they differ')],
        // at t = 0 the mixture is x2 and at t = 1 it is x1: both points are the end of the chord
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Điểm trộn nằm ở đâu khi t = 0 và khi t = 1?',
        'Where is the mixture when t = 0 and when t = 1?',
      ),
      m('Khi t = 0 nó ở x₂, khi t = 1 nó ở x₁.', 'At x₂ when t = 0, at x₁ when t = 1.'),
      m(
        'Với t giữa 0 và 1 nó nằm giữa hai điểm.',
        'For t between 0 and 1 it lies between the two points.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng t phải bằng 0,5: t là số bất kỳ trong [0, 1], và 0,5 chỉ cho trung điểm.',
        'Thinking t must be 0.5: t is any number in [0, 1] and 0.5 only gives the midpoint.',
      ),
    ],
  },
  {
    id: 'inequality',
    label: m('Bất đẳng thức', 'The inequality'),
    narration: m(
      'Độ cao của đồ thị tại điểm trộn là f của t nhân x một cộng một trừ t nhân x hai. Độ cao của dây cung là t nhân f của x một cộng một trừ t nhân f của x hai. Đồ thị không cao hơn dây cung, và đó là bất đẳng thức Jensen cho hàm lồi.',
      'The height of the graph at the mixture is f of t times x one plus one minus t times x two. The height of the chord is t times f of x one plus one minus t times f of x two. The graph is never higher than the chord, and that is Jensen for a convex function.',
    ),
    hints: [
      m(
        'Độ cao của đồ thị so với độ cao của dây cung thế nào?',
        'How does the height of the graph compare with that of the chord?',
      ),
      m(
        'Không cao hơn: đồ thị nằm dưới hoặc chạm dây cung.',
        'It is no higher: the graph is below or touches the chord.',
      ),
      m(
        'Đó là f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂).',
        'That is f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dấu bằng chỉ xảy ra khi x₁ = x₂: nó còn xảy ra ở hai đầu mút t = 0 và t = 1.',
        'Thinking equality holds only when x₁ = x₂: it also holds at the two ends t = 0 and t = 1.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Với mọi t từ 0 đến 1, đồ thị không cao hơn dây cung: f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂), đó là bất đẳng thức Jensen cho hàm lồi. Thử mẫu t = 0 để thấy hai độ cao bằng nhau ở đầu mút.',
      'For every t from 0 to 1 the graph is no higher than the chord: f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂), which is Jensen for a convex function. Try the preset with t = 0 to see the two heights equal at an end.',
    ),
    hints: [
      m('Đồ thị nằm ở đâu so với dây cung?', 'Where is the graph relative to the chord?'),
      m(
        'Dưới hoặc chạm dây cung, ở mọi t trong [0, 1].',
        'Below or touching the chord, for every t in [0, 1].',
      ),
      m(
        'Đó là f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂).',
        'That is f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng Jensen chỉ cho t = 0,5: nó đúng với mọi t trong [0, 1].',
        'Thinking Jensen holds only for t = 0.5: it holds for every t in [0, 1].',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đồ thị hàm {fname} có hình chiếc bát. Ta chọn hai điểm x₁ = {x1} và x₂ = {x2} trên trục hoành.',
    'The graph of {fname} is shaped like a bowl. We pick two points x₁ = {x1} and x₂ = {x2} on the horizontal axis.',
  ),
  chord: m(
    'Nối A = (x₁, f(x₁)) = ({x1}, {f1}) với B = (x₂, f(x₂)) = ({x2}, {f2}) bằng một đoạn thẳng: dây cung AB.',
    'Join A = (x₁, f(x₁)) = ({x1}, {f1}) to B = (x₂, f(x₂)) = ({x2}, {f2}) with a straight segment: the chord AB.',
  ),
  point: m(
    't = {tf}: điểm trộn M có hoành độ {xf}. Đồ thị cao {gf}, dây cung cao {cf}.',
    't = {tf}: the mixture M has abscissa {xf}. The graph is {gf} high, the chord {cf} high.',
  ),
  below: m(
    'Tại t = {tf}, đồ thị cao {gf} còn dây cung cao {cf}; vì {gf} < {cf} nên đồ thị nằm dưới dây cung.',
    'At t = {tf} the graph is {gf} high and the chord {cf} high; since {gf} < {cf} the graph is below the chord.',
  ),
  equal: m(
    'Tại t = {tf}, đồ thị cao {gf} và dây cung cũng cao {cf}: hai điểm trùng nhau, đây là dấu bằng của bất đẳng thức.',
    'At t = {tf} the graph is {gf} high and the chord is also {cf} high: the two points coincide, the equality case.',
  ),
  done: m(
    'Với t = {tf} và với mọi t trong [0, 1], đồ thị không cao hơn dây cung: đó là bất đẳng thức Jensen cho hàm lồi.',
    'For t = {tf} and for every t in [0, 1] the graph is no higher than the chord: that is Jensen for a convex function.',
  ),
};

const FN = {
  x2: { name: 'x²', p: 2, f: (x: number): number => x * x },
  abs: { name: '|x|', p: 1, f: (x: number): number => Math.abs(x) },
  x4: { name: 'x⁴', p: 4, f: (x: number): number => x * x * x * x },
} as const;

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { x1, x2, tn } = input;
  const { name, p, f } = FN[input.f];
  const f1 = f(x1);
  const f2 = f(x2);
  const lo = Math.min(x1, x2) - 1;
  const hi = Math.max(x1, x2) + 1;
  const top = Math.max(f1, f2) + 1;
  const bounds = { xmin: lo, xmax: hi, ymin: -Math.ceil(top / 8), ymax: top };
  const pieces = curvePieces(f, lo, hi, bounds.ymin, bounds.ymax, 100);
  const D = 10 ** p;
  /**
   * At t = s/10 the mixture is x = X/10 with X = s·x1 + (10 − s)·x2. The graph is f(x) = f(X)/D with D = 10^p (f is homogeneous of
   * degree p) and the chord is (s·f(x1) + (10 − s)·f(x2))/10 = C/D with C = 10^(p − 1)·(s·f(x1) + (10 − s)·f(x2)): all integers.
   */
  const at = (s: number): { X: number; g: number; c: number } => {
    const X = s * x1 + (10 - s) * x2;
    return { X, g: f(X), c: (D / 10) * (s * f1 + (10 - s) * f2) };
  };
  /** the same numbers as reduced fractions: t = s/10, x = X/10, the heights g/D and c/D */
  const fracs = (s: number, X: number, g: number, c: number) => ({
    tf: frac(s, 10),
    xf: frac(X, 10),
    gf: frac(g, D),
    cf: frac(c, D),
  });
  const base = (): Figure => {
    const fig = new Figure(bounds)
      .anchor('ax0', [lo, 0])
      .anchor('ax1', [hi, 0])
      .seg('xaxis', 'ax0', 'ax1', { dashed: true });
    pieces.forEach((pc, i) => fig.polyline(`f${i}`, pc));
    return fig.point('X1', [x1, 0], 'x₁').point('X2', [x2, 0], 'x₂');
  };
  const ends = (): Figure =>
    base()
      .point('A', [x1, f1])
      .point('B', [x2, f2])
      .seg('chord', 'A', 'B')
      .seg('v1', 'X1', 'A', { dashed: true })
      .seg('v2', 'X2', 'B', { dashed: true });
  /** the mixture M on the axis, the point G of the graph and the point C of the chord straight above it */
  const mixed = (s: number): { fig: Figure; same: boolean } => {
    const { X, g, c } = at(s);
    const same = g === c;
    const fig = ends()
      .point('M', [X / 10, 0], 'M')
      .point('G', [X / 10, g / D], 'G');
    if (!same) fig.point('C', [X / 10, c / D], 'C').seg('gap', 'G', 'C');
    return { fig, same };
  };
  const put = framePut(
    emit,
    ctx.locale,
    Object.fromEntries(pieces.map((_, i) => [`f${i}`, 'compare' as const])),
  );
  const fvars = { fname: name, x1, x2 };

  put(EX.start, 1, base(), fvars, 'start', { X1: 'active', X2: 'active' });
  put(EX.chord, 2, ends(), { ...fvars, f1, f2 }, 'chord', {
    chord: 'result',
    A: 'active',
    B: 'active',
  });
  SCRUB.forEach((s, idx) => {
    const { X, g, c } = at(s);
    const { fig, same } = mixed(s);
    put(
      EX.point,
      3,
      fig,
      { tn: s, xn: X, gn: g, cn: c, d: D, ...fracs(s, X, g, c) },
      idx === 0 ? 'point' : undefined,
      {
        M: 'active',
        G: 'active',
        ...(same ? {} : { C: 'result', gap: 'group-1' }),
      },
    );
  });
  const { X, g, c } = at(tn);
  const { fig, same } = mixed(tn);
  const marks: Record<string, HighlightKind> = {
    M: 'active',
    G: 'active',
    ...(same ? {} : { C: 'result', gap: 'group-1' }),
  };
  put(
    same ? EX.equal : EX.below,
    4,
    fig,
    { tn, xn: X, gn: g, cn: c, d: D, ...fracs(tn, X, g, c) },
    'inequality',
    marks,
  );
  put(EX.done, 4, fig, { tn, tf: frac(tn, 10) }, 'done', marks);
}

export const convexChordEntry: WalkthroughEntry<In, S> = {
  id: 'convex-chord',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-inequality-classic'],
  title: m('Dây cung trên đồ thị lồi (Jensen)', 'The chord of a convex graph (Jensen)'),
  code: {
    pseudo: [
      'đồ thị hình bát của x², |x| hoặc x⁴ với hai điểm x₁, x₂ trên trục',
      'đoạn thẳng nối hai điểm của đồ thị',
      'điểm trộn trên trục và hai điểm thẳng đứng: một trên đồ thị, một trên dây cung',
      'hai độ cao tại điểm trộn, đồ thị và dây cung, so với nhau',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => (i.x1 === i.x2 ? ['x1-equals-x2'] : []),
  customInput: false,
  presets: [
    {
      id: 'x2-mid',
      label: m('x² giữa dây cung', 'x² at the middle'),
      input: { f: 'x2', x1: -2, x2: 2, tn: 5 },
    },
    {
      id: 'abs-skew',
      label: m('|x| lệch về một phía', '|x| off centre'),
      input: { f: 'abs', x1: -3, x2: 1, tn: 3 },
    },
    { id: 'x4', label: m('x⁴', 'x⁴'), input: { f: 'x4', x1: -1, x2: 2, tn: 5 } },
    {
      id: 't-zero',
      label: m('t = 0 (đầu mút)', 't = 0 (an end)'),
      input: { f: 'x2', x1: -1, x2: 3, tn: 0 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng bất đẳng thức Jensen đúng với mọi hàm: nó đúng cho hàm lồi; với hàm lõm chiều bất đẳng thức đảo lại.',
        'Thinking Jensen holds for every function: it holds for convex ones; for a concave function the inequality reverses.',
      ),
    },
    {
      beat: 'chord',
      text: m(
        'Nghĩ rằng dây cung nằm dưới đồ thị vì đồ thị uốn lên: hàm lồi có dây cung nằm trên.',
        'Thinking the chord is below the graph because the graph curves up: a convex function has its chord above.',
      ),
    },
    {
      beat: 'point',
      text: m(
        'Nghĩ rằng t phải bằng 0,5: t là số bất kỳ trong [0, 1], và 0,5 chỉ cho trung điểm.',
        'Thinking t must be 0.5: t is any number in [0, 1] and 0.5 only gives the midpoint.',
      ),
    },
    {
      beat: 'inequality',
      text: m(
        'Nghĩ rằng dấu bằng chỉ xảy ra khi x₁ = x₂: nó còn xảy ra ở hai đầu mút t = 0 và t = 1.',
        'Thinking equality holds only when x₁ = x₂: it also holds at the two ends t = 0 and t = 1.',
      ),
    },
  ],
  maxFrames: 12,
  maxBytes: 200_000,
  run,
};
