/**
 * Walkthrough entry: Transforming a graph: y = a·f(x − h) + k (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m1-quadratic-vieta`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, curvePieces, framePut, type FigState } from '@/lib/subjects/math/figure';

type Fn = 'x2' | 'abs' | 'x3';
type In = { f: Fn; a: number; h: number; k: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    f: { kind: 'enum', values: ['x2', 'abs', 'x3'] },
    a: { kind: 'int', range: [-3, 3] },
    h: { kind: 'int', range: [-4, 4] },
    k: { kind: 'int', range: [-4, 4] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đồ thị gốc', 'The base graph'),
    narration: m(
      'Ta bắt đầu với đồ thị gốc của hàm f. Ta sẽ biến đổi nó từng bước và theo dõi một điểm đánh dấu. Điểm đánh dấu nằm ở gốc toạ độ của đồ thị gốc.',
      'We start with the base graph of the function f. We will transform it step by step and follow one marked point. The marked point sits at the origin of the base graph.',
    ),
    hints: [
      m('Điểm đánh dấu ở đâu trên đồ thị gốc?', 'Where is the marked point on the base graph?'),
      m(
        'Tại (0, f(0)), tức gốc toạ độ với cả ba hàm.',
        'At (0, f(0)), the origin for all three functions.',
      ),
      m(
        'Ta sẽ xem điểm này đi đâu sau mỗi biến đổi.',
        'We will see where this point goes after each transformation.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng mỗi hàm có đồ thị riêng không liên quan: các biến đổi cho ta nhiều đồ thị từ một đồ thị gốc.',
        'Thinking each function has an unrelated graph: transformations give many graphs from one base graph.',
      ),
    ],
  },
  {
    id: 'shift-h',
    label: m('Dời ngang', 'Horizontal shift'),
    narration: m(
      'Ta thay x bằng x trừ h trong công thức. Toàn bộ đồ thị trượt theo trục ngang. Giá trị cũ của f tại x không nay xuất hiện tại x bằng h.',
      'We replace x by x minus h in the formula. The whole graph slides along the horizontal axis. The old value of f at x zero now shows up at x equal to h.',
    ),
    ask: {
      text: m(
        'Theo em, với h dương, đồ thị dời sang trái hay sang phải?',
        'With h positive, does the graph move left or right?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Sang trái', 'Left'), m('Sang phải', 'Right')],
        // f(x − h) takes the old value f(0) at x = h: the graph moves right for h > 0
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Muốn f(x − h) cho giá trị cũ f(0), x phải bằng bao nhiêu?',
        'For f(x − h) to give the old value f(0), what must x be?',
      ),
      m('x − h = 0, tức x = h.', 'x − h = 0, so x = h.'),
      m(
        'Điểm cũ ở x = 0 nay ở x = h: dời sang phải h đơn vị khi h dương.',
        'The old point at x = 0 is now at x = h: it moved right by h when h is positive.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng f(x − 2) dời sang trái 2 đơn vị: nó dời sang phải 2 đơn vị, vì cần x lớn hơn 2 để có cùng giá trị.',
        'Thinking f(x − 2) moves left by 2: it moves right by 2, because x must be 2 larger to get the same value.',
      ),
    ],
  },
  {
    id: 'scale',
    label: m('Co giãn và lật', 'Stretch and flip'),
    narration: m(
      'Ta nhân giá trị của hàm với a. Khi a lớn hơn một về độ lớn, đồ thị cao lên và dốc hơn. Nếu a âm, đồ thị còn bị lật qua trục ngang.',
      'We multiply the value of the function by a. When a is bigger than one in size, the graph grows taller and steeper. If a is negative the graph is also flipped over the horizontal axis.',
    ),
    ask: {
      text: m(
        'Khi a âm, điểm Q ở độ cao 1 đi lên hay đi xuống dưới trục ngang?',
        'When a is negative, does the point Q at height 1 go up or down below the horizontal axis?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Lên trên trục ngang', 'Above the axis'),
          m('Xuống dưới trục ngang', 'Below the axis'),
        ],
        // Q goes to height a·1 = a < 0
        answer: () => 1,
      },
    },
    hints: [
      m(
        'Điểm có f(x) = 0 ra sao khi nhân với a?',
        'What happens to a point with f(x) = 0 when we multiply by a?',
      ),
      m('Vẫn bằng 0, nên nó đứng yên.', 'It stays 0, so it does not move.'),
      m(
        'Chỉ các điểm khác không bị kéo giãn theo hệ số a, và đổi phía nếu a âm.',
        'Only the non-zero points are stretched by the factor a, and change side if a is negative.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng a dời đồ thị: a chỉ co giãn và lật; điểm có f = 0 không di chuyển.',
        'Thinking a moves the graph: a only stretches and flips; points with f = 0 do not move.',
      ),
    ],
  },
  {
    id: 'shift-k',
    label: m('Dời dọc', 'Vertical shift'),
    narration: m(
      'Cuối cùng ta cộng k vào mọi giá trị: toàn bộ đồ thị trượt lên khi k dương, xuống khi k âm. Điểm đánh dấu giờ ở vị trí h, k.',
      'Finally we add k to every value: the whole graph moves up when k is positive and down when k is negative. The marked point is now at the position h, k.',
    ),
    hints: [
      m(
        'Điểm (x₀, f(x₀)) đi tới đâu sau cả ba biến đổi?',
        'Where does the point (x₀, f(x₀)) go after all three transformations?',
      ),
      m('x dời h, y nhân a rồi cộng k.', 'x moves by h, y is multiplied by a then k is added.'),
      m(
        'Nó tới (x₀ + h, a·f(x₀) + k), nằm trên đồ thị của hàm mới.',
        'It goes to (x₀ + h, a·f(x₀) + k), which lies on the graph of the new function.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng thứ tự các biến đổi không quan trọng: cộng k trước hay sau khi nhân với a cho kết quả khác nhau.',
        'Thinking the order of the transformations does not matter: adding k before or after multiplying by a gives different results.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Đồ thị mới là y = a·f(x − h) + k: dời ngang h, co giãn và lật theo a, rồi dời dọc k. Thứ tự có ý nghĩa: a nhân trước, k cộng sau. Đổi mẫu có sẵn để xem từng loại biến đổi.',
      'The new graph is y = a·f(x − h) + k: shift by h, stretch and flip by a, then shift by k. The order matters: a multiplies first and k is added after. Change the preset to see each kind of transformation.',
    ),
    hints: [
      m(
        'Điểm O ở gốc toạ độ đi tới đâu sau ba biến đổi?',
        'Where does the origin point O go after the three transformations?',
      ),
      m(
        'x dời h, y nhân a rồi cộng k; với O thì f(0) = 0.',
        'x moves by h, y is multiplied by a then k is added; for O we have f(0) = 0.',
      ),
      m(
        'O tới (h, k) và Q tới (1 + h, a + k), cả hai nằm trên đồ thị mới.',
        'O goes to (h, k) and Q to (1 + h, a + k), both on the new graph.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng k cũng bị nhân với a: trong a·f(x − h) + k thì k được cộng sau khi đã nhân, nên đồ thị dời dọc đúng k đơn vị.',
        'Thinking k is also multiplied by a: in a·f(x − h) + k, k is added after the multiplication, so the graph moves vertically by exactly k units.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Đồ thị gốc y = {eq}. O = (0, 0) và Q = (1, 1) là hai điểm đánh dấu; ta xem chúng đi đâu sau mỗi biến đổi.',
    'The base graph y = {eq}. O = (0, 0) and Q = (1, 1) are the two marked points; we follow where they go after each step.',
  ),
  right: m(
    'Thay x bằng x − {h}: y = {eq}. Đồ thị dời {h} đơn vị sang phải; O tới ({h}, 0), Q tới ({qx}, 1).',
    'Replace x by x − {h}: y = {eq}. The graph moves {h} units to the right; O goes to ({h}, 0), Q to ({qx}, 1).',
  ),
  left: m(
    'Thay x bằng x + {n}: y = {eq}. Đồ thị dời {n} đơn vị sang trái; O tới ({h}, 0), Q tới ({qx}, 1).',
    'Replace x by x + {n}: y = {eq}. The graph moves {n} units to the left; O goes to ({h}, 0), Q to ({qx}, 1).',
  ),
  noShiftH: m(
    'h = 0: đồ thị không dời theo chiều ngang, y = {eq}.',
    'h = 0: the graph does not move horizontally, y = {eq}.',
  ),
  stretch: m(
    'Nhân giá trị với {a}: y = {eq}. Đồ thị cao lên và dốc hơn; Q tới độ cao {qy}, còn O vì f = 0 nên đứng yên.',
    'Multiply the values by {a}: y = {eq}. The graph grows taller and steeper; Q goes to height {qy}, while O stays put because f = 0.',
  ),
  noScale: m('a = 1: đồ thị giữ nguyên, y = {eq}.', 'a = 1: the graph stays the same, y = {eq}.'),
  flat: m(
    'Nhân giá trị với 0: đồ thị dẹt thành trục ngang, y = {eq}. Đây chỉ là bước đi qua khi a âm.',
    'Multiply the values by 0: the graph flattens onto the horizontal axis, y = {eq}. This is only a stop on the way when a is negative.',
  ),
  flip: m(
    'Nhân giá trị với {a}: y = {eq}. Đồ thị bị lật qua trục ngang và kéo giãn {n} lần; Q xuống độ cao {qy}.',
    'Multiply the values by {a}: y = {eq}. The graph is flipped over the horizontal axis and stretched {n} times; Q drops to height {qy}.',
  ),
  up: m(
    'Cộng {k} vào mọi giá trị: y = {eq}. Đồ thị dời {k} đơn vị lên trên; O tới ({h}, {k}).',
    'Add {k} to every value: y = {eq}. The graph moves {k} units up; O goes to ({h}, {k}).',
  ),
  down: m(
    'Trừ {n} khỏi mọi giá trị: y = {eq}. Đồ thị dời {n} đơn vị xuống dưới; O tới ({h}, {k}).',
    'Subtract {n} from every value: y = {eq}. The graph moves {n} units down; O goes to ({h}, {k}).',
  ),
  noShiftK: m(
    'k = 0: đồ thị không dời theo chiều dọc, y = {eq}.',
    'k = 0: the graph does not move vertically, y = {eq}.',
  ),
  done: m(
    'Đồ thị cuối cùng y = {eq}: O đi tới ({h}, {k}) và Q tới ({qx}, {qy}), cả hai nằm trên đồ thị mới.',
    'The final graph is y = {eq}: O goes to ({h}, {k}) and Q to ({qx}, {qy}), both on the new graph.',
  ),
};

const FN = {
  x2: { f: (x: number): number => x * x, sq: '²', abs: false },
  abs: { f: (x: number): number => Math.abs(x), sq: '', abs: true },
  x3: { f: (x: number): number => x * x * x, sq: '³', abs: false },
} as const;

/** y = a·f(x − h) + k written out, e.g. "2(x − 1)² − 3" */
function equation(fn: Fn, a: number, h: number, k: number): string {
  const { sq, abs } = FN[fn];
  const inner = h === 0 ? 'x' : h > 0 ? `x − ${h}` : `x + ${-h}`;
  const core = abs ? `|${inner}|` : h === 0 ? `x${sq}` : `(${inner})${sq}`;
  const coef = a === 1 ? '' : a === -1 ? '−' : a < 0 ? `−${-a}` : `${a}`;
  const lift = k === 0 ? '' : k > 0 ? ` + ${k}` : ` − ${-k}`;
  if (a === 0) return k === 0 ? '0' : `${k}`;
  return `${coef}${core}${lift}`;
}

