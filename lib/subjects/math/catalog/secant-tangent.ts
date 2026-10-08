/**
 * Walkthrough entry: From the secant to the tangent (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m3-derivative-graphs`.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, curvePieces, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { c: number[]; x0: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    c: { kind: 'int-array', len: [3, 4], range: [-3, 3] },
    x0: { kind: 'int', range: [-2, 2] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đồ thị', 'The graph'),
    narration: m(
      'Ta vẽ đồ thị của một đa thức trên hệ trục toạ độ và chọn một điểm P có hoành độ x không. Câu hỏi: đồ thị dốc bao nhiêu đúng tại P?',
      'We draw the graph of a polynomial on the axes and pick a point P with x-coordinate x zero. The question: how steep is the graph exactly at P?',
    ),
    hints: [
      m('Một đường cong có độ dốc không đổi không?', 'Does a curve have one constant steepness?'),
      m('Không, nó thay đổi từ điểm này sang điểm khác.', 'No, it changes from point to point.'),
      m(
        'Ta cần định nghĩa độ dốc tại một điểm, và sẽ làm bằng cát tuyến.',
        'We need to define steepness at one point, and will do it with secants.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng độ dốc của đường cong chỉ có nghĩa với đường thẳng: đường cong có độ dốc khác nhau ở mỗi điểm.',
        'Thinking steepness only makes sense for a straight line: a curve has a different steepness at each point.',
      ),
    ],
  },
  {
    id: 'secant',
    label: m('Cát tuyến', 'The secant'),
    narration: m(
      'Ta lấy thêm điểm Q cách P một khoảng h bằng 1 theo chiều ngang và vẽ đường thẳng qua P và Q: cát tuyến. Hệ số góc của cát tuyến là độ tăng của f chia cho h.',
      'We take another point Q at horizontal distance h equal to 1 from P and draw the line through P and Q: the secant. The slope of the secant is the rise of f divided by h.',
    ),
    ask: {
      text: m(
        'Theo em, hệ số góc của cát tuyến lúc này có bằng độ dốc thật của đồ thị tại P không?',
        'Is the slope of the secant now equal to the true steepness of the graph at P?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Bằng', 'Equal'), m('Chưa chắc bằng', 'Not necessarily equal')],
        // for h = 1 the secant slope is f(x0 + 1) - f(x0); it equals f'(x0) only for special data
        answer: (frame) => ((frame.meta.vars as { same: number }).same === 1 ? 0 : 1),
      },
    },
    hints: [
      m(
        'Hệ số góc của đường thẳng qua hai điểm tính thế nào?',
        'How is the slope of a line through two points computed?',
      ),
      m('Lấy độ tăng của y chia độ tăng của x.', 'Take the rise in y over the run in x.'),
      m('k = (f(x₀ + h) − f(x₀)) / h với h = 1.', 'k = (f(x₀ + h) − f(x₀)) / h with h = 1.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cát tuyến luôn cắt đồ thị đúng hai điểm: nó có thể cắt nhiều hơn với đa thức bậc ba.',
        'Thinking a secant meets the graph at exactly two points: it can meet more with a cubic.',
      ),
    ],
  },
  {
    id: 'limit',
    label: m('Cho h tiến tới 0', 'Letting h go to 0'),
    narration: m(
      'Ta thu nhỏ h dần: Q trượt về P, và cát tuyến xoay quanh P. Hệ số góc của cát tuyến ổn định dần về một giá trị.',
      'We shrink h: Q slides toward P and the secant turns about P. The slope of the secant settles toward one value.',
    ),
    ask: {
      text: m('Hệ số góc đang tiến tới số nào?', 'Which number is the slope approaching?'),
      predict: {
        kind: 'choice',
        options: [
          m('Một số cố định', 'A fixed number'),
          m('Lớn vô hạn', 'Without bound'),
          m('Dao động qua lại', 'It keeps swinging'),
        ],
        // a polynomial is differentiable: the slopes of the secants settle on f'(x0)
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Điều gì xảy ra với hệ số góc khi h rất nhỏ?',
        'What happens to the slope when h is very small?',
      ),
      m(
        'Nó thay đổi rất ít giữa hai lần thu nhỏ liên tiếp.',
        'It changes very little between two successive shrinks.',
      ),
      m(
        'Nó tiến tới một số cố định: đó là đạo hàm tại x₀.',
        'It approaches a fixed number: the derivative at x₀.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng h phải bằng 0: khi h = 0 thì chia cho 0; ta chỉ cho h tiến tới 0.',
        'Thinking h must equal 0: at h = 0 we would divide by 0; we only let h go to 0.',
      ),
    ],
  },
  {
    id: 'tangent',
    label: m('Tiếp tuyến', 'The tangent'),
    narration: m(
      'Vị trí giới hạn của cát tuyến là tiếp tuyến của đồ thị tại P. Hệ số góc của tiếp tuyến chính là đạo hàm f phẩy tại x không.',
      'The limiting position of the secant is the tangent to the graph at P. The slope of the tangent is exactly the derivative f prime at x zero.',
    ),
    hints: [
      m('Tiếp tuyến là vị trí giới hạn của gì?', 'The tangent is the limiting position of what?'),
      m('Của cát tuyến PQ khi Q tiến tới P.', 'Of the secant PQ as Q goes to P.'),
      m(
        'Hệ số góc của nó là f′(x₀), tính từ hệ số của đa thức.',
        'Its slope is f′(x₀), computed from the coefficients of the polynomial.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tiếp tuyến chỉ chạm đồ thị tại một điểm: nó có thể cắt đồ thị ở chỗ khác.',
        'Thinking a tangent touches the graph at one point only: it may cross the graph elsewhere.',
      ),
      m(
        'Nghĩ rằng đạo hàm bằng 0 thì chắc chắn là cực trị: x³ có đạo hàm 0 tại 0 nhưng không có cực trị.',
        'Thinking a zero derivative is surely an extremum: x³ has derivative 0 at 0 but no extremum.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Độ dốc của cát tuyến tiến tới đạo hàm khi h → 0: đạo hàm tại x₀ chính là hệ số góc của tiếp tuyến. Thử mẫu có f′ = 0 để thấy tiếp tuyến nằm ngang.',
      'The slope of the secant approaches the derivative as h → 0: the derivative at x₀ is the slope of the tangent. Try the preset with f′ = 0 to see a horizontal tangent.',
    ),
    hints: [
      m('Đạo hàm là giới hạn của đại lượng nào?', 'The derivative is the limit of which quantity?'),
      m(
        'Của hệ số góc cát tuyến Δf/h khi h tiến về 0.',
        'Of the slope of the secant Δf/h as h tends to 0.',
      ),
      m(
        'Hệ số góc đó là hệ số góc của tiếp tuyến tại P.',
        'That slope is the slope of the tangent at P.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tiếp tuyến chỉ cắt đồ thị tại một điểm: nó có thể cắt thêm ở chỗ khác.',
        'Thinking the tangent meets the graph at one point only: it may meet it again elsewhere.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đồ thị của đa thức f và điểm P có hoành độ x₀ = {x0}, tung độ f(x₀) = {f0}. Câu hỏi: đồ thị dốc đến mức nào đúng tại P?',
    'The graph of the polynomial f and the point P with abscissa x₀ = {x0}, ordinate f(x₀) = {f0}. The question: how steep is the graph exactly at P?',
  ),
  secant: m(
    'Lấy Q cách P một đoạn h = 1 theo chiều ngang và kẻ cát tuyến PQ. Hệ số góc của nó là Δf/h = {num}/{den}.',
    'Take Q at horizontal distance h = 1 from P and draw the secant PQ. Its slope is Δf/h = {num}/{den}.',
  ),
  limit: m(
    'Thu nhỏ h còn 1/{h}: Q trượt về P, cát tuyến xoay quanh P. Hệ số góc Δf/h = {num}/{den}.',
    'Shrink h to 1/{h}: Q slides toward P and the secant turns about P. Its slope Δf/h = {num}/{den}.',
  ),
  tangent: m(
    'Vị trí giới hạn của cát tuyến là tiếp tuyến tại P, hệ số góc đúng bằng đạo hàm f′({x0}) = {fp}.',
    'The limiting position of the secant is the tangent at P, with slope exactly the derivative f′({x0}) = {fp}.',
  ),
  done: m(
    'Độ dốc của cát tuyến tiến tới f′({x0}) = {fp} khi h → 0. Đạo hàm là hệ số góc của tiếp tuyến.',
    'The slope of the secant approaches f′({x0}) = {fp} as h → 0. The derivative is the slope of the tangent.',
  ),
};

/** the steps of h: 1, 1/2, 1/4, 1/8 */
const SHRINKS = [1, 2, 4, 8];

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { c, x0 } = input;
  const f = (x: number): number => c.reduceRight((acc, k) => acc * x + k, 0);
  const fp = c.slice(1).reduceRight((acc, k, i) => acc * x0 + (i + 1) * k, 0);
  const f0 = f(x0);
  const d = c.length - 1;
  /**
   * The slope of the secant for h = 1/2^j as an exact fraction N/D (integers): with p = x0·2^j + 1 the point x0 + h is p/2^j,
   * so 2^(j·d)·f(x0 + h) = Σ c_i·p^i·2^(j·(d − i)) is an integer and the slope is (that − 2^(j·d)·f(x0)) / 2^(j·(d − 1)).
   */
  const secantSlope = (j: number): { num: number; den: number } => {
    const p = x0 * 2 ** j + 1;
    let top = 0;
    for (let i = 0; i <= d; i++) top += c[i] * p ** i * 2 ** (j * (d - i));
    return { num: top - f0 * 2 ** (j * d), den: 2 ** (j * (d - 1)) };
  };
  const w = 3;
  const ctr = f0;
  const bounds = { xmin: x0 - w, xmax: x0 + w, ymin: ctr - 4, ymax: ctr + 4 };
  const pieces = curvePieces(f, bounds.xmin, bounds.xmax, bounds.ymin, bounds.ymax, 120);
  const inWin = (p: Pt): boolean =>
    p[0] >= bounds.xmin && p[0] <= bounds.xmax && p[1] >= bounds.ymin && p[1] <= bounds.ymax;
  const base = (): Figure => {
    const fig = new Figure(bounds).point('P', [x0, f0]);
    pieces.forEach((pc, i) => fig.polyline(`f${i}`, pc));
    if (bounds.ymin <= 0 && bounds.ymax >= 0) {
      fig
        .anchor('ax0', [bounds.xmin, 0])
        .anchor('ax1', [bounds.xmax, 0])
        .seg('xaxis', 'ax0', 'ax1', { dashed: true });
    }
    return fig;
  };
  const secant = (j: number): Figure => {
    const h = 1 / 2 ** j;
    const q: Pt = [x0 + h, f(x0 + h)];
    const fig = base().line('sec', 'P', 'Q');
    fig.point('Q', q);
    if (inWin(q))
      fig
        .anchor('Rq', [q[0], f0])
        .seg('run', 'P', 'Rq', { dashed: true })
        .seg('rise', 'Rq', 'Q', { dashed: true });
    return fig;
  };
  const curveMarks = (): Record<string, HighlightKind> =>
    Object.fromEntries(pieces.map((_, i) => [`f${i}`, 'compare' as const]));
  const put = (
    text: Messages,
    codeLine: number,
    fig: Figure,
    vars: Record<string, number>,
    tag: string | undefined,
    marks: Record<string, HighlightKind>,
  ): void =>
    emit(fig.snapshot(), {
      explanation: fill(msg(text, ctx.locale), vars),
      codeLine,
      highlights: { ...curveMarks(), ...marks },
      vars,
      ...(tag ? { tags: [`beat:${tag}`] } : {}),
    });

  put(EX.start, 1, base(), { x0, f0 }, 'start', { P: 'active' });
  const s0 = secantSlope(0);
  put(
    EX.secant,
    2,
    secant(0),
    { num: s0.num, den: s0.den, same: s0.num === fp * s0.den ? 1 : 0 },
    'secant',
    {
      sec: 'active',
      Q: 'active',
      P: 'active',
    },
  );
  SHRINKS.slice(1).forEach((h, idx) => {
    const sl = secantSlope(idx + 1);
    put(
      EX.limit,
      3,
      secant(idx + 1),
      { h, num: sl.num, den: sl.den },
      idx === 0 ? 'limit' : undefined,
      { sec: 'active', Q: 'active', P: 'active' },
    );
  });
  const tangent = base()
    .anchor('T', [x0 + 1, f0 + fp])
    .line('tan', 'P', 'T');
  put(EX.tangent, 4, tangent, { x0, fp }, 'tangent', { tan: 'result', P: 'result' });
  put(EX.done, 4, tangent, { x0, fp }, 'done', { tan: 'result', P: 'result' });
}

