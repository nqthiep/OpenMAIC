/**
 * Walkthrough entry: The inscribed angle (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m1-circle-angles`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type In = { arc: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { arc: { kind: 'int', range: [20, 340] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đường tròn', 'The circle'),
    narration: m(
      'Ta vẽ một đường tròn tâm O và chọn hai điểm A và B trên nó. Hai điểm chia đường tròn thành hai cung. Ta sẽ nhìn cung nhỏ AB từ nhiều chỗ khác nhau.',
      'We draw a circle with centre O and choose two points A and B on it. The two points split the circle into two arcs. We will look at the arc AB from several different places.',
    ),
    hints: [
      m(
        'Hai điểm trên đường tròn chia nó thành mấy phần?',
        'Into how many parts do two points split a circle?',
      ),
      m(
        'Hai cung; cung nhỏ nằm một bên của dây AB, cung lớn ở bên kia.',
        'Two arcs; the minor one lies on one side of the chord AB, the major one on the other.',
      ),
      m(
        'Số đo hai cung cộng lại bằng 360 độ.',
        'The measures of the two arcs add up to 360 degrees.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai điểm chỉ xác định một cung: có hai cung, nhỏ và lớn, trừ khi AB là đường kính.',
        'Thinking two points define a single arc: there are two, minor and major, unless AB is a diameter.',
      ),
    ],
  },
  {
    id: 'central',
    label: m('Góc ở tâm', 'The central angle'),
    narration: m(
      'Nối O với A và B. Góc AOB ở tâm chắn cung AB và có số đo bằng số đo cung. Góc ở tâm là cái mốc để so sánh.',
      'Join O to A and B. The angle AOB at the centre subtends the arc AB and has the same measure as the arc. The central angle is the yardstick to compare with.',
    ),
    ask: {
      text: m(
        'Theo em, góc ở tâm AOB chắn cung AB có số đo so với số đo cung như thế nào?',
        'How does the measure of the central angle AOB compare with the measure of the arc AB?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Bằng số đo cung', 'Equal to the arc'),
          m('Bằng nửa số đo cung', 'Half of the arc'),
          m('Gấp đôi số đo cung', 'Twice the arc'),
        ],
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Góc ở tâm chắn cung AB thì có số đo thế nào so với cung?',
        'How does the central angle compare with the arc it subtends?',
      ),
      m('Bằng số đo cung đó, theo định nghĩa.', 'It equals the arc, by definition.'),
      m('Với cung 100° thì góc ở tâm bằng 100°.', 'For an arc of 100° the central angle is 100°.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng góc nội tiếp bằng góc ở tâm: nó chỉ bằng một nửa.',
        'Thinking the inscribed angle equals the central angle: it is only half of it.',
      ),
    ],
  },
  {
    id: 'inscribed',
    label: m('Góc nội tiếp', 'The inscribed angle'),
    narration: m(
      'Một điểm P chạy trên cung còn lại, và ta đo góc APB. Góc này có đỉnh P nằm trên đường tròn. Dù P ở đâu trên cung đó, góc APB không đổi và bằng một nửa góc ở tâm.',
      'A point P runs along the other arc and we measure the angle APB. Its vertex P lies on the circle. Wherever P is on that arc, the angle APB does not change and equals half the central angle.',
    ),
    ask: {
      text: m(
        'Khi điểm P chạy trên cung còn lại, góc APB có thay đổi không?',
        'As the point P runs along the other arc, does the angle APB change?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Không đổi', 'It stays the same'), m('Thay đổi', 'It changes')],
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Khi P chạy, những gì thay đổi và những gì không?',
        'As P runs, what changes and what does not?',
      ),
      m(
        'Vị trí P và độ dài PA, PB thay đổi; góc APB thì không.',
        'The position of P and the lengths PA, PB change; the angle APB does not.',
      ),
      m(
        'Góc APB luôn bằng nửa cung AB mà nó chắn.',
        'The angle APB always equals half the arc AB it subtends.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng góc nội tiếp thay đổi khi P di chuyển: chừng nào P còn trên cùng cung thì nó không đổi.',
        'Thinking the inscribed angle changes as P moves: as long as P stays on the same arc it does not.',
      ),
    ],
  },
  {
    id: 'cyclic',
    label: m('Tứ giác nội tiếp', 'The cyclic quadrilateral'),
    narration: m(
      'Ta lấy thêm điểm Q trên cung nhỏ AB, được tứ giác APBQ nội tiếp đường tròn. Hai góc đối là góc ở P và góc ở Q. Hai cung chắn bởi hai góc đối cộng lại thành cả đường tròn, nên hai góc đối cộng lại bằng 180 độ.',
      'We add a point Q on the arc AB, giving the cyclic quadrilateral APBQ. The opposite angles are the ones at P and at Q. The two arcs cut off by the opposite angles make the whole circle, so the opposite angles add up to 180 degrees.',
    ),
    hints: [
      m(
        'Hai góc đối của tứ giác nội tiếp chắn hai cung nào?',
        'Which two arcs do the opposite angles of a cyclic quadrilateral subtend?',
      ),
      m(
        'Hai cung AB, một cung nhỏ và một cung lớn, ghép lại thành cả đường tròn.',
        'The two arcs AB, a minor and a major one, which together make the whole circle.',
      ),
      m(
        'Mỗi góc bằng nửa cung của nó, nên tổng bằng nửa của 360°, tức 180°.',
        'Each angle is half its arc, so the sum is half of 360°, that is 180°.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai góc đối của mọi tứ giác cộng lại bằng 180°: chỉ đúng với tứ giác nội tiếp.',
        'Thinking opposite angles of every quadrilateral add to 180°: that holds only for a cyclic quadrilateral.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Góc nội tiếp bằng nửa góc ở tâm cùng chắn một cung, tại bất cứ điểm nào của cung còn lại; hai góc đối của tứ giác nội tiếp cộng lại bằng 180 độ. Thử mẫu cung 180° để thấy góc vuông.',
      'An inscribed angle is half the central angle on the same arc, at any point of the other arc; opposite angles of a cyclic quadrilateral add up to 180 degrees. Try the 180° preset to see the right angle.',
    ),
    hints: [
      m(
        'Góc nội tiếp liên hệ thế nào với góc ở tâm cùng chắn một cung?',
        'How is an inscribed angle related to the central angle on the same arc?',
      ),
      m(
        'Nó bằng một nửa, và không đổi khi đỉnh chạy trên cung còn lại.',
        'It is half, and does not change as the vertex runs along the other arc.',
      ),
      m(
        'Tứ giác nội tiếp có hai góc đối cộng lại bằng 180°.',
        'A cyclic quadrilateral has opposite angles adding to 180°.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng định lý góc nội tiếp chỉ đúng khi cung nhỏ hơn 180°: với cung lớn, góc nội tiếp vẫn bằng nửa số đo cung mà nó chắn.',
        'Thinking the inscribed angle theorem only holds for an arc under 180°: for a major arc the inscribed angle is still half the arc it cuts off.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đường tròn tâm O với hai điểm A, B: cung AB đo {arc}°, cung còn lại đo {rest}°, hai cung cộng lại thành cả đường tròn.',
    'A circle with centre O and two points A, B: the arc AB measures {arc}°, the other arc {rest}°, and the two arcs make the whole circle.',
  ),
  central: m(
    'Nối O với A và B: góc ở tâm AOB chắn cung AB và có số đo bằng số đo cung, tức {arc}°.',
    'Join O to A and B: the central angle AOB cuts off the arc AB and has the same measure as the arc, that is {arc}°.',
  ),
  inscribed: m(
    'P ở vị trí {k} trên cung còn lại: góc APB = {half}°, đúng bằng nửa góc ở tâm {arc}°.',
    'P at position {k} on the other arc: the angle APB = {half}°, exactly half the central angle {arc}°.',
  ),
  cyclic: m(
    'Tứ giác APBQ nội tiếp: góc P = {half}° và góc Q = {halfQ}°. Hai góc đối cộng lại bằng 180° vì hai cung chắn cộng lại bằng 360°.',
    'The quadrilateral APBQ is cyclic: the angle at P is {half}° and at Q is {halfQ}°. The opposite angles add up to 180° because the two arcs make 360°.',
  ),
  done: m(
    'Góc nội tiếp bằng nửa góc ở tâm; góc P = {half}° và góc Q = {halfQ}° cộng lại bằng 180°.',
    'The inscribed angle is half the central angle; the angle at P is {half}° and at Q is {halfQ}°, adding up to 180°.',
  ),
};

const R = 3;
/** cos 1° and sin 1°: the whole-degree points of the circle come from rotating by these (no trigonometry in the catalog) */
const C1 = 0.9998476951563913;
const S1 = 0.01745240643728351;
const UNIT: Pt[] = (() => {
  const out: Pt[] = [[1, 0]];
  for (let i = 1; i < 360; i++) {
    const [x, y] = out[i - 1];
    out.push([x * C1 - y * S1, x * S1 + y * C1]);
  }
  return out;
})();
/** the point of the circle at `deg` degrees (an integer), counted from the positive x axis */
const onCircle = (deg: number): Pt => {
  const u = UNIT[((deg % 360) + 360) % 360];
  return [R * u[0], R * u[1]];
};
/** the arc from `from` to `to` degrees as a polyline, a point every 4° */
const arcPoints = (from: number, to: number): Pt[] => {
  const out: Pt[] = [];
  for (let d = from; d < to; d += 4) out.push(onCircle(d));
  out.push(onCircle(to));
  return out;
};
/** n/2 as text without a decimal point: "50" or "101/2" */
const half = (n: number): string => (n % 2 === 0 ? `${n / 2}` : `${n}/2`);

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { arc } = input;
  const rest = 360 - arc;
  const tA = 270 - Math.floor(arc / 2);
  const tB = tA + arc;
  const tQ = tA + Math.floor(arc / 2);
  const tP = [1, 2, 3].map((k) => tB + Math.floor((rest * k) / 4));
  const bounds = { xmin: -3.8, xmax: 3.8, ymin: -3.8, ymax: 3.8 };
  const A = onCircle(tA);
  const B = onCircle(tB);
  const Q = onCircle(tQ);
  const base = (): Figure => {
    const fig = new Figure(bounds)
      .point('O', [0, 0], 'O')
      .circle('c', 'O', R)
      .polyline('arcAB', arcPoints(tA, tB))
      .polyline('arcRest', arcPoints(tB, tA + 360))
      .point('A', A, 'A')
      .point('B', B, 'B');
    return fig;
  };
  const arcMarks: Record<string, HighlightKind> = { arcAB: 'active', arcRest: 'muted' };
  const put = framePut(emit, ctx.locale);
  const hv = half(arc);
  const hq = half(rest);

  put(EX.start, 1, base(), { arc, rest }, 'start', { ...arcMarks, A: 'active', B: 'active' });

  const central = base()
    .seg('OA', 'O', 'A')
    .seg('OB', 'O', 'B')
    .poly('wedge', [[0, 0], ...arcPoints(tA, tB)])
    .anchor('cl', [Q[0] * 0.45, Q[1] * 0.45], `${arc}°`, true);
  put(EX.central, 2, central, { arc }, 'central', {
    ...arcMarks,
    OA: 'active',
    OB: 'active',
    wedge: 'group-0',
  });

  tP.forEach((t, i) => {
    const fig = base()
      .seg('OA', 'O', 'A')
      .seg('OB', 'O', 'B')
      .poly('wedge', [[0, 0], ...arcPoints(tA, tB)])
      .anchor('cl', [Q[0] * 0.45, Q[1] * 0.45], `${arc}°`, true)
      .point('P', onCircle(t), 'P')
      .seg('PA', 'P', 'A')
      .seg('PB', 'P', 'B')
      .angle('ap', 'P', 'A', 'B', `${hv}°`);
    put(EX.inscribed, 3, fig, { k: i + 1, arc, half: hv }, i === 0 ? 'inscribed' : undefined, {
      ...arcMarks,
      wedge: 'muted',
      P: 'active',
      PA: 'result',
      PB: 'result',
      ap: 'result',
    });
  });

  const quad = base()
    .point('P', onCircle(tP[1]), 'P')
    .point('Q', Q, 'Q')
    .polygon('quad', ['A', 'P', 'B', 'Q'])
    .angle('ap', 'P', 'A', 'B', `${hv}°`)
    .angle('aq', 'Q', 'A', 'B', `${hq}°`);
  const cyc = {
    ...arcMarks,
    quad: 'group-0' as const,
    ap: 'result' as const,
    aq: 'compare' as const,
  };
  put(EX.cyclic, 4, quad, { arc, half: hv, halfQ: hq }, 'cyclic', cyc);
  put(EX.done, 4, quad, { half: hv, halfQ: hq }, 'done', cyc);
}

