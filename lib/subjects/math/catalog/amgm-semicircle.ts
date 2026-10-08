/**
 * Walkthrough entry: AM–GM on a semicircle (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m1-inequality-basic`.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, upperSemicircle, type FigState } from '@/lib/subjects/math/figure';

type In = { a: number; b: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { a: { kind: 'int', range: [1, 20] }, b: { kind: 'int', range: [1, 20] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Dựng hình', 'The figure'),
    narration: m(
      'Cho hai số dương a và b, một đoạn AB dài a cộng b và một điểm C chia nó thành hai đoạn a và b. Ta vẽ nửa đường tròn đường kính AB. Nhớ rằng đường kính AB bằng a cộng b, nên bán kính là một nửa của nó.',
      'Take two positive numbers a and b, a segment AB of length a plus b, and a point C that cuts it into pieces a and b. We draw the semicircle on the diameter AB. Remember the diameter AB is a plus b, so the radius is half of it.',
    ),
    hints: [
      m('Đường kính AB dài bao nhiêu?', 'How long is the diameter AB?'),
      m(
        'AB bằng a cộng b, nên bán kính bằng một nửa.',
        'AB is a plus b, so the radius is half of it.',
      ),
      m(
        'r = (a + b)/2, ta sẽ so h với số này.',
        'r = (a + b)/2, and we will compare h with this number.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ đúng khi a, b nguyên: đúng với mọi số dương.',
        'Thinking it holds only for integers a, b: it holds for all positive numbers.',
      ),
    ],
  },
  {
    id: 'height',
    label: m('Chiều cao h', 'The height h'),
    narration: m(
      'Từ C ta dựng đường vuông góc với AB, cắt nửa đường tròn tại D. Gọi độ dài CD là h. Tam giác ABD vuông tại D, nên h bình phương bằng a nhân b.',
      'From C we erect the perpendicular to AB, meeting the semicircle at D. Call the length CD h. The triangle ABD has a right angle at D, so h squared equals a times b.',
    ),
    ask: {
      text: m(
        'Theo em, h lớn nhất khi C nằm ở đâu?',
        'Where do you think the point C must be for h to be largest?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Gần A', 'Near A'),
          m('Ở giữa AB', 'In the middle of AB'),
          m('Gần B', 'Near B'),
        ],
        // h is the height of the semicircle above C: largest above the centre, whatever a and b are
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Góc nội tiếp chắn nửa đường tròn bằng bao nhiêu?',
        'What is an inscribed angle on a diameter?',
      ),
      m(
        'Bằng 90 độ, nên tam giác ABD vuông tại D.',
        'It is 90 degrees, so the triangle ABD is right-angled at D.',
      ),
      m(
        'Trong tam giác vuông, bình phương đường cao bằng tích hai đoạn trên cạnh huyền: h² = ab.',
        'In a right triangle the square of the altitude equals the product of the two pieces of the hypotenuse: h² = ab.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng h là trung bình cộng của a và b: h là trung bình nhân, căn của ab.',
        'Thinking h is the arithmetic mean of a and b: h is the geometric mean, the root of ab.',
      ),
    ],
  },
  {
    id: 'compare',
    label: m('So với bán kính', 'Against the radius'),
    narration: m(
      'Bán kính r bằng a cộng b chia hai. Đoạn CD dựng từ C lên nửa đường tròn. Mọi điểm của nửa đường tròn cách AB không quá r, nên h nhỏ hơn hoặc bằng r.',
      'The radius r is a plus b over two. The segment CD rises from C to the semicircle. Every point of the semicircle is at most r above AB, so h is less than or equal to r.',
    ),
    hints: [
      m(
        'Điểm nào của nửa đường tròn cao nhất so với AB?',
        'Which point of the semicircle is highest above AB?',
      ),
      m('Điểm chính giữa, cao đúng bằng bán kính.', 'The middle one, exactly a radius high.'),
      m(
        'Mọi điểm cao không quá r, nên h ≤ r, tức √(ab) ≤ (a + b)/2.',
        'Every point is at most r high, so h ≤ r, that is √(ab) ≤ (a + b)/2.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng h luôn nhỏ hơn hẳn r: h có thể bằng r khi a = b.',
        'Thinking h is always strictly smaller than r: h can equal r when a = b.',
      ),
    ],
  },
  {
    id: 'equality',
    label: m('Khi nào bằng nhau', 'When equal'),
    narration: m(
      'Ta trượt C về phía tâm và xem h thay đổi thế nào so với r. Chỉ khi C trùng tâm, tức a bằng b, thì h mới chạm bán kính. Đây chính là bất đẳng thức AM-GM.',
      'We slide C toward the centre and watch how h compares with r. Only when C is the centre, that is a equals b, does h reach the radius. This is exactly the AM-GM inequality.',
    ),
    ask: {
      text: m('Khi nào thì h đúng bằng bán kính?', 'When is h exactly equal to the radius?'),
      predict: {
        kind: 'choice',
        options: [
          m('Khi a < b', 'When a < b'),
          m('Khi a = b', 'When a = b'),
          m('Khi a > b', 'When a > b'),
        ],
        // C is the centre of the semicircle exactly when a = b
        answer: () => 1,
      },
    },
    hints: [
      m('Khi nào C trùng với tâm của nửa đường tròn?', 'When is C the centre of the semicircle?'),
      m('Khi hai đoạn AC và CB bằng nhau, tức a = b.', 'When AC and CB are equal, that is a = b.'),
      m(
        'Lúc đó h = r, nên dấu bằng của bất đẳng thức xảy ra đúng khi a = b.',
        'Then h = r, so equality holds exactly when a = b.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dấu bằng cần a và b đều bằng 1: chỉ cần a = b, bất kể giá trị.',
        'Thinking equality needs a and b to be 1: it only needs a = b, whatever the value.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Vậy với mọi a, b dương, căn của ab không vượt quá (a + b)/2, và bằng nhau chỉ khi a = b. Thử các mẫu có sẵn khác để thấy h không bao giờ vượt bán kính.',
      'So for all positive a, b the root of ab never exceeds (a + b)/2, with equality only when a = b. Try the other presets and see that h never exceeds the radius.',
    ),
    hints: [
      m('Hai trung bình nào được so sánh?', 'Which two means are being compared?'),
      m(
        'Trung bình cộng (a + b)/2 là bán kính; trung bình nhân là chiều cao h.',
        'The arithmetic mean (a + b)/2 is the radius; the geometric mean is the height h.',
      ),
      m(
        'Bán kính là điểm cao nhất của nửa đường tròn, nên h ≤ r, dấu bằng khi C là tâm.',
        'The radius is the highest point of the semicircle, so h ≤ r, with equality when C is the centre.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bất đẳng thức chỉ đúng với số nguyên: nó đúng với mọi số dương.',
        'Thinking the inequality holds only for integers: it holds for all positive numbers.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đoạn AB dài a + b = {s}. Điểm C chia nó thành a = {a} và b = {b}.',
    'The segment AB has length a + b = {s}. The point C cuts it into a = {a} and b = {b}.',
  ),
  arc: m(
    'Nửa đường tròn đường kính AB, tâm O ở giữa AB: đường kính {s}, nên bán kính r = (a + b)/2.',
    'The semicircle on the diameter AB, centre O in the middle of AB: the diameter is {s}, so the radius is r = (a + b)/2.',
  ),
  height: m(
    'CD ⊥ AB, D trên nửa đường tròn. ABD vuông tại D nên h² = a·b = {ab}, với h = CD.',
    'CD ⊥ AB with D on the semicircle. ABD is right-angled at D, so h² = a·b = {ab}, where h = CD.',
  ),
  compare: m(
    'OP = r là điểm cao nhất của nửa đường tròn, nên h ≤ r, tức 4·ab ≤ (a + b)²: 4·{ab} = {ab4} ≤ {s2}.',
    'OP = r is the highest point of the semicircle, so h ≤ r, that is 4·ab ≤ (a + b)²: 4·{ab} = {ab4} ≤ {s2}.',
  ),
  slide: m(
    'Kéo C tới vị trí {k}/{parts} của AB: CD vẫn không dài hơn OP, tức h ≤ r.',
    'Slide C to position {k}/{parts} of AB: CD is still no longer than OP, that is h ≤ r.',
  ),
  centre: m(
    'C trùng tâm O (a = b): CD và OP chồng nhau, h = r. Đây là lúc duy nhất dấu bằng xảy ra.',
    'C is the centre O (a = b): CD and OP coincide, h = r. This is the only time equality holds.',
  ),
  done: m(
    'Vậy √(ab) ≤ (a + b)/2, dấu bằng khi và chỉ khi a = b. Với a = {a}, b = {b}: ab = {ab}, (a + b)² = {s2}.',
    'So √(ab) ≤ (a + b)/2, with equality if and only if a = b. For a = {a}, b = {b}: ab = {ab}, (a + b)² = {s2}.',
  ),
};

const PARTS = 8;

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { a, b } = input;
  const s = a + b;
  const r = s / 2;
  const ab = a * b;
  const bounds = { xmin: -1, xmax: s + 1, ymin: -1.4, ymax: r + 1 };
  const arc = upperSemicircle([r, 0], r);
  const base = (c: number): Figure =>
    new Figure(bounds)
      .point('A', [0, 0])
      .point('B', [s, 0])
      .point('C', [c, 0])
      .point('O', [r, 0])
      .seg('AC', 'A', 'C')
      .seg('CB', 'C', 'B');
  /** the height of the semicircle above x = c, for 0 < c < s: sqrt(c·(s − c)) */
  const height = (c: number): number => Math.sqrt(c * (s - c));
  const withHeight = (f: Figure, c: number): Figure =>
    f.point('D', [c, height(c)]).seg('CD', 'C', 'D');
  const withRadius = (f: Figure): Figure => f.point('P', [r, r]).seg('OP', 'O', 'P');
  const put = (
    text: Messages,
    codeLine: number,
    f: Figure,
    vars: Record<string, number>,
    tag: string | undefined,
    marks: Record<string, HighlightKind>,
  ): void =>
    emit(f.snapshot(), {
      explanation: fill(msg(text, ctx.locale), vars),
      codeLine,
      highlights: { AC: 'group-0', CB: 'group-1', ...marks },
      vars,
      ...(tag ? { tags: [`beat:${tag}`] } : {}),
    });

  put(EX.start, 1, base(a), { a, b, s }, 'start', {});
  put(EX.arc, 1, base(a).polyline('arc', arc), { s }, undefined, { arc: 'compare' });
  put(
    EX.height,
    2,
    withHeight(base(a).polyline('arc', arc), a)
      .seg('AD', 'A', 'D', { dashed: true })
      .seg('DB', 'D', 'B', { dashed: true })
      .angle('right', 'D', 'A', 'B', '90°'),
    { a, b, ab },
    'height',
    { CD: 'active', arc: 'visited' },
  );
  put(
    EX.compare,
    3,
    withRadius(withHeight(base(a).polyline('arc', arc), a)),
    { ab, ab4: 4 * ab, s2: s * s },
    'compare',
    { CD: 'active', OP: 'result', arc: 'visited' },
  );
  // C slides along AB while a + b stays the same: the figure follows C
  for (let k = 1; k < PARTS; k++) {
    const c = (k * s) / PARTS;
    const centre = k === PARTS / 2;
    put(
      centre ? EX.centre : EX.slide,
      centre ? 4 : 3,
      withRadius(withHeight(base(c).polyline('arc', arc), c)),
      centre ? {} : { k, parts: PARTS },
      centre ? 'equality' : undefined,
      centre ? { CD: 'result', OP: 'result' } : { CD: 'active', OP: 'result', arc: 'visited' },
    );
  }
  put(
    EX.done,
    4,
    withRadius(withHeight(base(a).polyline('arc', arc), a)),
    { a, b, ab, s2: s * s },
    'done',
    { CD: 'active', OP: 'result' },
  );
}

