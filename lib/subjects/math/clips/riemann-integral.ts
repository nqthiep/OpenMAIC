/**
 * Clip template: from Riemann sums to the integral (card 3B-T9): n left-endpoint rectangles under a polynomial,
 * refined until the sum meets the exact integral. TypeScript half only (the Manim scene is task 3B-M9).
 * Deterministic and browser-safe (ADR 0006): polynomials are evaluated with Horner's rule; the exact integral
 * comes from the antiderivative of the coefficients.
 * Curriculum topic `integral` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { c: number[]; a: number; b: number; n: 4 | 8 | 16 };

const inputSpec = {
  kind: 'record',
  fields: {
    c: { kind: 'int-array', len: [1, 4], range: [-3, 3] },
    a: { kind: 'int', range: [-3, 2] },
    b: { kind: 'int', range: [-2, 3] },
    n: { kind: 'enum', values: [4, 8, 16] },
  },
} as const;

const f = (c: readonly number[], x: number): number => c.reduceRight((acc, k) => acc * x + k, 0);
/** the antiderivative with F(0) = 0: c_k x^(k+1) / (k+1) */
const F = (c: readonly number[], x: number): number =>
  c.reduceRight((acc, k, i) => acc * x + k / (i + 1), 0) * x;
const round4 = (x: number): number => {
  const r = Math.round(x * 10000) / 10000;
  return r === 0 ? 0 : r;
};

/** The left-endpoint Riemann sum with n equal rectangles. */
export function leftSum(i: In): number {
  const dx = (i.b - i.a) / i.n;
  let s = 0;
  for (let k = 0; k < i.n; k++) s += f(i.c, i.a + k * dx) * dx;
  return s;
}
export const exactIntegral = (i: In): number => F(i.c, i.b) - F(i.c, i.a);

/** max |f′| over [a, b]: f′ is a polynomial of degree at most 2, so check the ends and its vertex. */
export function maxAbsDerivative(c: readonly number[], a: number, b: number): number {
  const d = c.slice(1).map((k, j) => (j + 1) * k); // f′ coefficients
  const at = (x: number): number => Math.abs(f(d, x));
  let best = Math.max(at(a), at(b));
  if (d.length === 3 && d[2] !== 0) {
    const vertex = -d[1] / (2 * d[2]);
    if (vertex > a && vertex < b) best = Math.max(best, at(vertex));
  }
  return best;
}

