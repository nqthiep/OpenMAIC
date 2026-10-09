/**
 * Walkthrough entry: Sums with dots: odd and triangular numbers (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-induction`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, boundsOf, framePut, type FigState } from '@/lib/subjects/math/figure';

type In = { series: 'odd' | 'natural'; n: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    series: { kind: 'enum', values: ['odd', 'natural'] },
    n: { kind: 'int', range: [2, 10] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Xếp chấm', 'Arranging dots'),
    narration: m(
      'Ta xếp các chấm thành từng hàng, hàng thứ nhất một chấm, rồi các hàng sau nhiều dần theo quy luật của dãy. Mỗi hàng là một số hạng của tổng.',
      'We arrange dots in rows, one dot in the first row, then more in each row following the rule of the sequence. Each row is one term of the sum.',
    ),
    hints: [
      m('Hàng thứ k có bao nhiêu chấm?', 'How many dots are in row k?'),
      m(
        'Số lẻ: 2k − 1 chấm; số tự nhiên: k chấm.',
        'Odd numbers: 2k − 1 dots; natural numbers: k dots.',
      ),
      m(
        'Tổng n hàng là số chấm của cả hình.',
        'The sum of n rows is the number of dots of the whole figure.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đúng với vài n đầu là đã chứng minh xong: phải chứng minh cho mọi n.',
        'Thinking that truth for the first few n already proves it: it must be proved for every n.',
      ),
    ],
  },
  {
    id: 'grow',
    label: m('Thêm một lớp', 'Adding a layer'),
    narration: m(
      'Ta thêm một lớp mới: chữ L ôm quanh hình vuông với số lẻ, hoặc hai bậc thang ghép thành hình chữ nhật với số tự nhiên. Mỗi lớp mới thêm đúng một số hạng tiếp theo của dãy.',
      'We add a new layer: an L wrapped around the square for odd numbers, or two staircases forming a rectangle for natural numbers. Each new layer adds exactly the next term of the sequence.',
    ),
    ask: {
      text: m(
        'Theo em, lớp tiếp theo (lớp thứ hai) có bao nhiêu chấm?',
        'How many dots do you think the next layer (the second one) has?',
      ),
      predict: {
        kind: 'choice',
        options: [m('2 chấm', '2 dots'), m('3 chấm', '3 dots'), m('4 chấm', '4 dots')],
        // the odd series adds 2·2 − 1 = 3 dots, the natural numbers add 2
        answer: (frame) => ((frame.meta.vars as { odd: number }).odd === 1 ? 1 : 0),
      },
    },
    hints: [
      m(
        'Chữ L thêm vào hình vuông k × k có bao nhiêu chấm?',
        'How many dots does the L add to a k × k square?',
      ),
      m(
        'Một hàng k cộng một cột k, nhưng chấm góc đếm hai lần.',
        'One row of k plus one column of k, but the corner is counted twice.',
      ),
      m(
        'Vậy 2k − 1 chấm, và hình mới là (k)² cộng thêm thành cạnh k.',
        'So 2k − 1 dots, and the new square has side k.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng lớp mới luôn có k chấm: với số lẻ lớp thứ k có 2k − 1 chấm.',
        'Thinking the new layer always has k dots: for odd numbers layer k has 2k − 1 dots.',
      ),
    ],
  },
  {
    id: 'count',
    label: m('Đếm', 'Counting'),
    narration: m(
      'Ta đếm tất cả các chấm theo hình vừa dựng: hình vuông cạnh n, hoặc nửa hình chữ nhật n nhân n cộng một. Cách đếm theo hình cho công thức ngay, không cần cộng từng số hạng.',
      'We count all the dots of the figure just built: a square of side n, or half a rectangle n by n plus one. Counting by the figure gives the formula at once, without adding term by term.',
    ),
    ask: {
      text: m(
        'Theo em, tổng của n số hạng đầu bằng biểu thức nào?',
        'Which expression do you think the sum of the first n terms equals?',
      ),
      predict: {
        kind: 'choice',
        options: [m('n²', 'n²'), m('n(n + 1)/2', 'n(n + 1)/2'), m('2n', '2n')],
        // odd numbers fill the square n × n; the natural numbers fill half of the rectangle n × (n + 1)
        answer: (frame) => ((frame.meta.vars as { odd: number }).odd === 1 ? 0 : 1),
      },
    },
    hints: [
      m('Hình vuông cạnh n có bao nhiêu chấm?', 'How many dots does a square of side n have?'),
      m('n nhân n, tức n².', 'n times n, that is n².'),
      m(
        'Số tam giác là nửa của hình chữ nhật n × (n + 1): n(n + 1)/2.',
        'A triangular number is half of the n × (n + 1) rectangle: n(n + 1)/2.',
      ),
    ],
    misconceptions: [
      m(
        'Quên chia đôi ở số tam giác: hình chữ nhật n × (n + 1) gồm hai lần tổng.',
        'Forgetting to halve for triangular numbers: the n × (n + 1) rectangle holds twice the sum.',
      ),
    ],
  },
  {
    id: 'induction',
    label: m('Bước quy nạp', 'The induction step'),
    narration: m(
      'Giả sử công thức đúng với k. Thêm lớp thứ k cộng một và xem tổng mới. Tổng mới đúng bằng công thức với k cộng một. Đó là bước quy nạp: từ k suy ra k cộng một.',
      'Suppose the formula holds for k. Add layer number k plus one and look at the new total. The new total is exactly the formula for k plus one. That is the induction step: from k we get k plus one.',
    ),
    hints: [
      m('Bước quy nạp chứng minh điều gì?', 'What does the induction step prove?'),
      m(
        'Rằng nếu công thức đúng với k thì đúng với k + 1.',
        'That if the formula holds for k it holds for k + 1.',
      ),
      m(
        'Cộng thêm số hạng thứ k + 1 vào vế phải và kiểm đúng dạng công thức với k + 1.',
        'Add the (k + 1)th term to the right side and check it matches the formula for k + 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bước quy nạp đã đủ mà không cần bước cơ sở: cả hai đều cần.',
        'Thinking the induction step is enough without the base case: both are needed.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng của n số hạng đầu bằng số chấm của hình dựng được: hình vuông n × n cho n², nửa hình chữ nhật n × (n + 1) cho n(n + 1)/2. Bước quy nạp cho thấy công thức đúng với mọi n. Đổi mẫu để thử.',
      'The sum of the first n terms is the number of dots of the figure: the square n × n gives n², half of the rectangle n × (n + 1) gives n(n + 1)/2. The induction step shows the formula holds for every n. Change the preset to try.',
    ),
    hints: [
      m('Số chấm của hình dựng được là gì?', 'What is the number of dots of the figure?'),
      m(
        'Đó chính là tổng của các số hạng, đếm theo hình.',
        'It is exactly the sum of the terms, counted by the figure.',
      ),
      m(
        'Hình vuông cho n², hình chữ nhật cho n(n + 1) rồi chia đôi.',
        'The square gives n², the rectangle gives n(n + 1), then halve it.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hình chỉ đúng với n đã vẽ: bước quy nạp mới chứng minh cho mọi n.',
        'Thinking the figure only works for the n drawn: the induction step is what proves it for every n.',
      ),
    ],
  },
];

const EX = {
  startOdd: m(
    'Xếp các chấm thành n = {n} hàng: hàng thứ nhất một chấm, mỗi hàng sau nhiều hơn hàng trước 2 chấm, hàng cuối có {last} chấm.',
    'Arrange the dots in n = {n|row|rows}: one dot in the first row, each row 2 dots more than the one before, {last|dot|dots} in the last row.',
  ),
  startNat: m(
    'Xếp các chấm thành n = {n} hàng: hàng thứ nhất một chấm, mỗi hàng sau nhiều hơn hàng trước một chấm, hàng cuối có {last} chấm.',
    'Arrange the dots in n = {n|row|rows}: one dot in the first row, each row one dot more than the one before, {last|dot|dots} in the last row.',
  ),
  growOdd1: m('Lớp 1 chỉ là một chấm: tổng 1 = 1².', 'Layer 1 is just one dot: the sum is 1 = 1².'),
  growOdd: m(
    'Lớp {k}: một chữ L ôm quanh hình vuông {km} × {km}, thêm {add} chấm; tổng {tot} = {k}².',
    'Layer {k}: an L wrapped around the {km} × {km} square adds {add|dot|dots}; the sum is {tot} = {k}².',
  ),
  growNat: m(
    'Hàng {k} thêm {add} chấm vào bậc thang; sau {k} hàng có tất cả {tot} chấm.',
    'Row {k} adds {add|dot|dots} to the staircase; after {k|row|rows} there are {tot|dot|dots} in all.',
  ),
  countOdd: m(
    'Các lớp ghép thành hình vuông {n} × {n} có {tot} chấm, nên tổng các số lẻ từ 1 đến {last} bằng {tot} = {n}².',
    'The layers fit into the {n} × {n} square of {tot|dot|dots}, so the sum of the odd numbers from 1 to {last} is {tot} = {n}².',
  ),
  countNat: m(
    'Hai bậc thang ghép thành hình chữ nhật {n} × {n1} = {rect} chấm; mỗi bậc thang là một nửa, tức {tot} chấm.',
    'Two staircases fit into the {n} × {n1} = {rect} rectangle; each staircase is half of it, that is {tot|dot|dots}.',
  ),
  indOdd1: m(
    'Giả sử đúng với k = {k}: tổng bằng {k}² = {sk}. Thêm lớp k + 1 = {k1} gồm {add} chấm.',
    'Suppose it holds for k = {k}: the sum is {k}² = {sk}. Add layer k + 1 = {k1} with {add|dot|dots}.',
  ),
  indOdd2: m(
    'Tổng mới {sk} + {add} = {tot} = {k1}²: công thức đúng với k + 1.',
    'The new sum {sk} + {add} = {tot} = {k1}²: the formula holds for k + 1.',
  ),
  indNat1: m(
    'Giả sử đúng với k = {k}: tổng bằng {sk} chấm. Thêm hàng k + 1 = {k1} gồm {add} chấm.',
    'Suppose it holds for k = {k}: the sum is {sk|dot|dots}. Add row k + 1 = {k1} with {add|dot|dots}.',
  ),
  indNat2: m(
    'Tổng mới {sk} + {add} = {tot} chấm, đúng bằng công thức với k + 1 = {k1}.',
    'The new sum {sk} + {add} = {tot|dot|dots}, exactly the formula for k + 1 = {k1}.',
  ),
  doneOdd: m(
    'Tổng {n} số lẻ đầu tiên bằng {tot} = {n}², đúng với mọi n nhờ bước quy nạp.',
    'The sum of the first {n} odd numbers is {tot} = {n}², true for every n by the induction step.',
  ),
  doneNat: m(
    'Tổng 1 + 2 + … + {n} bằng {tot} = {n}·{n1}/2, đúng với mọi n nhờ bước quy nạp.',
    'The sum 1 + 2 + … + {n} is {tot} = {n}·{n1}/2, true for every n by the induction step.',
  ),
};

type Dot = { x: number; y: number; layer: number; part?: 0 | 1 };

/** the dots of the layers 1..k of the square: layer L is the L-shape of the 2L − 1 dots whose larger coordinate is L */
function square(k: number): Dot[] {
  const dots: Dot[] = [];
  for (let L = 1; L <= k; L++) {
    for (let t = 1; t <= L; t++) dots.push({ x: t, y: L, layer: L });
    for (let t = 1; t < L; t++) dots.push({ x: L, y: t, layer: L });
  }
  return dots;
}
/** the staircase of rows 1..k: row r holds r dots (row 1 on top) */
function stairs(k: number): Dot[] {
  const dots: Dot[] = [];
  for (let r = 1; r <= k; r++)
    for (let x = 0; x < r; x++) dots.push({ x, y: -(r - 1), layer: r, part: 0 });
  return dots;
}
/** the rectangle n × (n + 1): the staircase and its half-turn, row r holding the dots r..n of the second one */
function rectangle(n: number): Dot[] {
  const dots = stairs(n);
  for (let r = 1; r <= n; r++)
    for (let x = r; x <= n; x++) dots.push({ x, y: -(r - 1), layer: r, part: 1 });
  return dots;
}
/** the n rows 1, 3, 5, …, 2n − 1, each centred on the axis */
function pyramid(n: number): Dot[] {
  const dots: Dot[] = [];
  for (let r = 1; r <= n; r++)
    for (let x = -(r - 1); x <= r - 1; x++) dots.push({ x, y: -(r - 1), layer: r });
  return dots;
}

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { series, n } = input;
  const odd = series === 'odd' ? 1 : 0;
  const term = (k: number): number => (odd ? 2 * k - 1 : k);
  /** the sum of the first k terms, as the formula says */
  const total = (k: number): number => (odd ? k * k : (k * (k + 1)) / 2);
  const full = odd ? square(n) : rectangle(n);
  const bounds = boundsOf(
    [...full, ...(odd ? pyramid(n) : [])].map((d) => [d.x, d.y] as const),
    1,
  );
  const picture = (
    dots: readonly Dot[],
    mark: (d: Dot) => HighlightKind,
  ): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const fig = new Figure(bounds);
    const marks: Record<string, HighlightKind> = {};
    dots.forEach((d, i) => {
      fig.point(`d${i}`, [d.x, d.y], '', { r: 6 });
      marks[`d${i}`] = mark(d);
    });
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const at = (
    text: Messages,
    codeLine: number,
    pic: { fig: Figure; marks: Record<string, HighlightKind> },
    vars: Record<string, number | string>,
    beat?: string,
  ): void => put(text, codeLine, pic.fig, { odd, ...vars }, beat, pic.marks);
  const last = term(n);

  at(
    odd ? EX.startOdd : EX.startNat,
    1,
    picture(odd ? pyramid(n) : stairs(n), (d) => (d.layer % 2 === 0 ? 'group-0' : 'group-1')),
    { n, last },
    'start',
  );
  for (let k = 1; k <= n; k++) {
    const pic = picture(odd ? square(k) : stairs(k), (d) => (d.layer === k ? 'active' : 'result'));
    at(
      odd ? (k === 1 ? EX.growOdd1 : EX.growOdd) : EX.growNat,
      2,
      pic,
      { k, km: k - 1, add: term(k), tot: total(k) },
      k === 1 ? 'grow' : undefined,
    );
  }
  at(
    odd ? EX.countOdd : EX.countNat,
    3,
    picture(full, (d) => (odd ? 'result' : d.part === 1 ? 'group-1' : 'group-0')),
    { n, n1: n + 1, last, rect: n * (n + 1), tot: total(n) },
    'count',
  );
  const k = n - 1;
  const before = picture(odd ? square(k) : stairs(k), () => 'result');
  at(
    odd ? EX.indOdd1 : EX.indNat1,
    4,
    before,
    { k, k1: n, sk: total(k), add: term(n) },
    'induction',
  );
  const after = picture(odd ? square(n) : stairs(n), (d) => (d.layer === n ? 'active' : 'result'));
  at(odd ? EX.indOdd2 : EX.indNat2, 4, after, { k1: n, sk: total(k), add: term(n), tot: total(n) });
  at(odd ? EX.doneOdd : EX.doneNat, 4, after, { n, n1: n + 1, tot: total(n) }, 'done');
}