export const amgmSemicircleEntry: WalkthroughEntry<In, S> = {
  id: 'amgm-semicircle',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-inequality-basic'],
  title: m('AM–GM bằng nửa đường tròn', 'AM–GM on a semicircle'),
  code: {
    pseudo: [
      'đoạn AB = a + b, điểm C chia thành a | b, nửa đường tròn đường kính AB',
      'đường CD vuông góc với AB tại C, cắt nửa đường tròn ở D; tam giác ABD vuông tại D',
      'bán kính r vẽ đứng từ tâm, đường CD ngắn hơn hoặc bằng nó',
      'C trượt về tâm; h tăng dần tới r; khi C trùng tâm thì h = r',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: 'two-eight', label: m('a = 2, b = 8', 'a = 2, b = 8'), input: { a: 2, b: 8 } },
    { id: 'equal', label: m('a = b = 4', 'a = b = 4'), input: { a: 4, b: 4 } },
    { id: 'far', label: m('a = 1, b = 20', 'a = 1, b = 20'), input: { a: 1, b: 20 } },
    { id: 'nine-sixteen', label: m('a = 9, b = 16', 'a = 9, b = 16'), input: { a: 9, b: 16 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng chỉ đúng khi a, b nguyên: đúng với mọi số dương.',
        'Thinking it holds only for integers a, b: it holds for all positive numbers.',
      ),
    },
    {
      beat: 'height',
      text: m(
        'Nghĩ rằng h là trung bình cộng của a và b: h là trung bình nhân, căn của ab.',
        'Thinking h is the arithmetic mean of a and b: h is the geometric mean, the root of ab.',
      ),
    },
    {
      beat: 'compare',
      text: m(
        'Nghĩ rằng h luôn nhỏ hơn hẳn r: h có thể bằng r khi a = b.',
        'Thinking h is always strictly smaller than r: h can equal r when a = b.',
      ),
    },
    {
      beat: 'equality',
      text: m(
        'Nghĩ rằng dấu bằng cần a và b đều bằng 1: chỉ cần a = b, bất kể giá trị.',
        'Thinking equality needs a and b to be 1: it only needs a = b, whatever the value.',
      ),
    },
  ],
  maxFrames: 14,
  maxBytes: 200_000,
  run,
};
