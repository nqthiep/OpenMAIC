/**
 * Clip template: a chord of a convex graph lies above it (card 3B-T6), the picture behind Jensen's inequality
 * f(t·x1 + (1−t)·x2) ≤ t·f(x1) + (1−t)·f(x2) for f convex. TypeScript half only (the Manim scene is task 3B-M6).
 * Deterministic and browser-safe (ADR 0006): powers are repeated products, no Math.pow.
 * Curriculum topic `inequality-classic` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Fn = 'x2' | 'abs' | 'x4';
type In = { f: Fn; x1: number; x2: number; t: number };

const inputSpec = {
  kind: 'record',
  fields: {
    f: { kind: 'enum', values: ['x2', 'abs', 'x4'] },
    x1: { kind: 'int', range: [-3, 3] },
    x2: { kind: 'int', range: [-3, 3] },
    t: { kind: 'number', range: [0, 1], step: 0.1 },
  },
} as const;

const f = (fn: Fn, x: number): number =>
  fn === 'x2' ? x * x : fn === 'abs' ? Math.abs(x) : x * x * x * x;
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

/** the point of the graph above the mixture, and the point of the chord at the same x */
const lhs = (i: In): number => f(i.f, i.t * i.x1 + (1 - i.t) * i.x2);
const rhs = (i: In): number => i.t * f(i.f, i.x1) + (1 - i.t) * f(i.f, i.x2);

