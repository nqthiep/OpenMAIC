/**
 * Walkthrough entry: Plane transformations and complex multiplication (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m3-vector-transform-complex`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, boundsOf, framePut, type FigState, type Pt } from '@/lib/subjects/math/figure';

type Mode = 'rotate90' | 'reflect-x' | 'homothety2' | 'mult-i';
type In = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; mode: Mode };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    x1: { kind: 'int', range: [-6, 6] },
    y1: { kind: 'int', range: [-6, 6] },
    x2: { kind: 'int', range: [-6, 6] },
    y2: { kind: 'int', range: [-6, 6] },
    x3: { kind: 'int', range: [-6, 6] },
    y3: { kind: 'int', range: [-6, 6] },
    mode: { kind: 'enum', values: ['rotate90', 'reflect-x', 'homothety2', 'mult-i'] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Hình ban đầu', 'The first figure'),
    narration: m(
      'Ta bắt đầu với một tam giác trên mặt phẳng toạ độ. Ta sẽ biến đổi từng đỉnh của nó. Ta ghi lại toạ độ ba đỉnh để so sánh sau.',
      'We start with a triangle on the coordinate plane. We will transform each of its vertices. We note the coordinates of the three vertices to compare later.',
    ),
    hints: [
      m(
        'Một phép biến hình biến mỗi điểm thành gì?',
        'What does a transformation turn each point into?',
      ),
      m(
        'Thành một điểm khác, theo một quy tắc đồng đều cho mọi điểm.',
        'Into another point, by one rule that is the same for all points.',
      ),
      m(
        'Ta chỉ cần biến ba đỉnh, vì cạnh nối các đỉnh ảnh là ảnh của cạnh.',
        'We only need to transform the three vertices, since the side between the image vertices is the image of the side.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phép biến hình chỉ đổi vị trí của hình: nó có thể đổi cả kích thước hoặc chiều quay.',
        'Thinking a transformation only moves the figure: it can also change its size or its orientation.',
      ),
    ],
  },
  {
    id: 'transform',
    label: m('Biến đổi', 'The transformation'),
    narration: m(
      'Ta áp dụng phép biến hình lên cả ba đỉnh và nối ba điểm mới thành tam giác ảnh. Tam giác ảnh xuất hiện cạnh tam giác ban đầu.',
      'We apply the transformation to all three vertices and join the three new points into the image triangle. The image triangle appears beside the original one.',
    ),
    ask: {
      text: m(
        'Theo em, tam giác ảnh có cùng kích thước với tam giác ban đầu không?',
        'Does the image triangle have the same size as the original one?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Cùng kích thước', 'The same size'),
          m('Khác kích thước, cùng hình dạng', 'A different size, the same shape'),
          m('Khác hình dạng', 'A different shape'),
        ],
        // the lengths are multiplied by k (1 for the rotation, the reflection and the multiplication by i; 2 for the homothety)
        answer: (frame) => ((frame.meta.vars as { k: number }).k === 1 ? 0 : 1),
      },
    },
    hints: [
      m('Quy tắc của phép quay 90° là gì?', 'What is the rule of the rotation by 90°?'),
      m('Điểm (x, y) đi tới (−y, x).', 'The point (x, y) goes to (−y, x).'),
      m(
        'Đối xứng trục hoành cho (x, −y); vị tự tỉ số 2 cho (2x, 2y).',
        'Reflection in the x axis gives (x, −y); a homothety of ratio 2 gives (2x, 2y).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đối xứng trục giữ chiều quay: nó đảo ngược chiều quay, như ảnh trong gương.',
        'Thinking a reflection keeps the orientation: it reverses it, like a mirror image.',
      ),
    ],
  },
  {
    id: 'invariants',
    label: m('Cái gì không đổi', 'What stays the same'),
    narration: m(
      'Ta đo độ dài các cạnh và diện tích của hai tam giác rồi so sánh. Có phép giữ nguyên độ dài, có phép nhân độ dài lên.',
      'We measure the side lengths and the areas of the two triangles and compare them. Some maps keep the lengths, one multiplies them.',
    ),
    ask: {
      text: m(
        'Phép biến hình này có giữ nguyên độ dài các cạnh không?',
        'Does this transformation keep the side lengths?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Có, giữ nguyên', 'Yes, it keeps them'),
          m('Không, nhân lên', 'No, it multiplies them'),
        ],
        answer: (frame) => ((frame.meta.vars as { k: number }).k === 1 ? 0 : 1),
      },
    },
    hints: [
      m(
        'Phép quay và phép đối xứng làm độ dài các cạnh thế nào?',
        'What do a rotation and a reflection do to the side lengths?',
      ),
      m(
        'Giữ nguyên, nên tam giác ảnh bằng tam giác ban đầu.',
        'They keep them, so the image triangle is congruent to the original.',
      ),
      m(
        'Vị tự tỉ số 2 nhân độ dài với 2 và diện tích với 4.',
        'A homothety of ratio 2 multiplies lengths by 2 and the area by 4.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng vị tự tỉ số 2 nhân diện tích lên 2: diện tích nhân lên 4, bình phương tỉ số.',
        'Thinking a homothety of ratio 2 doubles the area: the area is multiplied by 4, the square of the ratio.',
      ),
    ],
  },
  {
    id: 'complex',
    label: m('Số phức', 'Complex numbers'),
    narration: m(
      'Ta coi điểm x, y là số phức x cộng y nhân i, và nhân nó với i. Nhân với i chính là phép quay 90 độ quanh gốc toạ độ.',
      'We read the point x, y as the complex number x plus y times i, and multiply it by i. Multiplying by i is exactly the rotation by 90 degrees about the origin.',
    ),
    hints: [
      m('Tính (x + iy)·i bằng cách phân phối.', 'Compute (x + iy)·i by distributing.'),
      m('Được x·i + i²·y, và i² = −1.', 'It gives x·i + i²·y, and i² = −1.'),
      m(
        'Kết quả −y + ix, tức điểm (−y, x): phép quay 90° quanh gốc toạ độ.',
        'The result is −y + ix, the point (−y, x): the rotation by 90° about the origin.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng nhân với i là đối xứng qua trục: nó là phép quay, giữ chiều quay.',
        'Thinking multiplying by i is a reflection: it is a rotation, which keeps the orientation.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Mỗi phép biến hình đổi toạ độ từng đỉnh bằng một quy tắc. Nhân với i chính là phép quay 90° quanh O, giữ độ dài và chiều quay. Đổi mẫu để so sánh bốn phép.',
      'Each transformation changes the coordinates of every vertex by a rule. Multiplying by i is exactly the rotation by 90° about O, keeping lengths and orientation. Change the preset to compare the four maps.',
    ),
    hints: [
      m(
        'Nhân với i đưa điểm (x, y) tới đâu?',
        'Where does multiplying by i send the point (x, y)?',
      ),
      m('(x + iy)·i = −y + ix.', '(x + iy)·i = −y + ix.'),
      m(
        'Tới (−y, x): phép quay 90° quanh gốc toạ độ.',
        'To (−y, x): the rotation by 90° about the origin.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phép nào giữ độ dài cũng giữ chiều quay: đối xứng giữ độ dài nhưng đảo chiều, chỉ phép quay giữ cả hai.',
        'Thinking every length-keeping map also keeps orientation: a reflection keeps lengths but reverses orientation, only a rotation keeps both.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Tam giác ABC với A = ({x1}, {y1}), B = ({x2}, {y2}), C = ({x3}, {y3}). Ta sẽ áp dụng phép {mode} lên từng đỉnh.',
    'The triangle ABC with A = ({x1}, {y1}), B = ({x2}, {y2}), C = ({x3}, {y3}). We apply the {mode} to each vertex.',
  ),
  move: m(
    'Phép {mode}: {rule}. Đỉnh {P} = ({px}, {py}) tới {P}′ = ({qx}, {qy}).',
    'The {mode}: {rule}. The vertex {P} = ({px}, {py}) goes to {P}′ = ({qx}, {qy}).',
  ),
  moveLast: m(
    'Đỉnh {P} = ({px}, {py}) tới {P}′ = ({qx}, {qy}). Nối ba điểm ảnh thành tam giác ảnh A′B′C′.',
    'The vertex {P} = ({px}, {py}) goes to {P}′ = ({qx}, {qy}). Join the three image points into the image triangle A′B′C′.',
  ),
  lenSame: m(
    'Bình phương cạnh: AB² = {ab2} → {pab2}, BC² = {bc2} → {pbc2}, CA² = {ca2} → {pca2}. Giữ nguyên: phép này giữ độ dài.',
    'Squared sides: AB² = {ab2} → {pab2}, BC² = {bc2} → {pbc2}, CA² = {ca2} → {pca2}. Unchanged: this map keeps lengths.',
  ),
  lenScaled: m(
    'Bình phương cạnh: AB² = {ab2} → {pab2}, BC² = {bc2} → {pbc2}, CA² = {ca2} → {pca2}. Mỗi cái nhân 4: độ dài nhân {k}.',
    'Squared sides: AB² = {ab2} → {pab2}, BC² = {bc2} → {pbc2}, CA² = {ca2} → {pca2}. Each is times 4: lengths times {k}.',
  ),
  areaSame: m(
    'Hai lần diện tích có dấu: {s2} → {ps2}. Giữ nguyên, kể cả dấu: chiều quay của tam giác không đổi.',
    'Twice the signed area: {s2} → {ps2}. Unchanged, sign included: the orientation of the triangle stays.',
  ),
  areaFlip: m(
    'Hai lần diện tích có dấu: {s2} → {ps2}. Độ lớn giữ nguyên nhưng đổi dấu: chiều quay bị đảo ngược như ảnh trong gương.',
    'Twice the signed area: {s2} → {ps2}. The size stays but the sign flips: the orientation is reversed like a mirror image.',
  ),
  areaScaled: m(
    'Hai lần diện tích có dấu: {s2} → {ps2}, nhân 4 (bình phương tỉ số {k}), dấu giữ nguyên.',
    'Twice the signed area: {s2} → {ps2}, times 4 (the square of the ratio {k}), the sign stays.',
  ),
  complex: m(
    'Coi A = ({x1}, {y1}) là số phức {za}: nhân với i được {zi}, tức điểm ({ix}, {iy}). Cả tam giác quay 90° quanh O.',
    'Read A = ({x1}, {y1}) as the complex number {za}: multiplying by i gives {zi}, the point ({ix}, {iy}). The whole triangle turns by 90° about O.',
  ),
  done: m(
    'Phép {mode}: {rule}. Nhân với i chính là phép quay 90° quanh O, giữ độ dài và chiều quay.',
    'The {mode}: {rule}. Multiplying by i is exactly the rotation by 90° about O, keeping lengths and orientation.',
  ),
};

/** how each map is written: the rule on a point, its name in both languages and the factor on lengths */
const MODE: Record<Mode, { rule: string; vi: string; en: string; k: number }> = {
  rotate90: {
    rule: '(x, y) → (−y, x)',
    vi: 'quay 90° quanh O',
    en: 'rotation by 90° about O',
    k: 1,
  },
  'reflect-x': {
    rule: '(x, y) → (x, −y)',
    vi: 'đối xứng qua trục hoành',
    en: 'reflection in the x axis',
    k: 1,
  },
  homothety2: {
    rule: '(x, y) → (2x, 2y)',
    vi: 'vị tự tâm O tỉ số 2',
    en: 'homothety about O of ratio 2',
    k: 2,
  },
  'mult-i': { rule: '(x, y) → (−y, x)', vi: 'nhân với i', en: 'multiplication by i', k: 1 },
};

