/**
 * Clip template: the Euclidean algorithm as squares cut from a rectangle (card 3B-T14): cut the largest squares,
 * repeat with what is left; the last square has side gcd(a, b). TypeScript half only (the Manim scene is task
 * 3B-M14). Deterministic and browser-safe (ADR 0006): integers only.
 * Curriculum topic `euclid-diophantine` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { a: number; b: number };

const inputSpec = {
  kind: 'record',
  fields: { a: { kind: 'int', range: [1, 60] }, b: { kind: 'int', range: [1, 60] } },
} as const;

/** The cuts: from a rectangle x × y (x ≥ y) cut `count` squares of side y, leaving y × (x mod y). */
export function cuts(i: In): { side: number; count: number }[] {
  let x = Math.max(i.a, i.b);
  let y = Math.min(i.a, i.b);
  const out: { side: number; count: number }[] = [];
  while (y > 0) {
    out.push({ side: y, count: Math.floor(x / y) });
    const r = x % y;
    x = y;
    y = r;
  }
  return out;
}

export const euclidRectangleEntry: ClipEntry<In> = defineClip<In>({
  id: 'euclid-rectangle',
  curriculumTopics: ['m2-euclid-diophantine'],
  title: m('Thuật toán Euclid bằng lát hình vuông', 'The Euclidean algorithm with squares'),
  inputSpec,
  presets: [
    { id: '48-18', label: m('48 × 18', '48 × 18'), input: { a: 48, b: 18 } },
    { id: 'equal', label: m('12 × 12', '12 × 12'), input: { a: 12, b: 12 } },
    {
      id: 'coprime',
      label: m('13 × 8 (nguyên tố cùng nhau)', '13 × 8 (coprime)'),
      input: { a: 13, b: 8 },
    },
    { id: 'one', label: m('1 × 60', '1 × 60'), input: { a: 1, b: 60 } },
  ],
  chapters: [
    {
      id: 'rectangle',
      startSec: 0,
      endSec: 9,
      label: m('Hình chữ nhật', 'The rectangle'),
      before: m(
        'Ta vẽ một hình chữ nhật có hai cạnh là a và b. Ta muốn lát kín nó bằng những hình vuông bằng nhau, to nhất có thể.',
        'We draw a rectangle with sides a and b. We want to tile it exactly with equal squares, as large as possible.',
      ),
      after: m(
        'Cạnh lớn nhất của hình vuông như vậy là ước chung lớn nhất của a và b.',
        'The largest side of such a square is the greatest common divisor of a and b.',
      ),
    },
    {
      id: 'squares',
      startSec: 9,
      endSec: 21,
      label: m('Cắt hình vuông', 'Cutting squares'),
      before: m(
        'Ta cắt từ hình chữ nhật những hình vuông lớn nhất có thể, cạnh bằng cạnh ngắn.',
        'We cut from the rectangle the largest squares we can, with side equal to the short side.',
      ),
      after: m('Còn lại một hình chữ nhật nhỏ hơn.', 'A smaller rectangle is left.'),
      caption: m('x = q·y + r', 'x = q·y + r'),
      ask: m(
        'Hình vuông lớn nhất cắt được có cạnh bằng bao nhiêu?',
        'What is the side of the largest square we can cut?',
      ),
    },
    {
      id: 'repeat',
      startSec: 21,
      endSec: 35,
      label: m('Lặp lại', 'Repeating'),
      before: m(
        'Với hình chữ nhật còn lại ta làm đúng như vậy, và cứ thế cho tới khi không còn mảnh thừa.',
        'With the rectangle that is left we do exactly the same, and again until nothing is left over.',
      ),
      after: m(
        'Mỗi lần cạnh ngắn giảm đi, nên quá trình chắc chắn kết thúc.',
        'Each time the short side gets smaller, so the process is sure to end.',
      ),
      ask: m(
        'Hình vuông cuối cùng có cạnh bao nhiêu?',
        'What is the side of the very last square?',
      ),
    },
    {
      id: 'gcd',
      startSec: 35,
      endSec: 46,
      label: m('Ước chung lớn nhất', 'The greatest common divisor'),
      before: m(
        'Hình vuông cuối cùng lát vừa khít hình chữ nhật ngay trước nó, và cứ thế ngược lên đến hình ban đầu.',
        'The last square tiles the rectangle just before it exactly, and so on back up to the original one.',
      ),
      after: m(
        'Cạnh của nó chia hết cả a lẫn b, và đó chính là ước chung lớn nhất.',
        'Its side divides both a and b, and that is exactly the greatest common divisor.',
      ),
      caption: m('cạnh cuối = gcd', 'last side = gcd'),
    },
  ],
  invariants: (i) => {
    const steps = cuts(i);
    if (steps.length === 0) return false;
    const last = steps[steps.length - 1].side;
    // the squares tile the rectangle: their total area is ab
    const area = steps.reduce((s, c) => s + c.count * c.side * c.side, 0);
    // the last side divides both sides and no larger common divisor exists
    const divides = i.a % last === 0 && i.b % last === 0;
    for (let g = last + 1; g <= Math.min(i.a, i.b); g++)
      if (i.a % g === 0 && i.b % g === 0) return false;
    return area === i.a * i.b && divides;
  },
  sheet: {
    chapters: [
      {
        id: 'rectangle',
        shows: m('hình chữ nhật a × b', 'an a × b rectangle'),
        formulas: ['\\(a \\times b\\)', '\\(\\gcd(a, b)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng gcd luôn là số nhỏ hơn trong hai số: chỉ khi số nhỏ chia hết số lớn.',
            'Thinking the gcd is always the smaller of the two numbers: only when the smaller divides the larger.',
          ),
        ],
        hints: hints(
          'Hình vuông nào lát vừa khít được hình chữ nhật a × b?',
          'Hình vuông có cạnh là một ước chung của a và b.',
          'Cạnh lớn nhất như vậy là ước chung lớn nhất.',
          'Which squares can tile the a × b rectangle exactly?',
          'Squares whose side is a common divisor of a and b.',
          'The largest such side is the greatest common divisor.',
        ),
      },
      {
        id: 'squares',
        shows: m(
          'các hình vuông cạnh bằng cạnh ngắn được cắt khỏi hình chữ nhật',
          'squares as wide as the short side cut from the rectangle',
        ),
        formulas: ['\\(x = q\\,y + r\\)', '\\(0 \\le r < y\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng chỉ cắt được một hình vuông mỗi lần: có thể cắt q hình, với q là thương của phép chia.',
            'Thinking only one square can be cut each time: q of them, where q is the quotient of the division.',
          ),
        ],
        hints: hints(
          'Có thể cắt bao nhiêu hình vuông cạnh y từ một hình chữ nhật x × y?',
          'Bằng phần nguyên của x chia y.',
          'Phần thừa là hình chữ nhật y × r với r là số dư.',
          'How many squares of side y can we cut from an x × y rectangle?',
          'The whole part of x divided by y.',
          'The leftover is a y × r rectangle where r is the remainder.',
        ),
      },
      {
        id: 'repeat',
        shows: m(
          'hình chữ nhật còn lại được cắt tiếp, các hình vuông nhỏ dần',
          'the remaining rectangle cut again, the squares getting smaller',
        ),
        formulas: ['\\(\\gcd(x, y) = \\gcd(y, x \\bmod y)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng ta cần thử mọi ước của a và b: thuật toán chỉ làm vài phép chia.',
            'Thinking we must try every divisor of a and b: the algorithm only does a few divisions.',
          ),
        ],
        hints: hints(
          'Vì sao lặp được với hình chữ nhật còn lại?',
          'Vì ước chung của hai cạnh ban đầu cũng chia hết phần thừa.',
          'Nên gcd(x, y) = gcd(y, x mod y), và bài toán nhỏ dần.',
          'Why can we repeat with the leftover rectangle?',
          'Because a common divisor of the first two sides also divides the leftover.',
          'So gcd(x, y) = gcd(y, x mod y), and the problem shrinks.',
        ),
      },
      {
        id: 'gcd',
        shows: m(
          'hình vuông cuối cùng được tô sáng với cạnh bằng gcd',
          'the last square highlighted with side gcd',
        ),
        formulas: ['\\(\\gcd(a, b)\\)', '\\(ab = \\sum q_i s_i^2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng số hình vuông bằng gcd: số hình vuông là tổng các thương, còn gcd là cạnh hình cuối.',
            'Thinking the number of squares is the gcd: the count is the sum of the quotients, and the gcd is the side of the last square.',
          ),
        ],
        hints: hints(
          'Vì sao hình vuông cuối cùng lát được cả hình chữ nhật ban đầu?',
          'Vì nó lát vừa khít hình ngay trước, và hình đó lát vừa khít hình trước nữa.',
          'Nên cạnh của nó chia hết cả a và b, và không có số lớn hơn nào làm được.',
          'Why does the last square tile the original rectangle too?',
          'Because it tiles the rectangle just before it, and that one tiles the one before it.',
          'So its side divides both a and b, and no larger number does.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: gcd(a, b) and the number of squares cut in all. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  const steps = cuts(i);
  return {
    gcd: steps[steps.length - 1].side,
    squares: steps.reduce((s, c) => s + c.count, 0),
  };
}

const euclidRectangle: ClipModule<In> = { entry: euclidRectangleEntry, expectedDisplay };
export default euclidRectangle;
