/**
 * Walkthrough entry: Riemann sums and the integral (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m4-integral`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, curvePieces, frac, framePut, type FigState } from '@/lib/subjects/math/figure';

type In = { c: number[]; a: number; b: number; n: 4 | 8 | 16 };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    c: { kind: 'int-array', len: [1, 4], range: [-3, 3] },
    a: { kind: 'int', range: [-3, 2] },
    b: { kind: 'int', range: [-2, 3] },
    n: { kind: 'enum', values: [4, 8, 16] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Diện tích dưới đồ thị', 'Area under the graph'),
    narration: m(
      'Ta muốn biết diện tích của vùng nằm giữa đồ thị và trục hoành, từ a đến b. Vùng này có biên cong nên ta chưa có công thức diện tích trực tiếp.',
      'We want the area of the region between the graph and the horizontal axis, from a to b. The region has a curved edge, so we have no direct area formula yet.',
    ),
    hints: [
      m(
        'Vùng nằm giữa đồ thị và trục: ta đo nó thế nào?',
        'How do we measure the region between the graph and the axis?',
      ),
      m(
        'Bằng cách xấp xỉ bằng các hình có diện tích biết trước.',
        'By approximating it with shapes whose area we know.',
      ),
      m('Hình chữ nhật là lựa chọn đơn giản nhất.', 'Rectangles are the simplest choice.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng diện tích dưới trục hoành cũng cộng dương: tích phân tính diện tích có dấu, phần dưới trục là âm.',
        'Thinking area below the axis also adds as positive: the integral counts signed area, and the part below the axis is negative.',
      ),
    ],
  },
  {
    id: 'rectangles',
    label: m('Hình chữ nhật', 'Rectangles'),
    narration: m(
      'Ta chia đoạn từ a đến b thành n phần bằng nhau và dựng mỗi phần một hình chữ nhật, cao bằng giá trị của hàm ở đầu bên trái. Tổng diện tích các hình chữ nhật là một giá trị gần đúng.',
      'We cut the stretch from a to b into n equal parts and build a rectangle on each, as tall as the function at its left end. The total area of the rectangles is an approximation.',
    ),
    ask: {
      text: m(
        'Theo em, các hình chữ nhật có phủ vừa khít vùng không?',
        'Do the rectangles cover the region exactly?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Vừa khít', 'Exactly'), m('Chỉ gần đúng', 'Only approximately')],
        // the left sum equals the integral only when the graph is flat enough (a constant function): the frame says which
        answer: (frame) => ((frame.meta.vars as { exact: number }).exact === 1 ? 0 : 1),
      },
    },
    hints: [
      m(
        'Mỗi hình chữ nhật rộng bao nhiêu và cao bao nhiêu?',
        'How wide and how tall is each rectangle?',
      ),
      m(
        'Rộng Δx = (b − a)/n, cao f(xᵢ) tại đầu bên trái.',
        'Δx = (b − a)/n wide, f(xᵢ) tall at the left end.',
      ),
      m(
        'Diện tích mỗi hình là f(xᵢ)·Δx, và ta cộng n hình.',
        'Each has area f(xᵢ)·Δx, and we add n of them.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tổng các hình chữ nhật chính xác bằng diện tích: nó chỉ gần đúng, trừ hàm hằng.',
        'Thinking the rectangle total equals the area exactly: it is only approximate, except for a constant function.',
      ),
    ],
  },
  {
    id: 'refine',
    label: m('Chia nhỏ hơn', 'Finer cuts'),
    narration: m(
      'Ta tăng n, dựng nhiều hình chữ nhật mỏng hơn, và xem tổng thay đổi thế nào. Các hình chữ nhật bám sát đồ thị hơn và khoảng hở bé dần.',
      'We increase n, build more and thinner rectangles, and watch how the total changes. The rectangles hug the graph more closely and the gaps get smaller.',
    ),
    ask: {
      text: m(
        'Khi ta tăng n lên gấp đôi rồi gấp bốn, sai số tăng hay giảm?',
        'When we double n and then double it again, does the error grow or shrink?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Tăng', 'Grows'), m('Giảm', 'Shrinks'), m('Không đổi', 'Stays the same')],
        // compares the error after n parts with the error after 4n parts (the frame carries which one is smaller)
        answer: (frame) => (frame.meta.vars as { trend: number }).trend,
      },
    },
    hints: [
      m(
        'Hình chữ nhật mỏng hơn thì bám đồ thị tốt hơn hay kém hơn?',
        'Do thinner rectangles follow the graph better or worse?',
      ),
      m('Tốt hơn, vì khoảng hở bé đi.', 'Better, because the gaps get smaller.'),
      m(
        'Sai số giảm khi n tăng, với tốc độ khoảng 1/n.',
        'The error falls as n grows, at a rate of about 1/n.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tăng n không giúp ích vì tổng vẫn chỉ là gần đúng: sai số giảm tỉ lệ với 1/n.',
        'Thinking raising n does not help since the sum is still only approximate: the error shrinks in proportion to 1/n.',
      ),
    ],
  },
  {
    id: 'limit',
    label: m('Giới hạn', 'The limit'),
    narration: m(
      'Khi n lớn tới mức không đếm xuể, tổng các hình chữ nhật tiến tới một số cố định. Số đó là tích phân của f từ a đến b. Ta cũng tính được nó từ nguyên hàm F, tức hàm có đạo hàm bằng f.',
      'When n grows beyond counting, the sum of the rectangles approaches one fixed number. That number is the integral of f from a to b. We can also compute it from an antiderivative F, a function whose derivative is f.',
    ),
    hints: [
      m('Tổng Lₙ tiến tới số nào khi n lớn?', 'Which number does the sum Lₙ approach as n grows?'),
      m('Tới tích phân I.', 'The integral I.'),
      m(
        'Ta cũng có I = F(b) − F(a) với F là nguyên hàm của f.',
        'We also have I = F(b) − F(a) with F an antiderivative of f.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng giới hạn là số hình chữ nhật vô hạn nhân diện tích bằng 0: đó là giới hạn của các tổng, có giá trị hữu hạn.',
        'Thinking the limit is infinitely many rectangles of area 0: it is the limit of the sums, which is a finite value.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng Riemann Lₙ tiến tới tích phân I = F(b) − F(a), cũng là diện tích có dấu giữa đồ thị và trục hoành. Thử preset hàm hằng: tổng đúng ngay; đồ thị cong thì cần n lớn.',
      'The Riemann sum Lₙ approaches the integral I = F(b) − F(a), also the signed area between the graph and the horizontal axis. Change the preset: a constant gives the exact sum at once, while a curved graph needs a large n.',
    ),
    hints: [
      m('Lₙ tiến tới số nào khi n lớn?', 'Which number does Lₙ approach as n grows?'),
      m('Tới tích phân I của f từ a đến b.', 'The integral I of f from a to b.'),
      m(
        'Ta tính I = F(b) − F(a) với F là nguyên hàm của f.',
        'We compute I = F(b) − F(a) with F an antiderivative of f.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cần vô hạn hình chữ nhật mới có đáp án: nguyên hàm cho I ngay, còn tổng Riemann chỉ giải thích vì sao I là diện tích.',
        'Thinking infinitely many rectangles are needed for an answer: the antiderivative gives I at once, and the Riemann sum only explains why I is the area.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Vùng nằm giữa đồ thị hàm f và trục hoành từ a = {a} đến b = {b}. Biên trên cong nên ta chưa có công thức diện tích trực tiếp.',
    'The region between the graph of f and the horizontal axis from a = {a} to b = {b}. Its upper edge is curved, so we have no direct area formula yet.',
  ),
  rectangles: m(
    'Chia [{a}, {b}] thành n = {n} phần bằng nhau, mỗi phần một hình chữ nhật cao bằng f ở đầu bên trái. Tổng diện tích L = {L}.',
    'Cut [{a}, {b}] into n = {n} equal parts, one rectangle on each as tall as f at its left end. The total area is L = {L}.',
  ),
  refine: m(
    'Tăng lên n = {n} hình chữ nhật mỏng hơn: tổng diện tích L = {L}, các hình bám đồ thị sát hơn.',
    'Raise it to n = {n} thinner rectangles: the total area is L = {L}, and they hug the graph more closely.',
  ),
  limit: m(
    'Tích phân I = {V}. Chênh lệch |I − L| ở n = {n1}, {n2}, {n3} là {E1}, {E2}, {E3}; khi n lớn dần, L tiến tới I.',
    'The integral is I = {V}. The difference |I − L| at n = {n1}, {n2}, {n3} is {E1}, {E2}, {E3}; as n grows, L approaches I.',
  ),
  done: m(
    'Tổng Riemann Lₙ tiến tới tích phân I = F(b) − F(a) = {V}, cũng là diện tích có dấu giữa đồ thị và trục hoành.',
    'The Riemann sum Lₙ approaches the integral I = F(b) − F(a) = {V}, also the signed area between the graph and the horizontal axis.',
  ),
};

/** a fraction object as text */
const fr = (g: { num: number; den: number }): string => frac(g.num, g.den);

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { c, a, b, n } = input;
  const d = c.length - 1;
  const w = b - a;
  const f = (x: number): number => c.reduceRight((acc, k) => acc * x + k, 0);
  /**
   * The left sum with m equal parts as the exact fraction N/m^(d+1): the left ends are x_i = X_i/m with X_i = a·m + i·w, so
   * L = (w/m)·Σ f(x_i) = w·Σ_i Σ_j c_j·X_i^j·m^(d − j) / m^(d + 1), all integers.
   */
  const left = (m: number): { num: number; den: number } => {
    let sum = 0;
    for (let i = 0; i < m; i++) {
      const X = a * m + i * w;
      for (let j = 0; j <= d; j++) sum += c[j] * X ** j * m ** (d - j);
    }
    return { num: w * sum, den: m ** (d + 1) };
  };
  /** the integral F(b) − F(a) with F = Σ c_j·x^(j+1)/(j+1), as Vn/12 (12 is divisible by every j + 1 ≤ 4) */
  let vn = 0;
  for (let j = 0; j <= d; j++) vn += c[j] * (12 / (j + 1)) * (b ** (j + 1) - a ** (j + 1));
  const V = frac(vn, 12);
  /** |L − I| as a fraction: |12·N − Vn·D| / (12·D) */
  const gap = (m: number): { num: number; den: number } => {
    const { num, den } = left(m);
    return { num: Math.abs(12 * num - vn * den), den: 12 * den };
  };
  const sizes = [n, 2 * n, 4 * n];
  const gaps = sizes.map(gap);
  const value = (g: { num: number; den: number }): number => g.num / g.den;
  const exact = gaps[0].num === 0 ? 1 : 0;
  // the error after n and after 4n parts: 0 smaller, 1 bigger, 2 the same
  const trend = value(gaps[2]) < value(gaps[0]) ? 1 : value(gaps[2]) > value(gaps[0]) ? 0 : 2;

  const ys: number[] = [0];
  for (let i = 0; i <= 120; i++) ys.push(f(a + (w * i) / 120));
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = Math.max(1, Math.ceil((hi - lo) / 10));
  const bounds = { xmin: a - 1, xmax: b + 1, ymin: lo - pad, ymax: hi + pad };
  const pieces = curvePieces(f, a, b, bounds.ymin, bounds.ymax, 120);
  const curveMarks: Record<string, HighlightKind> = Object.fromEntries(
    pieces.map((_, i) => [`f${i}`, 'result' as const]),
  );
  const base = (): Figure => {
    const fig = new Figure(bounds)
      .anchor('ax0', [a - 1, 0])
      .anchor('ax1', [b + 1, 0])
      .seg('xaxis', 'ax0', 'ax1', { dashed: true })
      .anchor('ta', [a, f(a)])
      .anchor('tb', [b, f(b)])
      .point('A', [a, 0], 'a')
      .point('B', [b, 0], 'b')
      .seg('la', 'A', 'ta', { dashed: true })
      .seg('lb', 'B', 'tb', { dashed: true });
    pieces.forEach((pc, i) => fig.polyline(`f${i}`, pc));
    return fig;
  };
  /** m rectangles as tall as f at their left ends (below the axis when f is negative) */
  const rects = (m: number): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const fig = base();
    const marks: Record<string, HighlightKind> = { ...curveMarks };
    for (let i = 0; i < m; i++) {
      const x0 = a + (w * i) / m;
      const x1 = a + (w * (i + 1)) / m;
      const y = f(x0);
      fig.rect(`r${i}`, x0, Math.min(0, y), x1, Math.max(0, y));
      marks[`r${i}`] = y < 0 ? 'group-1' : 'group-0';
    }
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const plain = base();

  put(EX.start, 1, plain, { a, b }, 'start', curveMarks);
  const first = rects(n);
  put(EX.rectangles, 2, first.fig, { a, b, n, L: fr(left(n)), exact }, 'rectangles', first.marks);
  [2 * n, 4 * n].forEach((m, i) => {
    const r = rects(m);
    put(
      EX.refine,
      3,
      r.fig,
      { n: m, L: fr(left(m)), trend },
      i === 0 ? 'refine' : undefined,
      r.marks,
    );
  });
  const finest = rects(4 * n);
  const muted: Record<string, HighlightKind> = { ...finest.marks };
  for (const k of Object.keys(muted)) if (k.startsWith('r')) muted[k] = 'muted';
  put(
    EX.limit,
    4,
    finest.fig,
    {
      V,
      n1: sizes[0],
      n2: sizes[1],
      n3: sizes[2],
      E1: fr(gaps[0]),
      E2: fr(gaps[1]),
      E3: fr(gaps[2]),
    },
    'limit',
    muted,
  );
  put(EX.done, 4, plain, { V }, 'done', { ...curveMarks, A: 'result', B: 'result' });
}