/** where a point goes (no `-0`); multiplying x + iy by i gives −y + ix, the rotation by 90° */
function apply(mode: Mode, [x, y]: Pt): Pt {
  const z = (v: number): number => (v === 0 ? 0 : v);
  if (mode === 'reflect-x') return [z(x), z(-y)];
  if (mode === 'homothety2') return [2 * x, 2 * y];
  return [z(-y), z(x)];
}
/** the complex number x + yi as text: "3 − 2i" */
const cx = ([x, y]: Pt): string => `${x} ${y < 0 ? '−' : '+'} ${Math.abs(y)}i`;
const d2 = (p: Pt, q: Pt): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
/** twice the signed area of a triangle */
const area2 = (A: Pt, B: Pt, C: Pt): number =>
  (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
const NAMES = ['A', 'B', 'C'] as const;

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { mode } = input;
  const V: [Pt, Pt, Pt] = [
    [input.x1, input.y1],
    [input.x2, input.y2],
    [input.x3, input.y3],
  ];
  const W = V.map((p) => apply(mode, p)) as [Pt, Pt, Pt];
  const I = V.map((p) => apply('mult-i', p)) as [Pt, Pt, Pt];
  const { rule, k } = MODE[mode];
  /** the message with `{mode}` replaced by the name of this map */
  const named = (t: Messages): Messages => ({
    'vi-VN': t['vi-VN'].replace('{mode}', MODE[mode].vi),
    'en-US': t['en-US'].replace('{mode}', MODE[mode].en),
  });
  const bounds = boundsOf([...V, ...W, ...I, [0, 0]], 1.5);
  const base = (): Figure =>
    new Figure(bounds)
      .anchor('ax0', [bounds.xmin, 0])
      .anchor('ax1', [bounds.xmax, 0])
      .anchor('ay0', [0, bounds.ymin])
      .anchor('ay1', [0, bounds.ymax])
      .seg('xaxis', 'ax0', 'ax1', { dashed: true })
      .seg('yaxis', 'ay0', 'ay1', { dashed: true })
      .point('A', V[0], 'A')
      .point('B', V[1], 'B')
      .point('C', V[2], 'C')
      .polygon('tri', ['A', 'B', 'C']);
  /** the first `n` image points `img` with an arrow from each vertex to its image (when it moves); all three draw the image triangle */
  const image = (
    img: readonly Pt[],
    n: number,
    prefix: string,
  ): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const fig = base();
    const marks: Record<string, HighlightKind> = { tri: 'group-0' };
    for (let j = 0; j < n; j++) {
      const id = `${NAMES[j]}2`;
      fig.point(id, img[j], `${NAMES[j]}′`);
      marks[id] = 'result';
      if (img[j][0] !== V[j][0] || img[j][1] !== V[j][1]) {
        fig.seg(`${prefix}${j}`, NAMES[j], id, { arrow: true, dashed: true });
        marks[`${prefix}${j}`] = 'result';
      }
    }
    if (n === 3) {
      fig.polygon('img', ['A2', 'B2', 'C2']);
      marks.img = 'group-1';
    }
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const at = (
    text: Messages,
    codeLine: number,
    pic: { fig: Figure; marks: Record<string, HighlightKind> },
    vars: Record<string, number | string>,
    beat?: string,
  ): void => put(text, codeLine, pic.fig, vars, beat, pic.marks);

  at(
    named(EX.start),
    1,
    { fig: base(), marks: { tri: 'group-0', A: 'active', B: 'active', C: 'active' } },
    { x1: V[0][0], y1: V[0][1], x2: V[1][0], y2: V[1][1], x3: V[2][0], y3: V[2][1] },
    'start',
  );
  for (let j = 1; j <= 3; j++) {
    const [p, q] = [V[j - 1], W[j - 1]];
    at(
      named(j < 3 ? EX.move : EX.moveLast),
      2,
      image(W, j, 'm'),
      { P: NAMES[j - 1], px: p[0], py: p[1], qx: q[0], qy: q[1], rule, k },
      j === 1 ? 'transform' : undefined,
    );
  }
  const [sa, sb, sc] = [d2(V[0], V[1]), d2(V[1], V[2]), d2(V[2], V[0])];
  const [ta, tb, tc] = [d2(W[0], W[1]), d2(W[1], W[2]), d2(W[2], W[0])];
  at(
    k === 1 ? EX.lenSame : EX.lenScaled,
    3,
    image(W, 3, 'm'),
    { ab2: sa, pab2: ta, bc2: sb, pbc2: tb, ca2: sc, pca2: tc, k },
    'invariants',
  );
  const [s2, t2] = [area2(...V), area2(...W)];
  at(k === 2 ? EX.areaScaled : t2 === -s2 ? EX.areaFlip : EX.areaSame, 3, image(W, 3, 'm'), {
    s2,
    ps2: t2,
    k,
  });
  const rot = image(I, 3, 'n');
  at(
    EX.complex,
    4,
    rot,
    { x1: V[0][0], y1: V[0][1], za: cx(V[0]), zi: cx(I[0]), ix: I[0][0], iy: I[0][1] },
    'complex',
  );
  at(named(EX.done), 4, rot, { rule }, 'done');
}

