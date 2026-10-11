/**
 * Walkthrough entry: the three altitudes of a triangle meet at the orthocenter (card 3B-W2).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006). State holds the exact floating-point
 * coordinates (IEEE division of integers, same on every engine); the vars table shows them rounded.
 * Curriculum topic `m1-triangle-geometry` follows the Phase 3 SCHEMA §7 outline [Inference];
 * see docs/tutor/curriculum/curriculum-math-vn.json (its sources are [Unverified]).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };
type S = {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  points: { id: string; x: number; y: number; label: string }[];
  segments: { id: string; from: string; to: string; dashed?: boolean }[];
  lines: { id: string; through: [string, string] }[];
  angles: { id: string; at: string; from: string; to: string; label?: string }[];
};
type Pt = [number, number];

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
/** no `-0` in the data (it hashes as 0 but compares unequal to it) */
const z = (x: number): number => (x === 0 ? 0 : x);
const r2 = (x: number): number => z(Math.round(x * 100) / 100);

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars; no decimals. */
const EX = {
  start: m(
    'Tam giác ABC có A({x1}, {y1}), B({x2}, {y2}), C({x3}, {y3}). Ta dựng ba đường cao và xem chúng gặp nhau thế nào.',
    'Triangle ABC has A({x1}, {y1}), B({x2}, {y2}), C({x3}, {y3}). We draw the three altitudes and see how they meet.',
  ),
  altA: m(
    'Đường cao từ A: đường qua A vuông góc với BC. Chân đường cao là Ha trên đường thẳng BC.',
    'The altitude from A: the line through A perpendicular to BC. Its foot is Ha on the line BC.',
  ),
  altB: m(
    'Đường cao từ B: đường qua B vuông góc với CA. Chân đường cao là Hb trên đường thẳng CA.',
    'The altitude from B: the line through B perpendicular to CA. Its foot is Hb on the line CA.',
  ),
  outside: m(
    ' Chân nằm ngoài đoạn thẳng (tam giác tù).',
    ' The foot is outside the segment (obtuse triangle).',
  ),
  meet: m(
    'Hai đường cao từ A và B cắt nhau tại H. Đường cao thứ ba, từ C, có đi qua H không?',
    'The altitudes from A and B meet at H. Does the third altitude, from C, pass through H?',
  ),
  altC: m(
    'Đường cao từ C vuông góc với AB, chân Hc, và đi qua H: ba đường cao gặp nhau tại một điểm.',
    'The altitude from C is perpendicular to AB, foot Hc, and passes through H: all three meet at one point.',
  ),
  ortho: m(
    'Ba đường cao đồng quy tại H, gọi là trực tâm của tam giác ABC.',
    'The three altitudes are concurrent at H, the orthocenter of triangle ABC.',
  ),
  orthoAcute: m(
    ' Tam giác nhọn nên H nằm trong tam giác.',
    ' The triangle is acute, so H lies inside it.',
  ),
  orthoRight: m(
    ' Tam giác vuông nên H trùng với đỉnh góc vuông.',
    ' The triangle is right-angled, so H is the vertex of the right angle.',
  ),
  orthoObtuse: m(
    ' Tam giác tù nên H nằm ngoài tam giác.',
    ' The triangle is obtuse, so H lies outside it.',
  ),
  done: m(
    'Ba đường cao luôn đồng quy. Trực tâm nằm trong tam giác nhọn, tại đỉnh góc vuông của tam giác vuông, và ngoài tam giác tù.',
    'The three altitudes are always concurrent. The orthocenter is inside an acute triangle, at the right-angle vertex of a right one, outside an obtuse one.',
  ),
};