export const convexChordEntry: ClipEntry<In> = defineClip<In>({
  id: 'convex-chord',
  curriculumTopics: ['m2-inequality-classic'],
  title: m('Dây cung trên đồ thị lồi (Jensen)', 'The chord of a convex graph (Jensen)'),
  inputSpec,
  check: (i) => (i.x1 === i.x2 ? ['x1-equals-x2'] : []),
  presets: [
    {
      id: 'x2-mid',
      label: m('x² giữa dây cung', 'x² at the middle'),
      input: { f: 'x2', x1: -2, x2: 2, t: 0.5 },
    },
    {
      id: 'abs-skew',
      label: m('|x| lệch về một phía', '|x| off centre'),
      input: { f: 'abs', x1: -3, x2: 1, t: 0.3 },
    },
    { id: 'x4', label: m('x⁴', 'x⁴'), input: { f: 'x4', x1: -1, x2: 2, t: 0.5 } },
    {
      id: 't-zero',
      label: m('t = 0 (đầu mút)', 't = 0 (an end)'),
      input: { f: 'x2', x1: -1, x2: 3, t: 0 },
    },
  ],
  chapters: [
    {
      id: 'graph',
      startSec: 0,
      endSec: 9,
      label: m('Đồ thị lồi', 'A convex graph'),
      before: m(
        'Ta vẽ đồ thị của một hàm có hình chiếc bát. Hàm như thế gọi là lồi.',
        'We draw the graph of a function shaped like a bowl. Such a function is called convex.',
      ),
      after: m(
        'Hãy chọn hai điểm x một và x hai trên trục hoành.',
        'Pick two points x one and x two on the horizontal axis.',
      ),
    },
    {
      id: 'chord',
      startSec: 9,
      endSec: 20,
      label: m('Dây cung', 'The chord'),
      before: m(
        'Ta nối hai điểm tương ứng của đồ thị bằng một đoạn thẳng: dây cung.',
        'We join the two matching points of the graph with a straight segment: the chord.',
      ),
      after: m(
        'Giữa hai đầu mút, dây cung đi qua phía nào của đồ thị?',
        'Between the two ends, on which side of the graph does the chord run?',
      ),
      ask: m(
        'Theo em, giữa hai đầu mút, dây cung nằm phía trên hay phía dưới đồ thị?',
        'Between the two ends, does the chord lie above or below the graph?',
      ),
    },
    {
      id: 'point',
      startSec: 20,
      endSec: 34,
      label: m('Điểm chạy', 'The moving point'),
      before: m(
        'Cho t chạy từ 0 đến 1. Điểm trộn t nhân x một cộng một trừ t nhân x hai chạy từ x hai tới x một.',
        'Let t run from 0 to 1. The mixture t times x one plus one minus t times x two travels from x two to x one.',
      ),
      after: m(
        'Tại mỗi t ta so điểm của đồ thị với điểm của dây cung ngay phía trên nó.',
        'At each t we compare the point of the graph with the point of the chord straight above it.',
      ),
      caption: m('t: 0 → 1', 't: 0 → 1'),
      ask: m(
        'Điểm trên dây cung nằm trên hay dưới đồ thị?',
        'Is the point on the chord above or below the graph?',
      ),
    },
    {
      id: 'inequality',
      startSec: 34,
      endSec: 46,
      label: m('Bất đẳng thức', 'The inequality'),
      before: m(
        'Độ cao của đồ thị tại điểm trộn là f của t nhân x một cộng một trừ t nhân x hai. Độ cao của dây cung là t nhân f của x một cộng một trừ t nhân f của x hai.',
        'The height of the graph at the mixture is f of t times x one plus one minus t times x two. The height of the chord is t times f of x one plus one minus t times f of x two.',
      ),
      after: m(
        'Đồ thị không cao hơn dây cung, và đó là bất đẳng thức Jensen cho hàm lồi.',
        'The graph is never higher than the chord, and that is Jensen for a convex function.',
      ),
      caption: m('f(tx₁+(1−t)x₂) ≤ …', 'f(tx₁+(1−t)x₂) ≤ …'),
    },
  ],
  invariants: (i) => {
    const gap = rhs(i) - lhs(i);
    if (gap < -1e-9) return false;
    // at the ends (t = 0 or 1) the two heights coincide; for |x| they also coincide when both points lie on one side of 0
    if (i.t === 0 || i.t === 1) return Math.abs(gap) < 1e-9;
    return true;
  },
  sheet: {
    chapters: [
      {
        id: 'graph',
        shows: m(
          'đồ thị hình bát của x², |x| hoặc x⁴ với hai điểm x₁, x₂ trên trục',
          'the bowl-shaped graph of x², |x| or x⁴ with two points x₁, x₂ on the axis',
        ),
        formulas: ['\\(f(x) = x^2\\)', '\\(f(x) = |x|\\)', '\\(f(x) = x^4\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng bất đẳng thức Jensen đúng với mọi hàm: nó đúng cho hàm lồi; với hàm lõm chiều bất đẳng thức đảo lại.',
            'Thinking Jensen holds for every function: it holds for convex ones; for a concave function the inequality reverses.',
          ),
        ],
        hints: hints(
          'Hàm lồi trông như thế nào?',
          'Như chiếc bát: nối hai điểm bất kỳ của đồ thị, đoạn nối nằm trên đồ thị.',
          'x², |x| và x⁴ đều có dạng đó.',
          'What does a convex function look like?',
          'Like a bowl: join any two points of the graph and the segment lies above the graph.',
          'x², |x| and x⁴ are all like that.',
        ),
      },
      {
        id: 'chord',
        shows: m(
          'đoạn thẳng nối hai điểm của đồ thị',
          'a straight segment joining two points of the graph',
        ),
        formulas: ['\\((x_1, f(x_1))\\)', '\\((x_2, f(x_2))\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng dây cung nằm dưới đồ thị vì đồ thị uốn lên: hàm lồi có dây cung nằm trên.',
            'Thinking the chord is below the graph because the graph curves up: a convex function has its chord above.',
          ),
        ],
        hints: hints(
          'Dây cung nối hai điểm nào?',
          'Hai điểm của đồ thị ứng với x₁ và x₂.',
          'Với hàm hình bát, đoạn nối hai điểm nằm trên đồ thị ở giữa.',
          'Which two points does the chord join?',
          'The two points of the graph over x₁ and x₂.',
          'For a bowl-shaped function the segment lies above the graph in between.',
        ),
      },
      {
        id: 'point',
        shows: m(
          'điểm trộn trên trục và hai điểm thẳng đứng: một trên đồ thị, một trên dây cung',
          'the mixture on the axis and two points straight above it: one on the graph, one on the chord',
        ),
        formulas: ['\\(x = t x_1 + (1 - t) x_2\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng t phải bằng 0,5: t là số bất kỳ trong [0, 1], và 0,5 chỉ cho trung điểm.',
            'Thinking t must be 0.5: t is any number in [0, 1] and 0.5 only gives the midpoint.',
          ),
        ],
        hints: hints(
          'Điểm trộn nằm ở đâu khi t = 0 và khi t = 1?',
          'Khi t = 0 nó ở x₂, khi t = 1 nó ở x₁.',
          'Với t giữa 0 và 1 nó nằm giữa hai điểm.',
          'Where is the mixture when t = 0 and when t = 1?',
          'At x₂ when t = 0, at x₁ when t = 1.',
          'For t between 0 and 1 it lies between the two points.',
        ),
      },
      {
        id: 'inequality',
        shows: m(
          'hai độ cao cạnh nhau với dấu ≤ ở giữa',
          'the two heights side by side with ≤ between them',
        ),
        formulas: ['\\(f(t x_1 + (1 - t) x_2) \\le t f(x_1) + (1 - t) f(x_2)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng dấu bằng chỉ xảy ra khi x₁ = x₂: nó còn xảy ra ở hai đầu mút t = 0 và t = 1.',
            'Thinking equality holds only when x₁ = x₂: it also holds at the two ends t = 0 and t = 1.',
          ),
        ],
        hints: hints(
          'Độ cao của đồ thị so với độ cao của dây cung thế nào?',
          'Không cao hơn: đồ thị nằm dưới hoặc chạm dây cung.',
          'Đó là f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂).',
          'How does the height of the graph compare with that of the chord?',
          'It is no higher: the graph is below or touches the chord.',
          'That is f(t·x₁ + (1 − t)·x₂) ≤ t·f(x₁) + (1 − t)·f(x₂).',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the two heights, rounded to 4 decimals. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { lhs: round4(lhs(i)), rhs: round4(rhs(i)) };
}

const convexChord: ClipModule<In> = { entry: convexChordEntry, expectedDisplay };
export default convexChord;