export const planeTransformEntry: WalkthroughEntry<In, S> = {
  id: 'plane-transform',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m3-vector-transform-complex'],
  title: m('Phép biến hình và nhân số phức', 'Plane transformations and complex multiplication'),
  code: {
    pseudo: [
      'tam giác ABC trên lưới toạ độ',
      'tam giác ảnh A′B′C′ cạnh tam giác ABC',
      'độ dài các cạnh và diện tích của hai tam giác ghi cạnh nhau',
      'điểm x + iy được nhân với i và quay một góc vuông',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) =>
    area2([i.x1, i.y1], [i.x2, i.y2], [i.x3, i.y3]) === 0 ? ['degenerate-triangle'] : [],
  customInput: false,
  presets: [
    {
      id: 'rotate90',
      label: m('Quay 90°', 'Rotation by 90°'),
      input: { x1: 1, y1: 0, x2: 4, y2: 1, x3: 2, y3: 3, mode: 'rotate90' },
    },
    {
      id: 'reflect-x',
      label: m('Đối xứng qua trục hoành', 'Reflection in the x axis'),
      input: { x1: 1, y1: 0, x2: 4, y2: 1, x3: 2, y3: 3, mode: 'reflect-x' },
    },
    {
      id: 'homothety2',
      label: m('Vị tự tỉ số 2', 'Homothety of ratio 2'),
      input: { x1: 1, y1: 0, x2: 4, y2: 1, x3: 2, y3: 3, mode: 'homothety2' },
    },
    {
      id: 'mult-i',
      label: m('Nhân với i', 'Multiplying by i'),
      input: { x1: 1, y1: 0, x2: 4, y2: 1, x3: 2, y3: 3, mode: 'mult-i' },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng phép biến hình chỉ đổi vị trí của hình: nó có thể đổi cả kích thước hoặc chiều quay.',
        'Thinking a transformation only moves the figure: it can also change its size or its orientation.',
      ),
    },
    {
      beat: 'transform',
      text: m(
        'Nghĩ rằng đối xứng trục giữ chiều quay: nó đảo ngược chiều quay, như ảnh trong gương.',
        'Thinking a reflection keeps the orientation: it reverses it, like a mirror image.',
      ),
    },
    {
      beat: 'invariants',
      text: m(
        'Nghĩ rằng vị tự tỉ số 2 nhân diện tích lên 2: diện tích nhân lên 4, bình phương tỉ số.',
        'Thinking a homothety of ratio 2 doubles the area: the area is multiplied by 4, the square of the ratio.',
      ),
    },
    {
      beat: 'complex',
      text: m(
        'Nghĩ rằng nhân với i là đối xứng qua trục: nó là phép quay, giữ chiều quay.',
        'Thinking multiplying by i is a reflection: it is a rotation, which keeps the orientation.',
      ),
    },
  ],
  maxFrames: 10,
  maxBytes: 200_000,
  run,
};