const hints = (
  a: string,
  b: string,
  c: string,
  ea: string,
  eb: string,
  ec: string,
): readonly [Messages, Messages, Messages] => [m(a, ea), m(b, eb), m(c, ec)];

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Một tam giác có ba đường cao, mỗi đường hạ từ một đỉnh xuống cạnh đối diện và vuông góc với cạnh đó. Ta sẽ dựng chúng một cách có thứ tự và xem chúng gặp nhau ra sao.',
      'A triangle has three altitudes, each dropped from a vertex to the opposite side and perpendicular to it. We draw them in order and see how they meet.',
    ),
    hints: hints(
      'Đường cao đi qua đỉnh nào và vuông góc với gì?',
      'Đi qua một đỉnh, vuông góc với cạnh đối diện (hoặc đường thẳng chứa nó).',
      'Mỗi tam giác có đúng ba đường cao, một đường cho mỗi đỉnh.',
      'Which vertex does an altitude pass through, and what is it perpendicular to?',
      'It passes through one vertex and is perpendicular to the opposite side (or the line holding it).',
      'Every triangle has exactly three altitudes, one for each vertex.',
    ),
    misconceptions: [
      m(
        'Nhầm đường cao với trung tuyến: đường cao vuông góc với cạnh đối diện, còn trung tuyến đi qua trung điểm của nó.',
        'Confusing an altitude with a median: an altitude is perpendicular to the opposite side, a median goes through its midpoint.',
      ),
    ],
  },
  {
    id: 'altitude-a',
    label: m('Đường cao từ A', 'Altitude from A'),
    narration: m(
      'Từ A ta kẻ đường vuông góc với BC. Chân đường cao Ha có toạ độ khoảng ({hax}, {hay}). Dấu góc vuông cho thấy AHa vuông góc với BC.',
      'From A we draw the perpendicular to BC. The foot Ha is at about ({hax}, {hay}). The right-angle mark shows that AHa is perpendicular to BC.',
    ),
    hints: hints(
      'Làm sao dựng đường qua A vuông góc với BC?',
      'Dùng thước ê-ke, hoặc nói rằng hướng của nó vuông góc với hướng của BC.',
      'Chân đường cao là điểm của đường BC gần A nhất; tích vô hướng của AHa với BC bằng 0.',
      'How do we draw the line through A perpendicular to BC?',
      'Use a set square, or say that its direction is perpendicular to the direction of BC.',
      'The foot is the point of line BC nearest to A; the dot product of AHa and BC is 0.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng chân đường cao luôn nằm trên đoạn thẳng đối diện: ở tam giác tù, chân của hai đường cao nằm trên phần kéo dài.',
        'Thinking the foot always lies on the opposite side: in an obtuse triangle the feet of two altitudes lie on the extensions.',
      ),
    ],
  },
  {
    id: 'altitude-b',
    label: m('Đường cao từ B', 'Altitude from B'),
    narration: m(
      'Tương tự, từ B ta kẻ đường vuông góc với CA, chân đường cao Hb khoảng ({hbx}, {hby}). Giờ ta có hai đường cao trên hình.',
      'In the same way, from B we draw the perpendicular to CA, with foot Hb at about ({hbx}, {hby}). Now two altitudes are on the figure.',
    ),
    hints: hints(
      'Làm giống đường cao từ A, nhưng với đỉnh B.',
      'Đường qua B vuông góc với CA.',
      'Chân Hb nằm trên đường thẳng CA, và BHb vuông góc với CA.',
      'Do the same as for A, but with vertex B.',
      'The line through B perpendicular to CA.',
      'The foot Hb lies on line CA, and BHb is perpendicular to CA.',
    ),
    misconceptions: [
      m(
        'Kẻ đường cao từ B vuông góc với AB: phải vuông góc với cạnh đối diện, tức CA.',
        'Drawing the altitude from B perpendicular to AB: it must be perpendicular to the opposite side, CA.',
      ),
    ],
  },
  {
    id: 'predict-meet',
    label: m('Hai đường cắt nhau', 'The two meet'),
    narration: m(
      'Hai đường cao từ A và B cắt nhau tại một điểm H, khoảng ({hx}, {hy}). Câu hỏi hay: đường cao thứ ba, từ C, có đi qua đúng điểm này không?',
      'The altitudes from A and B meet at a point H, about ({hx}, {hy}). A good question: does the third altitude, from C, pass through exactly this point?',
    ),
    ask: {
      text: m(
        'Theo em, đường cao thứ ba có đi qua giao điểm của hai đường đầu không?',
        'Does the third altitude pass through the meeting point of the first two?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có', 'Yes'), m('Không', 'No')],
        // the concurrency of the three altitudes is a theorem: always yes
        answer: () => 0,
      },
    },
    hints: hints(
      'Hai đường thẳng không song song luôn cắt nhau tại một điểm. Còn đường thứ ba thì sao?',
      'Thử vẽ nhiều tam giác khác nhau và kiểm xem đường thứ ba có đi qua điểm đó không.',
      'Có: đây là định lý ba đường cao đồng quy, ta sẽ thấy lý do qua hình.',
      'Two non-parallel lines always meet at a point. What about a third line?',
      'Try several different triangles and check whether the third line goes through that point.',
      'Yes: this is the theorem that the three altitudes are concurrent; we will see why on the figure.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng ba đường thẳng bất kỳ đều đồng quy: thường ba đường tạo thành một tam giác nhỏ; ba đường cao thì đặc biệt.',
        'Thinking any three lines are concurrent: usually three lines form a small triangle; the three altitudes are special.',
      ),
    ],
  },
  {
    id: 'altitude-c',
    label: m('Đường cao từ C', 'Altitude from C'),
    narration: m(
      'Ta kẻ đường cao từ C vuông góc với AB, chân Hc khoảng ({hcx}, {hcy}). Nó đi qua H: đường thứ ba không tạo tam giác nhỏ nào, mà gặp hai đường kia đúng tại H.',
      'We draw the altitude from C perpendicular to AB, with foot Hc at about ({hcx}, {hcy}). It passes through H: the third line makes no small triangle but meets the other two exactly at H.',
    ),
    hints: hints(
      'Vẽ đường qua C vuông góc với AB.',
      'Chân Hc nằm trên đường thẳng AB.',
      'Kiểm tra: H có nằm trên đường này không? Có, nên ba đường đồng quy.',
      'Draw the line through C perpendicular to AB.',
      'The foot Hc lies on line AB.',
      'Check: is H on this line? Yes, so the three lines are concurrent.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng cần kẻ cả ba đường mới tìm được H: hai đường đã đủ, đường thứ ba chỉ để kiểm.',
        'Thinking all three lines are needed to find H: two are enough, the third only checks.',
      ),
    ],
  },
  {
    id: 'orthocenter',
    label: m('Trực tâm', 'The orthocenter'),
    narration: m(
      'Điểm H gọi là trực tâm. Toạ độ của nó khoảng ({hx}, {hy}). Vị trí của H cho biết loại tam giác: trong, trên hay ngoài tam giác.',
      'The point H is called the orthocenter. Its position is about ({hx}, {hy}). Where H lies tells the kind of triangle: inside, at a vertex, or outside.',
    ),
    hints: hints(
      'H nằm ở đâu so với tam giác?',
      'Nó phụ thuộc vào các góc: nhọn thì trong, vuông thì ở đỉnh, tù thì ngoài.',
      'Tam giác tù: H nằm ngoài, ở phần kéo dài của các đường cao.',
      'Where is H relative to the triangle?',
      'It depends on the angles: acute means inside, right means at a vertex, obtuse means outside.',
      'Obtuse triangle: H is outside, on the extensions of the altitudes.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng trực tâm luôn nằm trong tam giác: chỉ đúng với tam giác nhọn.',
        'Thinking the orthocenter is always inside the triangle: that holds only for an acute one.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Ba đường cao luôn đồng quy tại trực tâm, dù tam giác nhọn, vuông hay tù. Lần sau thử kéo một đỉnh và xem H di chuyển ra sao.',
      'The three altitudes always meet at the orthocenter, whether the triangle is acute, right or obtuse. Next time try moving one vertex and watch how H moves.',
    ),
    hints: hints(
      'Định lý nói gì về ba đường cao?',
      'Chúng đồng quy tại một điểm.',
      'Điểm đó là trực tâm, và vị trí của nó cho ta biết loại tam giác.',
      'What does the theorem say about the three altitudes?',
      'They are concurrent at one point.',
      'That point is the orthocenter, and its position tells us the kind of triangle.',
    ),
    misconceptions: [
      m(
        'Nghĩ rằng định lý chỉ đúng cho tam giác nhọn: nó đúng cho mọi tam giác, kể cả tam giác tù.',
        'Thinking the theorem is only for acute triangles: it holds for every triangle, obtuse ones too.',
      ),
    ],
  },
];

