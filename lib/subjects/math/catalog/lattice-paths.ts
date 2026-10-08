/**
 * Walkthrough entry: Lattice paths and Pascal’s triangle (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m3-counting-advanced`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { m: number; n: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { m: { kind: 'int', range: [1, 6] }, n: { kind: 'int', range: [1, 6] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Lưới', 'The grid'),
    narration: m(
      'Ta có một lưới m nhân n ô. Ta đi từ góc dưới trái tới góc trên phải, mỗi bước chỉ sang phải hoặc đi lên. Câu hỏi là có bao nhiêu đường đi như vậy.',
      'We have a grid of m by n cells. We walk from the bottom-left corner to the top-right one, each step only right or up. The question is how many such paths there are.',
    ),
    hints: [
      m(
        'Mỗi bước được phép đi theo những hướng nào?',
        'Which directions is each step allowed to take?',
      ),
      m('Chỉ sang phải hoặc đi lên, không đi lùi.', 'Only right or up, never backwards.'),
      m(
        'Nên mọi đường đi có đúng m bước phải và n bước lên.',
        'So every path has exactly m steps right and n steps up.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số đường đi bằng m·n: đó là số ô, không phải số đường đi.',
        'Thinking the number of paths is m·n: that is the number of cells, not of paths.',
      ),
    ],
  },
  {
    id: 'paths',
    label: m('Vài đường đi', 'A few paths'),
    narration: m(
      'Ta vẽ vài đường đi khác nhau. Mỗi đường là một dãy các bước sang phải và đi lên. Mọi đường đi đều có cùng số bước phải và cùng số bước lên, chỉ khác thứ tự.',
      'We draw a few different paths. Each is a sequence of steps to the right and steps up. Every path has the same number of right steps and the same number of up steps, only in a different order.',
    ),
    ask: {
      text: m(
        'Một đường đi từ A tới B gồm mấy bước sang phải và mấy bước đi lên?',
        'How many steps to the right and how many steps up does a path from A to B have?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('m bước phải và n bước lên', 'm steps right and n steps up'),
          m('n bước phải và m bước lên', 'n steps right and m steps up'),
          m('m + n bước phải', 'm + n steps right'),
        ],
        answer: () => 0,
      },
    },
    hints: [
      m('Một đường đi có tất cả bao nhiêu bước?', 'How many steps does a path have in all?'),
      m('m + n bước, vì m bước phải và n bước lên.', 'm + n steps, since m go right and n go up.'),
      m(
        'Hai đường khác nhau ở chỗ các bước lên đứng ở vị trí nào trong dãy.',
        'Two paths differ in which positions of the sequence the up steps take.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng các đường đi có độ dài khác nhau: mọi đường đi đều có m + n bước.',
        'Thinking the paths have different lengths: every path has m + n steps.',
      ),
    ],
  },
  {
    id: 'pascal',
    label: m('Đếm bằng cộng', 'Counting by adding'),
    narration: m(
      'Ta ghi vào mỗi điểm số đường đi từ góc xuất phát tới đó. Một điểm chỉ đến được từ điểm bên trái hoặc điểm bên dưới. Vậy số ở mỗi điểm là tổng hai số kề nó, đúng như tam giác Pascal.',
      'At each point we write the number of paths from the start to it. A point can only be reached from the point to its left or the point below. So the number at each point is the sum of its two neighbours, just like Pascal’s triangle.',
    ),
    ask: {
      text: m(
        'Số ở một điểm bằng tổng của những số nào ở các điểm kề nó?',
        'The number at a point is the sum of which numbers at its neighbours?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Số bên trái và số bên dưới', 'The number to its left and the number below'),
          m('Số bên phải và số bên trên', 'The number to its right and the number above'),
          m('Tích của hai số kề', 'The product of two neighbours'),
        ],
        answer: () => 0,
      },
    },
    hints: [
      m('Từ điểm nào có thể bước tới điểm này?', 'From which points can we step to this point?'),
      m(
        'Từ điểm bên trái (bước phải) hoặc điểm bên dưới (bước lên).',
        'From the point on its left (a right step) or the point below (an up step).',
      ),
      m(
        'Hai nhóm đường này không trùng nhau, nên số đường là tổng hai số.',
        'The two groups of paths do not overlap, so the count is the sum of the two numbers.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số ở một điểm là tích của hai số kề: nó là tổng, vì đường đi đến từ hai hướng rời nhau.',
        'Thinking the number at a point is the product of its neighbours: it is the sum, since paths arrive from two disjoint directions.',
      ),
    ],
  },
  {
    id: 'binomial',
    label: m('Công thức tổ hợp', 'The binomial formula'),
    narration: m(
      'Một đường đi là một cách chọn n bước đi lên trong tổng m cộng n bước. Số cách chọn đó là tổ hợp chập n của m cộng n, và nó trùng với số ở góc đối diện.',
      'A path is a way of choosing which n of the m plus n steps go up. The number of ways to choose is m plus n choose n, and it matches the number in the opposite corner.',
    ),
    hints: [
      m('Một đường đi hoàn toàn được xác định bởi điều gì?', 'What determines a path completely?'),
      m(
        'Bởi vị trí của n bước lên trong m + n bước.',
        'The positions of the n up steps among the m + n steps.',
      ),
      m(
        'Số cách chọn n vị trí trong m + n vị trí là C(m + n, n).',
        'The number of ways to choose n positions out of m + n is C(m + n, n).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chọn m bước phải và chọn n bước lên cho hai kết quả khác nhau: hai cách chọn cho cùng một số.',
        'Thinking choosing the m right steps and choosing the n up steps give different results: both give the same number.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Số đường đi bằng tổ hợp chập n của m + n: chọn trong m + n bước xem n bước nào đi lên. Số ở góc đích của bảng Pascal cho đúng giá trị đó. Đổi mẫu để thử lưới khác.',
      'The number of paths is m + n choose n: pick which n of the m + n steps go up. The corner of the Pascal table gives exactly that value. Change the preset to try another grid.',
    ),
    hints: [
      m(
        'Số đường đi là một tổ hợp của những số nào?',
        'The number of paths is a binomial coefficient of which numbers?',
      ),
      m('Chọn n bước đi lên trong tổng m + n bước.', 'Choose which n of the m + n steps go up.'),
      m(
        'C(m + n, n), và số ở góc đích của bảng cộng bằng chính nó.',
        'C(m + n, n), and the number at the final corner of the sums equals it.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số đường đi là m·n hoặc m + n: nó là tổ hợp C(m + n, n), tăng rất nhanh.',
        'Thinking the number of paths is m·n or m + n: it is C(m + n, n), which grows very fast.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Lưới {m} × {n} ô: ta đi từ góc dưới trái A tới góc trên phải B, mỗi bước chỉ sang phải hoặc đi lên. Có bao nhiêu đường đi?',
    'A grid of {m} × {n} cells: we walk from the bottom-left corner A to the top-right corner B, each step right or up. How many paths are there?',
  ),
  paths: m(
    'Đường {j}: {m} bước sang phải và {n} bước đi lên, theo một thứ tự riêng, tổng {mn} bước. Mọi đường đều dài như nhau.',
    'Path {j}: {m} steps right and {n} steps up in an order of its own, {mn} steps in all. Every path is equally long.',
  ),
  pascal0: m(
    'Ghi số đường đi từ A tới mỗi điểm. Hàng dưới cùng: chỉ có một đường đi thẳng, nên toàn số 1.',
    'Write the number of paths from A to each point. The bottom row: there is only the straight path, so all 1.',
  ),
  pascal: m(
    'Hàng {r}: mỗi số là tổng của số bên trái và số bên dưới, vì điểm chỉ đến được từ hai hướng ấy. Số ở cuối hàng là {last}.',
    'Row {r}: each number is the sum of the number to its left and the number below, since a point is reached from those two only. The last one is {last}.',
  ),
  binomial: m(
    'Chọn {n} bước đi lên trong tổng {mn} bước: C({mn}, {n}) = {ways}, đúng bằng số ở góc đích B.',
    'Choose which {n} of the {mn} steps go up: C({mn}, {n}) = {ways}, exactly the number at the corner B.',
  ),
  done: m(
    'Có {ways} đường đi trên lưới {m} × {n}, bằng C({mn}, {n}).',
    'There are {ways} paths on the {m} × {n} grid, equal to C({mn}, {n}).',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { m: cols, n: rows } = input;
  const mn = cols + rows;
  /** the number of paths from (0, 0) to (x, y): the sum of the two points it can be reached from */
  const ways: number[][] = [];
  for (let y = 0; y <= rows; y++) {
    ways.push([]);
    for (let x = 0; x <= cols; x++)
      ways[y].push(x === 0 || y === 0 ? 1 : ways[y][x - 1] + ways[y - 1][x]);
  }
  const total = ways[rows][cols];
  const bounds = { xmin: -1, xmax: cols + 1, ymin: -1, ymax: rows + 1 };
  const id = (x: number, y: number): string => `g${x}_${y}`;
  /** the grid; `numbers` writes the path count next to each point of the rows 0..numbers - 1, the corners are named A and B otherwise */
  const grid = (numbers: number, paths: readonly (readonly Pt[])[] = []): Figure => {
    const fig = new Figure(bounds);
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) {
        const label =
          y < numbers
            ? `${ways[y][x]}`
            : x === 0 && y === 0
              ? 'A'
              : x === cols && y === rows
                ? 'B'
                : '';
        fig.point(id(x, y), [x, y], label, { r: 4 });
      }
    }
    for (let y = 0; y <= rows; y++)
      for (let x = 0; x < cols; x++) fig.seg(`h${x}_${y}`, id(x, y), id(x + 1, y));
    for (let y = 0; y < rows; y++)
      for (let x = 0; x <= cols; x++) fig.seg(`v${x}_${y}`, id(x, y), id(x, y + 1));
    paths.forEach((p, j) => fig.polyline(`path${j}`, p));
    return fig;
  };
  /** three different step sequences: all right then all up, all up then all right, and up-right alternately */
  const alternate = Array.from(
    { length: Math.max(cols, rows) },
    (_, t) => (t < rows ? 'U' : '') + (t < cols ? 'R' : ''),
  ).join('');
  const sequences = [
    ...new Set([
      'R'.repeat(cols) + 'U'.repeat(rows),
      'U'.repeat(rows) + 'R'.repeat(cols),
      alternate,
    ]),
  ];
  const route = (seq: string): Pt[] => {
    const out: Pt[] = [[0, 0]];
    let [x, y] = [0, 0];
    for (const c of seq) {
      if (c === 'R') x++;
      else y++;
      out.push([x, y]);
    }
    return out;
  };
  const routes = sequences.map(route);
  const put = framePut(emit, ctx.locale);
  const base = { m: cols, n: rows, mn };

  put(EX.start, 1, grid(0), base, 'start', { g0_0: 'active', [id(cols, rows)]: 'active' });
  routes.forEach((_, j) => {
    const marks: Record<string, HighlightKind> = {};
    for (let q = 0; q <= j; q++) marks[`path${q}`] = q === j ? 'result' : 'compare';
    put(
      EX.paths,
      2,
      grid(0, routes.slice(0, j + 1)),
      { ...base, j: j + 1 },
      j === 0 ? 'paths' : undefined,
      marks,
    );
  });
  for (let r = 0; r <= rows; r++) {
    const marks: Record<string, HighlightKind> = {};
    for (let y = 0; y <= r; y++)
      for (let x = 0; x <= cols; x++) marks[id(x, y)] = y === r ? 'active' : 'result';
    put(
      r === 0 ? EX.pascal0 : EX.pascal,
      3,
      grid(r + 1),
      { ...base, r, last: ways[r][cols] },
      r === 0 ? 'pascal' : undefined,
      marks,
    );
  }
  const end = { [id(cols, rows)]: 'result' as const };
  put(EX.binomial, 4, grid(rows + 1), { ...base, ways: total }, 'binomial', end);
  put(EX.done, 4, grid(rows + 1), { ...base, ways: total }, 'done', end);
}

