/**
 * Walkthrough entry: Inversion in a circle (ADR 0015). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m4-projective-inversion`.
 *
 * The circle of inversion has centre O and radius r; P goes to P′ on the ray OP with OP·OP′ = r². For the line y = d
 * (d ≠ 0) and its points (t, d) the images are r²·(t, d)/(t² + d²), all rational, and they lie on the circle through O
 * with centre (0, r²/(2d)) and radius r²/(2d).
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, frac, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { r: number; d: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { r: { kind: 'int', range: [2, 4] }, d: { kind: 'int', range: [1, 4] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đường tròn nghịch đảo', 'The circle of inversion'),
    narration: m(
      'Ta có một đường tròn tâm O bán kính r, gọi là đường tròn nghịch đảo, và một đường thẳng l không đi qua O. Ta sẽ xem phép nghịch đảo biến đường thẳng này thành hình gì.',
      'We have a circle with centre O and radius r, the circle of inversion, and a line l that does not pass through O. We will see what shape the inversion turns this line into.',
    ),
    hints: [
      m('Đường thẳng l có đi qua O không?', 'Does the line l pass through O?'),
      m('Không: nó cách O một khoảng d khác 0.', 'No: it is at a distance d from O, not 0.'),
      m(
        'Đó là điểm khác với trường hợp đường thẳng đi qua O ở bước sau.',
        'That is what differs from the line through O in a later step.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phép nghịch đảo là phép đối xứng qua đường tròn: nó đưa điểm trong ra ngoài nhưng không giữ khoảng cách.',
        'Thinking inversion is a reflection in the circle: it sends inside to outside but does not keep distances.',
      ),
    ],
  },
  {
    id: 'rule',
    label: m('Quy tắc nghịch đảo', 'The rule'),
    narration: m(
      'Với điểm P khác O, ảnh P phẩy nằm trên tia OP sao cho OP nhân OP phẩy bằng r bình phương. Điểm ở gần O thì ảnh ở xa O, điểm ở xa thì ảnh ở gần.',
      'For a point P other than O, the image P prime lies on the ray OP with OP times OP prime equal to r squared. A point near O has an image far from O, and a far point has an image near O.',
    ),
    ask: {
      text: m(
        'Nếu P nằm trong đường tròn nghịch đảo thì ảnh P′ nằm ở đâu?',
        'If P lies inside the circle of inversion, where is its image P′?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Ngoài đường tròn', 'Outside the circle'),
          m('Trong đường tròn', 'Inside the circle'),
          m('Trùng với P (P nằm trên đường tròn)', 'Equal to P (P is on the circle)'),
        ],
        // OP·OP′ = r²: OP < r gives OP′ > r; the frame says where P is
        answer: (frame) => (frame.meta.vars as { side: number }).side,
      },
    },
    hints: [
      m('Tích OP·OP′ bằng bao nhiêu?', 'What does the product OP·OP′ equal?'),
      m('Bằng r², không đổi.', 'It equals r², a constant.'),
      m(
        'Nếu OP bé hơn r thì OP′ phải lớn hơn r để tích vẫn là r².',
        'If OP is less than r then OP′ must be more than r for the product to stay r².',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng OP′ = r²/2 hay OP′ = r − OP: ảnh được xác định bởi tích OP·OP′ = r².',
        'Thinking OP′ = r²/2 or OP′ = r − OP: the image is fixed by the product OP·OP′ = r².',
      ),
    ],
  },
  {
    id: 'line',
    label: m('Ảnh của các điểm trên l', 'Images of points on l'),
    narration: m(
      'Ta lấy lần lượt các điểm của đường thẳng l và vẽ ảnh của chúng. Các điểm ảnh không nằm trên một đường thẳng mà dồn lại quanh O.',
      'We take points of the line l one after another and draw their images. The image points do not lie on a line but gather near O.',
    ),
    hints: [
      m('Điểm P ở xa O thì ảnh ở đâu?', 'Where is the image of a point P far from O?'),
      m(
        'Rất gần O, vì tích OP·OP′ không đổi.',
        'Very near O, since the product OP·OP′ is constant.',
      ),
      m(
        'Các ảnh tạo thành một vòng khép kín đi qua O.',
        'The images form a closed loop through O.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ảnh của đường thẳng vẫn là một đường thẳng: chỉ đúng khi đường thẳng đi qua O.',
        'Thinking the image of a line is still a line: that holds only when the line passes through O.',
      ),
    ],
  },
  {
    id: 'circle',
    label: m('Ảnh là đường tròn', 'The image is a circle'),
    narration: m(
      'Mọi điểm ảnh nằm trên một đường tròn đi qua O. Tâm của nó nằm trên đường vuông góc với l kẻ từ O, và đường kính là ảnh của chân đường vuông góc từ O xuống l.',
      'All the image points lie on a circle through O. Its centre is on the perpendicular from O to l, and its diameter is the image of the foot of that perpendicular.',
    ),
    ask: {
      text: m(
        'Theo em, ảnh của đường thẳng l không đi qua O là hình gì?',
        'What shape do you think the image of a line l not through O is?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Một đường thẳng', 'A line'),
          m('Một đường tròn đi qua O', 'A circle through O'),
          m('Một đường tròn không đi qua O', 'A circle not through O'),
        ],
        answer: () => 1,
      },
    },
    hints: [
      m('Điểm nào của l gần O nhất?', 'Which point of l is nearest to O?'),
      m(
        'Chân đường vuông góc, cách O một khoảng d.',
        'The foot of the perpendicular, at distance d from O.',
      ),
      m(
        'Ảnh của nó cách O một khoảng r²/d và là đầu mút của đường kính.',
        'Its image is at distance r²/d from O and is the end of a diameter.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đường tròn ảnh không đi qua O: O là ảnh của "điểm ở vô cực", nên đường tròn đi qua O.',
        'Thinking the image circle does not pass through O: O is the image of the "point at infinity", so the circle passes through O.',
      ),
    ],
  },
  {
    id: 'through',
    label: m('Đường thẳng qua O', 'A line through O'),
    narration: m(
      'Nếu đường thẳng đi qua O thì mỗi điểm của nó có ảnh nằm trên chính đường thẳng đó, vì ảnh nằm trên tia OP. Đường thẳng qua O biến thành chính nó.',
      'If the line passes through O, the image of each of its points lies on that same line, since the image lies on the ray OP. A line through O becomes itself.',
    ),
    hints: [
      m('Ảnh của P nằm trên tia nào?', 'On which ray does the image of P lie?'),
      m('Trên tia OP, mà tia này nằm trong đường thẳng.', 'On the ray OP, which lies in the line.'),
      m(
        'Nên đường thẳng qua O được giữ nguyên, các điểm chỉ đổi chỗ.',
        'So a line through O is kept as a whole, its points only trade places.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng mỗi điểm của đường thẳng qua O đứng yên: chỉ điểm nằm trên đường tròn nghịch đảo đứng yên.',
        'Thinking each point of a line through O stays put: only the points on the circle of inversion do.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Phép nghịch đảo biến đường thẳng không qua O thành đường tròn qua O và ngược lại, giữ nguyên đường thẳng qua O. Nó là công cụ để biến bài toán về đường tròn thành bài toán về đường thẳng. Đổi mẫu để xem các bán kính và khoảng cách khác.',
      'Inversion turns a line not through O into a circle through O and back, and keeps a line through O. It is a tool for turning a problem about circles into one about lines. Change the preset to see other radii and distances.',
    ),
    hints: [
      m(
        'Phép nghịch đảo biến loại hình nào thành loại hình nào?',
        'Which kind of figure does inversion turn into which?',
      ),
      m(
        'Đường thẳng không qua O thành đường tròn qua O, và ngược lại.',
        'A line not through O into a circle through O, and back.',
      ),
      m('Đường thẳng qua O thì giữ nguyên.', 'A line through O is kept.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phép nghịch đảo giữ góc giữa hai đường: nó giữ độ lớn góc nhưng đảo chiều quay.',
        'Thinking inversion keeps angles as they are: it keeps their size but reverses their orientation.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đường tròn nghịch đảo tâm O bán kính r = {r}, và đường thẳng l: y = {d}, cách O một khoảng {d}, không đi qua O.',
    'The circle of inversion with centre O and radius r = {r}, and the line l: y = {d}, at distance {d} from O, not through O.',
  ),
  rule: m(
    'P = (1, {d}) có OP² = {op2}; ảnh P′ trên tia OP có OP′² = r⁴/OP² = {opp2}, nên (OP·OP′)² = {r4} = r⁴: OP·OP′ = r².',
    'P = (1, {d}) has OP² = {op2}; its image P′ on the ray OP has OP′² = r⁴/OP² = {opp2}, so (OP·OP′)² = {r4} = r⁴: OP·OP′ = r².',
  ),
  line: m(
    'P = ({t}, {d}) tới P′ = ({xs}, {ys}). Các ảnh đã vẽ nằm gần O hơn khi P ở xa O.',
    'P = ({t}, {d}) goes to P′ = ({xs}, {ys}). The images drawn so far come nearer to O as P goes farther from O.',
  ),
  circle: m(
    'Mọi ảnh nằm trên đường tròn đi qua O, tâm (0, {rc}) và bán kính {rc}, với {rc} = r²/(2d).',
    'All the images lie on the circle through O with centre (0, {rc}) and radius {rc}, where {rc} = r²/(2d).',
  ),
  through: m(
    'Đường thẳng qua O: P = (1, 2) tới P′ = ({xs}, {ys}) vẫn nằm trên đường thẳng OP. Đường thẳng qua O biến thành chính nó.',
    'A line through O: P = (1, 2) goes to P′ = ({xs}, {ys}), still on the line OP. A line through O becomes itself.',
  ),
  done: m(
    'Đường thẳng y = {d} (không qua O) biến thành đường tròn qua O bán kính {rc}; đường thẳng qua O biến thành chính nó.',
    'The line y = {d} (not through O) becomes a circle through O of radius {rc}; a line through O becomes itself.',
  ),
};

/** the scrub order of the points (t, d) of the line */
const TS = [0, 1, -1, 2, -2, 3, -3];

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { r, d } = input;
  const r2 = r * r;
  /** the image of (x, y): r²·(x, y)/(x² + y²), as numerator and denominator */
  const inv = (x: number, y: number): { px: number; py: number; den: number; pt: Pt } => {
    const den = x * x + y * y;
    return { px: r2 * x, py: r2 * y, den, pt: [(r2 * x) / den, (r2 * y) / den] };
  };
  const rc = r2 / (2 * d); // the radius and the height of the centre of the image circle
  const half = Math.max(r, 3, rc) + 1;
  const bounds = {
    xmin: -half,
    xmax: half,
    ymin: -r - 1,
    ymax: Math.max(r, 2 * rc, d, (2 * r2) / 5) + 1,
  };
  const base = (): Figure =>
    new Figure(bounds)
      .point('O', [0, 0], 'O')
      .circle('w', 'O', r)
      .anchor('l0', [-half, d])
      .anchor('l1', [half, d])
      .line('l', 'l0', 'l1');
  const put = framePut(emit, ctx.locale);
  const common = { r, d, rc: frac(r2, 2 * d) };

  put(EX.start, 1, base(), common, 'start', { w: 'compare', l: 'active', O: 'active' });

  // the rule at P = (1, d)
  const r1 = inv(1, d);
  const op2 = 1 + d * d;
  const rule = base()
    .point('P', [1, d], 'P')
    .point('P1', r1.pt, 'P′')
    .seg('ray', 'O', 'P1', { dashed: true });
  put(
    EX.rule,
    2,
    rule,
    {
      ...common,
      op2,
      opp2: frac(r2 * r2, op2),
      r4: r2 * r2,
      side: op2 < r2 ? 0 : op2 > r2 ? 1 : 2,
    },
    'rule',
    { w: 'compare', l: 'muted', P: 'active', P1: 'result', ray: 'result' },
  );

  // the images of the points of the line, one more at each frame
  TS.forEach((t, k) => {
    const fig = base();
    const marks: Record<string, HighlightKind> = { w: 'compare', l: 'muted' };
    for (let q = 0; q <= k; q++) {
      const im = inv(TS[q], d);
      fig.point(`P${q}`, [TS[q], d], q === k ? 'P' : '').point(`Q${q}`, im.pt, q === k ? 'P′' : '');
      marks[`P${q}`] = q === k ? 'active' : 'muted';
      marks[`Q${q}`] = q === k ? 'active' : 'result';
    }
    const cur = inv(t, d);
    put(
      EX.line,
      3,
      fig,
      { ...common, t, xs: frac(cur.px, cur.den), ys: frac(cur.py, cur.den) },
      k === 0 ? 'line' : undefined,
      marks,
    );
  });

  // all the images lie on the circle through O
  const circ = base().anchor('cc', [0, rc]).circle('img', 'cc', rc);
  const cmarks: Record<string, HighlightKind> = { w: 'compare', l: 'muted', img: 'result' };
  TS.forEach((t, q) => {
    circ.point(`Q${q}`, inv(t, d).pt, '');
    cmarks[`Q${q}`] = 'result';
  });
  put(EX.circle, 4, circ, common, 'circle', cmarks);

  // a line through O (the direction (1, 2)) is kept as a whole
  const p2 = inv(1, 2);
  const thr = new Figure(bounds)
    .point('O', [0, 0], 'O')
    .circle('w', 'O', r)
    .anchor('m1', [1, 2])
    .line('m', 'O', 'm1')
    .point('P', [1, 2], 'P')
    .point('P1', p2.pt, 'P′');
  put(
    EX.through,
    5,
    thr,
    { ...common, xs: frac(p2.px, p2.den), ys: frac(p2.py, p2.den) },
    'through',
    {
      w: 'compare',
      m: 'active',
      P: 'active',
      P1: 'result',
    },
  );

  put(EX.done, 5, circ, common, 'done', cmarks);
}

