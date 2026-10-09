/**
 * Walkthrough entry: The Euclidean algorithm with squares (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-euclid-diophantine`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { a: number; b: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { a: { kind: 'int', range: [1, 60] }, b: { kind: 'int', range: [1, 60] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Hình chữ nhật', 'The rectangle'),
    narration: m(
      'Ta vẽ một hình chữ nhật có hai cạnh là a và b. Ta muốn lát kín nó bằng những hình vuông bằng nhau, to nhất có thể. Cạnh lớn nhất của hình vuông như vậy là ước chung lớn nhất của a và b.',
      'We draw a rectangle with sides a and b. We want to tile it exactly with equal squares, as large as possible. The largest side of such a square is the greatest common divisor of a and b.',
    ),
    hints: [
      m(
        'Hình vuông nào lát vừa khít được hình chữ nhật a × b?',
        'Which squares can tile the a × b rectangle exactly?',
      ),
      m(
        'Hình vuông có cạnh là một ước chung của a và b.',
        'Squares whose side is a common divisor of a and b.',
      ),
      m(
        'Cạnh lớn nhất như vậy là ước chung lớn nhất.',
        'The largest such side is the greatest common divisor.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng gcd luôn là số nhỏ hơn trong hai số: chỉ khi số nhỏ chia hết số lớn.',
        'Thinking the gcd is always the smaller of the two numbers: only when the smaller divides the larger.',
      ),
    ],
  },
  {
    id: 'squares',
    label: m('Cắt hình vuông', 'Cutting squares'),
    narration: m(
      'Ta cắt từ hình chữ nhật những hình vuông lớn nhất có thể, cạnh bằng cạnh ngắn. Còn lại một hình chữ nhật nhỏ hơn.',
      'We cut from the rectangle the largest squares we can, with side equal to the short side. A smaller rectangle is left.',
    ),
    ask: {
      text: m(
        'Hình vuông lớn nhất cắt được có cạnh bằng bao nhiêu?',
        'What is the side of the largest square we can cut?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Cạnh ngắn', 'The short side'),
          m('Cạnh dài', 'The long side'),
          m('Hiệu hai cạnh', 'The difference of the sides'),
        ],
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Có thể cắt bao nhiêu hình vuông cạnh y từ một hình chữ nhật x × y?',
        'How many squares of side y can we cut from an x × y rectangle?',
      ),
      m('Bằng phần nguyên của x chia y.', 'The whole part of x divided by y.'),
      m(
        'Phần thừa là hình chữ nhật y × r với r là số dư.',
        'The leftover is a y × r rectangle where r is the remainder.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ cắt được một hình vuông mỗi lần: có thể cắt q hình, với q là thương của phép chia.',
        'Thinking only one square can be cut each time: q of them, where q is the quotient of the division.',
      ),
    ],
  },
  {
    id: 'repeat',
    label: m('Lặp lại', 'Repeating'),
    narration: m(
      'Với hình chữ nhật còn lại ta làm đúng như vậy, và cứ thế cho tới khi không còn mảnh thừa. Mỗi lần cạnh ngắn giảm đi, nên quá trình chắc chắn kết thúc.',
      'With the rectangle that is left we do exactly the same, and again until nothing is left over. Each time the short side gets smaller, so the process is sure to end.',
    ),
    ask: {
      text: m(
        'Hình vuông cuối cùng có cạnh bao nhiêu?',
        'What is the side of the very last square?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Cạnh ngắn ban đầu', 'The original short side'),
          m('ƯCLN của hai cạnh', 'The gcd of the two sides'),
          m('Hiệu hai cạnh', 'The difference of the sides'),
        ],
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Vì sao lặp được với hình chữ nhật còn lại?',
        'Why can we repeat with the leftover rectangle?',
      ),
      m(
        'Vì ước chung của hai cạnh ban đầu cũng chia hết phần thừa.',
        'Because a common divisor of the first two sides also divides the leftover.',
      ),
      m(
        'Nên gcd(x, y) = gcd(y, x mod y), và bài toán nhỏ dần.',
        'So gcd(x, y) = gcd(y, x mod y), and the problem shrinks.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ta cần thử mọi ước của a và b: thuật toán chỉ làm vài phép chia.',
        'Thinking we must try every divisor of a and b: the algorithm only does a few divisions.',
      ),
    ],
  },
  {
    id: 'gcd',
    label: m('Ước chung lớn nhất', 'The greatest common divisor'),
    narration: m(
      'Hình vuông cuối cùng lát vừa khít hình chữ nhật ngay trước nó, và cứ thế ngược lên đến hình ban đầu. Cạnh của nó chia hết cả a lẫn b, và đó chính là ước chung lớn nhất.',
      'The last square tiles the rectangle just before it exactly, and so on back up to the original one. Its side divides both a and b, and that is exactly the greatest common divisor.',
    ),
    hints: [
      m(
        'Vì sao hình vuông cuối cùng lát được cả hình chữ nhật ban đầu?',
        'Why does the last square tile the original rectangle too?',
      ),
      m(
        'Vì nó lát vừa khít hình ngay trước, và hình đó lát vừa khít hình trước nữa.',
        'Because it tiles the rectangle just before it, and that one tiles the one before it.',
      ),
      m(
        'Nên cạnh của nó chia hết cả a và b, và không có số lớn hơn nào làm được.',
        'So its side divides both a and b, and no larger number does.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số hình vuông bằng gcd: số hình vuông là tổng các thương, còn gcd là cạnh hình cuối.',
        'Thinking the number of squares is the gcd: the count is the sum of the quotients, and the gcd is the side of the last square.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Thuật toán Euclid dừng khi không còn dư, và cạnh hình vuông cuối cùng là ƯCLN. Thử mẫu hai cạnh nguyên tố cùng nhau để thấy hình vuông cuối cùng cạnh 1.',
      'The Euclidean algorithm stops when nothing is left over, and the side of the last square is the gcd. Try the coprime preset to see a last square of side 1.',
    ),
    hints: [
      m('Thuật toán dừng khi nào?', 'When does the algorithm stop?'),
      m('Khi phép chia không còn dư.', 'When the division leaves no remainder.'),
      m(
        'Cạnh hình vuông cuối cùng chia hết cả hai cạnh ban đầu và là lớn nhất như vậy.',
        'The side of the last square divides both original sides and is the largest such number.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ƯCLN là cạnh ngắn ban đầu: chỉ đúng khi cạnh ngắn chia hết cạnh dài.',
        'Thinking the gcd is the original short side: only so when the short side divides the long one.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Hình chữ nhật {big} × {small}. Ta muốn lát kín nó bằng các hình vuông bằng nhau, to nhất có thể.',
    'A {big} × {small} rectangle. We want to tile it exactly with equal squares, as large as possible.',
  ),
  cut: m(
    'Cắt {q} hình vuông cạnh {y} khỏi hình chữ nhật {x} × {y}: {x} = {q}·{y} + {r}.',
    'Cut {q|square|squares} of side {y} from the {x} × {y} rectangle: {x} = {q}·{y} + {r}.',
  ),
  cutEnd: m(
    'Cắt {q} hình vuông cạnh {y}: {x} = {q}·{y} + 0, không còn dư nên thuật toán dừng.',
    'Cut {q|square|squares} of side {y}: {x} = {q}·{y} + 0, nothing is left over, so the algorithm stops.',
  ),
  gcd: m(
    'Hình vuông cuối cùng có cạnh {g}. Nó lát khít hình chữ nhật trước đó, và cứ thế ngược lên: {g} = ƯCLN({a}, {b}).',
    'The last square has side {g}. It tiles the rectangle before it exactly, and so on back up: {g} = gcd({a}, {b}).',
  ),
  done: m(
    'Vậy ƯCLN({a}, {b}) = {g}: cạnh của hình vuông cuối cùng. Đã cắt tất cả {n} hình vuông.',
    'So gcd({a}, {b}) = {g}: the side of the last square. {n|square|squares} were cut in all.',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const big = Math.max(input.a, input.b);
  const small = Math.min(input.a, input.b);
  const bounds = { xmin: -1, xmax: big + 1, ymin: -1.2, ymax: small + 1 };
  const put = framePut(emit, ctx.locale);
  type Cut = { x: number; q: number; y: number; r: number; squares: Pt[][] };
  const cuts: Cut[] = [];
  let ox = 0;
  let oy = 0;
  let w = big;
  let h = small;
  while (w > 0 && h > 0) {
    const side = Math.min(w, h);
    const long = Math.max(w, h);
    const q = Math.floor(long / side);
    const squares: Pt[][] = [];
    for (let k = 0; k < q; k++) {
      const x0 = w >= h ? ox + k * side : ox;
      const y0 = w >= h ? oy : oy + k * side;
      squares.push([
        [x0, y0],
        [x0 + side, y0],
        [x0 + side, y0 + side],
        [x0, y0 + side],
      ]);
    }
    cuts.push({ x: long, q, y: side, r: long - q * side, squares });
    if (w >= h) {
      ox += q * side;
      w -= q * side;
    } else {
      oy += q * side;
      h -= q * side;
    }
  }
  const g = cuts[cuts.length - 1].y;
  const n = cuts.reduce((sum, c) => sum + c.q, 0);
  const outline = (f: Figure): Figure =>
    f.polyline('outline', [
      [0, 0],
      [big, 0],
      [big, small],
      [0, small],
      [0, 0],
    ]);
  const upTo = (t: number): Figure => {
    const f = outline(new Figure(bounds));
    for (let i = 0; i <= t; i++) cuts[i].squares.forEach((sq, k) => f.poly(`s${i}.${k}`, sq));
    return f;
  };
  const marks = (t: number, last: boolean): Record<string, HighlightKind> => {
    const out: Record<string, HighlightKind> = { outline: 'visited' };
    for (let i = 0; i <= t; i++)
      cuts[i].squares.forEach((_, k) => {
        out[`s${i}.${k}`] = last && i === t ? 'result' : (`group-${i % 6}` as HighlightKind);
      });
    return out;
  };
  const sides = (f: Figure, t: number): Figure => {
    const c = cuts[t].squares;
    const mid = (sq: Pt[]): Pt => [(sq[0][0] + sq[2][0]) / 2, (sq[0][1] + sq[2][1]) / 2];
    return f.anchor(`len${t}`, mid(c[0]), String(cuts[t].y), true);
  };
  const base = { a: input.a, b: input.b, big, small };
  put(
    EX.start,
    1,
    outline(new Figure(bounds))
      .anchor('wl', [big / 2, -0.6], String(big), true)
      .anchor('hl', [-0.6, small / 2], String(small), true),
    base,
    'start',
    { outline: 'compare' },
  );
  cuts.forEach((c, t) => {
    put(
      c.r === 0 ? EX.cutEnd : EX.cut,
      t === 0 ? 2 : 3,
      sides(upTo(t), t),
      { x: c.x, q: c.q, y: c.y, r: c.r },
      t === 0 ? 'squares' : t === 1 ? 'repeat' : undefined,
      marks(t, false),
    );
  });
  put(
    EX.gcd,
    4,
    sides(upTo(cuts.length - 1), cuts.length - 1),
    { ...base, g },
    'gcd',
    marks(cuts.length - 1, true),
  );
  put(
    EX.done,
    4,
    sides(upTo(cuts.length - 1), cuts.length - 1),
    { ...base, g, n },
    'done',
    marks(cuts.length - 1, true),
  );
}

export const euclidRectangleEntry: WalkthroughEntry<In, S> = {
  id: 'euclid-rectangle',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-euclid-diophantine'],
  title: m('Thuật toán Euclid bằng lát hình vuông', 'The Euclidean algorithm with squares'),
  code: {
    pseudo: [
      'hình chữ nhật a × b',
      'các hình vuông cạnh bằng cạnh ngắn được cắt khỏi hình chữ nhật',
      'hình chữ nhật còn lại được cắt tiếp, các hình vuông nhỏ dần',
      'hình vuông cuối cùng được tô sáng với cạnh bằng gcd',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: '48-18', label: m('48 × 18', '48 × 18'), input: { a: 48, b: 18 } },
    { id: 'equal', label: m('12 × 12', '12 × 12'), input: { a: 12, b: 12 } },
    {
      id: 'coprime',
      label: m('13 × 8 (nguyên tố cùng nhau)', '13 × 8 (coprime)'),
      input: { a: 13, b: 8 },
    },
    { id: 'one', label: m('1 × 60', '1 × 60'), input: { a: 1, b: 60 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng gcd luôn là số nhỏ hơn trong hai số: chỉ khi số nhỏ chia hết số lớn.',
        'Thinking the gcd is always the smaller of the two numbers: only when the smaller divides the larger.',
      ),
    },
    {
      beat: 'squares',
      text: m(
        'Nghĩ rằng chỉ cắt được một hình vuông mỗi lần: có thể cắt q hình, với q là thương của phép chia.',
        'Thinking only one square can be cut each time: q of them, where q is the quotient of the division.',
      ),
    },
    {
      beat: 'repeat',
      text: m(
        'Nghĩ rằng ta cần thử mọi ước của a và b: thuật toán chỉ làm vài phép chia.',
        'Thinking we must try every divisor of a and b: the algorithm only does a few divisions.',
      ),
    },
    {
      beat: 'gcd',
      text: m(
        'Nghĩ rằng số hình vuông bằng gcd: số hình vuông là tổng các thương, còn gcd là cạnh hình cuối.',
        'Thinking the number of squares is the gcd: the count is the sum of the quotients, and the gcd is the side of the last square.',
      ),
    },
  ],
  maxFrames: 12,
  maxBytes: 200_000,
  run,
};