/** the values from `from` toward `to` one unit at a time, always ending on `to` (so a parameter that does not change still has a frame) */
const walk = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let v = from; v !== to; ) {
    v += to > v ? 1 : -1;
    out.push(v);
  }
  return out.length > 0 ? out : [to];
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { a, h, k } = input;
  const f = FN[input.f].f;
  const bounds = { xmin: -8, xmax: 8, ymin: -8, ymax: 8 };
  const graph =
    (A: number, H: number, K: number) =>
    (x: number): number =>
      A * f(x - H) + K;
  /** the picture of y = A·f(x − H) + K, with `ghost` (the graph before this step) dashed behind it; returns the figure and the ids it drew */
  const draw = (
    A: number,
    H: number,
    K: number,
    ghost?: readonly [number, number, number],
  ): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const fig = new Figure(bounds)
      .anchor('ax0', [-8, 0])
      .anchor('ax1', [8, 0])
      .anchor('ay0', [0, -8])
      .anchor('ay1', [0, 8])
      .seg('xaxis', 'ax0', 'ax1', { dashed: true })
      .seg('yaxis', 'ay0', 'ay1', { dashed: true });
    const marks: Record<string, HighlightKind> = { O: 'active', Q: 'active' };
    if (ghost) {
      curvePieces(graph(...ghost), -8, 8, -8, 8, 160).forEach((pc, i) => {
        fig.polyline(`o${i}`, pc, true);
        marks[`o${i}`] = 'muted';
      });
    }
    curvePieces(graph(A, H, K), -8, 8, -8, 8, 160).forEach((pc, i) => {
      fig.polyline(`g${i}`, pc);
      marks[`g${i}`] = 'result';
    });
    fig.point('O', [H, K], 'O').point('Q', [1 + H, A + K], 'Q');
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const frame = (
    text: Messages,
    codeLine: number,
    A: number,
    H: number,
    K: number,
    n: number,
    ghost: readonly [number, number, number] | undefined,
    beat?: string,
  ): void => {
    const { fig, marks } = draw(A, H, K, ghost);
    put(
      text,
      codeLine,
      fig,
      { eq: equation(input.f, A, H, K), h: H, a: A, k: K, qx: 1 + H, qy: A + K, n },
      beat,
      marks,
    );
  };

  frame(EX.start, 1, 1, 0, 0, 0, undefined, 'start');
  walk(0, h).forEach((H, i) =>
    frame(
      H > 0 ? EX.right : H < 0 ? EX.left : EX.noShiftH,
      2,
      1,
      H,
      0,
      Math.abs(H),
      [1, 0, 0],
      i === 0 ? 'shift-h' : undefined,
    ),
  );
  walk(1, a).forEach((A, i) =>
    frame(
      A < 0 ? EX.flip : A === 0 ? EX.flat : A === 1 ? EX.noScale : EX.stretch,
      3,
      A,
      h,
      0,
      Math.abs(A),
      [1, h, 0],
      i === 0 ? 'scale' : undefined,
    ),
  );
  walk(0, k).forEach((K, i) =>
    frame(
      K > 0 ? EX.up : K < 0 ? EX.down : EX.noShiftK,
      4,
      a,
      h,
      K,
      Math.abs(K),
      [a, h, 0],
      i === 0 ? 'shift-k' : undefined,
    ),
  );
  frame(EX.done, 4, a, h, k, 0, undefined, 'done');
}

