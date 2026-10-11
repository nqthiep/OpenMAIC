/**
 * Walkthrough entry: The mean value theorem (Lagrange) (ADR 0015). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m4-limits-mvt`.
 *
 * f is a polynomial of degree 2 or 3 on [a, b]. The chord AB has the slope m = (f(b) − f(a))/(b − a); the points c with
 * f′(c) = m are the roots of h(x) = D·f′(x) − N = A·x² + B·x + C (D = b − a, N = f(b) − f(a): integers), classified against
 * a and b with integer arithmetic only, so that a root sitting on an end of the interval is never counted by mistake.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, curvePieces, frac, framePut, type FigState } from '@/lib/subjects/math/figure';

type In = { c: number[]; a: number; b: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    c: { kind: 'int-array', len: [3, 4], range: [-3, 3] },
    a: { kind: 'int', range: [-3, 1] },
    b: { kind: 'int', range: [-1, 3] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đồ thị và hai đầu mút', 'The graph and its two ends'),
    narration: m(
      'Ta có đồ thị của một đa thức f trên đoạn từ a đến b, với hai đầu mút A và B nằm trên đồ thị. Câu hỏi: trên đường cong giữa A và B có chỗ nào dốc đúng bằng độ dốc trung bình của cả đoạn không?',
      'We have the graph of a polynomial f on the stretch from a to b, with its two ends A and B on the graph. The question: between A and B, is there a place where the curve is exactly as steep as the average steepness of the whole stretch?',
    ),
    hints: [
      m(
        'Độ dốc trung bình của cả đoạn là gì?',
        'What is the average steepness of the whole stretch?',
      ),
      m(
        'Độ tăng của f chia cho độ dài đoạn.',
        'The rise of f divided by the length of the stretch.',
      ),
      m(
        'Đó cũng là hệ số góc của đoạn thẳng nối A với B.',
        'It is also the slope of the segment joining A to B.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đường cong dốc đều từ A tới B: độ dốc đổi từ điểm này sang điểm khác.',
        'Thinking the curve is equally steep from A to B: the steepness changes from point to point.',
      ),
    ],
  },
  {
    id: 'chord',
    label: m('Dây cung', 'The chord'),
    narration: m(
      'Ta nối A với B bằng một đoạn thẳng: dây cung. Hệ số góc của nó là độ tăng của f chia cho độ dài đoạn, tức độ dốc trung bình của f trên cả đoạn.',
      'We join A to B with a segment: the chord. Its slope is the rise of f divided by the length of the stretch, the average steepness of f over the whole stretch.',
    ),
    hints: [
      m(
        'Hệ số góc của đường thẳng qua hai điểm tính thế nào?',
        'How is the slope of a line through two points computed?',
      ),
      m(
        'Lấy hiệu tung độ chia hiệu hoành độ.',
        'Take the difference of heights over the difference of abscissas.',
      ),
      m('m = (f(b) − f(a)) / (b − a).', 'm = (f(b) − f(a)) / (b − a).'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hệ số góc của dây cung chính là f′ tại một đầu mút: nó là giá trị trung bình, không phải giá trị tại điểm nào.',
        'Thinking the slope of the chord is f′ at one end: it is an average, not the value at any point.',
      ),
    ],
  },
  {
    id: 'slide',
    label: m('Trượt tiếp tuyến', 'Sliding the tangent'),
    narration: m(
      'Ta dựng tiếp tuyến tại ba điểm của đoạn và so hệ số góc của nó với hệ số góc của dây cung. Có chỗ tiếp tuyến dốc hơn dây cung, có chỗ thoải hơn.',
      'We draw the tangent at three points of the stretch and compare its slope with the slope of the chord. Somewhere the tangent is steeper than the chord, somewhere it is flatter.',
    ),
    ask: {
      text: m(
        'Theo em, trong khoảng giữa A và B có điểm nào mà tiếp tuyến song song với dây cung không?',
        'Is there a point between A and B where the tangent is parallel to the chord?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Có, ít nhất một điểm', 'Yes, at least one point'),
          m('Không có điểm nào', 'No point at all'),
        ],
        // the mean value theorem: f is continuous on [a, b] and differentiable on (a, b)
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Hệ số góc của tiếp tuyến thay đổi liên tục hay nhảy cóc?',
        'Does the slope of the tangent change continuously or jump?',
      ),
      m(
        'Liên tục, vì f′ của đa thức là một đa thức.',
        'Continuously, since f′ of a polynomial is a polynomial.',
      ),
      m(
        'Nếu có chỗ dốc hơn và chỗ thoải hơn dây cung thì ở giữa phải có chỗ bằng.',
        'If it is steeper somewhere and flatter somewhere else, it must be equal in between.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tiếp tuyến song song với dây cung ở đúng trung điểm của [a, b]: chỉ đúng với hàm bậc hai.',
        'Thinking the tangent parallel to the chord is at the midpoint of [a, b]: that holds only for a quadratic.',
      ),
    ],
  },
  {
    id: 'rolle',
    label: m('Đưa về trường hợp nằm ngang', 'Reduce to the flat case'),
    narration: m(
      'Ta trừ đi dây cung: g của x bằng f của x trừ phần đường thẳng AB. Đồ thị g xuất phát từ trục ngang ở a và quay về trục ngang ở b, nên ở giữa nó có điểm cao nhất hoặc thấp nhất, và ở đó tiếp tuyến nằm ngang.',
      'We subtract the chord: g of x equals f of x minus the line AB. The graph of g starts on the horizontal axis at a and comes back to it at b, so in between it has a highest or lowest point, and there the tangent is horizontal.',
    ),
    ask: {
      text: m(
        'Theo em, g bằng 0 ở cả hai đầu mút, vậy trong khoảng giữa g có điểm cao nhất hoặc thấp nhất không?',
        'g is 0 at both ends, so does g have a highest or lowest point in between?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có', 'Yes'), m('Không', 'No')],
        // g is continuous and not identically 0 (f is a polynomial of degree at least 2, not a line)
        answer: () => 0,
      },
    },
    hints: [
      m('g(a) và g(b) bằng bao nhiêu?', 'What are g(a) and g(b)?'),
      m(
        'Cả hai bằng 0, vì dây cung đi qua A và B.',
        'Both are 0, since the chord passes through A and B.',
      ),
      m(
        'Đồ thị rời trục rồi quay về nên có một điểm xa trục nhất; tại đó g′ = 0.',
        'The graph leaves the axis and comes back, so it has a point farthest from it; there g′ = 0.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng g′ = 0 xảy ra ở hai đầu mút: ở đó g = 0, còn g′ = 0 ở điểm xa trục nhất.',
        'Thinking g′ = 0 happens at the ends: there g = 0, while g′ = 0 at the point farthest from the axis.',
      ),
    ],
  },
  {
    id: 'mvt',
    label: m('Định lý Lagrange', 'The Lagrange theorem'),
    narration: m(
      'Vì g′ bằng f′ trừ hệ số góc m của dây cung, g′ của c bằng 0 nghĩa là f′ của c bằng m. Tại điểm c đó, tiếp tuyến của f song song với dây cung. Đó là định lý giá trị trung bình của Lagrange.',
      'Since g′ equals f′ minus the slope m of the chord, g′ of c equal to 0 means f′ of c equals m. At that point c the tangent of f is parallel to the chord. This is the mean value theorem of Lagrange.',
    ),
    hints: [
      m('g′(x) bằng gì theo f′(x)?', 'What is g′(x) in terms of f′(x)?'),
      m('g′(x) = f′(x) − m.', 'g′(x) = f′(x) − m.'),
      m(
        'Nên g′(c) = 0 tức f′(c) = m: hai đường song song.',
        'So g′(c) = 0 means f′(c) = m: the two lines are parallel.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ có đúng một điểm c: với đa thức bậc ba có thể có hai điểm.',
        'Thinking there is exactly one point c: a cubic can have two.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Định lý giá trị trung bình: nếu f liên tục trên [a, b] và có đạo hàm trong (a, b) thì có c trong (a, b) với f′(c) bằng (f(b) − f(a))/(b − a). Chứng minh là trừ dây cung rồi dùng điểm cực trị. Đổi mẫu để thấy hàm bậc hai và bậc ba.',
      'The mean value theorem: if f is continuous on [a, b] and differentiable in (a, b), there is c in (a, b) with f′(c) equal to (f(b) − f(a))/(b − a). The proof subtracts the chord and uses an extreme point. Change the preset to see a quadratic and a cubic.',
    ),
    hints: [
      m('Định lý cần điều kiện gì của f?', 'What does the theorem need from f?'),
      m(
        'Liên tục trên [a, b] và có đạo hàm trong (a, b).',
        'Continuous on [a, b] and differentiable in (a, b).',
      ),
      m(
        'Khi đó có c với f′(c) bằng hệ số góc của dây cung.',
        'Then there is c with f′(c) equal to the slope of the chord.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng định lý cho biết vị trí của c: nó chỉ khẳng định c tồn tại.',
        'Thinking the theorem tells where c is: it only says that c exists.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đồ thị của f trên [{a}, {b}], hai đầu mút A = ({a}, {fa}) và B = ({b}, {fb}) nằm trên đồ thị.',
    'The graph of f on [{a}, {b}], with its two ends A = ({a}, {fa}) and B = ({b}, {fb}) on the graph.',
  ),
  chord: m(
    'Dây cung AB có hệ số góc m = (f(b) − f(a))/(b − a) = {nn}/{d} = {slope}.',
    'The chord AB has slope m = (f(b) − f(a))/(b − a) = {nn}/{d} = {slope}.',
  ),
  steeper: m(
    'Tại x = {x} tiếp tuyến có hệ số góc {s}, lớn hơn m = {slope}: tiếp tuyến dốc hơn dây cung.',
    'At x = {x} the tangent has slope {s}, larger than m = {slope}: the tangent is steeper than the chord.',
  ),
  flatter: m(
    'Tại x = {x} tiếp tuyến có hệ số góc {s}, nhỏ hơn m = {slope}: tiếp tuyến thoải hơn dây cung.',
    'At x = {x} the tangent has slope {s}, smaller than m = {slope}: the tangent is flatter than the chord.',
  ),
  equal: m(
    'Tại x = {x} tiếp tuyến có hệ số góc {s}, đúng bằng m = {slope}: tiếp tuyến song song với dây cung.',
    'At x = {x} the tangent has slope {s}, exactly m = {slope}: the tangent is parallel to the chord.',
  ),
  rolle: m(
    'g(x) = f(x) − (đường AB) có g({a}) = g({b}) = 0: đồ thị g rời trục rồi quay về, nên có điểm xa trục nhất ở c, nơi tiếp tuyến nằm ngang.',
    'g(x) = f(x) − (the line AB) has g({a}) = g({b}) = 0: g leaves the axis and returns, so it has a farthest point c where the tangent is horizontal.',
  ),
  mvtOne: m(
    'g′(c) = f′(c) − m = 0, tức f′(c) = {slope}. Có {nc} điểm c như vậy trong ({a}, {b}); tại đó tiếp tuyến của f song song với dây cung.',
    'g′(c) = f′(c) − m = 0, that is f′(c) = {slope}. There is {nc} such point c in ({a}, {b}); there the tangent of f is parallel to the chord.',
  ),
  mvtMany: m(
    'g′(c) = f′(c) − m = 0, tức f′(c) = {slope}. Có {nc} điểm c như vậy trong ({a}, {b}); tại mỗi điểm tiếp tuyến của f song song với dây cung.',
    'g′(c) = f′(c) − m = 0, that is f′(c) = {slope}. There are {nc} such points c in ({a}, {b}); at each the tangent of f is parallel to the chord.',
  ),
  mvtMid: m(
    'f bậc hai nên f′ bậc nhất: f′(c) = {slope} chỉ tại c = ({a} + {b})/2 = {mid}, đúng trung điểm của [{a}, {b}].',
    'f is quadratic so f′ is linear: f′(c) = {slope} only at c = ({a} + {b})/2 = {mid}, exactly the midpoint of [{a}, {b}].',
  ),
  done: m(
    'Có c trong ({a}, {b}) với f′(c) = (f(b) − f(a))/(b − a) = {slope}: định lý giá trị trung bình Lagrange.',
    'There is c in ({a}, {b}) with f′(c) = (f(b) − f(a))/(b − a) = {slope}: the Lagrange mean value theorem.',
  ),
};

/** the sign of ρ − t for the root ρ = (−B + s·√disc)/(2A) (s = ±1) of A·x² + B·x + C and an integer t, in integers only */
function rootVsInt(A: number, B: number, disc: number, s: 1 | -1, t: number): number {
  const u = -B - 2 * A * t; // ρ − t = (u + s·√disc)/(2A)
  let sign: number;
  if (s === 1) sign = u >= 0 ? (u === 0 && disc === 0 ? 0 : 1) : Math.sign(disc - u * u);
  else sign = u <= 0 ? (u === 0 && disc === 0 ? 0 : -1) : Math.sign(u * u - disc);
  return sign * Math.sign(A);
}