export const riemannIntegralEntry: ClipEntry<In> = defineClip<In>({
  id: 'riemann-integral',
  curriculumTopics: ['m4-integral'],
  title: m('Tổng Riemann và tích phân', 'Riemann sums and the integral'),
  inputSpec,
  check: (i) => (i.a >= i.b ? ['a-not-less-than-b'] : []),
  presets: [
    {
      id: 'x2-4',
      label: m('x² trên [0, 2], 4 hình chữ nhật', 'x² on [0, 2], 4 rectangles'),
      input: { c: [0, 0, 1], a: 0, b: 2, n: 4 },
    },
    {
      id: 'x2-16',
      label: m('x² trên [0, 2], 16 hình chữ nhật', 'x² on [0, 2], 16 rectangles'),
      input: { c: [0, 0, 1], a: 0, b: 2, n: 16 },
    },
    {
      id: 'const',
      label: m('hằng số 2 trên [−1, 2]', 'the constant 2 on [−1, 2]'),
      input: { c: [2], a: -1, b: 2, n: 4 },
    },
    {
      id: 'cubic',
      label: m('x³ − x trên [−1, 2]', 'x³ − x on [−1, 2]'),
      input: { c: [0, -1, 0, 1], a: -1, b: 2, n: 8 },
    },
  ],
  chapters: [
    {
      id: 'area',
      startSec: 0,
      endSec: 9,
      label: m('Diện tích dưới đồ thị', 'Area under the graph'),
      before: m(
        'Ta muốn biết diện tích của vùng nằm giữa đồ thị và trục hoành, từ a đến b.',
        'We want the area of the region between the graph and the horizontal axis, from a to b.',
      ),
      after: m(
        'Vùng này có biên cong nên ta chưa có công thức diện tích trực tiếp.',
        'The region has a curved edge, so we have no direct area formula yet.',
      ),
    },
    {
      id: 'rectangles',
      startSec: 9,
      endSec: 21,
      label: m('Hình chữ nhật', 'Rectangles'),
      before: m(
        'Ta chia đoạn từ a đến b thành n phần bằng nhau và dựng mỗi phần một hình chữ nhật, cao bằng giá trị của hàm ở đầu bên trái.',
        'We cut the stretch from a to b into n equal parts and build a rectangle on each, as tall as the function at its left end.',
      ),
      after: m(
        'Tổng diện tích các hình chữ nhật là một giá trị gần đúng.',
        'The total area of the rectangles is an approximation.',
      ),
      caption: m('Lₙ = Σ f(xᵢ)·Δx', 'Lₙ = Σ f(xᵢ)·Δx'),
      ask: m(
        'Theo em, các hình chữ nhật có phủ vừa khít vùng không?',
        'Do the rectangles cover the region exactly?',
      ),
    },
    {
      id: 'refine',
      startSec: 21,
      endSec: 35,
      label: m('Chia nhỏ hơn', 'Finer cuts'),
      before: m(
        'Ta tăng n, dựng nhiều hình chữ nhật mỏng hơn, và xem tổng thay đổi thế nào.',
        'We increase n, build more and thinner rectangles, and watch how the total changes.',
      ),
      after: m(
        'Các hình chữ nhật bám sát đồ thị hơn và khoảng hở bé dần.',
        'The rectangles hug the graph more closely and the gaps get smaller.',
      ),
      caption: m('n tăng', 'n grows'),
      ask: m('Khi n tăng, sai số tăng hay giảm?', 'As n grows, does the error grow or shrink?'),
    },
    {
      id: 'limit',
      startSec: 35,
      endSec: 46,
      label: m('Giới hạn', 'The limit'),
      before: m(
        'Khi n lớn tới mức không đếm xuể, tổng các hình chữ nhật tiến tới một số cố định.',
        'When n grows beyond counting, the sum of the rectangles approaches one fixed number.',
      ),
      after: m(
        'Số đó là tích phân của f từ a đến b. Ta cũng tính được nó từ nguyên hàm.',
        'That number is the integral of f from a to b. We can also compute it from an antiderivative.',
      ),
      caption: m('∫ f = F(b) − F(a)', '∫ f = F(b) − F(a)'),
    },
  ],
  invariants: (i) => {
    if (i.a >= i.b) return false;
    const err = Math.abs(leftSum(i) - exactIntegral(i));
    // error of the left-endpoint rule: at most (b − a)² · max|f′| / (2n)
    const bound = ((i.b - i.a) ** 2 * maxAbsDerivative(i.c, i.a, i.b)) / (2 * i.n);
    return err <= bound + 1e-9;
  },
  sheet: {
    chapters: [
      {
        id: 'area',
        shows: m(
          'vùng giữa đồ thị và trục hoành từ a đến b',
          'the region between the graph and the horizontal axis from a to b',
        ),
        formulas: ['\\(\\int_a^b f(x)\\,dx\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng diện tích dưới trục hoành cũng cộng dương: tích phân tính diện tích có dấu, phần dưới trục là âm.',
            'Thinking area below the axis also adds as positive: the integral counts signed area, and the part below the axis is negative.',
          ),
        ],
        hints: hints(
          'Vùng nằm giữa đồ thị và trục: ta đo nó thế nào?',
          'Bằng cách xấp xỉ bằng các hình có diện tích biết trước.',
          'Hình chữ nhật là lựa chọn đơn giản nhất.',
          'How do we measure the region between the graph and the axis?',
          'By approximating it with shapes whose area we know.',
          'Rectangles are the simplest choice.',
        ),
      },
      {
        id: 'rectangles',
        shows: m(
          'n hình chữ nhật có chiều cao f tại đầu bên trái mỗi đoạn',
          'n rectangles as tall as f at the left end of each piece',
        ),
        formulas: ['\\(\\Delta x = \\frac{b - a}{n}\\)', '\\(L_n = \\sum f(x_i)\\,\\Delta x\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng tổng các hình chữ nhật chính xác bằng diện tích: nó chỉ gần đúng, trừ hàm hằng.',
            'Thinking the rectangle total equals the area exactly: it is only approximate, except for a constant function.',
          ),
        ],
        hints: hints(
          'Mỗi hình chữ nhật rộng bao nhiêu và cao bao nhiêu?',
          'Rộng Δx = (b − a)/n, cao f(xᵢ) tại đầu bên trái.',
          'Diện tích mỗi hình là f(xᵢ)·Δx, và ta cộng n hình.',
          'How wide and how tall is each rectangle?',
          'Δx = (b − a)/n wide, f(xᵢ) tall at the left end.',
          'Each has area f(xᵢ)·Δx, and we add n of them.',
        ),
      },
      {
        id: 'refine',
        shows: m(
          'n tăng từ 4 lên 8 rồi 16; các hình chữ nhật mỏng dần',
          'n going from 4 to 8 to 16; the rectangles thinning',
        ),
        formulas: ["\\(|L_n - I| \\le \\frac{(b - a)^2 \\max|f'|}{2n}\\)"],
        misconceptions: [
          m(
            'Nghĩ rằng tăng n không giúp ích vì tổng vẫn chỉ là gần đúng: sai số giảm tỉ lệ với 1/n.',
            'Thinking raising n does not help since the sum is still only approximate: the error shrinks in proportion to 1/n.',
          ),
        ],
        hints: hints(
          'Hình chữ nhật mỏng hơn thì bám đồ thị tốt hơn hay kém hơn?',
          'Tốt hơn, vì khoảng hở bé đi.',
          'Sai số giảm khi n tăng, với tốc độ khoảng 1/n.',
          'Do thinner rectangles follow the graph better or worse?',
          'Better, because the gaps get smaller.',
          'The error falls as n grows, at a rate of about 1/n.',
        ),
      },
      {
        id: 'limit',
        shows: m(
          'Lₙ tiến tới giá trị của tích phân tính từ nguyên hàm',
          'Lₙ approaching the value of the integral computed from the antiderivative',
        ),
        formulas: ['\\(\\int_a^b f = F(b) - F(a)\\)', '\\(\\lim_{n \\to \\infty} L_n = I\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng giới hạn là số hình chữ nhật vô hạn nhân diện tích bằng 0: đó là giới hạn của các tổng, có giá trị hữu hạn.',
            'Thinking the limit is infinitely many rectangles of area 0: it is the limit of the sums, which is a finite value.',
          ),
        ],
        hints: hints(
          'Tổng Lₙ tiến tới số nào khi n lớn?',
          'Tới tích phân I.',
          'Ta cũng có I = F(b) − F(a) với F là nguyên hàm của f.',
          'Which number does the sum Lₙ approach as n grows?',
          'The integral I.',
          'We also have I = F(b) − F(a) with F an antiderivative of f.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the left sum and the exact integral, rounded to 4 decimals. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { sum: round4(leftSum(i)), exact: round4(exactIntegral(i)) };
}

const riemannIntegral: ClipModule<In> = { entry: riemannIntegralEntry, expectedDisplay };
export default riemannIntegral;