export const latticePathsEntry: WalkthroughEntry<In, S> = {
  id: 'lattice-paths',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m3-counting-advanced'],
  title: m('Đường đi trên lưới và tam giác Pascal', 'Lattice paths and Pascal’s triangle'),
  code: {
    pseudo: [
      'lưới m × n với điểm xuất phát và điểm đích ở hai góc đối',
      'vài đường đi tô màu khác nhau từ góc xuất phát tới góc đích',
      'số ở mỗi điểm lưới, mỗi số là tổng của số bên trái và số bên dưới',
      'số ở góc đích và công thức tổ hợp cạnh đó',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: '2-2', label: m('Lưới 2 × 2', 'A 2 × 2 grid'), input: { m: 2, n: 2 } },
    { id: '3-2', label: m('Lưới 3 × 2', 'A 3 × 2 grid'), input: { m: 3, n: 2 } },
    { id: '1-6', label: m('Lưới 1 × 6 (hẹp)', 'A 1 × 6 grid (narrow)'), input: { m: 1, n: 6 } },
    { id: '4-4', label: m('Lưới 4 × 4', 'A 4 × 4 grid'), input: { m: 4, n: 4 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng số đường đi bằng m·n: đó là số ô, không phải số đường đi.',
        'Thinking the number of paths is m·n: that is the number of cells, not of paths.',
      ),
    },
    {
      beat: 'paths',
      text: m(
        'Nghĩ rằng các đường đi có độ dài khác nhau: mọi đường đi đều có m + n bước.',
        'Thinking the paths have different lengths: every path has m + n steps.',
      ),
    },
    {
      beat: 'pascal',
      text: m(
        'Nghĩ rằng số ở một điểm là tích của hai số kề: nó là tổng, vì đường đi đến từ hai hướng rời nhau.',
        'Thinking the number at a point is the product of its neighbours: it is the sum, since paths arrive from two disjoint directions.',
      ),
    },
    {
      beat: 'binomial',
      text: m(
        'Nghĩ rằng chọn m bước phải và chọn n bước lên cho hai kết quả khác nhau: hai cách chọn cho cùng một số.',
        'Thinking choosing the m right steps and choosing the n up steps give different results: both give the same number.',
      ),
    },
  ],
  maxFrames: 14,
  maxBytes: 200_000,
  run,
};
