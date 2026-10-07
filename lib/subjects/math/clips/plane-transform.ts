/**
 * Clip template: transformations of the plane and complex multiplication (card 3D-T1): a rotation by 90°, a
 * reflection in the x axis and a homothety of ratio 2 act on a triangle; multiplying by i is the rotation.
 * TypeScript half only (the Manim scene is task 3D-M1). Deterministic and browser-safe (ADR 0006): integers only.
 * Curriculum topic `vector-transform-complex` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Mode = 'rotate90' | 'reflect-x' | 'homothety2' | 'mult-i';
type In = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; mode: Mode };
type Pt = [number, number];

const inputSpec = {
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
} as const;

const z = (x: number): number => (x === 0 ? 0 : x);
const vertices = (i: In): [Pt, Pt, Pt] => [
  [i.x1, i.y1],
  [i.x2, i.y2],
  [i.x3, i.y3],
];
/** twice the signed area of a triangle */
const area2 = ([A, B, C]: [Pt, Pt, Pt]): number =>
  (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);

/** Where a point goes. `mult-i` multiplies the complex number x + iy by i: (x + iy)·i = −y + ix. */
export function apply(mode: Mode, [x, y]: Pt): Pt {
  switch (mode) {
    case 'rotate90':
      return [z(-y), z(x)];
    case 'reflect-x':
      return [z(x), z(-y)];
    case 'homothety2':
      return [2 * x, 2 * y];
    default:
      return [z(-y), z(x)]; // mult-i
  }
}