/** the roots of A·x² + B·x + C = 0 that lie strictly between the integers a < b, each once */
export function rootsIn(A: number, B: number, C: number, a: number, b: number): number[] {
  if (A === 0) {
    if (B === 0) return [];
    // x = −C/B against the integers a and b, cross-multiplied with the sign of B
    const x = -C / B;
    const above = Math.sign(-C - a * B) * Math.sign(B); // sign(x − a)
    const below = Math.sign(b * B + C) * Math.sign(B); // sign(b − x)
    return above > 0 && below > 0 ? [x] : [];
  }
  const disc = B * B - 4 * A * C;
  if (disc < 0) return [];
  const out: number[] = [];
  for (const s of disc === 0 ? [1 as const] : [-1 as const, 1 as const]) {
    if (rootVsInt(A, B, disc, s, a) > 0 && rootVsInt(A, B, disc, s, b) < 0)
      out.push((-B + s * Math.sqrt(disc)) / (2 * A));
  }
  return out.sort((p, q) => p - q);
}

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { c, a, b } = input;
  const f = (x: number): number => c.reduceRight((acc, k) => acc * x + k, 0);
  const fp = (x: number): number => c.slice(1).reduceRight((acc, k, i) => acc * x + (i + 1) * k, 0);
  const d = b - a;
  const fa = f(a);
  const fb = f(b);
  const slope = frac(fb - fa, d);
  const mf = (fb - fa) / d;
  const c3 = c[3] ?? 0;
  const cs = rootsIn(3 * c3 * d, 2 * c[2] * d, c[1] * d - (fb - fa), a, b);
  /** label of the i-th point c: 'c' when there is one, c₁ and c₂ when there are two */
  const cLabel = (i: number): string => (cs.length === 1 ? 'c' : `c${'₁₂'[i]}`);
  const g = (x: number): number => f(x) - fa - mf * (x - a);

  // the window of the graph of f and, separately, of the graph of g
  const grid = Array.from({ length: 121 }, (_, i) => a + (d * i) / 120);
  const window = (fn: (x: number) => number) => {
    const ys = [...grid.map(fn), 0];
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = Math.max(1, (hi - lo) / 8);
    return { xmin: a - 1, xmax: b + 1, ymin: lo - pad, ymax: hi + pad };
  };
  const bf = window(f);
  const bg = window(g);
  const pieces = curvePieces(f, a, b, bf.ymin, bf.ymax, 120);
  const gPieces = curvePieces(g, a, b, bg.ymin, bg.ymax, 120);
  const curveMarks = (n: number, kind: HighlightKind): Record<string, HighlightKind> =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, kind]));

  const picture = (chord: boolean): Figure => {
    const fig = new Figure(bf);
    pieces.forEach((pc, i) => fig.polyline(`f${i}`, pc));
    fig.point('A', [a, fa], 'A').point('B', [b, fb], 'B');
    if (chord) fig.seg('chord', 'A', 'B');
    return fig;
  };
  /** the tangent line at x: through the point of the graph and the point one unit to the right */
  const tangent = (fig: Figure, id: string, x: number, y: number, k: number): void => {
    fig
      .anchor(`${id}0`, [x, y])
      .anchor(`${id}1`, [x + 1, y + k])
      .line(id, `${id}0`, `${id}1`);
  };
  const put = framePut(emit, ctx.locale);
  const base = { a, b, fa, fb, d, nn: fb - fa, slope };

  put(EX.start, 1, picture(false), base, 'start', {
    ...curveMarks(pieces.length, 'compare'),
    A: 'active',
    B: 'active',
  });
  put(EX.chord, 2, picture(true), base, 'chord', {
    ...curveMarks(pieces.length, 'compare'),
    chord: 'result',
    A: 'active',
    B: 'active',
  });
  [1, 2, 3].forEach((j) => {
    const X = 4 * a + j * d; // x = X/4
    const x = X / 4;
    const s16 = 16 * c[1] + 8 * c[2] * X + 3 * c3 * X * X; // f′(x) = s16/16
    const diff = Math.sign(s16 * d - (fb - fa) * 16);
    const fig = picture(true);
    fig.point(`T${j}`, [x, f(x)], 'P');
    tangent(fig, 'tan', x, f(x), fp(x));
    put(
      diff > 0 ? EX.steeper : diff < 0 ? EX.flatter : EX.equal,
      3,
      fig,
      { ...base, x: frac(X, 4), s: frac(s16, 16) },
      j === 1 ? 'slide' : undefined,
      {
        ...curveMarks(pieces.length, 'compare'),
        chord: 'result',
        tan: 'active',
        [`T${j}`]: 'active',
      },
    );
  });

  // the graph of g = f − chord: g(a) = g(b) = 0 and horizontal tangents at the points c
  const gfig = new Figure(bg)
    .anchor('ax0', [bg.xmin, 0])
    .anchor('ax1', [bg.xmax, 0])
    .seg('axis', 'ax0', 'ax1', { dashed: true })
    .point('A0', [a, 0], 'a')
    .point('B0', [b, 0], 'b');
  gPieces.forEach((pc, i) => gfig.polyline(`g${i}`, pc));
  const gMarks: Record<string, HighlightKind> = { A0: 'active', B0: 'active' };
  gPieces.forEach((_, i) => (gMarks[`g${i}`] = 'compare'));
  cs.forEach((x, i) => {
    gfig.point(`C${i}`, [x, g(x)], cLabel(i));
    tangent(gfig, `h${i}`, x, g(x), 0);
    gMarks[`C${i}`] = 'result';
    gMarks[`h${i}`] = 'result';
  });
  put(EX.rolle, 4, gfig, base, 'rolle', gMarks);

  // back to f: the tangents parallel to the chord
  const ffig = picture(true);
  const fMarks: Record<string, HighlightKind> = {
    ...curveMarks(pieces.length, 'compare'),
    chord: 'result',
  };
  cs.forEach((x, i) => {
    ffig.point(`C${i}`, [x, f(x)], cLabel(i));
    tangent(ffig, `t${i}`, x, f(x), mf);
    fMarks[`C${i}`] = 'result';
    fMarks[`t${i}`] = 'active';
  });
  const quad = c.length === 3;
  put(
    quad ? EX.mvtMid : cs.length === 1 ? EX.mvtOne : EX.mvtMany,
    5,
    ffig,
    { ...base, nc: cs.length, mid: frac(a + b, 2) },
    'mvt',
    fMarks,
  );
  put(EX.done, 5, ffig, base, 'done', fMarks);
}

