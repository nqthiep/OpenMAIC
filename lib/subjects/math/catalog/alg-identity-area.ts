/**
 * Walkthrough entry: Algebraic identities as areas (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m1-alg-identities`.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type Id = 'square-sum' | 'diff-squares';
type In = { id: Id; a: number; b: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    id: { kind: 'enum', values: ['square-sum', 'diff-squares'] },
    a: { kind: 'int', range: [1, 9] },
    b: { kind: 'int', range: [1, 9] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Hình vuông', 'The square'),
    narration: m(
      'Ta vẽ một hình vuông: cạnh a cộng b cho bình phương của một tổng, cạnh a cho hiệu hai bình phương. Diện tích hình vuông là cạnh nhân cạnh.',
      'We draw a square: side a plus b for the square of a sum, side a for the difference of squares. The area of a square is its side times its side.',
    ),
    hints: [
      m(
        'Diện tích hình vuông cạnh a + b tính thế nào?',
        'How is the area of a square of side a + b computed?',
      ),
      m('Cạnh nhân cạnh: (a + b)·(a + b).', 'Side times side: (a + b)·(a + b).'),
      m(
        'Đó là (a + b)², ta sẽ chia nó thành các phần nhỏ.',
        'That is (a + b)², and we will cut it into smaller parts.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng (a + b)² chỉ là diện tích hai hình vuông a² và b²: còn thiếu hai hình chữ nhật.',
        'Thinking (a + b)² is just the area of the two squares a² and b²: two rectangles are missing.',
      ),
    ],
  },
  {
    id: 'decompose',
    label: m('Chia nhỏ', 'Cutting it up'),
    narration: m(
      'Ta kẻ hai đường song song với các cạnh để chia hình vuông cạnh a cộng b thành bốn phần: hai hình vuông và hai hình chữ nhật. Với hiệu hai bình phương ta cắt bỏ góc b bình phương. Hai hình vuông có diện tích a bình phương và b bình phương, hai hình chữ nhật cùng có diện tích a nhân b.',
      'We draw two lines parallel to the sides to cut the square of side a plus b into four parts: two squares and two rectangles. For the difference we cut away the corner b squared. The squares have areas a squared and b squared, and the two rectangles each have area a times b.',
    ),
    ask: {
      text: m(
        'Sau khi chia, có mấy hình chữ nhật?',
        'After the cut, how many rectangles are there?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Một', 'One'), m('Hai', 'Two'), m('Ba', 'Three')],
        // the square of a sum has two a-by-b rectangles; the L of a difference is two rectangles as well
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Một đường dọc và một đường ngang chia hình vuông thành mấy phần?',
        'How many parts do one vertical and one horizontal line make?',
      ),
      m(
        'Bốn phần: hai hình vuông và hai hình chữ nhật.',
        'Four parts: two squares and two rectangles.',
      ),
      m(
        'Hai hình vuông là a² và b², hai hình chữ nhật đều là a·b.',
        'The squares are a² and b², and both rectangles are a·b.',
      ),
    ],
    misconceptions: [
      m(
        'Quên rằng có hai hình chữ nhật ab, nên viết a² + ab + b².',
        'Forgetting that there are two rectangles ab, and writing a² + ab + b².',
      ),
    ],
  },
  {
    id: 'rearrange',
    label: m('Ghép lại', 'Rearranging'),
    narration: m(
      'Ta di chuyển các phần còn lại và ghép chúng thành một hình mới, không bỏ sót và không chồng lên nhau. Diện tích không đổi vì ta chỉ dịch chuyển các phần, không thêm bớt.',
      'We move the remaining parts and fit them into a new shape, leaving nothing out and overlapping nothing. The area does not change because we only moved the parts, adding and removing nothing.',
    ),
    hints: [
      m(
        'Sau khi cắt góc b², phần còn lại có hình gì?',
        'After cutting the b² corner, what shape is left?',
      ),
      m(
        'Hình chữ L; cắt đôi rồi ghép lại thì ra hình chữ nhật.',
        'An L; cut it in two and move a piece to get a rectangle.',
      ),
      m(
        'Chiều dài a + b, chiều rộng a − b, nên diện tích (a + b)(a − b).',
        'Length a + b, width a − b, so the area is (a + b)(a − b).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ghép lại làm diện tích thay đổi: ta chỉ dịch chuyển, nên diện tích giữ nguyên.',
        'Thinking rearranging changes the area: we only move parts, so the area is preserved.',
      ),
    ],
  },
  {
    id: 'formula',
    label: m('Công thức', 'The formula'),
    narration: m(
      'Bây giờ ta đọc diện tích hai cách: một cách từ hình ban đầu, một cách từ hình đã ghép. Hai cách phải cho cùng một số, và đó chính là hằng đẳng thức.',
      'Now we read the area two ways: once from the original figure, once from the rearranged one. The two ways must give the same number, and that is exactly the identity.',
    ),
    hints: [
      m(
        'Hai cách đọc diện tích cho cùng kết quả vì sao?',
        'Why do the two readings give the same result?',
      ),
      m(
        'Vì ta chỉ sắp xếp lại các phần, không thêm bớt.',
        'Because we only rearranged the parts, adding and removing nothing.',
      ),
      m(
        'Nên hai biểu thức bằng nhau với mọi a, b: đó là hằng đẳng thức.',
        'So the two expressions are equal for all a, b: that is an identity.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hằng đẳng thức chỉ đúng với số nguyên dương nhỏ: nó đúng với mọi số, hình vẽ chỉ minh hoạ.',
        'Thinking the identity holds only for small positive integers: it holds for all numbers; the picture only illustrates it.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Hai cách đọc cùng một diện tích cho hai hằng đẳng thức: (a + b)² = a² + 2ab + b² và a² − b² = (a + b)(a − b). Đổi sang mẫu khác để thấy chúng đúng với các số khác.',
      'Two readings of the same area give two identities: (a + b)² = a² + 2ab + b² and a² − b² = (a + b)(a − b). Switch presets to see them hold for other numbers.',
    ),
    hints: [
      m('Hằng đẳng thức nào được chứng minh bằng hình?', 'Which identity does the figure prove?'),
      m(
        'Tính diện tích một hình theo hai cách khác nhau.',
        'Compute the area of one figure in two different ways.',
      ),
      m(
        'Hai cách phải cho cùng một số, và đó chính là hằng đẳng thức.',
        'The two ways must give the same number, and that is exactly the identity.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng một hình chỉ minh hoạ cho một cặp số: hình cho thấy cách ghép đúng với mọi a, b thoả điều kiện.',
        'Thinking a figure only illustrates one pair of numbers: it shows a cutting that works for all a, b that meet the condition.',
      ),
    ],
  },
];

const EX = {
  sumStart: m(
    'Hình vuông cạnh a + b = {s} (a = {a}, b = {b}). Diện tích của nó là (a + b)² = {t}.',
    'A square of side a + b = {s} (a = {a}, b = {b}). Its area is (a + b)² = {t}.',
  ),
  sumCut: m(
    'Hai đường song song với các cạnh chia nó thành bốn phần: a² = {a2}, hai hình chữ nhật ab = {ab} và b² = {b2}.',
    'Two lines parallel to the sides cut it into four parts: a² = {a2}, two rectangles ab = {ab} and b² = {b2}.',
  ),
  sumApart: m(
    'Tách bốn phần ra xa nhau: không phần nào bị mất hay chồng lên nhau.',
    'Pull the four parts apart: none is lost and none overlaps another.',
  ),
  sumFormula: m(
    'Ghép lại: (a + b)² = a² + 2ab + b², tức {t} = {a2} + {ab2} + {b2}.',
    'Put them back: (a + b)² = a² + 2ab + b², that is {t} = {a2} + {ab2} + {b2}.',
  ),
  sumDone: m(
    'Vậy (a + b)² = a² + 2ab + b² (2ab là diện tích của cả hai hình chữ nhật). Với a = {a}, b = {b}: {t} = {a2} + {ab2} + {b2}.',
    'So (a + b)² = a² + 2ab + b² (2ab is the area of both rectangles). For a = {a}, b = {b}: {t} = {a2} + {ab2} + {b2}.',
  ),
  diffStart: m(
    'Hình vuông cạnh a = {a}, diện tích a² = {a2}. Ở góc có hình vuông nhỏ cạnh b = {b}, diện tích b² = {b2}.',
    'A square of side a = {a}, area a² = {a2}. In the corner sits a small square of side b = {b}, area b² = {b2}.',
  ),
  diffCut: m(
    'Cắt bỏ góc b²: còn hình chữ L diện tích a² − b² = {d}, gồm hai hình chữ nhật a·(a − b) và (a − b)·b.',
    'Cut away the corner b²: the L-shape of area a² − b² = {d} remains, made of two rectangles a·(a − b) and (a − b)·b.',
  ),
  diffMove: m(
    'Xoay hình chữ nhật nhỏ một góc vuông và ghép vào cạnh phải của hình chữ nhật lớn: diện tích không đổi.',
    'Turn the small rectangle a quarter turn and fit it to the right of the big one: the area does not change.',
  ),
  diffFormula: m(
    'Được hình chữ nhật (a + b) × (a − b) = {sa} × {db}: a² − b² = (a + b)(a − b), tức {d} = {p}.',
    'It is a rectangle (a + b) × (a − b) = {sa} × {db}: a² − b² = (a + b)(a − b), that is {d} = {p}.',
  ),
  diffDone: m(
    'Vậy a² − b² = (a + b)(a − b). Với a = {a}, b = {b}: {d} = {sa}·{db}.',
    'So a² − b² = (a + b)(a − b). For a = {a}, b = {b}: {d} = {sa}·{db}.',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { a, b } = input;
  const put = framePut(emit, ctx.locale);
  const labels = (f: Figure, items: [string, Pt, string][]): Figure => {
    for (const [id, p, text] of items) f.anchor(id, p, text, true);
    return f;
  };
  if (input.id === 'square-sum') {
    const s = a + b;
    const g = Math.max(1, s / 8); // how far the parts are pulled apart
    const bounds = { xmin: -1, xmax: s + g + 1, ymin: -1.2, ymax: s + g + 1 };
    const nums = { a, b, s, a2: a * a, b2: b * b, ab: a * b, ab2: 2 * a * b, t: s * s };
    const pieces = (dx: number, dy: number, withLabels: boolean): Figure => {
      const f = new Figure(bounds)
        .rect('qa', 0, 0, a, a)
        .rect('r1', a + dx, 0, s + dx, a)
        .rect('r2', 0, a + dy, a, s + dy)
        .rect('qb', a + dx, a + dy, s + dx, s + dy);
      return withLabels
        ? labels(f, [
            ['ta', [a / 2, a / 2], 'a²'],
            ['t1', [a + dx + b / 2, a / 2], 'ab'],
            ['t2', [a / 2, a + dy + b / 2], 'ab'],
            ['tb', [a + dx + b / 2, a + dy + b / 2], 'b²'],
          ])
        : f;
    };
    const marks = { qa: 'group-0', r1: 'group-1', r2: 'group-1', qb: 'group-2' } as const;
    put(
      EX.sumStart,
      1,
      labels(new Figure(bounds).rect('whole', 0, 0, s, s), [
        ['la', [a / 2, -0.6], 'a'],
        ['lb', [a + b / 2, -0.6], 'b'],
      ]),
      nums,
      'start',
      { whole: 'compare' },
    );
    put(EX.sumCut, 2, pieces(0, 0, true), nums, 'decompose', marks);
    put(EX.sumApart, 3, pieces(g, g, true), nums, 'rearrange', marks);
    put(EX.sumFormula, 4, pieces(0, 0, true), nums, 'formula', marks);
    put(EX.sumDone, 4, pieces(0, 0, true), nums, 'done', marks);
    return;
  }
  // difference of squares: a > b
  const sa = a + b;
  const db = a - b;
  const bounds = { xmin: -1, xmax: sa + 1, ymin: -1.2, ymax: a + 1 };
  const nums = { a, b, a2: a * a, b2: b * b, d: a * a - b * b, sa, db, p: sa * db };
  const L = (withCorner: boolean): Figure => {
    const f = new Figure(bounds);
    if (withCorner) f.rect('corner', db, db, a, a);
    return f;
  };
  put(
    EX.diffStart,
    1,
    labels(L(true).rect('big', 0, 0, a, a), [
      ['la', [a / 2, -0.6], 'a'],
      ['lb', [db + b / 2, a + 0.6], 'b'],
    ]),
    nums,
    'start',
    { big: 'compare', corner: 'group-2' },
  );
  const cut = (): Figure =>
    labels(L(false).rect('r1', 0, 0, a, db).rect('r2', 0, db, db, a), [
      ['t1', [a / 2, db / 2], 'a(a−b)'],
      ['t2', [db / 2, db + b / 2], '(a−b)b'],
    ]);
  put(EX.diffCut, 2, cut(), nums, 'decompose', { r1: 'group-0', r2: 'group-1' });
  const moved = (): Figure =>
    labels(L(false).rect('r1', 0, 0, a, db).rect('ghost', 0, db, db, a).rect('r2', a, 0, sa, db), [
      ['t1', [a / 2, db / 2], 'a(a−b)'],
      ['t2', [a + b / 2, db / 2], '(a−b)b'],
    ]);
  put(EX.diffMove, 3, moved(), nums, 'rearrange', { r1: 'group-0', r2: 'group-1', ghost: 'muted' });
  put(
    EX.diffFormula,
    4,
    labels(L(false).rect('r1', 0, 0, a, db).rect('r2', a, 0, sa, db), [
      ['w', [sa / 2, -0.6], 'a+b'],
      ['h', [sa + 0.7, db / 2], 'a−b'],
    ]),
    nums,
    'formula',
    { r1: 'group-0', r2: 'group-1' },
  );
  put(EX.diffDone, 4, L(false).rect('r1', 0, 0, a, db).rect('r2', a, 0, sa, db), nums, 'done', {
    r1: 'group-0',
    r2: 'group-1',
  });
}

export const algIdentityAreaEntry: WalkthroughEntry<In, S> = {
  id: 'alg-identity-area',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-alg-identities'],
  title: m('Hằng đẳng thức bằng diện tích', 'Algebraic identities as areas'),
  code: {
    pseudo: [
      'hình vuông cạnh a + b (hoặc cạnh a)',
      'hình vuông chia thành a², ab, ab, b² (hoặc cắt bỏ góc b²)',
      'các phần được di chuyển và ghép thành hình chữ nhật (a + b) × (a − b) cho hiệu hai bình phương',
      'hai cách đọc diện tích cạnh nhau và dấu bằng',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) =>
    i.id === 'diff-squares' && i.a <= i.b ? ['diff-squares-needs-a-greater-than-b'] : [],
  customInput: false,
  presets: [
    { id: 'sum-3-2', label: m('(3 + 2)²', '(3 + 2)²'), input: { id: 'square-sum', a: 3, b: 2 } },
    {
      id: 'sum-1-1',
      label: m('(1 + 1)² (nhỏ nhất)', '(1 + 1)² (smallest)'),
      input: { id: 'square-sum', a: 1, b: 1 },
    },
    { id: 'diff-5-2', label: m('5² − 2²', '5² − 2²'), input: { id: 'diff-squares', a: 5, b: 2 } },
    { id: 'diff-9-1', label: m('9² − 1²', '9² − 1²'), input: { id: 'diff-squares', a: 9, b: 1 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng (a + b)² chỉ là diện tích hai hình vuông a² và b²: còn thiếu hai hình chữ nhật.',
        'Thinking (a + b)² is just the area of the two squares a² and b²: two rectangles are missing.',
      ),
    },
    {
      beat: 'decompose',
      text: m(
        'Quên rằng có hai hình chữ nhật ab, nên viết a² + ab + b².',
        'Forgetting that there are two rectangles ab, and writing a² + ab + b².',
      ),
    },
    {
      beat: 'rearrange',
      text: m(
        'Nghĩ rằng ghép lại làm diện tích thay đổi: ta chỉ dịch chuyển, nên diện tích giữ nguyên.',
        'Thinking rearranging changes the area: we only move parts, so the area is preserved.',
      ),
    },
    {
      beat: 'formula',
      text: m(
        'Nghĩ rằng hằng đẳng thức chỉ đúng với số nguyên dương nhỏ: nó đúng với mọi số, hình vẽ chỉ minh hoạ.',
        'Thinking the identity holds only for small positive integers: it holds for all numbers; the picture only illustrates it.',
      ),
    },
  ],
  maxFrames: 6,
  maxBytes: 200_000,
  run,
};
