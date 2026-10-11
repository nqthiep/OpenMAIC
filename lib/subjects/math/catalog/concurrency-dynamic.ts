/**
 * Walkthrough entry: Concurrent lines while a vertex moves (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m1-triangle-geometry`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import {
  Figure,
  boundsOf,
  frac,
  framePut,
  type FigState,
  type Pt,
} from '@/lib/subjects/math/figure';

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
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
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
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Tam giác', 'The triangle'),
    narration: m(
      'Ta bắt đầu với tam giác ABC. Đỉnh C sẽ chạy trên một đường thẳng, còn A và B đứng yên. Ta sẽ theo dõi ba đường đặc biệt của tam giác này khi nó thay đổi.',
      'We start with the triangle ABC. The vertex C will run along a line while A and B stay fixed. We will follow three special lines of this triangle as it changes.',
    ),
    hints: [
      m(
        'C chạy song song với AB thì điều gì không đổi?',
        'If C runs parallel to AB, what stays the same?',
      ),
      m('Khoảng cách từ C tới AB, tức chiều cao.', 'The distance from C to AB, the height.'),
      m(
        'Nên diện tích không đổi và tam giác không bao giờ suy biến.',
        'So the area is constant and the triangle never degenerates.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng khi C chạy thì tam giác vẫn đồng dạng với ban đầu: hình dạng thay đổi, chỉ chiều cao giữ nguyên.',
        'Thinking the triangle stays similar to the first one as C moves: the shape changes, only the height is kept.',
      ),
    ],
  },
  {
    id: 'lines',
    label: m('Ba đường', 'The three lines'),
    narration: m(
      'Ta vẽ ba đường của tâm đã chọn, mỗi đường gắn với một đỉnh hoặc một cạnh. Ba đường thẳng tuỳ ý thường tạo thành một tam giác nhỏ.',
      'We draw the three lines of the chosen center, each tied to a vertex or a side. Three arbitrary lines usually form a small triangle.',
    ),
    ask: {
      text: m(
        'Theo em, ba đường này có gặp nhau tại một điểm không?',
        'Do these three lines meet at one point?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Gặp nhau tại một điểm', 'They meet at one point'),
          m('Tạo thành một tam giác nhỏ', 'They form a small triangle'),
        ],
        answer: () => 0,
      },
    },
    hints: [
      m('Mỗi đường được định nghĩa bởi tính chất nào?', 'Which property defines each line?'),
      m(
        'Đường cao vuông góc với cạnh, trung tuyến qua trung điểm, trung trực vuông góc tại trung điểm, phân giác chia đôi góc.',
        'An altitude is perpendicular to a side, a median passes through a midpoint, a perpendicular bisector is perpendicular at the midpoint, a bisector halves an angle.',
      ),
      m(
        'Mỗi tâm đúng với một loại đường; ba đường cùng loại đồng quy.',
        'Each center goes with one kind of line; three lines of the same kind are concurrent.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ba đường thẳng bất kỳ luôn đồng quy: thường chúng tạo thành một tam giác nhỏ.',
        'Thinking any three lines are concurrent: usually they form a small triangle.',
      ),
    ],
  },
  {
    id: 'meet',
    label: m('Gặp nhau', 'They meet'),
    narration: m(
      'Ta phóng to chỗ giao: ba đường đi qua đúng một điểm, không tạo ra tam giác nhỏ nào. Điểm đó là tâm của tam giác, và ta đánh dấu nó.',
      'We zoom in on the crossing: the three lines pass through exactly one point and form no small triangle. That point is the center of the triangle, and we mark it.',
    ),
    hints: [
      m(
        'Hai đường cắt nhau tại một điểm; đường thứ ba có đi qua điểm đó không?',
        'Two lines meet at one point; does the third pass through it?',
      ),
      m(
        'Có, đây là một định lý chứ không phải trùng hợp.',
        'Yes, this is a theorem, not a coincidence.',
      ),
      m(
        'Điều đó được chứng minh cho mọi tam giác, kể cả tam giác tù.',
        'It is proved for every triangle, obtuse ones too.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tâm là giao của hai đường và đường thứ ba chỉ gần đúng đi qua: nó đi qua chính xác.',
        'Thinking the center is where two lines meet and the third only roughly passes there: it passes exactly.',
      ),
    ],
  },
  {
    id: 'move',
    label: m('Đỉnh C chạy', 'Vertex C moves'),
    narration: m(
      'Bây giờ ta cho đỉnh C chạy song song với AB. Ba đường và tâm di chuyển theo. Dù tam giác đổi hình, ba đường vẫn luôn gặp nhau tại một điểm.',
      'Now we let the vertex C run parallel to AB. The three lines and the center move along. Whatever shape the triangle takes, the three lines still meet at one point.',
    ),
    ask: {
      text: m(
        'Khi C chạy khắp đường song song với AB, tâm có luôn nằm trong tam giác không?',
        'As C runs along the whole line parallel to AB, does the center always stay inside the triangle?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Luôn nằm trong', 'Always inside'), m('Có lúc ra ngoài', 'Sometimes outside')],
        // the orthocenter and the circumcenter leave the triangle once it is obtuse; the centroid and the incenter never do
        answer: (frame) => (frame.meta.vars as { ev: number }).ev,
      },
    },
    hints: [
      m(
        'Khi C chạy, những gì thay đổi và những gì không?',
        'As C moves, what changes and what does not?',
      ),
      m(
        'Hình dạng và vị trí tâm thay đổi; tính đồng quy thì không.',
        'The shape and the position of the center change; the concurrency does not.',
      ),
      m(
        'Tâm có thể ra ngoài tam giác, nhưng ba đường vẫn gặp nhau.',
        'The center may leave the triangle, but the three lines still meet.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tâm luôn nằm trong tam giác: trực tâm và tâm ngoại tiếp có thể nằm ngoài.',
        'Thinking the center always lies inside the triangle: the orthocenter and the circumcenter may lie outside.',
      ),
    ],
  },
  {
    id: 'special',
    label: m('Trường hợp riêng', 'A special case'),
    narration: m(
      'Ta dừng ở một vị trí đặc biệt của C, nơi tâm rơi ra ngoài tam giác hoặc trùng với một đỉnh. Tâm có thể nằm ngoài tam giác, nhưng ba đường vẫn đồng quy.',
      'We stop at a special position of C, where the center falls outside the triangle or onto a vertex. The center may lie outside the triangle, yet the three lines are still concurrent.',
    ),
    hints: [
      m('Trực tâm của tam giác vuông ở đâu?', 'Where is the orthocenter of a right triangle?'),
      m(
        'Tại đỉnh góc vuông, vì hai cạnh góc vuông đã là hai đường cao.',
        'At the right-angle vertex, since the two legs are already two altitudes.',
      ),
      m(
        'Với tam giác tù, các đường cao gặp nhau trên phần kéo dài, nên ngoài tam giác.',
        'In an obtuse triangle the altitudes meet on their extensions, outside the triangle.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng trực tâm luôn nằm trong tam giác: chỉ với tam giác nhọn; tam giác vuông cho trực tâm tại đỉnh, tam giác tù cho trực tâm ngoài.',
        'Thinking the orthocenter is always inside the triangle: only for an acute one; a right triangle puts it at a vertex, an obtuse one outside.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Dù tam giác đổi hình khi C chạy, ba đường vẫn luôn gặp nhau tại một điểm: đó là định lý đúng với mọi tam giác. Đổi mẫu để thử bốn loại tâm và các tam giác nhọn, vuông, tù.',
      'Whatever shape the triangle takes as C runs, the three lines always meet at one point: a theorem for every triangle. Change the preset to try the four centers and acute, right and obtuse triangles.',
    ),
    hints: [
      m(
        'Ba đường có còn gặp nhau khi tam giác đổi hình?',
        'Do the three lines still meet when the triangle changes shape?',
      ),
      m('Có, đó là định lý đúng với mọi tam giác.', 'Yes, it is a theorem for every triangle.'),
      m(
        'Tâm có thể nằm ngoài tam giác (trực tâm, tâm ngoại tiếp) nhưng ba đường vẫn đồng quy.',
        'The center may lie outside the triangle (orthocenter, circumcenter) yet the three lines are still concurrent.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng ba đường đồng quy chỉ với tam giác nhọn: với tam giác tù chúng gặp nhau trên phần kéo dài.',
        'Thinking the three lines are concurrent only in an acute triangle: in an obtuse one they meet on the extensions.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Tam giác ABC với A = ({x1}, {y1}), B = ({x2}, {y2}), C = ({x3}, {y3}). Đỉnh C sẽ chạy trên đường song song với AB, còn A và B đứng yên.',
    'The triangle ABC with A = ({x1}, {y1}), B = ({x2}, {y2}), C = ({x3}, {y3}). The vertex C will run along a line parallel to AB while A and B stay fixed.',
  ),
  lines: m(
    'Vẽ ba {lines} của tam giác: mỗi đường gắn với một đỉnh hoặc một cạnh. Ba đường bất kỳ thường tạo thành một tam giác nhỏ.',
    'Draw the three {lines} of the triangle, each tied to a vertex or a side. Three arbitrary lines usually form a small triangle.',
  ),
  meet: m(
    'Ba {lines} đi qua đúng một điểm {cl}: đó là {center} của tam giác. Đây là định lý, không phải trùng hợp.',
    'The three {lines} pass through exactly one point {cl}: the {center} of the triangle. This is a theorem, not a coincidence.',
  ),
  move: {
    in: m(
      'C = ({cx}, {cy}): ba {lines} vẫn gặp nhau tại {cl}, nằm trong tam giác.',
      'C = ({cx}, {cy}): the three {lines} still meet at {cl}, inside the triangle.',
    ),
    on: m(
      'C = ({cx}, {cy}): tam giác vuông, ba {lines} vẫn gặp nhau tại {cl}, nằm trên tam giác (ở một đỉnh hoặc trên một cạnh).',
      'C = ({cx}, {cy}): a right triangle, the three {lines} still meet at {cl}, on the triangle (at a vertex or on a side).',
    ),
    out: m(
      'C = ({cx}, {cy}): tam giác tù, {cl} nằm ngoài tam giác nhưng ba {lines} vẫn gặp nhau tại đó.',
      'C = ({cx}, {cy}): an obtuse triangle, {cl} lies outside it but the three {lines} still meet there.',
    ),
  },
  special: {
    in: m(
      'C chạy xa tới ({cx}, {cy}): {cl} vẫn nằm trong tam giác, ba {lines} vẫn đồng quy.',
      'C runs far to ({cx}, {cy}): {cl} stays inside the triangle and the three {lines} are still concurrent.',
    ),
    on: m(
      'C = ({cx}, {cy}): tam giác vuông, {cl} nằm trên tam giác (ở đỉnh góc vuông hoặc trung điểm cạnh huyền).',
      'C = ({cx}, {cy}): a right triangle, {cl} lies on it (at the right-angle vertex or the midpoint of the hypotenuse).',
    ),
    out: m(
      'C = ({cx}, {cy}): tam giác tù nên {cl} rơi ra ngoài tam giác, nhưng ba {lines} vẫn đồng quy.',
      'C = ({cx}, {cy}): the triangle is obtuse so {cl} falls outside it, but the three {lines} are still concurrent.',
    ),
  },
  done: m(
    'Dù C chạy tới đâu, ba {lines} vẫn gặp nhau tại một điểm {cl}, {center} của tam giác.',
    'Wherever C runs, the three {lines} still meet at one point {cl}, the {center} of the triangle.',
  ),
};

/** the names of each center: its point letter, its name and its three lines, in both languages */
const CENTER: Record<Center, { letter: string; vi: string; en: string; lvi: string; len: string }> =
  {
    orthocenter: {
      letter: 'H',
      vi: 'trực tâm',
      en: 'orthocenter',
      lvi: 'đường cao',
      len: 'altitudes',
    },
    centroid: { letter: 'G', vi: 'trọng tâm', en: 'centroid', lvi: 'trung tuyến', len: 'medians' },
    circumcenter: {
      letter: 'O',
      vi: 'tâm đường tròn ngoại tiếp',
      en: 'circumcenter',
      lvi: 'trung trực',
      len: 'perpendicular bisectors',
    },
    incenter: {
      letter: 'I',
      vi: 'tâm đường tròn nội tiếp',
      en: 'incenter',
      lvi: 'phân giác',
      len: 'angle bisectors',
    },
  };

