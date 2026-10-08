/**
 * Clip template: from the secant to the tangent (card 3A-T3, SCHEMA Phase 3 §3). TypeScript half only (the Manim
 * scene is task 3A-M3). Deterministic and browser-safe (ADR 0006): polynomials are evaluated with Horner's rule.
 * Curriculum topic `derivative-graphs` follows the SCHEMA §7 outline [Inference].
 *
 * Deviation from the card: its invariant `|slope(0.01) − f'(x0)| < 0.1` fails inside the input range (for
 * c = [0, 0, 3, 3] at x0 = 2 the difference is about 0.21). The invariant here is the exact identity
 * slope(h) = f'(x0) + f''(x0)·h/2 + c3·h² (c3 = 0 for a quadratic) plus the loose bound 0.25.
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { c: number[]; x0: number };

const inputSpec = {
  kind: 'record',
  fields: {
    c: { kind: 'int-array', len: [3, 4], range: [-3, 3] },
    x0: { kind: 'int', range: [-2, 2] },
  },
} as const;

/** Horner's rule; coefficients in increasing degree. */
const f = (c: readonly number[], x: number): number => c.reduceRight((acc, k) => acc * x + k, 0);
const fprime = (c: readonly number[], x: number): number =>
  c.slice(1).reduceRight((acc, k, i) => acc * x + (i + 1) * k, 0);
const slope = (c: readonly number[], x0: number, h: number): number =>
  (f(c, x0 + h) - f(c, x0)) / h;
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

