/**
 * Clip template: sums by figurate numbers (card 3B-T2): 1 + 3 + … + (2n−1) = n² and 1 + 2 + … + n = n(n+1)/2.
 * TypeScript half only (the Manim scene is task 3B-M2). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `induction` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { series: 'odd' | 'natural'; n: number };

const inputSpec = {
  kind: 'record',
  fields: {
    series: { kind: 'enum', values: ['odd', 'natural'] },
    n: { kind: 'int', range: [2, 10] },
  },
} as const;

/** the sum, added term by term (not through the closed formula) */
const added = (i: In): number => {
  let s = 0;
  for (let k = 1; k <= i.n; k++) s += i.series === 'odd' ? 2 * k - 1 : k;
  return s;
};
const closed = (i: In): number => (i.series === 'odd' ? i.n * i.n : (i.n * (i.n + 1)) / 2);

export const figurateSumsEntry: ClipEntry<In> = defineClip<In>({
  id: 'figurate-sums',
  curriculumTopics: ['m2-induction'],
  title: m('Tổng bằng chấm: số lẻ và số tam giác', 'Sums with dots: odd and triangular numbers'),
  inputSpec,
  presets: [
    { id: 'odd-4', label: m('1 + 3 + 5 + 7', '1 + 3 + 5 + 7'), input: { series: 'odd', n: 4 } },
    {
      id: 'odd-2',
      label: m('1 + 3 (nhỏ nhất)', '1 + 3 (smallest)'),
      input: { series: 'odd', n: 2 },
    },
    {
      id: 'natural-5',
      label: m('1 + 2 + 3 + 4 + 5', '1 + 2 + 3 + 4 + 5'),
      input: { series: 'natural', n: 5 },
    },
    {
      id: 'natural-10',
      label: m('1 + 2 + … + 10', '1 + 2 + … + 10'),
      input: { series: 'natural', n: 10 },
    },
  ],
  chapters: [
    {
      id: 'dots',
      startSec: 0,
      endSec: 10,
      label: m('Xếp chấm', 'Arranging dots'),
      before: m(
        'Ta xếp các chấm thành từng hàng, hàng thứ nhất một chấm, rồi các hàng sau nhiều dần theo quy luật của dãy.',
        'We arrange dots in rows, one dot in the first row, then more in each row following the rule of the sequence.',
      ),
      after: m('Mỗi hàng là một số hạng của tổng.', 'Each row is one term of the sum.'),
    },
    {
      id: 'grow',
      startSec: 10,
      endSec: 23,
      label: m('Thêm một lớp', 'Adding a layer'),
      before: m(
        'Ta thêm một lớp mới: chữ L ôm quanh hình vuông với số lẻ, hoặc hai bậc thang ghép thành hình chữ nhật với số tự nhiên.',
        'We add a new layer: an L wrapped around the square for odd numbers, or two staircases forming a rectangle for natural numbers.',
      ),
      after: m(
        'Mỗi lớp mới thêm đúng một số hạng tiếp theo của dãy.',
        'Each new layer adds exactly the next term of the sequence.',
      ),
      ask: m(
        'Theo em, lớp tiếp theo có bao nhiêu chấm?',
        'How many dots will the next layer have?',
      ),
    },
    {
      id: 'count',
      startSec: 23,
      endSec: 36,
      label: m('Đếm', 'Counting'),
      before: m(
        'Ta đếm tất cả các chấm theo hình vừa dựng: hình vuông cạnh n, hoặc nửa hình chữ nhật n nhân n cộng một.',
        'We count all the dots of the figure just built: a square of side n, or half a rectangle n by n plus one.',
      ),
      after: m(
        'Cách đếm theo hình cho công thức ngay, không cần cộng từng số hạng.',
        'Counting by the figure gives the formula at once, without adding term by term.',
      ),
      caption: m('1+3+…+(2n−1) = n²', '1+3+…+(2n−1) = n²'),
      ask: m(
        'Nếu thêm một lớp nữa thì tổng bằng bao nhiêu?',
        'If we add one more layer, what is the total?',
      ),
    },
    {
      id: 'induction',
      startSec: 36,
      endSec: 48,
      label: m('Bước quy nạp', 'The induction step'),
      before: m(
        'Giả sử công thức đúng với k. Thêm lớp thứ k cộng một và xem tổng mới.',
        'Suppose the formula holds for k. Add layer number k plus one and look at the new total.',
      ),
      after: m(
        'Tổng mới đúng bằng công thức với k cộng một. Đó là bước quy nạp: từ k suy ra k cộng một.',
        'The new total is exactly the formula for k plus one. That is the induction step: from k we get k plus one.',
      ),
    },
  ],
  invariants: (i) => added(i) === closed(i) && Number.isInteger(closed(i)),
  sheet: {
    chapters: [
      {
        id: 'dots',
        shows: m(
          'các hàng chấm 1, 3, 5, … hoặc 1, 2, 3, …',
          'rows of dots 1, 3, 5, … or 1, 2, 3, …',
        ),
        formulas: ['\\(1 + 3 + 5 + \\dots + (2n - 1)\\)', '\\(1 + 2 + \\dots + n\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng đúng với vài n đầu là đã chứng minh xong: phải chứng minh cho mọi n.',
            'Thinking that truth for the first few n already proves it: it must be proved for every n.',
          ),
        ],
        hints: hints(
          'Hàng thứ k có bao nhiêu chấm?',
          'Số lẻ: 2k − 1 chấm; số tự nhiên: k chấm.',
          'Tổng n hàng là số chấm của cả hình.',
          'How many dots are in row k?',
          'Odd numbers: 2k − 1 dots; natural numbers: k dots.',
          'The sum of n rows is the number of dots of the whole figure.',
        ),
      },
      {
        id: 'grow',
        shows: m(
          'chữ L (gnomon) ôm hình vuông, hoặc hai bậc thang ghép thành hình chữ nhật',
          'an L (gnomon) around the square, or two staircases forming a rectangle',
        ),
        formulas: ['\\(2k - 1\\)', '\\(2 \\cdot (1 + 2 + \\dots + n) = n(n + 1)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng lớp mới luôn có k chấm: với số lẻ lớp thứ k có 2k − 1 chấm.',
            'Thinking the new layer always has k dots: for odd numbers layer k has 2k − 1 dots.',
          ),
        ],
        hints: hints(
          'Chữ L thêm vào hình vuông k × k có bao nhiêu chấm?',
          'Một hàng k cộng một cột k, nhưng chấm góc đếm hai lần.',
          'Vậy 2k − 1 chấm, và hình mới là (k)² cộng thêm thành cạnh k.',
          'How many dots does the L add to a k × k square?',
          'One row of k plus one column of k, but the corner is counted twice.',
          'So 2k − 1 dots, and the new square has side k.',
        ),
      },
      {
        id: 'count',
        shows: m(
          'hình vuông cạnh n hoặc nửa hình chữ nhật n × (n + 1)',
          'a square of side n or half of an n × (n + 1) rectangle',
        ),
        formulas: [
          '\\(1 + 3 + \\dots + (2n - 1) = n^2\\)',
          '\\(1 + 2 + \\dots + n = \\frac{n(n + 1)}{2}\\)',
        ],
        misconceptions: [
          m(
            'Quên chia đôi ở số tam giác: hình chữ nhật n × (n + 1) gồm hai lần tổng.',
            'Forgetting to halve for triangular numbers: the n × (n + 1) rectangle holds twice the sum.',
          ),
        ],
        hints: hints(
          'Hình vuông cạnh n có bao nhiêu chấm?',
          'n nhân n, tức n².',
          'Số tam giác là nửa của hình chữ nhật n × (n + 1): n(n + 1)/2.',
          'How many dots does a square of side n have?',
          'n times n, that is n².',
          'A triangular number is half of the n × (n + 1) rectangle: n(n + 1)/2.',
        ),
      },
      {
        id: 'induction',
        shows: m(
          'từ hình ở bước k thêm lớp k + 1 được hình ở bước k + 1',
          'from the figure at step k, adding layer k + 1 gives the figure at step k + 1',
        ),
        formulas: [
          '\\(k^2 + (2k + 1) = (k + 1)^2\\)',
          '\\(\\frac{k(k + 1)}{2} + (k + 1) = \\frac{(k + 1)(k + 2)}{2}\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng bước quy nạp đã đủ mà không cần bước cơ sở: cả hai đều cần.',
            'Thinking the induction step is enough without the base case: both are needed.',
          ),
        ],
        hints: hints(
          'Bước quy nạp chứng minh điều gì?',
          'Rằng nếu công thức đúng với k thì đúng với k + 1.',
          'Cộng thêm số hạng thứ k + 1 vào vế phải và kiểm đúng dạng công thức với k + 1.',
          'What does the induction step prove?',
          'That if the formula holds for k it holds for k + 1.',
          'Add the (k + 1)th term to the right side and check it matches the formula for k + 1.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: n and the total number of dots. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { n: i.n, sum: closed(i) };
}

const figurateSums: ClipModule<In> = { entry: figurateSumsEntry, expectedDisplay };
export default figurateSums;