const dist = (p: Pt, q: Pt): number => Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
const perp = (p: Pt, q: Pt): Pt => [-(q[1] - p[1]), q[0] - p[0]];
const plus = (p: Pt, d: Pt): Pt => [p[0] + d[0], p[1] + d[1]];

/** the foot of the perpendicular from P to the line QR */
function foot(P: Pt, Q: Pt, R: Pt): Pt {
  const d: Pt = [R[0] - Q[0], R[1] - Q[1]];
  const t = ((P[0] - Q[0]) * d[0] + (P[1] - Q[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
  return [Q[0] + t * d[0], Q[1] + t * d[1]];
}

/** the circumcenter, from the two perpendicular bisector equations */
function circumcenter([ax, ay]: Pt, [bx, by]: Pt, [cx, cy]: Pt): Pt {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  return [
    (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d,
    (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  ];
}

/** for each vertex P of the triangle PQR: two points of the line the center is built from (an altitude, a median, a bisector) */
function lineOf(center: Center, P: Pt, Q: Pt, R: Pt): [Pt, Pt] {
  switch (center) {
    case 'orthocenter':
      return [P, foot(P, Q, R)];
    case 'centroid':
      return [P, mid(Q, R)];
    case 'circumcenter': {
      const M = mid(Q, R);
      return [M, plus(M, perp(Q, R))];
    }
    default: {
      // the bisector at P meets QR at D with QD : DR = PQ : PR
      const [pq, pr] = [dist(P, Q), dist(P, R)];
      return [P, [(pr * Q[0] + pq * R[0]) / (pq + pr), (pr * Q[1] + pq * R[1]) / (pq + pr)]];
    }
  }
}

function centerOf(center: Center, A: Pt, B: Pt, C: Pt): Pt {
  if (center === 'centroid') return [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
  const O = circumcenter(A, B, C);
  if (center === 'circumcenter') return O;
  if (center === 'orthocenter')
    return [A[0] + B[0] + C[0] - 2 * O[0], A[1] + B[1] + C[1] - 2 * O[1]]; // Euler: H = A + B + C − 2O
  const [a, b, c] = [dist(B, C), dist(C, A), dist(A, B)];
  return [
    (a * A[0] + b * B[0] + c * C[0]) / (a + b + c),
    (a * A[1] + b * B[1] + c * C[1]) / (a + b + c),
  ];
}

/** where the center is: 'in' the triangle, 'on' it (a vertex or the middle of a side), or 'out'; from integer dot products of the vertices scaled by 4 */
function whereIs(center: Center, A: Pt, B: Pt, C: Pt): 'in' | 'on' | 'out' {
  if (center === 'centroid' || center === 'incenter') return 'in';
  const dot = (P: Pt, Q: Pt, R: Pt): number =>
    (Q[0] - P[0]) * (R[0] - P[0]) + (Q[1] - P[1]) * (R[1] - P[1]);
  const dots = [dot(A, B, C), dot(B, C, A), dot(C, A, B)];
  return dots.some((v) => v < 0) ? 'out' : dots.some((v) => v === 0) ? 'on' : 'in';
}

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { center, x1, y1, x2, y2, x3, y3 } = input;
  const { letter } = CENTER[center];
  const dx = x2 - x1;
  const dy = y2 - y1;
  /** C slid along the line parallel to AB by k quarters of AB (k/4·(B − A)) */
  const cAt = (k: number): Pt => [x3 + (k * dx) / 4, y3 + (k * dy) / 4];
  /** the same, scaled by 4 so that every coordinate is an integer */
  const scaled = (k: number): [Pt, Pt, Pt] => [
    [4 * x1, 4 * y1],
    [4 * x2, 4 * y2],
    [4 * x3 + k * dx, 4 * y3 + k * dy],
  ];
  const A: Pt = [x1, y1];
  const B: Pt = [x2, y2];
  const named = (t: Messages): Messages => ({
    'vi-VN': t['vi-VN']
      .replaceAll('{center}', CENTER[center].vi)
      .replaceAll('{lines}', CENTER[center].lvi),
    'en-US': t['en-US']
      .replaceAll('{center}', CENTER[center].en)
      .replaceAll('{lines}', CENTER[center].len),
  });
  const ks = [-2, -1, 1, 2, 3];
  /** the size of the picture of the triangle with C at k quarters, centre included */
  const extent = (k: number): number => {
    const all = [A, B, cAt(k), centerOf(center, A, B, cAt(k))];
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  };
  /** the special position: an obtuse triangle (the orthocenter and the circumcenter are outside) of the smallest picture; C far to the right otherwise */
  const outs = Array.from({ length: 17 }, (_, i) => i - 8).filter(
    (k) => k !== 0 && !ks.includes(k) && whereIs(center, ...scaled(k)) === 'out',
  );
  const specialK =
    outs.length > 0 ? outs.reduce((best, k) => (extent(k) < extent(best) ? k : best)) : 8;
  const used = [0, ...ks, specialK];
  const bounds = boundsOf(
    [A, B, ...used.map(cAt), ...used.map((k) => centerOf(center, A, B, cAt(k)))],
    1,
  );
  const [kLo, kHi] = [Math.min(...used), Math.max(...used)];

  const triangle = (
    C: Pt,
    withLines: boolean,
    withCenter: boolean,
  ): { fig: Figure; marks: Record<string, HighlightKind> } => {
    const G = centerOf(center, A, B, C);
    // a centre on a vertex (right triangle: H = A) shares that vertex's label, not a second one
    const onVertex = (P: Pt): boolean => withCenter && dist(P, G) < 1e-9;
    const fig = new Figure(bounds)
      .point('A', A, onVertex(A) ? `A = ${letter}` : 'A')
      .point('B', B, onVertex(B) ? `B = ${letter}` : 'B')
      .point('C', C, onVertex(C) ? `C = ${letter}` : 'C')
      .polygon('tri', ['A', 'B', 'C']);
    const marks: Record<string, HighlightKind> = { tri: 'group-0', C: 'active' };
    const size = Math.max(dist(A, B), dist(B, C), dist(C, A));
    const [p0, p1] = [cAt(kLo), cAt(kHi)];
    fig.anchor('p0', p0).anchor('p1', p1).seg('path', 'p0', 'p1', { dashed: true });
    marks.path = 'muted';
    if (withLines) {
      const trio: [Pt, Pt, Pt] = [A, B, C];
      [0, 1, 2].forEach((j) => {
        const [P, Q, R] = [trio[j], trio[(j + 1) % 3], trio[(j + 2) % 3]];
        const [u, w] = lineOf(center, P, Q, R);
        // the second anchor is pushed out to about the size of the triangle, so that rounding the anchors never tilts the line
        const k = size / dist(u, w);
        const v: Pt = [u[0] + (w[0] - u[0]) * k, u[1] + (w[1] - u[1]) * k];
        fig.anchor(`l${j}a`, u).anchor(`l${j}b`, v).line(`l${j}`, `l${j}a`, `l${j}b`);
        marks[`l${j}`] = 'compare';
      });
    }
    if (withCenter) {
      fig.point('G', G, [A, B, C].some(onVertex) ? '' : letter);
      marks.G = 'result';
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
  ): void => put(named(text), codeLine, pic.fig, vars, beat, pic.marks);
  const coord = (k: number): { cx: string; cy: string } => ({
    cx: frac(4 * x3 + k * dx, 4),
    cy: frac(4 * y3 + k * dy, 4),
  });
  const ev = center === 'orthocenter' || center === 'circumcenter' ? 1 : 0;
  const here = (k: number, text: Record<'in' | 'on' | 'out', Messages>, beat?: string): void => {
    const w = whereIs(center, ...scaled(k));
    at(text[w], 4, triangle(cAt(k), true, true), { ...coord(k), cl: letter, ev }, beat);
  };

  at(EX.start, 1, triangle(cAt(0), false, false), { x1, y1, x2, y2, x3, y3 }, 'start');
  at(EX.lines, 2, triangle(cAt(0), true, false), { cl: letter }, 'lines');
  at(EX.meet, 3, triangle(cAt(0), true, true), { cl: letter }, 'meet');
  ks.forEach((k, i) => here(k, EX.move, i === 0 ? 'move' : undefined));
  here(specialK, EX.special, 'special');
  at(EX.done, 5, triangle(cAt(specialK), true, true), { cl: letter }, 'done');
}

export const concurrencyDynamicEntry: WalkthroughEntry<In, S> = {
  id: 'concurrency-dynamic',
  entryRev: 3,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-triangle-geometry'],
  title: m('Các đường đồng quy khi đỉnh chạy', 'Concurrent lines while a vertex moves'),
  code: {
    pseudo: [
      'tam giác ABC, đường nét đứt là đường C chạy song song với AB',
      'ba đường cao, trung tuyến, trung trực hoặc phân giác tuỳ chọn',
      'ba đường qua đúng một điểm, được đánh dấu bằng tâm',
      'C trượt song song với AB qua năm vị trí; ba đường và tâm trượt theo',
      'vị trí đặc biệt của C: tam giác tù thì tâm ra ngoài tam giác',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) =>
    (i.x2 - i.x1) * (i.y3 - i.y1) - (i.y2 - i.y1) * (i.x3 - i.x1) === 0
      ? ['degenerate-triangle']
      : [],
  customInput: false,
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
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng khi C chạy thì tam giác vẫn đồng dạng với ban đầu: hình dạng thay đổi, chỉ chiều cao giữ nguyên.',
        'Thinking the triangle stays similar to the first one as C moves: the shape changes, only the height is kept.',
      ),
    },
    {
      beat: 'lines',
      text: m(
        'Nghĩ rằng ba đường thẳng bất kỳ luôn đồng quy: thường chúng tạo thành một tam giác nhỏ.',
        'Thinking any three lines are concurrent: usually they form a small triangle.',
      ),
    },
    {
      beat: 'meet',
      text: m(
        'Nghĩ rằng tâm là giao của hai đường và đường thứ ba chỉ gần đúng đi qua: nó đi qua chính xác.',
        'Thinking the center is where two lines meet and the third only roughly passes there: it passes exactly.',
      ),
    },
    {
      beat: 'move',
      text: m(
        'Nghĩ rằng tâm luôn nằm trong tam giác: trực tâm và tâm ngoại tiếp có thể nằm ngoài.',
        'Thinking the center always lies inside the triangle: the orthocenter and the circumcenter may lie outside.',
      ),
    },
    {
      beat: 'special',
      text: m(
        'Nghĩ rằng trực tâm luôn nằm trong tam giác: chỉ với tam giác nhọn; tam giác vuông cho trực tâm tại đỉnh, tam giác tù cho trực tâm ngoài.',
        'Thinking the orthocenter is always inside the triangle: only for an acute one; a right triangle puts it at a vertex, an obtuse one outside.',
      ),
    },
  ],
  maxFrames: 12,
  maxBytes: 200_000,
  run,
};