export const inscribedAngleEntry: WalkthroughEntry<In, S> = {
  id: 'inscribed-angle',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-circle-angles'],
  title: m('Góc nội tiếp', 'The inscribed angle'),
  code: {
    pseudo: [
      'đường tròn tâm O, hai điểm A, B chia thành cung nhỏ và cung lớn',
      'góc AOB ở tâm với hai bán kính OA, OB',
      'điểm P đứng ở ba vị trí trên cung còn lại, góc APB giữ nguyên số đo bằng nửa góc ở tâm',
      'tứ giác APBQ nội tiếp, hai góc đối ở P và Q',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: 'arc-100', label: m('Cung 100°', 'Arc 100°'), input: { arc: 100 } },
    { id: 'arc-60', label: m('Cung 60°', 'Arc 60°'), input: { arc: 60 } },
    {
      id: 'arc-180',
      label: m('Cung 180° (góc vuông)', 'Arc 180° (right angle)'),
      input: { arc: 180 },
    },
    { id: 'arc-300', label: m('Cung lớn 300°', 'Major arc 300°'), input: { arc: 300 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng hai điểm chỉ xác định một cung: có hai cung, nhỏ và lớn, trừ khi AB là đường kính.',
        'Thinking two points define a single arc: there are two, minor and major, unless AB is a diameter.',
      ),
    },
    {
      beat: 'central',
      text: m(
        'Nghĩ rằng góc nội tiếp bằng góc ở tâm: nó chỉ bằng một nửa.',
        'Thinking the inscribed angle equals the central angle: it is only half of it.',
      ),
    },
    {
      beat: 'inscribed',
      text: m(
        'Nghĩ rằng góc nội tiếp thay đổi khi P di chuyển: chừng nào P còn trên cùng cung thì nó không đổi.',
        'Thinking the inscribed angle changes as P moves: as long as P stays on the same arc it does not.',
      ),
    },
    {
      beat: 'cyclic',
      text: m(
        'Nghĩ rằng hai góc đối của mọi tứ giác cộng lại bằng 180°: chỉ đúng với tứ giác nội tiếp.',
        'Thinking opposite angles of every quadrilateral add to 180°: that holds only for a cyclic quadrilateral.',
      ),
    },
  ],
  maxFrames: 9,
  maxBytes: 200_000,
  run,
};
