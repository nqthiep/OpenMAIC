/**
 * Walkthrough entry: A geometric series as areas (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m3-sequences-limits`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState } from '@/lib/subjects/math/figure';

type Ratio = '1/2' | '1/3' | '1/4';
type In = { r: Ratio };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { r: { kind: 'enum', values: ['1/2', '1/3', '1/4'] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Hình vuông đơn vị', 'The unit square'),
    narration: m(
      'Ta bắt đầu với một hình vuông có diện tích bằng 1. Ta sẽ cắt nó thành những mảnh nhỏ dần.',
      'We start with a square of area 1. We will cut it into smaller and smaller pieces.',
    ),
    hints: [
      m('Hình vuông đơn vị có diện tích bao nhiêu?', 'What is the area of the unit square?'),
      m('Bằng 1.', 'It is 1.'),
      m(
        'Mọi phần ta cắt ra từ nó cộng lại không thể vượt quá 1.',
        'All the parts we cut from it cannot add up to more than 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cộng vô hạn số dương thì ra vô hạn: nhiều tổng vô hạn có giá trị hữu hạn.',
        'Thinking that adding infinitely many positive numbers gives infinity: many infinite sums have a finite value.',
      ),
    ],
  },
  {
    id: 'cut',
    label: m('Cắt một phần', 'Cutting a part'),
    narration: m(
      'Ta cắt từ hình vuông một phần có diện tích bằng r. Phần còn lại có diện tích một trừ r.',
      'We cut from the square a part whose area is r. The rest has area one minus r.',
    ),
    ask: {
      text: m(
        'Theo em, phần còn lại có diện tích bao nhiêu?',
        'What area does the remaining part have?',
      ),
      predict: {
        kind: 'choice',
        options: [m('r', 'r'), m('1 − r', '1 − r'), m('r²', 'r²')],
        answer: () => 1,
      },
    },
    hints: [
      m('Sau khi cắt r, còn lại bao nhiêu?', 'After cutting r, how much is left?'),
      m('Một trừ r.', 'One minus r.'),
      m(
        'Lần cắt sau lấy r của phần còn lại, tức r(1 − r)? Hãy xem hình để thấy mảnh thứ hai.',
        'The next cut takes r of the remainder; look at the picture to see the second piece.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phần cắt tiếp theo là r của hình vuông ban đầu: nó là r của phần còn lại.',
        'Thinking the next cut is r of the original square: it is r of the remainder.',
      ),
    ],
  },
  {
    id: 'repeat',
    label: m('Lặp lại', 'Repeating'),
    narration: m(
      'Rồi ta cắt thêm một mảnh có diện tích r lần mảnh vừa cắt, và cứ thế mãi. Mỗi mảnh mới có diện tích bằng r lần mảnh trước.',
      'Then we cut a piece that is r times as large as the one just cut, and so on again and again. Each new piece has r times the area of the one before.',
    ),
    ask: {
      text: m('Tổng các mảnh có thể vượt quá 1 không?', 'Can the total of the pieces exceed 1?'),
      predict: {
        kind: 'choice',
        options: [m('Có', 'Yes'), m('Không', 'No')],
        // r is at most 1/2, so the total stays at most r/(1 - r) = 1
        answer: () => 1,
      },
    },
    hints: [
      m('Mỗi mảnh liên hệ với mảnh trước thế nào?', 'How is each piece related to the one before?'),
      m('Bằng r lần mảnh trước.', 'It is r times the previous piece.'),
      m(
        'Nên các mảnh là r, r², r³, … và các tổng riêng tăng nhưng chậm dần.',
        'So the pieces are r, r², r³, … and the partial sums grow but ever more slowly.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tổng sẽ vượt quá 1 nếu ta cắt đủ nhiều lần: các tổng riêng luôn nhỏ hơn giá trị giới hạn.',
        'Thinking the total will pass 1 if we cut often enough: the partial sums always stay below the limit.',
      ),
    ],
  },
  {
    id: 'sum',
    label: m('Tổng', 'The sum'),
    narration: m(
      'Ta cộng dần các mảnh, và tổng diện tích của chúng tiến tới một giá trị nhưng không bao giờ vượt quá nó. Tổng vô hạn của các mảnh bằng r chia một trừ r; với r bằng một phần hai đó là cả hình vuông.',
      'We add the pieces one by one, and their total area approaches one value and never passes it. The infinite total of the pieces equals r over one minus r; for r equal to one half that is the whole square.',
    ),
    hints: [
      m(
        'Tổng vô hạn r + r² + r³ + … tính thế nào?',
        'How is the infinite sum r + r² + r³ + … computed?',
      ),
      m(
        'Nhân hai vế với (1 − r): các số hạng triệt tiêu nối tiếp.',
        'Multiply both sides by (1 − r): the terms cancel one after another.',
      ),
      m(
        'Kết quả r / (1 − r), ví dụ r = 1/2 cho 1.',
        'The result is r / (1 − r), for example r = 1/2 gives 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tổng bằng 1 với mọi r: chỉ với r = 1/2; với r = 1/3 tổng là 1/2.',
        'Thinking the sum is 1 for every r: only for r = 1/2; for r = 1/3 it is 1/2.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Các mảnh nhỏ dần cộng lại thành một số hữu hạn: r + r² + r³ + … = r/(1 − r). Thử ba tỉ lệ để thấy tổng là 1, 1/2 và 1/3.',
      'Pieces that shrink geometrically add up to a finite number: r + r² + r³ + … = r/(1 − r). Try the three ratios to see totals 1, 1/2 and 1/3.',
    ),
    hints: [
      m('Tổng vô hạn có thể hữu hạn không?', 'Can an infinite sum be finite?'),
      m(
        'Có, khi các số hạng giảm đủ nhanh như cấp số nhân.',
        'Yes, when the terms shrink fast enough, like a geometric progression.',
      ),
      m(
        'Tổng bằng r/(1 − r), dùng bằng cách so với hình vuông.',
        'The total is r/(1 − r), seen by comparing with the square.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cộng vô hạn số dương luôn cho vô cùng: không đúng khi các số hạng giảm đủ nhanh.',
        'Thinking an infinite sum of positive numbers is always infinite: not so when the terms shrink fast enough.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Một hình vuông diện tích 1. Ta cắt từ nó các mảnh nhỏ dần theo tỉ lệ r = 1/{d}.',
    'A square of area 1. We cut smaller and smaller pieces from it in the ratio r = 1/{d}.',
  ),
  cut: m(
    'Mảnh thứ nhất có diện tích r = 1/{d}. Phần còn lại của hình vuông có diện tích 1 − 1/{d}.',
    'The first piece has area r = 1/{d}. What is left of the square has area 1 − 1/{d}.',
  ),
  piece: m(
    'Mảnh thứ {k} có diện tích r^{k} = 1/{pw}, bằng r lần mảnh trước. Thanh bên dưới là tổng các mảnh đã cắt.',
    'Piece number {k} has area r^{k} = 1/{pw}, which is r times the one before. The bar below is the total of the pieces so far.',
  ),
  sum: m(
    'Tổng các mảnh tiến tới r/(1 − r) = 1/{dm1} (vạch đứt) và không bao giờ vượt qua nó.',
    'The total of the pieces approaches r/(1 − r) = 1/{dm1} (the dashed line) and never passes it.',
  ),
  done: m(
    'Vậy r + r² + r³ + … = r/(1 − r) = 1/{dm1} với r = 1/{d}. Với r = 1/2 đó là cả hình vuông.',
    'So r + r² + r³ + … = r/(1 − r) = 1/{dm1} for r = 1/{d}. For r = 1/2 that is the whole square.',
  ),
};

const PIECES = 5;

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const d = input.r === '1/2' ? 2 : input.r === '1/3' ? 3 : 4;
  const L = 8;
  const bounds = { xmin: -1, xmax: L + 1, ymin: -2.4, ymax: L + 1.2 };
  const put = framePut(emit, ctx.locale);
  /** the left edge of piece k (0-based) and its width: L, then L/d, L/d², … */
  const widths: number[] = [];
  let wd = L;
  for (let k = 0; k < PIECES; k++) {
    wd /= d;
    widths.push(wd);
  }
  const lefts = widths.map((_, k) => widths.slice(0, k).reduce((s, x) => s + x, 0));
  const limitX = L / (d - 1);
  const fig = (shown: number): Figure => {
    const f = new Figure(bounds).rect('square', 0, 0, L, L);
    for (let k = 0; k < shown; k++) f.rect(`p${k}`, lefts[k], 0, lefts[k] + widths[k], L);
    if (shown >= 2) {
      const total = lefts[shown - 1] + widths[shown - 1];
      f.rect('bar', 0, -1.6, total, -1);
    }
    return f;
  };
  const marks = (shown: number): Record<string, HighlightKind> => ({
    square: 'visited',
    bar: 'group-3',
    ...Object.fromEntries(
      Array.from({ length: shown }, (_, k) => [`p${k}`, `group-${k % 3}` as HighlightKind]),
    ),
  });
  const base = { d };
  put(EX.start, 1, fig(0), base, 'start', { square: 'compare' });
  put(EX.cut, 2, fig(1), base, 'cut', marks(1));
  let pw = d;
  for (let k = 2; k <= PIECES; k++) {
    pw *= d;
    put(EX.piece, 3, fig(k), { k, pw }, k === 2 ? 'repeat' : undefined, marks(k));
  }
  const limit = fig(PIECES)
    .anchor('l0', [limitX, -2], undefined)
    .anchor('l1', [limitX, L + 0.4], undefined)
    .seg('limit', 'l0', 'l1', { dashed: true })
    .anchor('ll', [limitX, L + 0.9], `1/${d - 1}`, true);
  put(EX.sum, 4, limit, { dm1: d - 1 }, 'sum', { ...marks(PIECES), limit: 'result' });
  put(EX.done, 4, limit, { d, dm1: d - 1 }, 'done', { ...marks(PIECES), limit: 'result' });
}

