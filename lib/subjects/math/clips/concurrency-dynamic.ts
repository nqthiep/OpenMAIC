/**
 * Clip template: the concurrency of altitudes, medians, perpendicular bisectors or angle bisectors, while a vertex
 * runs along a line (card 3B-T3). TypeScript half only (the Manim scene is task 3B-M3). Deterministic and
 * browser-safe (ADR 0006): lengths use Math.sqrt, no trigonometry.
 * Curriculum topic `triangle-geometry` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Center = 'orthocenter' | 'centroid' | 'circumcenter' | 'incenter';
type In = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
  center: Center;
};
type Pt = [number, number];
/** a line a·x + b·y = c with (a, b) of length 1 */
type Line = [number, number, number];

const inputSpec = {
  kind: 'record',
  fields: {
    x1: { kind: 'int', range: [-9, 9] },
    y1: { kind: 'int', range: [-9, 9] },
    x2: { kind: 'int', range: [-9, 9] },
    y2: { kind: 'int', range: [-9, 9] },
    x3: { kind: 'int', range: [-9, 9] },
    y3: { kind: 'int', range: [-9, 9] },
    center: { kind: 'enum', values: ['orthocenter', 'centroid', 'circumcenter', 'incenter'] },
  },
} as const;

const dist = (p: Pt, q: Pt): number => Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
const z = (x: number): number => (x === 0 ? 0 : x); // no -0
const round3 = (x: number): number => z(Math.round(x * 1000) / 1000);
const area2 = (A: Pt, B: Pt, C: Pt): number =>
  (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
const vertices = (i: In): [Pt, Pt, Pt] => [
  [i.x1, i.y1],
  [i.x2, i.y2],
  [i.x3, i.y3],
];

/** The line through `p` with normal `n` (any length). */
function lineThrough(p: Pt, n: Pt): Line {
  const len = Math.sqrt(n[0] * n[0] + n[1] * n[1]);
  const a = n[0] / len;
  const b = n[1] / len;
  return [a, b, a * p[0] + b * p[1]];
}

/** The three lines of the chosen center: altitudes, medians, perpendicular bisectors or angle bisectors. */
export function centerLines(center: Center, A: Pt, B: Pt, C: Pt): [Line, Line, Line] {
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const side = (p: Pt, q: Pt): Pt => [q[0] - p[0], q[1] - p[1]];
  const perp = (d: Pt): Pt => [-d[1], d[0]];
  const trio = ([P, Q, R]: [Pt, Pt, Pt]): [Line, Line, Line] => {
    // for the vertex P and the opposite side QR
    switch (center) {
      case 'orthocenter':
        return [lineThrough(P, side(Q, R)), lineThrough(Q, side(R, P)), lineThrough(R, side(P, Q))];
      case 'centroid':
        return [
          lineThrough(P, perp(side(P, mid(Q, R)))),
          lineThrough(Q, perp(side(Q, mid(R, P)))),
          lineThrough(R, perp(side(R, mid(P, Q)))),
        ];
      case 'circumcenter':
        return [
          lineThrough(mid(Q, R), side(Q, R)),
          lineThrough(mid(R, P), side(R, P)),
          lineThrough(mid(P, Q), side(P, Q)),
        ];
      default: {
        // the bisector at a vertex has the direction (unit vector to one neighbour) + (unit vector to the other)
        const bis = (V: Pt, U: Pt, W: Pt): Line => {
          const du = dist(V, U);
          const dw = dist(V, W);
          const d: Pt = [
            (U[0] - V[0]) / du + (W[0] - V[0]) / dw,
            (U[1] - V[1]) / du + (W[1] - V[1]) / dw,
          ];
          return lineThrough(V, perp(d));
        };
        return [bis(P, Q, R), bis(Q, R, P), bis(R, P, Q)];
      }
    }
  };
  return trio([A, B, C]);
}

/** The determinant of three lines; it is 0 exactly when they pass through one point (or are parallel). */
export function concurrencyDet(lines: readonly [Line, Line, Line]): number {
  const [[a1, b1, c1], [a2, b2, c2], [a3, b3, c3]] = lines;
  return a1 * (b2 * c3 - b3 * c2) - b1 * (a2 * c3 - a3 * c2) + c1 * (a2 * b3 - a3 * b2);
}

/** The center, from closed formulas. */
export function centerOf(center: Center, A: Pt, B: Pt, C: Pt): Pt {
  const [ax, ay] = A;
  const [bx, by] = B;
  const [cx, cy] = C;
  if (center === 'centroid') return [(ax + bx + cx) / 3, (ay + by + cy) / 3];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux =
    ((ax * ax + ay * ay) * (by - cy) +
      (bx * bx + by * by) * (cy - ay) +
      (cx * cx + cy * cy) * (ay - by)) /
    d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) +
      (bx * bx + by * by) * (ax - cx) +
      (cx * cx + cy * cy) * (bx - ax)) /
    d;
  if (center === 'circumcenter') return [ux, uy];
  if (center === 'orthocenter') return [ax + bx + cx - 2 * ux, ay + by + cy - 2 * uy]; // Euler: H = A + B + C - 2O
  const a = dist(B, C);
  const b = dist(C, A);
  const c = dist(A, B);
  const s = a + b + c;
  return [(a * ax + b * bx + c * cx) / s, (a * ay + b * by + c * cy) / s];
}