export const riemannIntegralEntry: WalkthroughEntry<In, S> = {
  id: 'riemann-integral',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m4-integral'],
  title: m('Tổng Riemann và tích phân', 'Riemann sums and the integral'),
  code: {
    pseudo: [
      'vùng giữa đồ thị và trục hoành từ a đến b',
      'n hình chữ nhật có chiều cao f tại đầu bên trái mỗi đoạn, và tổng diện tích Lₙ',
      'n tăng gấp đôi rồi gấp bốn; các hình chữ nhật mỏng dần',
      'tích phân tính từ nguyên hàm, và chênh lệch với Lₙ ở ba giá trị của n',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => (i.a >= i.b ? ['a-not-less-than-b'] : []),
  customInput: false,
  presets: [
    {
      id: 'x2-4',
      label: m('x² trên [0, 2], 4 hình chữ nhật', 'x² on [0, 2], 4 rectangles'),
      input: { c: [0, 0, 1], a: 0, b: 2, n: 4 },
    },
    {
      id: 'x2-16',
      label: m('x² trên [0, 2], 16 hình chữ nhật', 'x² on [0, 2], 16 rectangles'),
      input: { c: [0, 0, 1], a: 0, b: 2, n: 16 },
    },
    {
      id: 'const',
      label: m('hằng số 2 trên [−1, 2]', 'the constant 2 on [−1, 2]'),
      input: { c: [2], a: -1, b: 2, n: 4 },
    },
    {
      id: 'cubic',
      label: m('x³ − x trên [−1, 2]', 'x³ − x on [−1, 2]'),
      input: { c: [0, -1, 0, 1], a: -1, b: 2, n: 8 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng diện tích dưới trục hoành cũng cộng dương: tích phân tính diện tích có dấu, phần dưới trục là âm.',
        'Thinking area below the axis also adds as positive: the integral counts signed area, and the part below the axis is negative.',
      ),
    },
    {
      beat: 'rectangles',
      text: m(
        'Nghĩ rằng tổng các hình chữ nhật chính xác bằng diện tích: nó chỉ gần đúng, trừ hàm hằng.',
        'Thinking the rectangle total equals the area exactly: it is only approximate, except for a constant function.',
      ),
    },
    {
      beat: 'refine',
      text: m(
        'Nghĩ rằng tăng n không giúp ích vì tổng vẫn chỉ là gần đúng: sai số giảm tỉ lệ với 1/n.',
        'Thinking raising n does not help since the sum is still only approximate: the error shrinks in proportion to 1/n.',
      ),
    },
    {
      beat: 'limit',
      text: m(
        'Nghĩ rằng giới hạn là số hình chữ nhật vô hạn nhân diện tích bằng 0: đó là giới hạn của các tổng, có giá trị hữu hạn.',
        'Thinking the limit is infinitely many rectangles of area 0: it is the limit of the sums, which is a finite value.',
      ),
    },
  ],
  maxFrames: 8,
  maxBytes: 200_000,
  run,
};