export const secantTangentEntry: ClipEntry<In> = defineClip<In>({
  id: 'secant-tangent',
  curriculumTopics: ['m3-derivative-graphs'],
  title: m('Từ cát tuyến đến tiếp tuyến', 'From the secant to the tangent'),
  inputSpec,
  check: (i) => (i.c[i.c.length - 1] === 0 ? ['leading-coefficient-zero'] : []),
  presets: [
    { id: 'square-at-1', label: m('x² tại x = 1', 'x² at x = 1'), input: { c: [0, 0, 1], x0: 1 } },
    {
      id: 'cubic-at-0',
      label: m('x³ − 3x tại x = 0', 'x³ − 3x at x = 0'),
      input: { c: [0, -3, 0, 1], x0: 0 },
    },
    {
      id: 'stationary',
      label: m('x³ − 3x tại x = 1 (tiếp tuyến ngang)', 'x³ − 3x at x = 1 (flat tangent)'),
      input: { c: [0, -3, 0, 1], x0: 1 },
    },
    {
      id: 'quad-at-minus-1',
      label: m('2x² − x + 1 tại x = −1', '2x² − x + 1 at x = −1'),
      input: { c: [1, -1, 2], x0: -1 },
    },
  ],
  chapters: [
    {
      id: 'curve',
      startSec: 0,
      endSec: 10,
      label: m('Đồ thị', 'The graph'),
      before: m(
        'Ta vẽ đồ thị của một đa thức trên hệ trục toạ độ và chọn một điểm P có hoành độ x không.',
        'We draw the graph of a polynomial on the axes and pick a point P with x-coordinate x zero.',
      ),
      after: m(
        'Câu hỏi: đồ thị dốc bao nhiêu đúng tại P?',
        'The question: how steep is the graph exactly at P?',
      ),
    },
    {
      id: 'secant',
      startSec: 10,
      endSec: 24,
      label: m('Cát tuyến', 'The secant'),
      before: m(
        'Ta lấy thêm điểm Q cách P một khoảng h bằng 1 theo chiều ngang và vẽ đường thẳng qua P và Q: cát tuyến.',
        'We take another point Q at horizontal distance h equal to 1 from P and draw the line through P and Q: the secant.',
      ),
      after: m(
        'Hệ số góc của cát tuyến là độ tăng của f chia cho h.',
        'The slope of the secant is the rise of f divided by h.',
      ),
      caption: m('k = Δf / h', 'k = Δf / h'),
      ask: m(
        'Theo em, hệ số góc của cát tuyến lúc này có bằng độ dốc thật của đồ thị tại P không?',
        'Is the slope of the secant now equal to the true steepness of the graph at P?',
      ),
    },
    {
      id: 'limit',
      startSec: 24,
      endSec: 42,
      label: m('Cho h tiến tới 0', 'Letting h go to 0'),
      before: m(
        'Ta thu nhỏ h dần: Q trượt về P, và cát tuyến xoay quanh P.',
        'We shrink h: Q slides toward P and the secant turns about P.',
      ),
      after: m(
        'Hệ số góc của cát tuyến ổn định dần về một giá trị.',
        'The slope of the secant settles toward one value.',
      ),
      caption: m('h → 0', 'h → 0'),
      ask: m('Hệ số góc đang tiến tới số nào?', 'Which number is the slope approaching?'),
    },
    {
      id: 'tangent',
      startSec: 42,
      endSec: 53,
      label: m('Tiếp tuyến', 'The tangent'),
      before: m(
        'Vị trí giới hạn của cát tuyến là tiếp tuyến của đồ thị tại P.',
        'The limiting position of the secant is the tangent to the graph at P.',
      ),
      after: m(
        'Hệ số góc của tiếp tuyến chính là đạo hàm f phẩy tại x không.',
        'The slope of the tangent is exactly the derivative f prime at x zero.',
      ),
      caption: m('k = f′(x₀)', 'k = f′(x₀)'),
    },
  ],
  invariants: (i) => {
    const c = i.c;
    const x0 = i.x0;
    const h = 0.01;
    const f2 = c.slice(2).reduceRight((acc, k, j) => acc * x0 + (j + 2) * (j + 1) * k, 0); // f''(x0)
    const c3 = c.length === 4 ? c[3] : 0;
    const exact = fprime(c, x0) + (f2 * h) / 2 + c3 * h * h; // slope(h) written out
    return (
      Math.abs(slope(c, x0, h) - exact) < 1e-9 && Math.abs(slope(c, x0, h) - fprime(c, x0)) < 0.25
    );
  },
  sheet: {
    chapters: [
      {
        id: 'curve',
        shows: m(
          'đồ thị đa thức trên hệ trục, điểm P tại x₀',
          'the polynomial graph on the axes, the point P at x₀',
        ),
        formulas: ['\\(f(x_0)\\)', '\\(P = (x_0, f(x_0))\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng độ dốc của đường cong chỉ có nghĩa với đường thẳng: đường cong có độ dốc khác nhau ở mỗi điểm.',
            'Thinking steepness only makes sense for a straight line: a curve has a different steepness at each point.',
          ),
        ],
        hints: hints(
          'Một đường cong có độ dốc không đổi không?',
          'Không, nó thay đổi từ điểm này sang điểm khác.',
          'Ta cần định nghĩa độ dốc tại một điểm, và sẽ làm bằng cát tuyến.',
          'Does a curve have one constant steepness?',
          'No, it changes from point to point.',
          'We need to define steepness at one point, and will do it with secants.',
        ),
      },
      {
        id: 'secant',
        shows: m('điểm Q ở x₀ + 1, đường thẳng PQ', 'the point Q at x₀ + 1, the line PQ'),
        formulas: ['\\(k = \\frac{f(x_0 + h) - f(x_0)}{h}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng cát tuyến luôn cắt đồ thị đúng hai điểm: nó có thể cắt nhiều hơn với đa thức bậc ba.',
            'Thinking a secant meets the graph at exactly two points: it can meet more with a cubic.',
          ),
        ],
        hints: hints(
          'Hệ số góc của đường thẳng qua hai điểm tính thế nào?',
          'Lấy độ tăng của y chia độ tăng của x.',
          'k = (f(x₀ + h) − f(x₀)) / h với h = 1.',
          'How is the slope of a line through two points computed?',
          'Take the rise in y over the run in x.',
          'k = (f(x₀ + h) − f(x₀)) / h with h = 1.',
        ),
      },
      {
        id: 'limit',
        shows: m(
          'h giảm 1, 0,5, 0,1, 0,01; cát tuyến xoay dần',
          'h shrinking 1, 0.5, 0.1, 0.01; the secant turning',
        ),
        formulas: ['\\(h \\to 0\\)', "\\(k(h) \\to f'(x_0)\\)"],
        misconceptions: [
          m(
            'Nghĩ rằng h phải bằng 0: khi h = 0 thì chia cho 0; ta chỉ cho h tiến tới 0.',
            'Thinking h must equal 0: at h = 0 we would divide by 0; we only let h go to 0.',
          ),
        ],
        hints: hints(
          'Điều gì xảy ra với hệ số góc khi h rất nhỏ?',
          'Nó thay đổi rất ít giữa hai lần thu nhỏ liên tiếp.',
          'Nó tiến tới một số cố định: đó là đạo hàm tại x₀.',
          'What happens to the slope when h is very small?',
          'It changes very little between two successive shrinks.',
          'It approaches a fixed number: the derivative at x₀.',
        ),
      },
      {
        id: 'tangent',
        shows: m('tiếp tuyến tại P với hệ số góc f′(x₀)', 'the tangent at P with slope f′(x₀)'),
        formulas: ["\\(f'(x_0)\\)", "\\(y = f(x_0) + f'(x_0)(x - x_0)\\)"],
        misconceptions: [
          m(
            'Nghĩ rằng tiếp tuyến chỉ chạm đồ thị tại một điểm: nó có thể cắt đồ thị ở chỗ khác.',
            'Thinking a tangent touches the graph at one point only: it may cross the graph elsewhere.',
          ),
          m(
            'Nghĩ rằng đạo hàm bằng 0 thì chắc chắn là cực trị: x³ có đạo hàm 0 tại 0 nhưng không có cực trị.',
            'Thinking a zero derivative is surely an extremum: x³ has derivative 0 at 0 but no extremum.',
          ),
        ],
        hints: hints(
          'Tiếp tuyến là vị trí giới hạn của gì?',
          'Của cát tuyến PQ khi Q tiến tới P.',
          'Hệ số góc của nó là f′(x₀), tính từ hệ số của đa thức.',
          'The tangent is the limiting position of what?',
          'Of the secant PQ as Q goes to P.',
          'Its slope is f′(x₀), computed from the coefficients of the polynomial.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json (the two secant slopes rounded to 4 decimals). */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return {
    f0: f(i.c, i.x0),
    fprime: fprime(i.c, i.x0),
    slope1: round4(slope(i.c, i.x0, 1)),
    slope01: round4(slope(i.c, i.x0, 0.01)),
  };
}

const secantTangent: ClipModule<In> = { entry: secantTangentEntry, expectedDisplay };
export default secantTangent;
