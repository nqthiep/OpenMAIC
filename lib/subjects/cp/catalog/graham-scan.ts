/**
 * Walkthrough entry: Graham scan, the convex hull of a point set (SCHEMA §2.4, card 2E-05).
 * Deterministic and browser-safe: no Intl/Date/Math.random and no atan2; the angular order uses the
 * integer cross product (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { pts: number[][] };
type S = {
  bounds: { xmin: number; xmax: number; ymin: number; ymax: number };
  points: { id: string; x: number; y: number; label: string }[];
  segments: { id: string; from: string; to: string; dashed?: boolean }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const P = (i: number): string => `P${i}`;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Cho {n} điểm trên mặt phẳng. Bao lồi là đa giác lồi nhỏ nhất chứa mọi điểm. Graham scan: chọn điểm gốc, sắp theo góc, rồi dùng ngăn xếp.',
    'We have {n} points in the plane. The convex hull is the smallest convex polygon holding them all. Graham scan: pick a pivot, sort by angle, then use a stack.',
  ),
  pivot: m(
    'Chọn điểm thấp nhất (bằng nhau thì trái nhất): P{k} = ({x}, {y}). Điểm này chắc chắn nằm trên bao lồi.',
    'Pick the lowest point (the leftmost if tied): P{k} = ({x}, {y}). It is certain to lie on the hull.',
  ),
  sort: m(
    'Sắp các điểm còn lại theo góc quanh P{k}, từ trục x ngược chiều kim đồng hồ; cùng góc thì điểm gần trước. Chỉ dùng tích có hướng.',
    'Sort the other points by angle around P{k}, from the x axis counter-clockwise; on the same angle the nearer point first. Only the cross product is used.',
  ),
  init: m(
    'Đặt P{k} và điểm đầu tiên theo góc, P{a}, vào ngăn xếp. Từ điểm thứ ba trở đi ta kiểm tra chỗ rẽ.',
    'Put P{k} and the first point by angle, P{a}, on the stack. From the third point on we check the turn.',
  ),
  turn: m(
    'Xét P{p}. Đi từ P{a} tới P{b} rồi tới P{p}: ta rẽ trái hay rẽ phải?',
    'Look at P{p}. Going from P{a} to P{b} and then to P{p}: do we turn left or right?',
  ),
  pop: m(
    'Tích có hướng = {cross} ≤ 0: rẽ phải hoặc đi thẳng, nên P{b} không là đỉnh của bao lồi. Bỏ P{b} khỏi ngăn xếp.',
    'The cross product is {cross} ≤ 0: a right turn or straight on, so P{b} is not a hull vertex. Pop P{b} from the stack.',
  ),
  pushLeft: m(
    'Tích có hướng = {cross} > 0: rẽ trái, giữ P{b}. Đẩy P{p} vào ngăn xếp.',
    'The cross product is {cross} > 0: a left turn, so P{b} stays. Push P{p} on the stack.',
  ),
  pushOnly: m(
    'Ngăn xếp chỉ còn P{b}, chưa có chỗ rẽ để kiểm. Đẩy P{p} vào ngăn xếp.',
    'Only P{b} is left on the stack, so there is no turn to check. Push P{p} on the stack.',
  ),
  done: m(
    'Hết điểm. Ngăn xếp là bao lồi với {h} đỉnh, đi ngược chiều kim đồng hồ bắt đầu từ P{k}.',
    'No points left. The stack is the hull with {h} vertices, counter-clockwise from P{k}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Hãy tưởng tượng căng một sợi dây quanh {n} chiếc đinh. Sợi dây là bao lồi. Graham scan tìm nó bằng cách sắp điểm theo góc rồi bỏ những điểm làm dây lõm vào.',
      'Imagine stretching a rope around {n} nails. The rope is the convex hull. Graham scan finds it by sorting the points by angle and dropping those that make the rope dent inward.',
    ),
    hints: [
      m(
        'Bao lồi của vài chiếc đinh trông như thế nào?',
        'What does the hull of a few nails look like?',
      ),
      m(
        'Một đa giác không có góc lõm, mọi điểm nằm trong hoặc trên nó.',
        'A polygon with no dent, with every point inside it or on it.',
      ),
      m(
        'Duyệt điểm theo góc quanh một điểm chắc chắn trên bao, giữ ngăn xếp các đỉnh luôn rẽ trái.',
        'Walk the points by angle around a point sure to be on the hull, keeping a stack of vertices that always turn left.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bao lồi gồm mọi điểm ngoài cùng theo một hướng: có điểm ngoài cùng vẫn không là đỉnh nếu nó thẳng hàng giữa hai đỉnh.',
        'Thinking the hull contains every outermost point: an outer point still is not a vertex if it lies straight between two vertices.',
      ),
    ],
  },
  {
    id: 'pivot',
    label: m('Chọn điểm gốc', 'Choose the pivot'),
    narration: m(
      'Ta chọn điểm thấp nhất P{k} = ({x}, {y}). Mọi điểm khác nằm trên hoặc phía trên nó, nên nó chắc chắn là đỉnh của bao lồi và là điểm xuất phát tốt.',
      'We choose the lowest point P{k} = ({x}, {y}). Every other point is on or above it, so it is certainly a hull vertex and a good starting point.',
    ),
    hints: [
      m('Điểm nào chắc chắn nằm trên bao lồi?', 'Which point is certain to be on the hull?'),
      m('Điểm thấp nhất: không điểm nào ở dưới nó.', 'The lowest point: nothing lies below it.'),
      m(
        'Chọn y nhỏ nhất, nếu bằng nhau thì x nhỏ nhất, để mọi góc quanh nó nằm trong [0°, 180°).',
        'Pick the smallest y, the smallest x if tied, so every angle around it lies in [0°, 180°).',
      ),
    ],
    misconceptions: [
      m(
        'Chọn điểm đầu tiên của đầu vào làm gốc: nó có thể nằm trong bao lồi và làm thuật toán sai.',
        'Taking the first input point as the pivot: it may be inside the hull and break the algorithm.',
      ),
    ],
  },
  {
    id: 'sort-angle',
    label: m('Sắp theo góc', 'Sort by angle'),
    narration: m(
      'Ta sắp các điểm còn lại theo góc quanh P{k}. Không cần atan2: điểm b đứng sau a nếu tích có hướng (a − P{k}) × (b − P{k}) dương, vì chỉ dùng số nguyên nên không sai số.',
      'We sort the remaining points by angle around P{k}. No atan2 is needed: b comes after a when the cross product (a − P{k}) × (b − P{k}) is positive, and integers give no rounding error.',
    ),
    hints: [
      m(
        'Làm sao so sánh góc của hai điểm mà không tính góc?',
        'How can we compare the angles of two points without computing an angle?',
      ),
      m(
        'Tích có hướng của hai vectơ cho biết vectơ nào quay ngược chiều kim đồng hồ.',
        'The cross product of two vectors tells which one lies counter-clockwise of the other.',
      ),
      m(
        'Sắp theo tích có hướng dương; cùng góc thì tích bằng 0 nên so khoảng cách, gần trước.',
        'Sort by a positive cross product; on the same angle the product is 0, so compare distances, nearer first.',
      ),
    ],
    misconceptions: [
      m(
        'Sắp theo hoành độ x thay vì theo góc: thứ tự đó không cho đường đi quanh bao lồi.',
        'Sorting by the x coordinate instead of by angle: that order does not walk around the hull.',
      ),
    ],
  },
  {
    id: 'turn',
    label: m('Kiểm tra chỗ rẽ', 'Check the turn'),
    narration: m(
      'Với điểm mới P{p}, ta nhìn hai điểm trên cùng của ngăn xếp, P{a} và P{b}. Bao lồi chỉ được rẽ trái; nếu đi P{a}, P{b}, P{p} rẽ phải thì P{b} làm bao bị lõm.',
      'For the new point P{p} we look at the top two stack points, P{a} and P{b}. The hull may only turn left; if P{a}, P{b}, P{p} turns right, P{b} makes the hull dent.',
    ),
    ask: {
      text: m(
        'Theo em, đi qua ba điểm này (hai điểm trên cùng ngăn xếp rồi điểm mới) thì rẽ trái hay rẽ phải?',
        'Going through these three points (the top two of the stack, then the new one), do we turn left or right?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Rẽ trái', 'Left turn'),
          m('Rẽ phải hoặc đi thẳng', 'Right turn or straight on'),
        ],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:pop') ? 1 : 0),
      },
    },
    hints: [
      m(
        'Vẽ mũi tên từ điểm dưới tới điểm trên cùng ngăn xếp rồi tới điểm mới: đường gấp về bên nào?',
        'Draw the arrows from the lower to the top stack point and on to the new point: which way does the path bend?',
      ),
      m('Quay ngược chiều kim đồng hồ là rẽ trái.', 'Bending counter-clockwise is a left turn.'),
      m(
        'Tích có hướng (b − a) × (p − a) > 0 là rẽ trái, với a, b là hai điểm trên cùng ngăn xếp.',
        'The cross product (b − a) × (p − a) > 0 is a left turn, where a, b are the top two stack points.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đi thẳng cũng giữ điểm giữa: điểm nằm giữa hai điểm kia không là đỉnh, nên phải bỏ.',
        'Thinking that going straight on keeps the middle point: a point between the other two is not a vertex, so it must go.',
      ),
    ],
  },
  {
    id: 'pop',
    label: m('Bỏ điểm', 'Pop a point'),
    narration: m(
      'Tích có hướng {cross} không dương, nên P{b} nằm trong hoặc trên đoạn P{a}P{p}. Ta bỏ P{b} và kiểm tiếp với hai điểm trên cùng mới.',
      'The cross product {cross} is not positive, so P{b} lies inside or on the segment P{a}P{p}. We pop P{b} and check again with the new top two points.',
    ),
    hints: [
      m(
        'Nếu rẽ phải thì điểm giữa ở đâu so với hai điểm kia?',
        'After a right turn, where is the middle point relative to the other two?',
      ),
      m(
        'Nó nằm trong bao lồi của ba điểm, không phải là đỉnh.',
        'It lies inside the hull of the three points, so it is not a vertex.',
      ),
      m(
        'Lặp while: pop, rồi so sánh lại với cặp trên cùng mới cho tới khi rẽ trái hoặc còn một điểm.',
        'Loop with while: pop, then compare with the new top pair until a left turn or one point is left.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ bỏ một điểm rồi đi tiếp: có thể phải bỏ nhiều điểm liên tiếp, nên cần vòng while, không phải if.',
        'Popping just one point and moving on: several points in a row may have to go, so it needs a while loop, not an if.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Ngăn xếp giờ là bao lồi với {h} đỉnh, đi ngược chiều kim đồng hồ từ P{k}. Mỗi điểm vào ngăn xếp một lần và ra nhiều nhất một lần; sắp xếp chiếm O(n log n).',
      'The stack is now the hull with {h} vertices, counter-clockwise from P{k}. Each point is pushed once and popped at most once; sorting costs O(n log n).',
    ),
    hints: [
      m(
        'Mỗi điểm vào và ra ngăn xếp tối đa mấy lần?',
        'How many times can each point enter and leave the stack?',
      ),
      m(
        'Vào một lần, ra tối đa một lần, nên phần quét là O(n).',
        'Once in, at most once out, so the scan is O(n).',
      ),
      m(
        'Cả thuật toán là O(n log n), do bước sắp xếp theo góc.',
        'The whole algorithm is O(n log n), from the angular sort.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bao lồi luôn có đủ ba đỉnh trở lên: nếu mọi điểm thẳng hàng, bao chỉ có hai đầu mút.',
        'Thinking the hull always has three or more vertices: if all points are collinear, the hull is just two end points.',
      ),
    ],
  },
];

const cross = (o: number[], a: number[], b: number[]): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const pts = input.pts;
  const n = pts.length;
  let lo = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i][1] < pts[lo][1] || (pts[i][1] === pts[lo][1] && pts[i][0] < pts[lo][0])) lo = i;
  }
  const o = pts[lo];
  const dist = (i: number): number => (pts[i][0] - o[0]) ** 2 + (pts[i][1] - o[1]) ** 2;
  const order = Array.from({ length: n }, (_, i) => i)
    .filter((i) => i !== lo)
    .sort((a, b) => {
      const c = cross(o, pts[a], pts[b]);
      return c !== 0 ? (c > 0 ? -1 : 1) : dist(a) - dist(b) || a - b;
    });

  const stack: number[] = [];
  const popped = new Set<number>();
  const points = pts.map(([x, y], i) => ({ id: P(i), x, y, label: P(i) }));
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  // fixed for the whole walkthrough: the points' box plus one unit of margin
  const bounds = {
    xmin: Math.min(...xs) - 1,
    xmax: Math.max(...xs) + 1,
    ymin: Math.min(...ys) - 1,
    ymax: Math.max(...ys) + 1,
  };

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    extra: {
      tag?: string;
      mark?: Record<string, HighlightKind>;
      cand?: [number, number];
      rays?: boolean;
      close?: boolean;
    } = {},
  ): void => {
    const segments: S['segments'] = [];
    const highlights: Record<string, HighlightKind> = {};
    if (extra.rays) {
      for (const i of order) {
        segments.push({ id: `r${i}`, from: P(lo), to: P(i), dashed: true });
        highlights[`r${i}`] = 'muted';
      }
    }
    for (let k = 0; k + 1 < stack.length; k++) {
      const id = `e${stack[k]}-${stack[k + 1]}`;
      segments.push({ id, from: P(stack[k]), to: P(stack[k + 1]) });
      highlights[id] = 'result';
    }
    if (extra.close && stack.length > 2) {
      const id = `e${stack[stack.length - 1]}-${stack[0]}`;
      segments.push({ id, from: P(stack[stack.length - 1]), to: P(stack[0]) });
      highlights[id] = 'result';
    }
    if (extra.cand) {
      segments.push({ id: 'cand', from: P(extra.cand[0]), to: P(extra.cand[1]), dashed: true });
      highlights.cand = 'compare';
    }
    for (const i of popped) highlights[P(i)] = 'muted';
    for (const i of stack) highlights[P(i)] = 'result';
    Object.assign(highlights, extra.mark);
    emit(
      { bounds, points, segments },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        vars,
        aux: [
          {
            id: 'stack',
            label: msg(m('Ngăn xếp', 'Stack'), ctx.locale),
            items: stack.map(P),
          },
          ...(extra.rays || stack.length > 0
            ? [
                {
                  id: 'order',
                  label: msg(m('Thứ tự theo góc', 'Angular order'), ctx.locale),
                  items: [P(lo), ...order.map(P)],
                },
              ]
            : []),
        ],
        ...(extra.tag ? { tags: [`beat:${extra.tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n }, { tag: 'start' });
  put(EX.pivot, 1, { k: lo, x: o[0], y: o[1] }, { tag: 'pivot', mark: { [P(lo)]: 'active' } });
  put(EX.sort, 2, { k: lo }, { tag: 'sort-angle', rays: true, mark: { [P(lo)]: 'active' } });
  stack.push(lo, order[0]);
  put(EX.init, 3, { k: lo, a: order[0] }, {});
  for (const p of order.slice(1)) {
    tick();
    let judged = false;
    while (stack.length >= 2) {
      const a = stack[stack.length - 2];
      const b = stack[stack.length - 1];
      if (!judged) {
        put(EX.turn, 5, { p, a, b }, { tag: 'turn', mark: { [P(p)]: 'active' }, cand: [b, p] });
        judged = true;
      }
      const c = cross(pts[a], pts[b], pts[p]);
      if (c > 0) {
        stack.push(p);
        put(EX.pushLeft, 6, { cross: c, b, p }, { mark: { [P(p)]: 'active' } });
        break;
      }
      put(
        EX.pop,
        5,
        { cross: c, a, b, p },
        { tag: 'pop', mark: { [P(p)]: 'active' }, cand: [a, p] },
      );
      stack.pop();
      popped.add(b);
      judged = false;
    }
    if (stack.length < 2) {
      const b = stack[0];
      stack.push(p);
      put(EX.pushOnly, 6, { b, p }, { mark: { [P(p)]: 'active' } });
    }
  }
  put(EX.done, 7, { h: stack.length, k: lo }, { tag: 'done', close: true });
}

export const grahamScanEntry: WalkthroughEntry<In, S> = {
  id: 'graham-scan',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'geometry',
  curriculumTopics: ['t4-geometry'],
  title: m('Graham scan: bao lồi của tập điểm', 'Graham scan: the convex hull of a point set'),
  code: {
    pseudo: [
      'pivot ← điểm thấp nhất (trái nhất nếu bằng nhau)',
      'sắp các điểm còn lại theo góc quanh pivot (tích có hướng; cùng góc: gần trước)',
      'stack ← [pivot, điểm đầu tiên theo góc]',
      'for mỗi điểm p còn lại theo thứ tự đó:',
      '    while |stack| ≥ 2 và cross(stack[-2], stack[-1], p) ≤ 0: pop',
      '    push p',
      'return stack  (bao lồi, ngược chiều kim đồng hồ)',
    ],
    impl: {
      cpp: [
        'struct P { int x, y; };',
        'long long cross(P o, P a, P b) {',
        '    return (long long)(a.x - o.x) * (b.y - o.y) - (long long)(a.y - o.y) * (b.x - o.x);',
        '}',
        'std::vector<P> graham(std::vector<P> pts) {',
        '    int lo = 0;',
        '    for (int i = 1; i < (int)pts.size(); i++)',
        '        if (pts[i].y < pts[lo].y || (pts[i].y == pts[lo].y && pts[i].x < pts[lo].x)) lo = i;',
        '    std::swap(pts[0], pts[lo]);',
        '    P o = pts[0];',
        '    std::sort(pts.begin() + 1, pts.end(), [&](P a, P b) {',
        '        long long c = cross(o, a, b);',
        '        if (c != 0) return c > 0;',
        '        return (a.x - o.x) * (a.x - o.x) + (a.y - o.y) * (a.y - o.y) <',
        '               (b.x - o.x) * (b.x - o.x) + (b.y - o.y) * (b.y - o.y);',
        '    });',
        '    std::vector<P> st = {pts[0], pts[1]};',
        '    for (int i = 2; i < (int)pts.size(); i++) {',
        '        while (st.size() >= 2 && cross(st[st.size() - 2], st.back(), pts[i]) <= 0) st.pop_back();',
        '        st.push_back(pts[i]);',
        '    }',
        '    return st;',
        '}',
      ],
      py: [
        'from functools import cmp_to_key',
        'def cross(o, a, b):',
        '    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])',
        'def graham(pts):',
        '    o = min(pts, key=lambda p: (p[1], p[0]))',
        '    rest = [p for p in pts if p != o]',
        '    def order(a, b):',
        '        c = cross(o, a, b)',
        '        if c != 0:',
        '            return -1 if c > 0 else 1',
        '        return (a[0] - o[0]) ** 2 + (a[1] - o[1]) ** 2 - (b[0] - o[0]) ** 2 - (b[1] - o[1]) ** 2',
        '    rest.sort(key=cmp_to_key(order))',
        '    st = [o, rest[0]]',
        '    for p in rest[1:]:',
        '        while len(st) >= 2 and cross(st[-2], st[-1], p) <= 0:',
        '            st.pop()',
        '        st.append(p)',
        '    return st',
      ],
    },
    map: {
      cpp: {
        1: [6, 7, 8, 9, 10],
        2: [11, 12, 13, 14, 15, 16],
        3: [17],
        4: [18],
        5: [19],
        6: [20],
        7: [22],
      },
      py: {
        1: [5],
        2: [6, 7, 8, 9, 10, 11, 12],
        3: [13],
        4: [14],
        5: [15, 16],
        6: [17],
        7: [18],
      },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { pts: { kind: 'grid', rows: [3, 8], cols: [2, 2], cell: 'int', range: [-9, 9] } },
  },
  check: (input) => {
    const seen = new Set<string>();
    const issues: string[] = [];
    for (const [x, y] of input.pts) {
      const k = `${x},${y}`;
      if (seen.has(k)) issues.push('duplicate-point');
      seen.add(k);
    }
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn (8 điểm)', 'Standard example (8 points)'),
      input: {
        pts: [
          [0, 0],
          [4, -1],
          [8, 1],
          [6, 4],
          [7, 8],
          [3, 5],
          [-1, 7],
          [2, 2],
        ],
      },
    },
    {
      id: 'collinear',
      label: m('Có điểm thẳng hàng', 'With collinear points'),
      input: {
        pts: [
          [-4, -3],
          [0, -3],
          [4, -3],
          [4, 3],
          [-4, 3],
          [0, 0],
        ],
      },
    },
    {
      id: 'triangle',
      label: m('Tam giác (3 điểm)', 'Triangle (3 points)'),
      input: {
        pts: [
          [-5, -2],
          [6, -1],
          [1, 7],
        ],
      },
    },
    {
      id: 'square-inside',
      label: m('Hình vuông và điểm trong', 'Square with an inner point'),
      input: {
        pts: [
          [-4, -4],
          [4, -4],
          [4, 4],
          [-4, 4],
          [0, 1],
        ],
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'turn',
      text: m(
        'Dùng tích có hướng số nguyên, không dùng góc thực: atan2 và số thực có sai số nên hai điểm thẳng hàng có thể bị xếp sai. Điểm thẳng hàng phải bỏ (so ≤ 0, không phải < 0).',
        'Use the integer cross product, not real angles: atan2 and floating point carry error, so two collinear points may be ordered wrongly. Collinear points must go (test ≤ 0, not < 0).',
      ),
    },
    {
      lang: 'cpp',
      beat: 'sort-angle',
      text: m(
        'Bộ so sánh của std::sort phải là thứ tự yếu chặt: trả về c > 0 và khoảng cách "<", không bao giờ "<=" hay ">=". Tích có hướng ép sang long long để tránh tràn số.',
        'The std::sort comparator must be a strict weak order: return c > 0 and distance "<", never "<=" or ">=". Cast the cross product to long long to avoid overflow.',
      ),
    },
    {
      lang: 'py',
      beat: 'sort-angle',
      text: m(
        'Python 3 không có tham số cmp trong sort: bọc hàm so sánh bằng functools.cmp_to_key, và trả về số âm, 0 hoặc dương.',
        'Python 3 has no cmp argument in sort: wrap the comparison with functools.cmp_to_key and return a negative, zero or positive number.',
      ),
    },
  ],
  maxFrames: 50,
  maxBytes: 150_000,
  run,
};
