/**
 * Walkthrough entry: A chessboard with two cells removed, and dominoes (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-pigeonhole-invariants`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState } from '@/lib/subjects/math/figure';

type In = { n: 4 | 6 | 8; removed: 'opposite-corners' | 'adjacent' };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    n: { kind: 'enum', values: [4, 6, 8] },
    removed: { kind: 'enum', values: ['opposite-corners', 'adjacent'] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bàn cờ', 'The board'),
    narration: m(
      'Ta có một bàn cờ vuông và bỏ đi hai ô. Câu hỏi là có lát kín phần còn lại bằng các domino hai ô không. Mỗi domino phủ đúng hai ô kề nhau.',
      'We have a square board with two cells removed. The question is whether dominoes of two cells can cover the rest exactly. Each domino covers exactly two cells that touch.',
    ),
    hints: [
      m('Bàn còn lại bao nhiêu ô?', 'How many cells are left?'),
      m('n² − 2 ô, và mỗi domino phủ 2 ô.', 'n² − 2 cells, and each domino covers 2.'),
      m(
        'Số ô phải chẵn thì mới có thể lát, và ở đây nó chẵn, nên ta cần một điều kiện khác.',
        'The count must be even for a tiling to be possible, and it is, so another condition is needed.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng thử vài cách không được nghĩa là không thể: cần một lý lẽ cho mọi cách.',
        'Thinking that a few failed attempts mean it is impossible: an argument for every attempt is needed.',
      ),
    ],
  },
  {
    id: 'color',
    label: m('Tô màu', 'Colouring'),
    narration: m(
      'Ta tô các ô đen trắng xen kẽ như bàn cờ vua. Bây giờ mỗi ô có một màu, và hai ô kề nhau luôn khác màu.',
      'We colour the cells black and white in turns, like a chess board. Now every cell has a colour, and two touching cells always have different colours.',
    ),
    ask: {
      text: m(
        'Theo em, hai ô kề nhau có cùng màu hay khác màu?',
        'Do two touching cells have the same colour or different ones?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Cùng màu', 'The same colour'), m('Khác màu', 'Different colours')],
        answer: () => 1,
      },
    },
    hints: [
      m('Hai ô kề nhau có màu thế nào?', 'What colours do two touching cells have?'),
      m(
        'Khác màu, vì cộng hàng và cột lệch nhau 1.',
        'Different, because row plus column differs by 1.',
      ),
      m(
        'Nên mỗi domino phủ đúng một ô đen và một ô trắng.',
        'So each domino covers exactly one black and one white cell.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng việc tô màu chỉ để cho đẹp: nó tạo ra một bất biến dùng được trong chứng minh.',
        'Thinking the colouring is only decoration: it creates an invariant that can be used in a proof.',
      ),
    ],
  },
  {
    id: 'count',
    label: m('Đếm màu', 'Counting colours'),
    narration: m(
      'Ta đếm số ô đen và số ô trắng còn lại trên bàn sau khi bỏ hai ô. Hai số này cho ta một điều kiện cần để lát được.',
      'We count the black and the white cells left on the board after the two removals. The two numbers give a necessary condition for a tiling.',
    ),
    ask: {
      text: m('Một domino luôn phủ mấy ô đen?', 'How many black cells does a domino always cover?'),
      predict: {
        kind: 'choice',
        options: [
          m('Đúng một ô đen', 'Exactly one black cell'),
          m('Hai ô đen', 'Two black cells'),
          m('Không ô đen nào', 'No black cell'),
        ],
        // the two cells of a domino touch, so they have different colours
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Hai góc đối có cùng màu hay khác màu?',
        'Do opposite corners have the same colour or different ones?',
      ),
      m(
        'Cùng màu, vì (0 + 0) và (n − 1 + n − 1) cùng tính chẵn lẻ.',
        'The same, since 0 + 0 and (n − 1) + (n − 1) have the same parity.',
      ),
      m(
        'Bỏ hai ô cùng màu thì số đen và trắng lệch nhau 2.',
        'Removing two cells of one colour makes the black and white counts differ by 2.',
      ),
    ],
    misconceptions: [
      m(
        'Quên rằng hai góc đối cùng màu: bỏ chúng làm mất hai ô cùng màu, nên hai số đếm lệch nhau.',
        'Forgetting that opposite corners have the same colour: removing them takes away two cells of one colour, so the counts differ.',
      ),
    ],
  },
  {
    id: 'conclude',
    label: m('Kết luận', 'The conclusion'),
    narration: m(
      'Mỗi domino phủ một ô đen và một ô trắng. Nếu lát được thì hai số đếm phải bằng nhau. Nếu hai số khác nhau thì không thể lát được; nếu bằng nhau, có thể lát được và ta đi tìm một cách lát.',
      'Each domino covers one black and one white cell. If a tiling exists the two counts must be equal. If the two counts differ no tiling is possible; if they match, a tiling may exist and we look for one.',
    ),
    hints: [
      m(
        'Nếu lát được thì hai số đếm thế nào?',
        'If a tiling exists, how do the two counts compare?',
      ),
      m(
        'Bằng nhau, vì mỗi domino phủ một ô mỗi màu.',
        'Equal, because each domino covers one cell of each colour.',
      ),
      m(
        'Hai số khác nhau thì không lát được; bằng nhau thì phải chỉ ra một cách lát.',
        'Different counts mean no tiling; equal counts mean an explicit tiling must be shown.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai số đếm bằng nhau thì chắc chắn lát được: đó mới là điều kiện cần, ta phải chỉ ra một cách lát.',
        'Thinking equal counts guarantee a tiling: that is only a necessary condition, an explicit tiling must be shown.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tô màu cho ta một bất biến: mỗi domino phủ một ô đen và một ô trắng, nên lát được thì hai số đếm phải bằng nhau. Hai số khác nhau thì chắc chắn không lát được; bằng nhau mới chỉ là điều kiện cần. Đổi mẫu để thử.',
      'The colouring gives an invariant: each domino covers one black and one white cell, so a tiling forces the two counts to be equal. Different counts mean certainly no tiling; equal counts are only a necessary condition. Change the preset to try.',
    ),
    hints: [
      m(
        'Mỗi domino phủ bao nhiêu ô mỗi màu?',
        'How many cells of each colour does a domino cover?',
      ),
      m(
        'Đúng một ô đen và một ô trắng, vì hai ô kề nhau khác màu.',
        'Exactly one black and one white, since touching cells differ in colour.',
      ),
      m(
        'Nên số ô đen phải bằng số ô trắng; nếu không, không lát được.',
        'So the black count must equal the white count; otherwise there is no tiling.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai số đếm bằng nhau là đủ để lát được: đó chỉ là điều kiện cần, phải chỉ ra một cách lát cụ thể.',
        'Thinking equal counts are enough for a tiling: they are only necessary, a concrete tiling must be shown.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Bàn cờ {n} × {n} bị bỏ hai ô (màu cam). Có lát kín phần còn lại bằng các domino hai ô được không? Mỗi domino phủ hai ô kề nhau.',
    'A {n} × {n} board with two cells removed (orange). Can dominoes of two cells cover the rest exactly? Each domino covers two touching cells.',
  ),
  color: m(
    'Tô đen trắng xen kẽ như bàn cờ vua: hai ô kề nhau luôn khác màu, nên mỗi domino phủ một ô đen và một ô trắng.',
    'Colour the cells black and white in turns like a chess board: touching cells always differ in colour, so each domino covers one black and one white cell.',
  ),
  count: m(
    'Còn lại {black} ô đen và {white} ô trắng, tổng {total} ô. Một cách lát cần {d} domino, mỗi cái phủ một ô mỗi màu.',
    'There remain {black} black and {white} white cells, {total} in all. A tiling needs {d|domino|dominoes}, each covering one cell of each colour.',
  ),
  concludeNo: m(
    'Hai ô bị bỏ cùng màu đen nên {black} ≠ {white}. Mỗi domino phủ một ô mỗi màu, vậy không thể lát được.',
    'The two removed cells are both black, so {black} ≠ {white}. Each domino covers one cell of each colour, so no tiling exists.',
  ),
  concludeYes: m(
    'Hai ô bị bỏ khác màu nên {black} = {white}: điều kiện cần thoả. Lát được bằng {d} domino nằm ngang theo từng hàng.',
    'The two removed cells differ in colour, so {black} = {white}: the necessary condition holds. A tiling exists, with {d} horizontal dominoes row by row.',
  ),
  doneNo: m(
    'Bàn {n} × {n} bỏ hai góc đối không lát được: {black} ô đen khác {white} ô trắng. Màu là bất biến của mọi cách lát.',
    'The {n} × {n} board with opposite corners removed cannot be tiled: {black} black differs from {white} white. The colours are an invariant of every tiling.',
  ),
  doneYes: m(
    'Bàn {n} × {n} bỏ hai ô kề lát được bằng {d} domino. Số đếm bằng nhau chỉ là điều kiện cần; ở đây ta đã chỉ ra một cách lát.',
    'The {n} × {n} board with two adjacent cells removed is tiled by {d|domino|dominoes}. Equal counts are only necessary; here we showed a tiling.',
  ),
};

type Cell = readonly [number, number];

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { n, removed } = input;
  /** the two removed cells, (row, column) counted from the top left */
  const gone: [Cell, Cell] =
    removed === 'opposite-corners'
      ? [
          [0, 0],
          [n - 1, n - 1],
        ]
      : [
          [0, 0],
          [0, 1],
        ];
  const isGone = (r: number, c: number): boolean => gone.some(([a, b]) => a === r && b === c);
  /** a cell is black when row + column is even */
  const black = (r: number, c: number): boolean => (r + c) % 2 === 0;
  let blackLeft = 0;
  let whiteLeft = 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (isGone(r, c)) continue;
      if (black(r, c)) blackLeft++;
      else whiteLeft++;
    }
  const total = n * n - 2;
  const possibleBySize = blackLeft === whiteLeft;
  /** with (0, 0) and (0, 1) removed every row splits into horizontal dominoes, the first row from column 2 */
  const dominoes: [Cell, Cell][] = [];
  if (possibleBySize && removed === 'adjacent') {
    for (let r = 0; r < n; r++)
      for (let c = r === 0 ? 2 : 0; c < n; c += 2)
        dominoes.push([
          [r, c],
          [r, c + 1],
        ]);
  }
  const x = (c: number): number => c;
  const y = (r: number): number => n - 1 - r;
  const bounds = { xmin: -0.5, xmax: n + 0.5, ymin: -0.5, ymax: n + 0.5 };
  /** the board; `colour` paints the cells, `pieces` adds domino shapes on top */
  const board = (
    colour: boolean,
    pieces: readonly (readonly [Cell, Cell])[],
  ): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const fig = new Figure(bounds);
    const marks: Record<string, HighlightKind> = {};
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const id = `c${r}_${c}`;
        fig.rect(id, x(c), y(r), x(c) + 1, y(r) + 1);
        if (isGone(r, c)) marks[id] = 'compare';
        else if (colour && black(r, c)) marks[id] = 'group-1';
      }
    pieces.forEach(([p, q], k) => {
      fig.rect(
        `d${k}`,
        Math.min(x(p[1]), x(q[1])) + 0.08,
        Math.min(y(p[0]), y(q[0])) + 0.08,
        Math.max(x(p[1]), x(q[1])) + 0.92,
        Math.max(y(p[0]), y(q[0])) + 0.92,
      );
      marks[`d${k}`] = k % 2 === 0 ? 'result' : 'active';
    });
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const at = (
    text: Messages,
    codeLine: number,
    pic: { fig: Figure; marks: Record<string, HighlightKind> },
    vars: Record<string, number>,
    beat?: string,
  ): void => put(text, codeLine, pic.fig, vars, beat, pic.marks);
  const counts = { n, black: blackLeft, white: whiteLeft, total, d: total / 2 };
  /** one example domino on two touching cells that are still on the board */
  const example: [Cell, Cell] =
    removed === 'adjacent'
      ? [
          [1, 0],
          [1, 1],
        ]
      : [
          [0, 1],
          [0, 2],
        ];

  at(EX.start, 1, board(false, [example]), { n }, 'start');
  at(EX.color, 2, board(true, []), { n }, 'color');
  at(EX.count, 3, board(true, []), counts, 'count');
  at(possibleBySize ? EX.concludeYes : EX.concludeNo, 4, board(true, dominoes), counts, 'conclude');
  at(possibleBySize ? EX.doneYes : EX.doneNo, 4, board(true, dominoes), counts, 'done');
}