export const geometricSeriesAreaEntry: WalkthroughEntry<In, S> = {
  id: 'geometric-series-area',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m3-sequences-limits'],
  title: m('Chuỗi hình học bằng diện tích', 'A geometric series as areas'),
  code: {
    pseudo: [
      'hình vuông đơn vị',
      'một phần diện tích r được cắt ra khỏi hình vuông',
      'các mảnh r, r², r³, … nối tiếp nhau, mỗi mảnh nhỏ hơn mảnh trước',
      'các mảnh lấp hình vuông và tổng riêng tiến tới giới hạn',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: 'half', label: m('1/2 + 1/4 + 1/8 + …', '1/2 + 1/4 + 1/8 + …'), input: { r: '1/2' } },
    { id: 'third', label: m('1/3 + 1/9 + 1/27 + …', '1/3 + 1/9 + 1/27 + …'), input: { r: '1/3' } },
    {
      id: 'quarter',
      label: m('1/4 + 1/16 + 1/64 + …', '1/4 + 1/16 + 1/64 + …'),
      input: { r: '1/4' },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng cộng vô hạn số dương thì ra vô hạn: nhiều tổng vô hạn có giá trị hữu hạn.',
        'Thinking that adding infinitely many positive numbers gives infinity: many infinite sums have a finite value.',
      ),
    },
    {
      beat: 'cut',
      text: m(
        'Nghĩ rằng phần cắt tiếp theo là r của hình vuông ban đầu: nó là r của phần còn lại.',
        'Thinking the next cut is r of the original square: it is r of the remainder.',
      ),
    },
    {
      beat: 'repeat',
      text: m(
        'Nghĩ rằng tổng sẽ vượt quá 1 nếu ta cắt đủ nhiều lần: các tổng riêng luôn nhỏ hơn giá trị giới hạn.',
        'Thinking the total will pass 1 if we cut often enough: the partial sums always stay below the limit.',
      ),
    },
    {
      beat: 'sum',
      text: m(
        'Nghĩ rằng tổng bằng 1 với mọi r: chỉ với r = 1/2; với r = 1/3 tổng là 1/2.',
        'Thinking the sum is 1 for every r: only for r = 1/2; for r = 1/3 it is 1/2.',
      ),
    },
  ],
  maxFrames: 8,
  maxBytes: 200_000,
  run,
};
