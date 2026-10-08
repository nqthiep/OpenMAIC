/**
 * Clip template: transformations of a graph, y = a·f(x − h) + k (card 3B-T7). TypeScript half only (the Manim scene
 * is task 3B-M7). Deterministic and browser-safe (ADR 0006): powers are repeated products, no Math.pow.
 * Curriculum topic `quadratic-vieta` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Fn = 'x2' | 'abs' | 'x3';
type In = { f: Fn; a: number; h: number; k: number };

const inputSpec = {
  kind: 'record',
  fields: {
    f: { kind: 'enum', values: ['x2', 'abs', 'x3'] },
    a: { kind: 'int', range: [-3, 3] },
    h: { kind: 'int', range: [-4, 4] },
    k: { kind: 'int', range: [-4, 4] },
  },
} as const;

const base = (fn: Fn, x: number): number =>
  fn === 'x2' ? x * x : fn === 'abs' ? Math.abs(x) : x * x * x;
/** the transformed function g(x) = a·f(x − h) + k */
const g = (i: In, x: number): number => i.a * base(i.f, x - i.h) + i.k;
/** where the point (x0, f(x0)) of the base graph goes */
const image = (i: In, x0: number): [number, number] => [x0 + i.h, i.a * base(i.f, x0) + i.k];
/** the sample points of the invariant */
export const SAMPLE_X = [-2, -1, 0, 1, 2] as const;