/** The positions of the running vertex C used by the invariant: C + t·(B − A) keeps the height, so the triangle never degenerates. */
export const MOVE_STEPS = [-0.5, -0.25, 0.25, 0.5, 0.75] as const;

export const concurrencyDynamicEntry: ClipEntry<In> = defineClip<In>({
  id: 'concurrency-dynamic',
  curriculumTopics: ['m1-triangle-geometry'],
  title: m('Các đường đồng quy khi đỉnh chạy', 'Concurrent lines while a vertex moves'),
  inputSpec,
  check: (i) => {
    const [A, B, C] = vertices(i);
    return area2(A, B, C) === 0 ? ['degenerate-triangle'] : [];
  },
  presets: [
    {
      id: 'acute-ortho',
      label: m('Trực tâm, tam giác nhọn', 'Orthocenter, acute'),
      input: { x1: 0, y1: 0, x2: 6, y2: 0, x3: 2, y3: 5, center: 'orthocenter' },
    },
    {
      id: 'obtuse-ortho',
      label: m('Trực tâm, tam giác tù (nằm ngoài)', 'Orthocenter, obtuse (outside)'),
      input: { x1: 0, y1: 0, x2: 6, y2: 0, x3: -2, y3: 2, center: 'orthocenter' },
    },
    {
      id: 'right-ortho',
      label: m('Trực tâm, tam giác vuông (tại đỉnh)', 'Orthocenter, right (at a vertex)'),
      input: { x1: 0, y1: 0, x2: 4, y2: 0, x3: 0, y3: 3, center: 'orthocenter' },
    },
    {
      id: 'scalene-centroid',
      label: m('Trọng tâm', 'Centroid'),
      input: { x1: 0, y1: 0, x2: 7, y2: 1, x3: 2, y3: 6, center: 'centroid' },
    },
    {
      id: 'acute-circum',
      label: m('Tâm đường tròn ngoại tiếp', 'Circumcenter'),
      input: { x1: 0, y1: 0, x2: 6, y2: 0, x3: 2, y3: 5, center: 'circumcenter' },
    },
  ],
  chapters: [
    {
      id: 'triangle',
      startSec: 0,
      endSec: 9,
      label: m('Tam giác', 'The triangle'),
      before: m(
        'Ta bắt đầu với tam giác ABC. Đỉnh C sẽ chạy trên một đường thẳng, còn A và B đứng yên.',
        'We start with the triangle ABC. The vertex C will run along a line while A and B stay fixed.',
      ),
      after: m(
        'Ta sẽ theo dõi ba đường đặc biệt của tam giác này khi nó thay đổi.',
        'We will follow three special lines of this triangle as it changes.',
      ),
    },
    {
      id: 'lines',
      startSec: 9,
      endSec: 21,
      label: m('Ba đường', 'The three lines'),
      before: m(
        'Ta vẽ ba đường của tâm đã chọn, mỗi đường gắn với một đỉnh hoặc một cạnh.',
        'We draw the three lines of the chosen center, each tied to a vertex or a side.',
      ),
      after: m(
        'Ba đường thẳng tuỳ ý thường tạo thành một tam giác nhỏ.',
        'Three arbitrary lines usually form a small triangle.',
      ),
      ask: m(
        'Theo em, ba đường này có gặp nhau tại một điểm không?',
        'Do these three lines meet at one point?',
      ),
    },
    {
      id: 'meet',
      startSec: 21,
      endSec: 32,
      label: m('Gặp nhau', 'They meet'),
      before: m(
        'Ta phóng to chỗ giao: ba đường đi qua đúng một điểm, không tạo ra tam giác nhỏ nào.',
        'We zoom in on the crossing: the three lines pass through exactly one point and form no small triangle.',
      ),
      after: m(
        'Điểm đó là tâm của tam giác, và ta đánh dấu nó.',
        'That point is the center of the triangle, and we mark it.',
      ),
      caption: m('đồng quy', 'concurrent'),
    },
    {
      id: 'move',
      startSec: 32,
      endSec: 48,
      label: m('Đỉnh C chạy', 'Vertex C moves'),
      before: m(
        'Bây giờ ta cho đỉnh C chạy song song với AB. Ba đường và tâm di chuyển theo.',
        'Now we let the vertex C run parallel to AB. The three lines and the center move along.',
      ),
      after: m(
        'Dù tam giác đổi hình, ba đường vẫn luôn gặp nhau tại một điểm.',
        'Whatever shape the triangle takes, the three lines still meet at one point.',
      ),
      ask: m(
        'Khi C chạy, tâm có còn nằm trong tam giác không?',
        'As C moves, does the center stay inside the triangle?',
      ),
    },
    {
      id: 'special',
      startSec: 48,
      endSec: 58,
      label: m('Trường hợp riêng', 'A special case'),
      before: m(
        'Ta dừng ở một vị trí đặc biệt của C, nơi tâm rơi ra ngoài tam giác hoặc trùng với một đỉnh.',
        'We stop at a special position of C, where the center falls outside the triangle or onto a vertex.',
      ),
      after: m(
        'Tâm có thể nằm ngoài tam giác, nhưng ba đường vẫn đồng quy.',
        'The center may lie outside the triangle, yet the three lines are still concurrent.',
      ),
    },
  ],
  invariants: (i) => {
    const [A, B, C] = vertices(i);
    const at = (t: number): [Pt, Pt, Pt] => [
      A,
      B,
      [C[0] + t * (B[0] - A[0]), C[1] + t * (B[1] - A[1])],
    ];
    // the three lines meet at one point now and at five positions of the running vertex
    for (const t of [0, ...MOVE_STEPS]) {
      const [P, Q, R] = at(t);
      const lines = centerLines(i.center, P, Q, R);
      if (Math.abs(concurrencyDet(lines)) >= 1e-6) return false;
      // and the center from the closed formula lies on each of them
      const c = centerOf(i.center, P, Q, R);
      for (const [a, b, d] of lines) if (Math.abs(a * c[0] + b * c[1] - d) >= 1e-6) return false;
    }
    return true;
  },
  sheet: {
    chapters: [
      {
        id: 'triangle',
        shows: m(
          'tam giác ABC, đỉnh C có mũi tên chỉ hướng chạy song song với AB',
          'the triangle ABC, with an arrow on C showing it runs parallel to AB',
        ),
        formulas: ['\\(A,\\ B,\\ C\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng khi C chạy thì tam giác vẫn đồng dạng với ban đầu: hình dạng thay đổi, chỉ chiều cao giữ nguyên.',
            'Thinking the triangle stays similar to the first one as C moves: the shape changes, only the height is kept.',
          ),
        ],
        hints: hints(
          'C chạy song song với AB thì điều gì không đổi?',
          'Khoảng cách từ C tới AB, tức chiều cao.',
          'Nên diện tích không đổi và tam giác không bao giờ suy biến.',
          'If C runs parallel to AB, what stays the same?',
          'The distance from C to AB, the height.',
          'So the area is constant and the triangle never degenerates.',
        ),
      },
      {
        id: 'lines',
        shows: m(
          'ba đường cao, trung tuyến, trung trực hoặc phân giác tuỳ chọn',
          'the three altitudes, medians, perpendicular bisectors or angle bisectors, as chosen',
        ),
        formulas: ['\\(a_1x + b_1y = c_1\\)', '\\(a_2x + b_2y = c_2\\)', '\\(a_3x + b_3y = c_3\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng ba đường thẳng bất kỳ luôn đồng quy: thường chúng tạo thành một tam giác nhỏ.',
            'Thinking any three lines are concurrent: usually they form a small triangle.',
          ),
        ],
        hints: hints(
          'Mỗi đường được định nghĩa bởi tính chất nào?',
          'Đường cao vuông góc với cạnh, trung tuyến qua trung điểm, trung trực vuông góc tại trung điểm, phân giác chia đôi góc.',
          'Mỗi tâm đúng với một loại đường; ba đường cùng loại đồng quy.',
          'Which property defines each line?',
          'An altitude is perpendicular to a side, a median passes through a midpoint, a perpendicular bisector is perpendicular at the midpoint, a bisector halves an angle.',
          'Each center goes with one kind of line; three lines of the same kind are concurrent.',
        ),
      },
      {
        id: 'meet',
        shows: m(
          'chỗ giao được phóng to: ba đường qua một điểm',
          'the crossing zoomed in: three lines through one point',
        ),
        formulas: [
          '\\(\\det \\begin{pmatrix} a_1 & b_1 & c_1 \\\\ a_2 & b_2 & c_2 \\\\ a_3 & b_3 & c_3 \\end{pmatrix} = 0\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng tâm là giao của hai đường và đường thứ ba chỉ gần đúng đi qua: nó đi qua chính xác.',
            'Thinking the center is where two lines meet and the third only roughly passes there: it passes exactly.',
          ),
        ],
        hints: hints(
          'Hai đường cắt nhau tại một điểm; đường thứ ba có đi qua điểm đó không?',
          'Có, đây là một định lý chứ không phải trùng hợp.',
          'Điều đó được chứng minh cho mọi tam giác, kể cả tam giác tù.',
          'Two lines meet at one point; does the third pass through it?',
          'Yes, this is a theorem, not a coincidence.',
          'It is proved for every triangle, obtuse ones too.',
        ),
      },
      {
        id: 'move',
        shows: m(
          'C trượt song song với AB; ba đường và tâm trượt theo',
          'C sliding parallel to AB; the three lines and the center sliding with it',
        ),
        formulas: ['\\(C(t) = C + t\\,(B - A)\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng tâm luôn nằm trong tam giác: trực tâm và tâm ngoại tiếp có thể nằm ngoài.',
            'Thinking the center always lies inside the triangle: the orthocenter and the circumcenter may lie outside.',
          ),
        ],
        hints: hints(
          'Khi C chạy, những gì thay đổi và những gì không?',
          'Hình dạng và vị trí tâm thay đổi; tính đồng quy thì không.',
          'Tâm có thể ra ngoài tam giác, nhưng ba đường vẫn gặp nhau.',
          'As C moves, what changes and what does not?',
          'The shape and the position of the center change; the concurrency does not.',
          'The center may leave the triangle, but the three lines still meet.',
        ),
      },
      {
        id: 'special',
        shows: m(
          'vị trí đặc biệt: tâm ngoài tam giác hoặc trùng với đỉnh góc vuông',
          'a special position: the center outside the triangle or at the right-angle vertex',
        ),
        formulas: ['\\(H = A\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng trực tâm luôn nằm trong tam giác: chỉ với tam giác nhọn; tam giác vuông cho trực tâm tại đỉnh, tam giác tù cho trực tâm ngoài.',
            'Thinking the orthocenter is always inside the triangle: only for an acute one; a right triangle puts it at a vertex, an obtuse one outside.',
          ),
        ],
        hints: hints(
          'Trực tâm của tam giác vuông ở đâu?',
          'Tại đỉnh góc vuông, vì hai cạnh góc vuông đã là hai đường cao.',
          'Với tam giác tù, các đường cao gặp nhau trên phần kéo dài, nên ngoài tam giác.',
          'Where is the orthocenter of a right triangle?',
          'At the right-angle vertex, since the two legs are already two altitudes.',
          'In an obtuse triangle the altitudes meet on their extensions, outside the triangle.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the center, rounded to 3 decimals. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  const [A, B, C] = vertices(i);
  const [cx, cy] = centerOf(i.center, A, B, C);
  return { cx: round3(cx), cy: round3(cy) };
}

const concurrencyDynamic: ClipModule<In> = { entry: concurrencyDynamicEntry, expectedDisplay };
export default concurrencyDynamic;