export const inversionCircleEntry: WalkthroughEntry<In, S> = {
  id: 'inversion-circle',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m4-projective-inversion'],
  title: m('Phép nghịch đảo đối với đường tròn', 'Inversion in a circle'),
  code: {
    pseudo: [
      'đường tròn nghịch đảo tâm O bán kính r và đường thẳng l: y = d',
      'điểm P, ảnh P′ trên tia OP với OP·OP′ = r²',
      'ảnh của bảy điểm của l, mỗi khung thêm một điểm',
      'tất cả ảnh nằm trên đường tròn qua O, tâm (0, r²/(2d))',
      'đường thẳng qua O và ảnh của một điểm của nó trên chính nó',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    {
      id: 'r2-d1',
      label: m('r = 2, l cách O một đơn vị', 'r = 2, l one unit from O'),
      input: { r: 2, d: 1 },
    },
    {
      id: 'r3-d2',
      label: m('r = 3, l cách O hai đơn vị', 'r = 3, l two units from O'),
      input: { r: 3, d: 2 },
    },
    {
      id: 'r3-d1',
      label: m('r = 3, l cách O một đơn vị', 'r = 3, l one unit from O'),
      input: { r: 3, d: 1 },
    },
    {
      id: 'r2-d3',
      label: m('r = 2, l ở xa (d = 3)', 'r = 2, l far away (d = 3)'),
      input: { r: 2, d: 3 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng phép nghịch đảo là phép đối xứng qua đường tròn: nó đưa điểm trong ra ngoài nhưng không giữ khoảng cách.',
        'Thinking inversion is a reflection in the circle: it sends inside to outside but does not keep distances.',
      ),
    },
    {
      beat: 'rule',
      text: m(
        'Nghĩ rằng OP′ = r²/2 hay OP′ = r − OP: ảnh được xác định bởi tích OP·OP′ = r².',
        'Thinking OP′ = r²/2 or OP′ = r − OP: the image is fixed by the product OP·OP′ = r².',
      ),
    },
    {
      beat: 'line',
      text: m(
        'Nghĩ rằng ảnh của đường thẳng vẫn là một đường thẳng: chỉ đúng khi đường thẳng đi qua O.',
        'Thinking the image of a line is still a line: that holds only when the line passes through O.',
      ),
    },
    {
      beat: 'circle',
      text: m(
        'Nghĩ rằng đường tròn ảnh không đi qua O: O là ảnh của "điểm ở vô cực", nên đường tròn đi qua O.',
        'Thinking the image circle does not pass through O: O is the image of the "point at infinity", so the circle passes through O.',
      ),
    },
    {
      beat: 'through',
      text: m(
        'Nghĩ rằng mỗi điểm của đường thẳng qua O đứng yên: chỉ điểm nằm trên đường tròn nghịch đảo đứng yên.',
        'Thinking each point of a line through O stays put: only the points on the circle of inversion do.',
      ),
    },
  ],
  maxFrames: 14,
  maxBytes: 260_000,
  run,
};
