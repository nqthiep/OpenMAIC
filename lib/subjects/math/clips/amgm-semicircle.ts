/**
 * Clip template: the AM–GM inequality on a semicircle (card 3A-T1, SCHEMA Phase 3 §3 row 1). TypeScript half only:
 * the entry, the pure invariant and the numbers the scene must write to manifest.json. The Manim scene is task 3A-M1.
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006); Math.sqrt is allowed.
 * Curriculum topic `m1-inequality-basic` follows the Phase 3 SCHEMA §7 outline [Inference];
 * see docs/tutor/curriculum/curriculum-math-vn.json (its sources are [Unverified]).
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { a: number; b: number };

const inputSpec = {
  kind: 'record',
  fields: { a: { kind: 'int', range: [1, 20] }, b: { kind: 'int', range: [1, 20] } },
} as const;

/** half the sum, and the height of the perpendicular at C: h² = ab (altitude on the hypotenuse) */
const radius = (i: In): number => (i.a + i.b) / 2;
const height = (i: In): number => Math.sqrt(i.a * i.b);

export const amgmSemicircleEntry: ClipEntry<In> = defineClip<In>({
  id: 'amgm-semicircle',
  curriculumTopics: ['m1-inequality-basic'],
  title: m('AM–GM bằng nửa đường tròn', 'AM–GM on a semicircle'),
  inputSpec,
  presets: [
    { id: 'two-eight', label: m('a = 2, b = 8', 'a = 2, b = 8'), input: { a: 2, b: 8 } },
    { id: 'equal', label: m('a = b = 4', 'a = b = 4'), input: { a: 4, b: 4 } },
    { id: 'far', label: m('a = 1, b = 20', 'a = 1, b = 20'), input: { a: 1, b: 20 } },
    { id: 'nine-sixteen', label: m('a = 9, b = 16', 'a = 9, b = 16'), input: { a: 9, b: 16 } },
  ],
  chapters: [
    {
      id: 'setup',
      startSec: 0,
      endSec: 10,
      label: m('Dựng hình', 'The figure'),
      before: m(
        'Cho hai số dương a và b, một đoạn AB dài a cộng b và một điểm C chia nó thành hai đoạn a và b. Ta vẽ nửa đường tròn đường kính AB.',
        'Take two positive numbers a and b, a segment AB of length a plus b, and a point C that cuts it into pieces a and b. We draw the semicircle on the diameter AB.',
      ),
      after: m(
        'Nhớ rằng đường kính AB bằng a cộng b, nên bán kính là một nửa của nó.',
        'Remember the diameter AB is a plus b, so the radius is half of it.',
      ),
    },
    {
      id: 'height',
      startSec: 10,
      endSec: 24,
      label: m('Chiều cao h', 'The height h'),
      before: m(
        'Từ C ta dựng đường vuông góc với AB, cắt nửa đường tròn tại D. Gọi độ dài CD là h.',
        'From C we erect the perpendicular to AB, meeting the semicircle at D. Call the length CD h.',
      ),
      after: m(
        'Tam giác ABD vuông tại D, nên h bình phương bằng a nhân b.',
        'The triangle ABD has a right angle at D, so h squared equals a times b.',
      ),
      caption: m('h² = ab', 'h² = ab'),
      ask: m(
        'Theo em, h lớn nhất khi điểm C nằm ở đâu?',
        'Where do you think the point C must be for h to be largest?',
      ),
    },
    {
      id: 'compare',
      startSec: 24,
      endSec: 35,
      label: m('So với bán kính', 'Against the radius'),
      before: m(
        'Bán kính r bằng a cộng b chia hai. Đoạn CD dựng từ C lên nửa đường tròn.',
        'The radius r is a plus b over two. The segment CD rises from C to the semicircle.',
      ),
      after: m(
        'Mọi điểm của nửa đường tròn cách AB không quá r, nên h nhỏ hơn hoặc bằng r.',
        'Every point of the semicircle is at most r above AB, so h is less than or equal to r.',
      ),
      caption: m('h ≤ r', 'h ≤ r'),
    },
    {
      id: 'equality',
      startSec: 35,
      endSec: 49,
      label: m('Khi nào bằng nhau', 'When equal'),
      before: m(
        'Ta trượt C về phía tâm và xem h thay đổi thế nào so với r.',
        'We slide C toward the centre and watch how h compares with r.',
      ),
      after: m(
        'Chỉ khi C trùng tâm, tức a bằng b, thì h mới chạm bán kính. Đây chính là bất đẳng thức AM-GM.',
        'Only when C is the centre, that is a equals b, does h reach the radius. This is exactly the AM-GM inequality.',
      ),
      caption: m('h = r ⇔ a = b', 'h = r ⇔ a = b'),
      ask: m('Khi nào thì h đúng bằng bán kính?', 'When is h exactly equal to the radius?'),
    },
  ],
  invariants: (i) => {
    const h = height(i);
    const r = radius(i);
    // h = sqrt(ab) <= r, and the two are equal exactly when a = b
    return h <= r + 1e-9 && Math.abs(h - r) < 1e-9 === (i.a === i.b);
  },
  sheet: {
    chapters: [
      {
        id: 'setup',
        shows: m(
          'đoạn AB = a + b, điểm C chia thành a | b, nửa đường tròn đường kính AB',
          'the segment AB = a + b, the point C splitting it into a | b, the semicircle on diameter AB',
        ),
        formulas: ['\\(AB = a + b\\)', '\\(r = \\frac{a + b}{2}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng chỉ đúng khi a, b nguyên: đúng với mọi số dương.',
            'Thinking it holds only for integers a, b: it holds for all positive numbers.',
          ),
        ],
        hints: hints(
          'Đường kính AB dài bao nhiêu?',
          'AB bằng a cộng b, nên bán kính bằng một nửa.',
          'r = (a + b)/2, ta sẽ so h với số này.',
          'How long is the diameter AB?',
          'AB is a plus b, so the radius is half of it.',
          'r = (a + b)/2, and we will compare h with this number.',
        ),
      },
      {
        id: 'height',
        shows: m(
          'đường CD vuông góc với AB tại C, cắt nửa đường tròn ở D; tam giác ABD vuông tại D',
          'the line CD perpendicular to AB at C meeting the semicircle at D; the triangle ABD right-angled at D',
        ),
        formulas: ['\\(h^2 = ab\\)', '\\(h = \\sqrt{ab}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng h là trung bình cộng của a và b: h là trung bình nhân, căn của ab.',
            'Thinking h is the arithmetic mean of a and b: h is the geometric mean, the root of ab.',
          ),
        ],
        hints: hints(
          'Góc nội tiếp chắn nửa đường tròn bằng bao nhiêu?',
          'Bằng 90 độ, nên tam giác ABD vuông tại D.',
          'Trong tam giác vuông, bình phương đường cao bằng tích hai đoạn trên cạnh huyền: h² = ab.',
          'What is an inscribed angle on a diameter?',
          'It is 90 degrees, so the triangle ABD is right-angled at D.',
          'In a right triangle the square of the altitude equals the product of the two pieces of the hypotenuse: h² = ab.',
        ),
      },
      {
        id: 'compare',
        shows: m(
          'bán kính r vẽ đứng từ tâm, đường CD ngắn hơn hoặc bằng nó',
          'the radius r drawn upright from the centre, with CD no longer than it',
        ),
        formulas: ['\\(h \\le r\\)', '\\(\\sqrt{ab} \\le \\frac{a + b}{2}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng h luôn nhỏ hơn hẳn r: h có thể bằng r khi a = b.',
            'Thinking h is always strictly smaller than r: h can equal r when a = b.',
          ),
        ],
        hints: hints(
          'Điểm nào của nửa đường tròn cao nhất so với AB?',
          'Điểm chính giữa, cao đúng bằng bán kính.',
          'Mọi điểm cao không quá r, nên h ≤ r, tức √(ab) ≤ (a + b)/2.',
          'Which point of the semicircle is highest above AB?',
          'The middle one, exactly a radius high.',
          'Every point is at most r high, so h ≤ r, that is √(ab) ≤ (a + b)/2.',
        ),
      },
      {
        id: 'equality',
        shows: m(
          'C trượt về tâm; h tăng dần tới r; khi C trùng tâm thì h = r',
          'C sliding to the centre; h grows toward r; when C is the centre, h = r',
        ),
        formulas: ['\\(h = r \\iff a = b\\)', '\\(\\frac{a + b}{2} \\ge \\sqrt{ab}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng dấu bằng cần a và b đều bằng 1: chỉ cần a = b, bất kể giá trị.',
            'Thinking equality needs a and b to be 1: it only needs a = b, whatever the value.',
          ),
        ],
        hints: hints(
          'Khi nào C trùng với tâm của nửa đường tròn?',
          'Khi hai đoạn AC và CB bằng nhau, tức a = b.',
          'Lúc đó h = r, nên dấu bằng của bất đẳng thức xảy ra đúng khi a = b.',
          'When is C the centre of the semicircle?',
          'When AC and CB are equal, that is a = b.',
          'Then h = r, so equality holds exactly when a = b.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json (h rounded to 3 decimals), computed straight from the formulas. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { a: i.a, b: i.b, r: radius(i), h: Math.round(height(i) * 1000) / 1000 };
}

const amgmSemicircle: ClipModule<In> = { entry: amgmSemicircleEntry, expectedDisplay };
export default amgmSemicircle;