export const planeTransformEntry: ClipEntry<In> = defineClip<In>({
  id: 'plane-transform',
  curriculumTopics: ['vector-transform-complex'],
  title: m('Phép biến hình và nhân số phức', 'Plane transformations and complex multiplication'),
  inputSpec,
  check: (i) => (area2(vertices(i)) === 0 ? ['degenerate-triangle'] : []),
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
  chapters: [
    {
      id: 'shape',
      startSec: 0,
      endSec: 9,
      label: m('Hình ban đầu', 'The first figure'),
      before: m(
        'Ta bắt đầu với một tam giác trên mặt phẳng toạ độ. Ta sẽ biến đổi từng đỉnh của nó.',
        'We start with a triangle on the coordinate plane. We will transform each of its vertices.',
      ),
      after: m(
        'Ta ghi lại toạ độ ba đỉnh để so sánh sau.',
        'We note the coordinates of the three vertices to compare later.',
      ),
    },
    {
      id: 'transform',
      startSec: 9,
      endSec: 21,
      label: m('Biến đổi', 'The transformation'),
      before: m(
        'Ta áp dụng phép biến hình lên cả ba đỉnh và nối ba điểm mới thành tam giác ảnh.',
        'We apply the transformation to all three vertices and join the three new points into the image triangle.',
      ),
      after: m(
        'Tam giác ảnh xuất hiện cạnh tam giác ban đầu.',
        'The image triangle appears beside the original one.',
      ),
      ask: m(
        'Theo em, tam giác ảnh có giống tam giác ban đầu không?',
        'Does the image triangle look like the original one?',
      ),
    },
    {
      id: 'invariants',
      startSec: 21,
      endSec: 34,
      label: m('Cái gì không đổi', 'What stays the same'),
      before: m(
        'Ta đo độ dài các cạnh và diện tích của hai tam giác rồi so sánh.',
        'We measure the side lengths and the areas of the two triangles and compare them.',
      ),
      after: m(
        'Có phép giữ nguyên độ dài, có phép nhân độ dài lên.',
        'Some maps keep the lengths, one multiplies them.',
      ),
      caption: m('độ dài, diện tích', 'lengths, area'),
      ask: m('Phép biến hình này có giữ độ dài không?', 'Does this transformation keep lengths?'),
    },
    {
      id: 'complex',
      startSec: 34,
      endSec: 46,
      label: m('Số phức', 'Complex numbers'),
      before: m(
        'Ta coi điểm x, y là số phức x cộng y nhân i, và nhân nó với i.',
        'We read the point x, y as the complex number x plus y times i, and multiply it by i.',
      ),
      after: m(
        'Nhân với i chính là phép quay 90 độ quanh gốc toạ độ.',
        'Multiplying by i is exactly the rotation by 90 degrees about the origin.',
      ),
      caption: m('(x + iy)·i = −y + ix', '(x + iy)·i = −y + ix'),
    },
  ],
  invariants: (i) => {
    const [A, B, C] = vertices(i);
    const [A2, B2, C2] = [A, B, C].map((p) => apply(i.mode, p)) as [Pt, Pt, Pt];
    const d2 = (p: Pt, q: Pt): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    const before = [d2(A, B), d2(B, C), d2(C, A)];
    const after = [d2(A2, B2), d2(B2, C2), d2(C2, A2)];
    const scale = i.mode === 'homothety2' ? 4 : 1; // squared lengths: ×4 for ratio 2
    if (!before.every((v, k) => after[k] === scale * v)) return false;
    // |area| × scale; the reflection reverses the orientation, the other maps keep it
    const sign = i.mode === 'reflect-x' ? -1 : 1;
    if (area2([A2, B2, C2]) !== sign * scale * area2([A, B, C])) return false;
    // multiplying by i is the rotation by 90 degrees
    return (
      i.mode !== 'mult-i' ||
      [A, B, C].every(
        (p) =>
          apply('mult-i', p)[0] === apply('rotate90', p)[0] &&
          apply('mult-i', p)[1] === apply('rotate90', p)[1],
      )
    );
  },
  sheet: {
    chapters: [
      {
        id: 'shape',
        shows: m('tam giác ABC trên lưới toạ độ', 'the triangle ABC on a coordinate grid'),
        formulas: ['\\(A(x_1, y_1),\\ B(x_2, y_2),\\ C(x_3, y_3)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng phép biến hình chỉ đổi vị trí của hình: nó có thể đổi cả kích thước hoặc chiều quay.',
            'Thinking a transformation only moves the figure: it can also change its size or its orientation.',
          ),
        ],
        hints: hints(
          'Một phép biến hình biến mỗi điểm thành gì?',
          'Thành một điểm khác, theo một quy tắc đồng đều cho mọi điểm.',
          'Ta chỉ cần biến ba đỉnh, vì cạnh nối các đỉnh ảnh là ảnh của cạnh.',
          'What does a transformation turn each point into?',
          'Into another point, by one rule that is the same for all points.',
          'We only need to transform the three vertices, since the side between the image vertices is the image of the side.',
        ),
      },
      {
        id: 'transform',
        shows: m(
          'tam giác ảnh A′B′C′ cạnh tam giác ABC',
          'the image triangle A′B′C′ beside the triangle ABC',
        ),
        formulas: [
          '\\((x, y) \\mapsto (-y, x)\\)',
          '\\((x, y) \\mapsto (x, -y)\\)',
          '\\((x, y) \\mapsto (2x, 2y)\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng đối xứng trục giữ chiều quay: nó đảo ngược chiều quay, như ảnh trong gương.',
            'Thinking a reflection keeps the orientation: it reverses it, like a mirror image.',
          ),
        ],
        hints: hints(
          'Quy tắc của phép quay 90° là gì?',
          'Điểm (x, y) đi tới (−y, x).',
          'Đối xứng trục hoành cho (x, −y); vị tự tỉ số 2 cho (2x, 2y).',
          'What is the rule of the rotation by 90°?',
          'The point (x, y) goes to (−y, x).',
          'Reflection in the x axis gives (x, −y); a homothety of ratio 2 gives (2x, 2y).',
        ),
      },
      {
        id: 'invariants',
        shows: m(
          'độ dài các cạnh và diện tích của hai tam giác ghi cạnh nhau',
          'the side lengths and areas of the two triangles written side by side',
        ),
        formulas: ["\\(|A'B'| = |AB|\\)", "\\(|A'B'| = 2|AB|\\)", "\\(S' = 4S\\)"],
        misconceptions: [
          m(
            'Nghĩ rằng vị tự tỉ số 2 nhân diện tích lên 2: diện tích nhân lên 4, bình phương tỉ số.',
            'Thinking a homothety of ratio 2 doubles the area: the area is multiplied by 4, the square of the ratio.',
          ),
        ],
        hints: hints(
          'Phép quay và phép đối xứng làm độ dài các cạnh thế nào?',
          'Giữ nguyên, nên tam giác ảnh bằng tam giác ban đầu.',
          'Vị tự tỉ số 2 nhân độ dài với 2 và diện tích với 4.',
          'What do a rotation and a reflection do to the side lengths?',
          'They keep them, so the image triangle is congruent to the original.',
          'A homothety of ratio 2 multiplies lengths by 2 and the area by 4.',
        ),
      },
      {
        id: 'complex',
        shows: m(
          'điểm x + iy được nhân với i và quay một góc vuông',
          'the point x + iy multiplied by i and turned through a right angle',
        ),
        formulas: ['\\((x + iy)\\,i = -y + ix\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng nhân với i là đối xứng qua trục: nó là phép quay, giữ chiều quay.',
            'Thinking multiplying by i is a reflection: it is a rotation, which keeps the orientation.',
          ),
        ],
        hints: hints(
          'Tính (x + iy)·i bằng cách phân phối.',
          'Được x·i + i²·y, và i² = −1.',
          'Kết quả −y + ix, tức điểm (−y, x): phép quay 90° quanh gốc toạ độ.',
          'Compute (x + iy)·i by distributing.',
          'It gives x·i + i²·y, and i² = −1.',
          'The result is −y + ix, the point (−y, x): the rotation by 90° about the origin.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the area of the triangle before and after (half the cross product). */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  const before = vertices(i);
  const after = before.map((p) => apply(i.mode, p)) as [Pt, Pt, Pt];
  return { areaBefore: Math.abs(area2(before)) / 2, areaAfter: Math.abs(area2(after)) / 2 };
}

const planeTransform: ClipModule<In> = { entry: planeTransformEntry, expectedDisplay };
export default planeTransform;
