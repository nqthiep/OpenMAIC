/**
 * Clip template: a geometric series as areas (card 3B-T10): 1/2 + 1/4 + … = 1 and its cousins with ratios 1/3 and
 * 1/4. TypeScript half only (the Manim scene is task 3B-M10). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `sequences-limits` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Ratio = '1/2' | '1/3' | '1/4';
type In = { r: Ratio };

const inputSpec = {
  kind: 'record',
  fields: { r: { kind: 'enum', values: ['1/2', '1/3', '1/4'] } },
} as const;

/** the denominator d of the ratio 1/d */
const denominator = (r: Ratio): number => (r === '1/2' ? 2 : r === '1/3' ? 3 : 4);
/** the partial sum S_k = r + r² + … + r^k, added term by term */
export function partialSum(r: Ratio, k: number): number {
  const q = 1 / denominator(r);
  let term = 1;
  let s = 0;
  for (let j = 1; j <= k; j++) {
    term *= q;
    s += term;
  }
  return s;
}
/** the sum of the whole series: r / (1 − r) = 1 / (d − 1) */
export const seriesLimit = (r: Ratio): number => 1 / (denominator(r) - 1);
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

export const geometricSeriesAreaEntry: ClipEntry<In> = defineClip<In>({
  id: 'geometric-series-area',
  curriculumTopics: ['m3-sequences-limits'],
  title: m('Chuỗi hình học bằng diện tích', 'A geometric series as areas'),
  inputSpec,
  presets: [
    { id: 'half', label: m('1/2 + 1/4 + 1/8 + …', '1/2 + 1/4 + 1/8 + …'), input: { r: '1/2' } },
    { id: 'third', label: m('1/3 + 1/9 + 1/27 + …', '1/3 + 1/9 + 1/27 + …'), input: { r: '1/3' } },
    {
      id: 'quarter',
      label: m('1/4 + 1/16 + 1/64 + …', '1/4 + 1/16 + 1/64 + …'),
      input: { r: '1/4' },
    },
  ],
  chapters: [
    {
      id: 'square',
      startSec: 0,
      endSec: 9,
      label: m('Hình vuông đơn vị', 'The unit square'),
      before: m(
        'Ta bắt đầu với một hình vuông có diện tích bằng 1.',
        'We start with a square of area 1.',
      ),
      after: m(
        'Ta sẽ cắt nó thành những mảnh nhỏ dần.',
        'We will cut it into smaller and smaller pieces.',
      ),
    },
    {
      id: 'cut',
      startSec: 9,
      endSec: 21,
      label: m('Cắt một phần', 'Cutting a part'),
      before: m(
        'Ta cắt từ hình vuông một phần có diện tích bằng r.',
        'We cut from the square a part whose area is r.',
      ),
      after: m('Phần còn lại có diện tích một trừ r.', 'The rest has area one minus r.'),
      caption: m('r', 'r'),
      ask: m(
        'Theo em, phần còn lại có diện tích bằng bao nhiêu?',
        'What area does the remaining part have?',
      ),
    },
    {
      id: 'repeat',
      startSec: 21,
      endSec: 35,
      label: m('Lặp lại', 'Repeating'),
      before: m(
        'Rồi ta cắt thêm một mảnh có diện tích r lần mảnh vừa cắt, và cứ thế mãi.',
        'Then we cut a piece that is r times as large as the one just cut, and so on again and again.',
      ),
      after: m(
        'Mỗi mảnh mới có diện tích bằng r lần mảnh trước.',
        'Each new piece has r times the area of the one before.',
      ),
      caption: m('r + r² + r³ + …', 'r + r² + r³ + …'),
      ask: m('Tổng các mảnh có thể vượt quá 1 không?', 'Can the total of the pieces exceed 1?'),
    },
    {
      id: 'sum',
      startSec: 35,
      endSec: 46,
      label: m('Tổng', 'The sum'),
      before: m(
        'Ta cộng dần các mảnh, và tổng diện tích của chúng tiến tới một giá trị nhưng không bao giờ vượt quá nó.',
        'We add the pieces one by one, and their total area approaches one value and never passes it.',
      ),
      after: m(
        'Tổng vô hạn của các mảnh bằng r chia một trừ r; với r bằng một phần hai đó là cả hình vuông.',
        'The infinite total of the pieces equals r over one minus r; for r equal to one half that is the whole square.',
      ),
      caption: m('Σ = r / (1 − r)', 'Σ = r / (1 − r)'),
    },
  ],
  invariants: (i) => {
    const limit = seriesLimit(i.r);
    let prev = 0;
    for (let k = 1; k <= 20; k++) {
      const s = partialSum(i.r, k);
      if (!(s > prev) || !(s < limit)) return false; // increasing and always below the limit
      prev = s;
    }
    return Math.abs(limit - partialSum(i.r, 20)) < 1e-6;
  },
  sheet: {
    chapters: [
      {
        id: 'square',
        shows: m('hình vuông đơn vị', 'the unit square'),
        formulas: ['\\(\\text{diện tích} = 1\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng cộng vô hạn số dương thì ra vô hạn: nhiều tổng vô hạn có giá trị hữu hạn.',
            'Thinking that adding infinitely many positive numbers gives infinity: many infinite sums have a finite value.',
          ),
        ],
        hints: hints(
          'Hình vuông đơn vị có diện tích bao nhiêu?',
          'Bằng 1.',
          'Mọi phần ta cắt ra từ nó cộng lại không thể vượt quá 1.',
          'What is the area of the unit square?',
          'It is 1.',
          'All the parts we cut from it cannot add up to more than 1.',
        ),
      },
      {
        id: 'cut',
        shows: m(
          'một phần diện tích r được cắt ra khỏi hình vuông',
          'a part of area r cut out of the square',
        ),
        formulas: ['\\(r\\)', '\\(1 - r\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng phần cắt tiếp theo là r của hình vuông ban đầu: nó là r của phần còn lại.',
            'Thinking the next cut is r of the original square: it is r of the remainder.',
          ),
        ],
        hints: hints(
          'Sau khi cắt r, còn lại bao nhiêu?',
          'Một trừ r.',
          'Lần cắt sau lấy r của phần còn lại, tức r(1 − r)? Hãy xem hình để thấy mảnh thứ hai.',
          'After cutting r, how much is left?',
          'One minus r.',
          'The next cut takes r of the remainder; look at the picture to see the second piece.',
        ),
      },
      {
        id: 'repeat',
        shows: m(
          'các mảnh r, r², r³, … nối tiếp nhau, mỗi mảnh nhỏ hơn mảnh trước',
          'the pieces r, r², r³, … following each other, each smaller than the last',
        ),
        formulas: ['\\(r + r^2 + r^3 + \\dots\\)', '\\(S_k = r + r^2 + \\dots + r^k\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng tổng sẽ vượt quá 1 nếu ta cắt đủ nhiều lần: các tổng riêng luôn nhỏ hơn giá trị giới hạn.',
            'Thinking the total will pass 1 if we cut often enough: the partial sums always stay below the limit.',
          ),
        ],
        hints: hints(
          'Mỗi mảnh liên hệ với mảnh trước thế nào?',
          'Bằng r lần mảnh trước.',
          'Nên các mảnh là r, r², r³, … và các tổng riêng tăng nhưng chậm dần.',
          'How is each piece related to the one before?',
          'It is r times the previous piece.',
          'So the pieces are r, r², r³, … and the partial sums grow but ever more slowly.',
        ),
      },
      {
        id: 'sum',
        shows: m(
          'các mảnh lấp hình vuông và tổng riêng tiến tới giới hạn',
          'the pieces filling the square and the partial sums approaching the limit',
        ),
        formulas: ['\\(r + r^2 + \\dots = \\frac{r}{1 - r}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng tổng bằng 1 với mọi r: chỉ với r = 1/2; với r = 1/3 tổng là 1/2.',
            'Thinking the sum is 1 for every r: only for r = 1/2; for r = 1/3 it is 1/2.',
          ),
        ],
        hints: hints(
          'Tổng vô hạn r + r² + r³ + … tính thế nào?',
          'Nhân hai vế với (1 − r): các số hạng triệt tiêu nối tiếp.',
          'Kết quả r / (1 − r), ví dụ r = 1/2 cho 1.',
          'How is the infinite sum r + r² + r³ + … computed?',
          'Multiply both sides by (1 − r): the terms cancel one after another.',
          'The result is r / (1 − r), for example r = 1/2 gives 1.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the sum of the whole series and the fifth partial sum, rounded to 4 decimals. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { limit: round4(seriesLimit(i.r)), s5: round4(partialSum(i.r, 5)) };
}

const geometricSeriesArea: ClipModule<In> = { entry: geometricSeriesAreaEntry, expectedDisplay };
export default geometricSeriesArea;