export const mvtLagrangeEntry: WalkthroughEntry<In, S> = {
  id: 'mvt-lagrange',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m4-limits-mvt'],
  title: m('Định lý giá trị trung bình (Lagrange)', 'The mean value theorem (Lagrange)'),
  code: {
    pseudo: [
      'đồ thị f trên [a, b], hai đầu mút A và B',
      'dây cung AB và hệ số góc (f(b) − f(a))/(b − a)',
      'tiếp tuyến tại ba điểm của (a, b), so hệ số góc với dây cung',
      'hiệu g = f − dây cung có g(a) = g(b) = 0 nên có điểm c với g′(c) = 0',
      'tiếp tuyến song song với dây cung tại mọi điểm c có f′(c) bằng hệ số góc',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => [
    ...(i.a >= i.b ? ['a-not-less-than-b'] : []),
    ...(i.c[i.c.length - 1] === 0 ? ['leading-coefficient-zero'] : []),
  ],
  customInput: false,
  presets: [
    {
      id: 'square',
      label: m('x² trên [0, 2] (bậc hai)', 'x² on [0, 2] (quadratic)'),
      input: { c: [0, 0, 1], a: 0, b: 2 },
    },
    {
      id: 'cubic-two',
      label: m('x³ − 3x trên [−2, 2] (hai điểm c)', 'x³ − 3x on [−2, 2] (two points c)'),
      input: { c: [0, -3, 0, 1], a: -2, b: 2 },
    },
    {
      id: 'cubic-one',
      label: m('x³ trên [0, 1] (một điểm c)', 'x³ on [0, 1] (one point c)'),
      input: { c: [0, 0, 0, 1], a: 0, b: 1 },
    },
    {
      id: 'quad-skew',
      label: m('2x² − x + 1 trên [−1, 3]', '2x² − x + 1 on [−1, 3]'),
      input: { c: [1, -1, 2], a: -1, b: 3 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'slide',
      text: m(
        'Nghĩ rằng tiếp tuyến song song với dây cung ở đúng trung điểm của [a, b]: chỉ đúng với hàm bậc hai.',
        'Thinking the tangent parallel to the chord is at the midpoint of [a, b]: that holds only for a quadratic.',
      ),
    },
    {
      beat: 'rolle',
      text: m(
        'Nghĩ rằng g′ = 0 xảy ra ở hai đầu mút: ở đó g = 0, còn g′ = 0 ở điểm xa trục nhất.',
        'Thinking g′ = 0 happens at the ends: there g = 0, while g′ = 0 at the point farthest from the axis.',
      ),
    },
    {
      beat: 'mvt',
      text: m(
        'Nghĩ rằng chỉ có đúng một điểm c: với đa thức bậc ba có thể có hai điểm.',
        'Thinking there is exactly one point c: a cubic can have two.',
      ),
    },
    {
      beat: 'done',
      text: m(
        'Nghĩ rằng định lý cho biết vị trí của c: nó chỉ khẳng định c tồn tại.',
        'Thinking the theorem tells where c is: it only says that c exists.',
      ),
    },
  ],
  maxFrames: 10,
  maxBytes: 260_000,
  run,
};