export const graphTransformEntry: WalkthroughEntry<In, S> = {
  id: 'graph-transform',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-quadratic-vieta'],
  title: m('Biến đổi đồ thị: y = a·f(x − h) + k', 'Transforming a graph: y = a·f(x − h) + k'),
  code: {
    pseudo: [
      'đồ thị gốc của x², |x| hoặc x³ và hai điểm đánh dấu O, Q',
      'đồ thị trượt ngang từng đơn vị: O tới (h, 0), Q tới (1 + h, 1)',
      'đồ thị co giãn theo chiều dọc và lật nếu a âm: Q tới độ cao a',
      'đồ thị trượt dọc: O tới (h, k), Q tới (1 + h, a + k)',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => (i.a === 0 ? ['a-is-zero'] : []),
  customInput: false,
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
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng mỗi hàm có đồ thị riêng không liên quan: các biến đổi cho ta nhiều đồ thị từ một đồ thị gốc.',
        'Thinking each function has an unrelated graph: transformations give many graphs from one base graph.',
      ),
    },
    {
      beat: 'shift-h',
      text: m(
        'Nghĩ rằng f(x − 2) dời sang trái 2 đơn vị: nó dời sang phải 2 đơn vị, vì cần x lớn hơn 2 để có cùng giá trị.',
        'Thinking f(x − 2) moves left by 2: it moves right by 2, because x must be 2 larger to get the same value.',
      ),
    },
    {
      beat: 'scale',
      text: m(
        'Nghĩ rằng a dời đồ thị: a chỉ co giãn và lật; điểm có f = 0 không di chuyển.',
        'Thinking a moves the graph: a only stretches and flips; points with f = 0 do not move.',
      ),
    },
    {
      beat: 'shift-k',
      text: m(
        'Nghĩ rằng thứ tự các biến đổi không quan trọng: cộng k trước hay sau khi nhân với a cho kết quả khác nhau.',
        'Thinking the order of the transformations does not matter: adding k before or after multiplying by a gives different results.',
      ),
    },
  ],
  maxFrames: 16,
  maxBytes: 200_000,
  run,
};