export const graphTransformEntry: ClipEntry<In> = defineClip<In>({
  id: 'graph-transform',
  curriculumTopics: ['m1-quadratic-vieta'],
  title: m('Biến đổi đồ thị: y = a·f(x − h) + k', 'Transforming a graph: y = a·f(x − h) + k'),
  inputSpec,
  check: (i) => (i.a === 0 ? ['a-is-zero'] : []),
  presets: [
    {
      id: 'shift',
      label: m('x² dời sang (2, −1)', 'x² shifted by (2, −1)'),
      input: { f: 'x2', a: 1, h: 2, k: -1 },
    },
    {
      id: 'stretch',
      label: m('x² nhân 2', 'x² stretched by 2'),
      input: { f: 'x2', a: 2, h: 0, k: 0 },
    },
    {
      id: 'reflect',
      label: m('−|x − 1| + 2 (lật)', '−|x − 1| + 2 (reflected)'),
      input: { f: 'abs', a: -1, h: 1, k: 2 },
    },
    {
      id: 'identity',
      label: m('x³ (không đổi)', 'x³ (unchanged)'),
      input: { f: 'x3', a: 1, h: 0, k: 0 },
    },
  ],
  chapters: [
    {
      id: 'base',
      startSec: 0,
      endSec: 9,
      label: m('Đồ thị gốc', 'The base graph'),
      before: m(
        'Ta bắt đầu với đồ thị gốc của hàm f. Ta sẽ biến đổi nó từng bước và theo dõi một điểm đánh dấu.',
        'We start with the base graph of the function f. We will transform it step by step and follow one marked point.',
      ),
      after: m(
        'Điểm đánh dấu nằm ở gốc toạ độ của đồ thị gốc.',
        'The marked point sits at the origin of the base graph.',
      ),
    },
    {
      id: 'shift-h',
      startSec: 9,
      endSec: 21,
      label: m('Dời ngang', 'Horizontal shift'),
      before: m(
        'Ta thay x bằng x trừ h trong công thức. Toàn bộ đồ thị trượt theo trục ngang.',
        'We replace x by x minus h in the formula. The whole graph slides along the horizontal axis.',
      ),
      after: m(
        'Giá trị cũ của f tại x không nay xuất hiện tại x bằng h.',
        'The old value of f at x zero now shows up at x equal to h.',
      ),
      caption: m('f(x − h)', 'f(x − h)'),
      ask: m(
        'Theo em, với h dương, đồ thị dời sang trái hay sang phải?',
        'With h positive, does the graph move left or right?',
      ),
    },
    {
      id: 'scale',
      startSec: 21,
      endSec: 33,
      label: m('Co giãn và lật', 'Stretch and flip'),
      before: m(
        'Ta nhân giá trị của hàm với a. Khi a lớn hơn một về độ lớn, đồ thị cao lên và dốc hơn.',
        'We multiply the value of the function by a. When a is bigger than one in size, the graph grows taller and steeper.',
      ),
      after: m(
        'Nếu a âm, đồ thị còn bị lật qua trục ngang.',
        'If a is negative the graph is also flipped over the horizontal axis.',
      ),
      caption: m('a · f', 'a · f'),
      ask: m(
        'Khi a âm, đồ thị lật lên hay lật xuống?',
        'When a is negative, does the graph flip up or down?',
      ),
    },
    {
      id: 'shift-k',
      startSec: 33,
      endSec: 44,
      label: m('Dời dọc', 'Vertical shift'),
      before: m(
        'Cuối cùng ta cộng k vào mọi giá trị: toàn bộ đồ thị trượt lên khi k dương, xuống khi k âm.',
        'Finally we add k to every value: the whole graph moves up when k is positive and down when k is negative.',
      ),
      after: m('Điểm đánh dấu giờ ở vị trí h, k.', 'The marked point is now at the position h, k.'),
      caption: m('+ k', '+ k'),
    },
  ],
  invariants: (i) => {
    if (i.a === 0) return false;
    // each point (x0, f(x0)) of the base graph lands on the graph of g, at x0 + h
    for (const x0 of SAMPLE_X) {
      const [px, py] = image(i, x0);
      if (Math.abs(g(i, px) - py) > 1e-9) return false;
    }
    // the origin of the base graph (f(0) = 0 for all three functions) goes to (h, k)
    const [ox, oy] = image(i, 0);
    return ox === i.h && oy === i.k;
  },
  sheet: {
    chapters: [
      {
        id: 'base',
        shows: m(
          'đồ thị gốc của x², |x| hoặc x³ và điểm đánh dấu tại gốc',
          'the base graph of x², |x| or x³ with the marked point at the origin',
        ),
        formulas: ['\\(y = f(x)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng mỗi hàm có đồ thị riêng không liên quan: các biến đổi cho ta nhiều đồ thị từ một đồ thị gốc.',
            'Thinking each function has an unrelated graph: transformations give many graphs from one base graph.',
          ),
        ],
        hints: hints(
          'Điểm đánh dấu ở đâu trên đồ thị gốc?',
          'Tại (0, f(0)), tức gốc toạ độ với cả ba hàm.',
          'Ta sẽ xem điểm này đi đâu sau mỗi biến đổi.',
          'Where is the marked point on the base graph?',
          'At (0, f(0)), the origin for all three functions.',
          'We will see where this point goes after each transformation.',
        ),
      },
      {
        id: 'shift-h',
        shows: m(
          'đồ thị trượt ngang, điểm đánh dấu từ 0 tới h',
          'the graph sliding horizontally, the marked point going from 0 to h',
        ),
        formulas: ['\\(y = f(x - h)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng f(x − 2) dời sang trái 2 đơn vị: nó dời sang phải 2 đơn vị, vì cần x lớn hơn 2 để có cùng giá trị.',
            'Thinking f(x − 2) moves left by 2: it moves right by 2, because x must be 2 larger to get the same value.',
          ),
        ],
        hints: hints(
          'Muốn f(x − h) cho giá trị cũ f(0), x phải bằng bao nhiêu?',
          'x − h = 0, tức x = h.',
          'Điểm cũ ở x = 0 nay ở x = h: dời sang phải h đơn vị khi h dương.',
          'For f(x − h) to give the old value f(0), what must x be?',
          'x − h = 0, so x = h.',
          'The old point at x = 0 is now at x = h: it moved right by h when h is positive.',
        ),
      },
      {
        id: 'scale',
        shows: m(
          'đồ thị co giãn theo chiều dọc và lật nếu a âm',
          'the graph stretched vertically and flipped when a is negative',
        ),
        formulas: ['\\(y = a\\,f(x)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng a dời đồ thị: a chỉ co giãn và lật; điểm có f = 0 không di chuyển.',
            'Thinking a moves the graph: a only stretches and flips; points with f = 0 do not move.',
          ),
        ],
        hints: hints(
          'Điểm có f(x) = 0 ra sao khi nhân với a?',
          'Vẫn bằng 0, nên nó đứng yên.',
          'Chỉ các điểm khác không bị kéo giãn theo hệ số a, và đổi phía nếu a âm.',
          'What happens to a point with f(x) = 0 when we multiply by a?',
          'It stays 0, so it does not move.',
          'Only the non-zero points are stretched by the factor a, and change side if a is negative.',
        ),
      },
      {
        id: 'shift-k',
        shows: m(
          'đồ thị trượt dọc, điểm đánh dấu tại (h, k)',
          'the graph sliding vertically, the marked point at (h, k)',
        ),
        formulas: [
          '\\(y = a\\,f(x - h) + k\\)',
          '\\((x_0, f(x_0)) \\mapsto (x_0 + h,\\ a f(x_0) + k)\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng thứ tự các biến đổi không quan trọng: cộng k trước hay sau khi nhân với a cho kết quả khác nhau.',
            'Thinking the order of the transformations does not matter: adding k before or after multiplying by a gives different results.',
          ),
        ],
        hints: hints(
          'Điểm (x₀, f(x₀)) đi tới đâu sau cả ba biến đổi?',
          'x dời h, y nhân a rồi cộng k.',
          'Nó tới (x₀ + h, a·f(x₀) + k), nằm trên đồ thị của hàm mới.',
          'Where does the point (x₀, f(x₀)) go after all three transformations?',
          'x moves by h, y is multiplied by a then k is added.',
          'It goes to (x₀ + h, a·f(x₀) + k), which lies on the graph of the new function.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: where the marked point (the origin of the base graph) ends up. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  const [x, y] = image(i, 0);
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
}

const graphTransform: ClipModule<In> = { entry: graphTransformEntry, expectedDisplay };
export default graphTransform;