const dot = (o: Pt, a: Pt, b: Pt): number =>
  (a[0] - o[0]) * (b[0] - o[0]) + (a[1] - o[1]) * (b[1] - o[1]);

/** The foot of the perpendicular from `p` to the line `q`–`r`. */
function foot(p: Pt, q: Pt, r: Pt): Pt {
  const t = dot(q, p, r) / dot(q, r, r);
  return [q[0] + t * (r[0] - q[0]), q[1] + t * (r[1] - q[1])];
}

/** Points at one position share one label ("A = Hb = H") on the first of them; the rest get none. */
function mergeLabels(points: S['points']): S['points'] {
  const at = (p: S['points'][number], q: S['points'][number]): boolean =>
    Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
  return points.map((p, i) => {
    if (points.slice(0, i).some((q) => at(p, q))) return { ...p, label: '' };
    return {
      ...p,
      label: points
        .filter((q) => at(p, q))
        .map((q) => q.id)
        .join(' = '),
    };
  });
}

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const A: Pt = [input.x1, input.y1];
  const B: Pt = [input.x2, input.y2];
  const C: Pt = [input.x3, input.y3];
  const Ha = foot(A, B, C);
  const Hb = foot(B, C, A);
  const Hc = foot(C, A, B);
  // H solves (H - A)·(C - B) = 0 and (H - B)·(C - A) = 0
  const u: Pt = [C[0] - B[0], C[1] - B[1]];
  const v: Pt = [C[0] - A[0], C[1] - A[1]];
  const det = u[0] * v[1] - u[1] * v[0];
  const au = A[0] * u[0] + A[1] * u[1];
  const bv = B[0] * v[0] + B[1] * v[1];
  const H: Pt = [(au * v[1] - bv * u[1]) / det, (u[0] * bv - v[0] * au) / det];

  // the angle at each vertex, exact in integers: < 0 obtuse, 0 right
  const corner = [dot(A, B, C), dot(B, C, A), dot(C, A, B)];
  const kind = corner.some((c) => c < 0)
    ? 'obtuse'
    : corner.some((c) => c === 0)
      ? 'right'
      : 'acute';

  const all: Pt[] = [A, B, C, Ha, Hb, Hc, H];
  const bounds = {
    xmin: Math.min(...all.map((p) => p[0])) - 1,
    xmax: Math.max(...all.map((p) => p[0])) + 1,
    ymin: Math.min(...all.map((p) => p[1])) - 1,
    ymax: Math.max(...all.map((p) => p[1])) + 1,
  };
  const pt = (id: string, p: Pt) => ({ id, x: z(p[0]), y: z(p[1]), label: id });
  const same = (p: Pt, q: Pt) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;

  const shown = { Ha: false, Hb: false, Hc: false, H: false };
  const alt: Record<string, boolean> = { a: false, b: false, c: false };
  const rv = (p: Pt, name: string): Record<string, number> => ({
    [`${name}x`]: r2(p[0]),
    [`${name}y`]: r2(p[1]),
  });

  const put = (
    text: Messages,
    extraText: Messages | null,
    codeLine: number,
    vars: Record<string, number>,
    tag: string | undefined,
    marks: Record<string, HighlightKind>,
  ): void => {
    const shownPoints = [pt('A', A), pt('B', B), pt('C', C)];
    if (shown.Ha) shownPoints.push(pt('Ha', Ha));
    if (shown.Hb) shownPoints.push(pt('Hb', Hb));
    if (shown.Hc) shownPoints.push(pt('Hc', Hc));
    if (shown.H) shownPoints.push(pt('H', H));
    const points = mergeLabels(shownPoints);
    const segments: S['segments'] = [
      { id: 'AB', from: 'A', to: 'B' },
      { id: 'BC', from: 'B', to: 'C' },
      { id: 'CA', from: 'C', to: 'A' },
    ];
    const lines: S['lines'] = [];
    const angles: S['angles'] = [];
    const draw = (key: string, vertex: string, f: string, fp: Pt, q: string, qp: Pt, r: string) => {
      if (!alt[key]) return;
      lines.push({ id: `l${key}`, through: [vertex, f] });
      segments.push({ id: `h${key}`, from: vertex, to: f, dashed: true });
      // the right angle is drawn between the altitude and a vertex of the base that is not the foot itself
      angles.push({ id: `r${key}`, at: f, from: vertex, to: same(fp, qp) ? r : q, label: '90°' });
    };
    draw('a', 'A', 'Ha', Ha, 'B', B, 'C');
    draw('b', 'B', 'Hb', Hb, 'C', C, 'A');
    draw('c', 'C', 'Hc', Hc, 'A', A, 'B');
    const highlights: Record<string, HighlightKind> = { ...marks };
    emit(
      { bounds, points, segments, lines, angles },
      {
        explanation: fill(
          msg(text, ctx.locale) + (extraText ? msg(extraText, ctx.locale) : ''),
          vars,
        ),
        codeLine,
        highlights,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  const base: Record<string, number> = {
    x1: A[0],
    y1: A[1],
    x2: B[0],
    y2: B[1],
    x3: C[0],
    y3: C[1],
  };
  const outside = (f: Pt, q: Pt, r: Pt): boolean => {
    const t = dot(q, f, r) / dot(q, r, r);
    return t < 0 || t > 1;
  };

  put(EX.start, null, 1, base, 'start', {});
  alt.a = true;
  shown.Ha = true;
  put(EX.altA, outside(Ha, B, C) ? EX.outside : null, 2, rv(Ha, 'ha'), 'altitude-a', {
    la: 'active',
    Ha: 'active',
  });
  alt.b = true;
  shown.Hb = true;
  put(EX.altB, outside(Hb, C, A) ? EX.outside : null, 3, rv(Hb, 'hb'), 'altitude-b', {
    lb: 'active',
    Hb: 'active',
    la: 'visited',
  });
  shown.H = true;
  put(EX.meet, null, 4, rv(H, 'h'), 'predict-meet', { H: 'active', la: 'visited', lb: 'visited' });
  alt.c = true;
  shown.Hc = true;
  put(EX.altC, outside(Hc, A, B) ? EX.outside : null, 5, { ...rv(Hc, 'hc') }, 'altitude-c', {
    lc: 'active',
    Hc: 'active',
    H: 'result',
  });
  put(
    EX.ortho,
    kind === 'acute' ? EX.orthoAcute : kind === 'right' ? EX.orthoRight : EX.orthoObtuse,
    6,
    rv(H, 'h'),
    'orthocenter',
    { H: 'result', la: 'result', lb: 'result', lc: 'result' },
  );
  put(EX.done, null, 6, {}, 'done', { H: 'result' });
}

export const triangleAltitudeEntry: WalkthroughEntry<In, S> = {
  id: 'triangle-altitude',
  entryRev: 3,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m1-triangle-geometry'],
  title: m(
    'Ba đường cao của tam giác và trực tâm',
    'The three altitudes of a triangle and the orthocenter',
  ),
  code: {
    pseudo: [
      'Cho tam giác ABC (ba đỉnh không thẳng hàng)',
      'Đường cao từ A: đường qua A vuông góc với BC; chân Ha nằm trên đường thẳng BC',
      'Đường cao từ B: đường qua B vuông góc với CA; chân Hb nằm trên đường thẳng CA',
      'Hai đường cao này cắt nhau tại H',
      'Đường cao từ C: đường qua C vuông góc với AB; chân Hc nằm trên đường thẳng AB',
      'Đường cao thứ ba cũng đi qua H: ba đường cao đồng quy, H là trực tâm',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      x1: { kind: 'int', range: [-6, 6] },
      y1: { kind: 'int', range: [-6, 6] },
      x2: { kind: 'int', range: [-6, 6] },
      y2: { kind: 'int', range: [-6, 6] },
      x3: { kind: 'int', range: [-6, 6] },
      y3: { kind: 'int', range: [-6, 6] },
    },
  },
  check: (input) =>
    (input.x2 - input.x1) * (input.y3 - input.y1) -
      (input.y2 - input.y1) * (input.x3 - input.x1) ===
    0
      ? ['degenerate-triangle']
      : [],
  customInput: false,
  presets: [
    {
      id: 'acute',
      label: m('Tam giác nhọn', 'Acute triangle'),
      input: { x1: 0, y1: 0, x2: 6, y2: 0, x3: 2, y3: 4 },
    },
    {
      id: 'obtuse',
      label: m('Tam giác tù', 'Obtuse triangle'),
      input: { x1: 0, y1: 0, x2: 6, y2: 0, x3: -2, y3: 2 },
    },
    {
      id: 'right',
      label: m('Tam giác vuông', 'Right triangle'),
      input: { x1: 0, y1: 0, x2: 4, y2: 0, x3: 0, y3: 3 },
    },
    {
      id: 'isosceles',
      label: m('Tam giác cân', 'Isosceles triangle'),
      input: { x1: -3, y1: 0, x2: 3, y2: 0, x3: 0, y3: 4 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'altitude-a',
      text: m(
        'Chân đường cao nằm trên đường thẳng chứa cạnh đối diện, không nhất thiết trên đoạn thẳng: ở tam giác tù có hai đường cao có chân ở phần kéo dài.',
        'The foot lies on the line holding the opposite side, not necessarily on the segment: in an obtuse triangle two altitudes have their feet on the extensions.',
      ),
    },
    {
      beat: 'orthocenter',
      text: m(
        'Đừng nhầm trực tâm với trọng tâm hay tâm đường tròn ngoại tiếp: ba điểm này trùng nhau chỉ khi tam giác đều.',
        'Do not confuse the orthocenter with the centroid or the circumcenter: the three points coincide only for an equilateral triangle.',
      ),
    },
  ],
  maxFrames: 20,
  maxBytes: 150_000,
  run,
};