export const figurateSumsEntry: WalkthroughEntry<In, S> = {
  id: 'figurate-sums',
  entryRev: 2,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-induction'],
  title: m('Tổng bằng chấm: số lẻ và số tam giác', 'Sums with dots: odd and triangular numbers'),
  code: {
    pseudo: [
      'các hàng chấm 1, 3, 5, … hoặc 1, 2, 3, …',
      'từng lớp: chữ L (gnomon) ôm hình vuông với số lẻ, hoặc một hàng thêm vào bậc thang với số tự nhiên',
      'đếm cả hình: hình vuông n × n, hoặc hai bậc thang ghép thành hình chữ nhật n × (n + 1)',
      'từ hình ở bước k thêm lớp k + 1 được hình ở bước k + 1',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: 'odd-4', label: m('1 + 3 + 5 + 7', '1 + 3 + 5 + 7'), input: { series: 'odd', n: 4 } },
    {
      id: 'odd-2',
      label: m('1 + 3 (nhỏ nhất)', '1 + 3 (smallest)'),
      input: { series: 'odd', n: 2 },
    },
    {
      id: 'natural-5',
      label: m('1 + 2 + 3 + 4 + 5', '1 + 2 + 3 + 4 + 5'),
      input: { series: 'natural', n: 5 },
    },
    {
      id: 'natural-10',
      label: m('1 + 2 + … + 10', '1 + 2 + … + 10'),
      input: { series: 'natural', n: 10 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng đúng với vài n đầu là đã chứng minh xong: phải chứng minh cho mọi n.',
        'Thinking that truth for the first few n already proves it: it must be proved for every n.',
      ),
    },
    {
      beat: 'grow',
      text: m(
        'Nghĩ rằng lớp mới luôn có k chấm: với số lẻ lớp thứ k có 2k − 1 chấm.',
        'Thinking the new layer always has k dots: for odd numbers layer k has 2k − 1 dots.',
      ),
    },
    {
      beat: 'count',
      text: m(
        'Quên chia đôi ở số tam giác: hình chữ nhật n × (n + 1) gồm hai lần tổng.',
        'Forgetting to halve for triangular numbers: the n × (n + 1) rectangle holds twice the sum.',
      ),
    },
    {
      beat: 'induction',
      text: m(
        'Nghĩ rằng bước quy nạp đã đủ mà không cần bước cơ sở: cả hai đều cần.',
        'Thinking the induction step is enough without the base case: both are needed.',
      ),
    },
  ],
  maxFrames: 16,
  maxBytes: 200_000,
  run,
};