export const secantTangentEntry: WalkthroughEntry<In, S> = {
  id: 'secant-tangent',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m3-derivative-graphs'],
  title: m('Từ cát tuyến đến tiếp tuyến', 'From the secant to the tangent'),
  code: {
    pseudo: [
      'đồ thị đa thức trên hệ trục, điểm P tại x₀',
      'điểm Q ở x₀ + 1, đường thẳng PQ',
      'h giảm 1, 1/2, 1/4, 1/8; cát tuyến xoay dần quanh P',
      'tiếp tuyến tại P với hệ số góc f′(x₀)',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => (i.c[i.c.length - 1] === 0 ? ['leading-coefficient-zero'] : []),
  customInput: false,
  presets: [
    { id: 'square-at-1', label: m('x² tại x = 1', 'x² at x = 1'), input: { c: [0, 0, 1], x0: 1 } },
    {
      id: 'cubic-at-0',
      label: m('x³ − 3x tại x = 0', 'x³ − 3x at x = 0'),
      input: { c: [0, -3, 0, 1], x0: 0 },
    },
    {
      id: 'stationary',
      label: m('x³ − 3x tại x = 1 (tiếp tuyến ngang)', 'x³ − 3x at x = 1 (flat tangent)'),
      input: { c: [0, -3, 0, 1], x0: 1 },
    },
    {
      id: 'quad-at-minus-1',
      label: m('2x² − x + 1 tại x = −1', '2x² − x + 1 at x = −1'),
      input: { c: [1, -1, 2], x0: -1 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng độ dốc của đường cong chỉ có nghĩa với đường thẳng: đường cong có độ dốc khác nhau ở mỗi điểm.',
        'Thinking steepness only makes sense for a straight line: a curve has a different steepness at each point.',
      ),
    },
    {
      beat: 'secant',
      text: m(
        'Nghĩ rằng cát tuyến luôn cắt đồ thị đúng hai điểm: nó có thể cắt nhiều hơn với đa thức bậc ba.',
        'Thinking a secant meets the graph at exactly two points: it can meet more with a cubic.',
      ),
    },
    {
      beat: 'limit',
      text: m(
        'Nghĩ rằng h phải bằng 0: khi h = 0 thì chia cho 0; ta chỉ cho h tiến tới 0.',
        'Thinking h must equal 0: at h = 0 we would divide by 0; we only let h go to 0.',
      ),
    },
    {
      beat: 'tangent',
      text: m(
        'Nghĩ rằng tiếp tuyến chỉ chạm đồ thị tại một điểm: nó có thể cắt đồ thị ở chỗ khác.',
        'Thinking a tangent touches the graph at one point only: it may cross the graph elsewhere.',
      ),
    },
    {
      beat: 'tangent',
      text: m(
        'Nghĩ rằng đạo hàm bằng 0 thì chắc chắn là cực trị: x³ có đạo hàm 0 tại 0 nhưng không có cực trị.',
        'Thinking a zero derivative is surely an extremum: x³ has derivative 0 at 0 but no extremum.',
      ),
    },
  ],
  maxFrames: 8,
  maxBytes: 200_000,
  run,
};