export const tilingColoringEntry: WalkthroughEntry<In, S> = {
  id: 'tiling-coloring',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-pigeonhole-invariants'],
  title: m('Bàn cờ bỏ hai ô và lát domino', 'A chessboard with two cells removed, and dominoes'),
  code: {
    pseudo: [
      'bàn cờ n × n với hai ô bị bỏ và một domino',
      'các ô tô đen trắng xen kẽ, hai ô bị bỏ được đánh dấu màu cam',
      'số ô đen và ô trắng còn lại ghi bên cạnh bàn cờ',
      'kết luận từ hai số đếm: khác nhau thì không lát được, bằng nhau thì có một cách lát hoàn chỉnh',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    {
      id: 'n8-opposite',
      label: m('Bàn 8 × 8, bỏ hai góc đối', '8 × 8, opposite corners removed'),
      input: { n: 8, removed: 'opposite-corners' },
    },
    {
      id: 'n4-opposite',
      label: m('Bàn 4 × 4, bỏ hai góc đối', '4 × 4, opposite corners removed'),
      input: { n: 4, removed: 'opposite-corners' },
    },
    {
      id: 'n6-adjacent',
      label: m('Bàn 6 × 6, bỏ hai ô kề', '6 × 6, two adjacent cells removed'),
      input: { n: 6, removed: 'adjacent' },
    },
    {
      id: 'n8-adjacent',
      label: m('Bàn 8 × 8, bỏ hai ô kề', '8 × 8, two adjacent cells removed'),
      input: { n: 8, removed: 'adjacent' },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng thử vài cách không được nghĩa là không thể: cần một lý lẽ cho mọi cách.',
        'Thinking that a few failed attempts mean it is impossible: an argument for every attempt is needed.',
      ),
    },
    {
      beat: 'color',
      text: m(
        'Nghĩ rằng việc tô màu chỉ để cho đẹp: nó tạo ra một bất biến dùng được trong chứng minh.',
        'Thinking the colouring is only decoration: it creates an invariant that can be used in a proof.',
      ),
    },
    {
      beat: 'count',
      text: m(
        'Quên rằng hai góc đối cùng màu: bỏ chúng làm mất hai ô cùng màu, nên hai số đếm lệch nhau.',
        'Forgetting that opposite corners have the same colour: removing them takes away two cells of one colour, so the counts differ.',
      ),
    },
    {
      beat: 'conclude',
      text: m(
        'Nghĩ rằng hai số đếm bằng nhau thì chắc chắn lát được: đó mới là điều kiện cần, ta phải chỉ ra một cách lát.',
        'Thinking equal counts guarantee a tiling: that is only a necessary condition, an explicit tiling must be shown.',
      ),
    },
  ],
  maxFrames: 6,
  maxBytes: 200_000,
  run,
};
