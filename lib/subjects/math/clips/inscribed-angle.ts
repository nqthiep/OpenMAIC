/**
 * Clip template: the inscribed angle theorem (card 3B-T4): an inscribed angle is half the central angle on the
 * same arc, whichever point of the remaining arc it sits on; opposite angles of a cyclic quadrilateral add to 180°.
 * TypeScript half only (the Manim scene is task 3B-M4). Deterministic and browser-safe (ADR 0006): all numbers are
 * in degrees and come from arcs, no trigonometry.
 * Curriculum topic `circle-angles` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { arc: number };

const inputSpec = {
  kind: 'record',
  fields: { arc: { kind: 'int', range: [20, 340] } },
} as const;

/** the inscribed angle on an arc of `arc` degrees seen from the rest of the circle */
const inscribed = (arc: number): number => arc / 2;

export const inscribedAngleEntry: ClipEntry<In> = defineClip<In>({
  id: 'inscribed-angle',
  curriculumTopics: ['circle-angles'],
  title: m('Góc nội tiếp', 'The inscribed angle'),
  inputSpec,
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
  chapters: [
    {
      id: 'circle',
      startSec: 0,
      endSec: 9,
      label: m('Đường tròn', 'The circle'),
      before: m(
        'Ta vẽ một đường tròn tâm O và chọn hai điểm A và B trên nó. Hai điểm chia đường tròn thành hai cung.',
        'We draw a circle with centre O and choose two points A and B on it. The two points split the circle into two arcs.',
      ),
      after: m(
        'Ta sẽ nhìn cung nhỏ AB từ nhiều chỗ khác nhau.',
        'We will look at the arc AB from several different places.',
      ),
    },
    {
      id: 'central',
      startSec: 9,
      endSec: 20,
      label: m('Góc ở tâm', 'The central angle'),
      before: m(
        'Nối O với A và B. Góc AOB ở tâm chắn cung AB và có số đo bằng số đo cung.',
        'Join O to A and B. The angle AOB at the centre subtends the arc AB and has the same measure as the arc.',
      ),
      after: m(
        'Góc ở tâm là cái mốc để so sánh.',
        'The central angle is the yardstick to compare with.',
      ),
      caption: m('∠AOB = cung AB', '∠AOB = arc AB'),
      ask: m(
        'Theo em, góc ở tâm này bằng bao nhiêu độ?',
        'How many degrees do you think this central angle is?',
      ),
    },
    {
      id: 'inscribed',
      startSec: 20,
      endSec: 35,
      label: m('Góc nội tiếp', 'The inscribed angle'),
      before: m(
        'Một điểm P chạy trên cung còn lại, và ta đo góc APB. Góc này có đỉnh P nằm trên đường tròn.',
        'A point P runs along the other arc and we measure the angle APB. Its vertex P lies on the circle.',
      ),
      after: m(
        'Dù P ở đâu trên cung đó, góc APB không đổi và bằng một nửa góc ở tâm.',
        'Wherever P is on that arc, the angle APB does not change and equals half the central angle.',
      ),
      caption: m('∠APB = ½ ∠AOB', '∠APB = ½ ∠AOB'),
      ask: m(
        'Khi điểm P chạy, góc APB có thay đổi không?',
        'As the point P runs, does the angle APB change?',
      ),
    },
    {
      id: 'cyclic',
      startSec: 35,
      endSec: 48,
      label: m('Tứ giác nội tiếp', 'The cyclic quadrilateral'),
      before: m(
        'Ta lấy thêm điểm Q trên cung nhỏ AB, được tứ giác APBQ nội tiếp đường tròn. Hai góc đối là góc ở P và góc ở Q.',
        'We add a point Q on the arc AB, giving the cyclic quadrilateral APBQ. The opposite angles are the ones at P and at Q.',
      ),
      after: m(
        'Hai cung chắn bởi hai góc đối cộng lại thành cả đường tròn, nên hai góc đối cộng lại bằng 180 độ.',
        'The two arcs cut off by the opposite angles make the whole circle, so the opposite angles add up to 180 degrees.',
      ),
      caption: m('P + Q = 180°', 'P + Q = 180°'),
    },
  ],
  invariants: (i) => {
    // the angle at P on the remaining arc (360 − arc) is half the arc AB; the angle at Q on arc AB is half of 360 − arc
    const atP = inscribed(i.arc);
    const atQ = inscribed(360 - i.arc);
    return atP === i.arc / 2 && atP + atQ === 180 && atP > 0 && atQ > 0;
  },
  sheet: {
    chapters: [
      {
        id: 'circle',
        shows: m(
          'đường tròn tâm O, hai điểm A, B chia thành cung nhỏ và cung lớn',
          'a circle with centre O, the points A, B splitting it into a minor and a major arc',
        ),
        formulas: ['\\(\\text{cung } AB\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng hai điểm chỉ xác định một cung: có hai cung, nhỏ và lớn, trừ khi AB là đường kính.',
            'Thinking two points define a single arc: there are two, minor and major, unless AB is a diameter.',
          ),
        ],
        hints: hints(
          'Hai điểm trên đường tròn chia nó thành mấy phần?',
          'Hai cung; cung nhỏ nằm một bên của dây AB, cung lớn ở bên kia.',
          'Số đo hai cung cộng lại bằng 360 độ.',
          'Into how many parts do two points split a circle?',
          'Two arcs; the minor one lies on one side of the chord AB, the major one on the other.',
          'The measures of the two arcs add up to 360 degrees.',
        ),
      },
      {
        id: 'central',
        shows: m(
          'góc AOB ở tâm với hai bán kính OA, OB',
          'the central angle AOB with the two radii OA, OB',
        ),
        formulas: ['\\(\\angle AOB = \\text{cung } AB\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng góc nội tiếp bằng góc ở tâm: nó chỉ bằng một nửa.',
            'Thinking the inscribed angle equals the central angle: it is only half of it.',
          ),
        ],
        hints: hints(
          'Góc ở tâm chắn cung AB thì có số đo thế nào so với cung?',
          'Bằng số đo cung đó, theo định nghĩa.',
          'Với cung 100° thì góc ở tâm bằng 100°.',
          'How does the central angle compare with the arc it subtends?',
          'It equals the arc, by definition.',
          'For an arc of 100° the central angle is 100°.',
        ),
      },
      {
        id: 'inscribed',
        shows: m(
          'điểm P chạy trên cung còn lại, góc APB giữ nguyên số đo bằng nửa góc ở tâm',
          'the point P running along the other arc, the angle APB keeping its measure at half the central angle',
        ),
        formulas: ['\\(\\angle APB = \\frac{1}{2}\\angle AOB\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng góc nội tiếp thay đổi khi P di chuyển: chừng nào P còn trên cùng cung thì nó không đổi.',
            'Thinking the inscribed angle changes as P moves: as long as P stays on the same arc it does not.',
          ),
        ],
        hints: hints(
          'Khi P chạy, những gì thay đổi và những gì không?',
          'Vị trí P và độ dài PA, PB thay đổi; góc APB thì không.',
          'Góc APB luôn bằng nửa cung AB mà nó chắn.',
          'As P runs, what changes and what does not?',
          'The position of P and the lengths PA, PB change; the angle APB does not.',
          'The angle APB always equals half the arc AB it subtends.',
        ),
      },
      {
        id: 'cyclic',
        shows: m(
          'tứ giác APBQ nội tiếp, hai góc đối ở P và Q',
          'the cyclic quadrilateral APBQ with the opposite angles at P and Q',
        ),
        formulas: ['\\(\\angle P + \\angle Q = 180^\\circ\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng hai góc đối của mọi tứ giác cộng lại bằng 180°: chỉ đúng với tứ giác nội tiếp.',
            'Thinking opposite angles of every quadrilateral add to 180°: that holds only for a cyclic quadrilateral.',
          ),
        ],
        hints: hints(
          'Hai góc đối của tứ giác nội tiếp chắn hai cung nào?',
          'Hai cung AB, một cung nhỏ và một cung lớn, ghép lại thành cả đường tròn.',
          'Mỗi góc bằng nửa cung của nó, nên tổng bằng nửa của 360°, tức 180°.',
          'Which two arcs do the opposite angles of a cyclic quadrilateral subtend?',
          'The two arcs AB, a minor and a major one, which together make the whole circle.',
          'Each angle is half its arc, so the sum is half of 360°, that is 180°.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the central angle and the inscribed angle, in degrees. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { central: i.arc, inscribed: inscribed(i.arc) };
}

const inscribedAngle: ClipModule<In> = { entry: inscribedAngleEntry, expectedDisplay };
export default inscribedAngle;
