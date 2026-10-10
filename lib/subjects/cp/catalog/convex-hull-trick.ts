/**
 * Walkthrough entry: the monotone convex hull trick for lines y = k·x + m, minimum queries
 * (SCHEMA §5, card 2D-04). Slopes strictly decrease, queries x strictly increase.
 * Intersections are compared by integer cross-multiplication. Deterministic and browser-safe:
 * no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { lines: number[][]; xs: number[] };
type S = {
  rows: number;
  cols: number;
  cells: number[][];
  rowLabels: string[];
  colLabels: string[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const EX = {
  start: m(
    '{n} đường y = k·x + m (hàng) và {q} truy vấn x (cột): ô là giá trị k·x + m. Với mỗi x ta cần giá trị nhỏ nhất của cột. Dùng deque giữ các đường còn có ích.',
    '{n|line|lines} y = k·x + m (rows) and {q} query points x (columns): a cell is k·x + m. For each x we need the column minimum. A deque keeps the lines that still matter.',
  ),
  ask: m(
    'Thêm đường L{l} (k = {k}, m = {mm}). Deque có từ hai đường trở lên; đường cuối deque, L{b}, còn có ích không hay bị L{l} và L{a} che mất?',
    'Add the line L{l} (k = {k}, m = {mm}). The deque has two or more lines; is its last line L{b} still useful or hidden by L{l} and L{a}?',
  ),
  pop: m(
    'Giao của L{a} với L{l} nằm bên trái (hoặc trùng) giao của L{a} với L{b}: L{b} không bao giờ nhỏ nhất. Bỏ L{b} khỏi cuối deque.',
    'The crossing of L{a} with L{l} is left of (or at) the crossing of L{a} with L{b}: L{b} is never the minimum. Pop L{b} off the back.',
  ),
  push: m(
    'Đưa L{l} vào cuối deque. Deque: {dq}.',
    'Push L{l} on the back of the deque. Deque: {dq}.',
  ),
  front: m(
    'Tại x = {x}, L{b} = {vb} ≤ L{a} = {va}: L{a} không còn nhỏ nhất với x này và mọi x lớn hơn. Bỏ L{a} khỏi đầu deque.',
    'At x = {x}, L{b} = {vb} ≤ L{a} = {va}: L{a} is no longer minimal for this x nor any larger x. Pop L{a} off the front.',
  ),
  query: m(
    'Truy vấn x = {x}: đường đầu deque L{a} cho giá trị nhỏ nhất {v}.',
    'Query x = {x}: the front line of the deque L{a} gives the minimum {v}.',
  ),
  done: m(
    'Mọi truy vấn xong: các giá trị nhỏ nhất là {res}. Mỗi đường vào và ra deque tối đa một lần: O(n + q).',
    'All queries are done: the minima are {res}. Each line enters and leaves the deque at most once: O(n + q).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Ta có {n} đường thẳng và {q} điểm x; với mỗi x cần min của k·x + m (k là độ dốc) trên mọi đường. Thử mọi đường cho mỗi x tốn O(n·q); khi k giảm dần và x tăng dần, dùng deque (hàng đợi hai đầu) chỉ cần O(n + q).',
      'We have {n|line|lines} and {q} points x; for each x we need the minimum of k·x + m (k is the slope) over all lines. Trying every line per x costs O(n·q); with the hull trick (a deque) it gets O(n + q) when k decreases and x increases.',
    ),
    hints: [
      m(
        'Có đường nào không bao giờ là nhỏ nhất không?',
        'Is there a line that is never the minimum?',
      ),
      m(
        'Có: một đường nằm "trên" mọi giao điểm của hai đường kia.',
        'Yes: a line that lies "above" the crossing of two others.',
      ),
      m(
        'Giữ chỉ các đường còn có thể nhỏ nhất, xếp theo độ dốc, trong một deque.',
        'Keep only the lines that can still be the minimum, ordered by slope, in a deque.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đường có m nhỏ nhất luôn thắng: k·x làm đổi thứ tự khi x thay đổi.',
        'Thinking the line with the smallest m always wins: k·x changes the order as x varies.',
      ),
    ],
  },
  {
    id: 'add-line',
    label: m('Thêm đường', 'Add a line'),
    narration: m(
      'Đường mới L{l} có độ dốc nhỏ nhất, nên nó thắng khi x đủ lớn. Trước khi đưa vào, ta xem đường cuối deque L{b} có còn có ích không.',
      'The new line L{l} has the smallest slope so it wins for large enough x. Before pushing it we check whether the last line of the deque L{b} is still useful.',
    ),
    ask: {
      text: m(
        'Theo em, đường cuối deque có bị loại không?',
        'Is the last line of the deque removed?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có, bị loại', 'Yes, removed'), m('Không, giữ lại', 'No, kept')],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:pop-back') ? 0 : 1),
      },
    },
    hints: [
      m(
        'So hai giao điểm: L{a} với L{b} và L{a} với L{l}.',
        'Compare two crossings: L{a} with L{b} and L{a} with L{l}.',
      ),
      m(
        'Nếu giao với đường mới nằm bên trái giao với đường giữa thì đường giữa bị che.',
        'If the crossing with the new line lies left of the crossing with the middle one, the middle line is hidden.',
      ),
      m(
        'Kiểm bằng nhân chéo số nguyên: (m3 − m1)(k1 − k2) ≤ (m2 − m1)(k1 − k3), không chia số thực.',
        'Test by integer cross-multiplication: (m3 − m1)(k1 − k2) ≤ (m2 − m1)(k1 − k3), no real division.',
      ),
    ],
    misconceptions: [
      m(
        'So giao điểm bằng phép chia số thực: sai số làm hỏng điều kiện; dùng nhân chéo.',
        'Comparing crossings with real division: rounding breaks the test; use cross-multiplication.',
      ),
    ],
  },
  {
    id: 'pop-back',
    label: m('Bỏ cuối deque', 'Pop the back'),
    narration: m(
      'L{b} bị L{a} và L{l} che: bất kể x thế nào, một trong hai đường kia không lớn hơn. Bỏ L{b} khỏi cuối deque rồi kiểm tiếp với đường trước nó.',
      'L{b} is hidden by L{a} and L{l}: whatever x is, one of those two is no larger. Pop L{b} off the back and test again against the line before it.',
    ),
    hints: [
      m(
        'Đường nằm giữa hai đường kia có thể là nhỏ nhất ở đâu?',
        'Where can a line lying between two others be the minimum?',
      ),
      m(
        'Chỉ trong một khoảng x; nếu khoảng đó rỗng thì bỏ.',
        'Only on some interval of x; if that interval is empty, drop it.',
      ),
      m(
        'Lặp while: sau khi bỏ, đường mới ở cuối có thể bị che tiếp.',
        'Loop with while: after popping, the new last line may be hidden too.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ bỏ nhiều nhất một đường: phải lặp tới khi đường cuối còn có ích.',
        'Popping at most one line: repeat until the last line is useful.',
      ),
    ],
  },
  {
    id: 'query',
    label: m('Truy vấn', 'Query'),
    narration: m(
      'Với x = {x}, đường đầu deque L{a} cho giá trị nhỏ nhất {v}. Vì x chỉ tăng, các đường đã bị bỏ ở đầu không bao giờ cần lại.',
      'For x = {x} the front line of the deque L{a} gives the minimum {v}. Since x only increases, lines popped from the front are never needed again.',
    ),
    hints: [
      m(
        'Đường nào cho giá trị nhỏ nhất ở x này?',
        'Which line gives the smallest value at this x?',
      ),
      m(
        'Deque xếp đường theo độ dốc giảm: khi x tăng, đáp án dịch dần về cuối.',
        'The deque orders lines by decreasing slope: as x grows the answer moves toward the back.',
      ),
      m(
        'Đọc đường đầu sau khi bỏ các đường đầu không còn nhỏ nhất.',
        'Read the front line after popping the front lines that stopped being minimal.',
      ),
    ],
    misconceptions: [
      m(
        'Duyệt cả deque cho mỗi truy vấn: sẽ thành O(n·q); chỉ cần xem hai đường đầu.',
        'Scanning the whole deque for each query: that becomes O(n·q); only the first two lines matter.',
      ),
    ],
  },
  {
    id: 'pop-front',
    label: m('Bỏ đầu deque', 'Pop the front'),
    narration: m(
      'Tại x = {x}, đường thứ hai L{b} không lớn hơn đường đầu L{a}. Với x tăng, L{b} còn tốt hơn nữa, nên L{a} vô dụng từ nay: bỏ khỏi đầu.',
      'At x = {x} the second line L{b} is no larger than the front line L{a}. As x grows L{b} only gets better, so L{a} is useless from now on: pop it from the front.',
    ),
    hints: [
      m(
        'Hai đường, một dốc nhiều hơn: khi x tăng, đường nào đi xuống nhanh hơn?',
        'Two lines, one steeper: as x grows, which falls faster?',
      ),
      m('Đường có độ dốc nhỏ hơn (L{b}).', 'The one with the smaller slope (L{b}).'),
      m(
        'Nếu L{b} đã không lớn hơn L{a} ở x, nó vẫn như thế với mọi x lớn hơn.',
        'If L{b} is already no larger than L{a} at x, it stays so for every larger x.',
      ),
    ],
    misconceptions: [
      m(
        'Bỏ đường đầu khi x còn có thể giảm: chỉ đúng khi truy vấn x tăng dần.',
        'Popping the front when x may still decrease: valid only when queries increase.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Các giá trị nhỏ nhất: {res}. Mỗi đường vào deque một lần và ra tối đa một lần, nên tổng O(n + q) thay vì O(n·q).',
      'The minima: {res}. Each line enters the deque once and leaves at most once, so O(n + q) in total instead of O(n·q).',
    ),
    hints: [
      m('Mỗi đường bị bỏ bao nhiêu lần?', 'How many times is each line removed?'),
      m('Tối đa một lần, ở cuối hoặc đầu.', 'At most once, from the back or the front.'),
      m(
        'Nên tổng công việc tuyến tính; nếu truy vấn không đơn điệu cần tìm kiếm nhị phân trên hull.',
        'So the total work is linear; if queries are not monotone, binary search on the hull is needed.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng kỹ thuật này dùng cho mọi thứ tự truy vấn: bản deque cần x tăng dần.',
        'Thinking this works for any query order: the deque version needs increasing x.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { lines, xs } = input;
  const n = lines.length;
  const val = (l: number, x: number): number => lines[l][0] * x + lines[l][1];
  const dq: number[] = [];
  const dead = new Set<number>();
  const best: Record<string, HighlightKind> = {};
  const res: number[] = [];
  const lab = (l: number): string => {
    const [k, mm] = lines[l];
    return `${k}x${mm >= 0 ? '+' : ''}${mm}`;
  };

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const l of dead) for (let c = 0; c < xs.length; c++) highlights[`${l},${c}`] = 'muted';
    Object.assign(highlights, best); // a query minimum stays marked even when its line is popped later
    emit(
      {
        rows: n,
        cols: xs.length,
        cells: lines.map((_, l) => xs.map((x) => val(l, x))),
        rowLabels: lines.map((_, l) => lab(l)),
        colLabels: xs.map((x) => `x=${x}`),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [{ id: 'deque', label: 'Deque', items: dq.map((l) => `L${l}`) }],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };
  const bad = (a: number, b: number, c: number): boolean => {
    const [k1, m1] = lines[a];
    const [k2, m2] = lines[b];
    const [k3, m3] = lines[c];
    return (m3 - m1) * (k1 - k2) <= (m2 - m1) * (k1 - k3);
  };
  const rowOf = (l: number): Record<string, HighlightKind> =>
    Object.fromEntries(xs.map((_, c) => [`${l},${c}`, 'active' as HighlightKind]));

  put(EX.start, 1, { n, q: xs.length }, {}, 'start');
  for (let l = 0; l < n; l++) {
    tick();
    const [k, mm] = lines[l];
    if (dq.length >= 2) {
      put(
        EX.ask,
        2,
        { l, k, mm, a: dq[dq.length - 2], b: dq[dq.length - 1] },
        rowOf(l),
        'add-line',
      );
    }
    while (dq.length >= 2 && bad(dq[dq.length - 2], dq[dq.length - 1], l)) {
      const b = dq.pop() as number;
      dead.add(b);
      put(EX.pop, 2, { a: dq[dq.length - 1], b, l }, rowOf(l), 'pop-back');
    }
    dq.push(l);
    put(EX.push, 2, { l, dq: dq.map((x) => `L${x}`).join(', ') }, rowOf(l));
  }
  for (let c = 0; c < xs.length; c++) {
    const x = xs[c];
    while (dq.length >= 2 && val(dq[1], x) <= val(dq[0], x)) {
      tick();
      const a = dq.shift() as number;
      dead.add(a);
      put(
        EX.front,
        4,
        { x, a, b: dq[0], va: val(a, x), vb: val(dq[0], x) },
        { [`${dq[0]},${c}`]: 'compare' },
        'pop-front',
      );
    }
    const a = dq[0];
    best[`${a},${c}`] = 'result';
    res.push(val(a, x));
    put(EX.query, 5, { x, a, v: val(a, x) }, {}, 'query');
  }
  put(EX.done, 5, { res: res.join(', ') }, {}, 'done');
}

export const convexHullTrickEntry: WalkthroughEntry<In, S> = {
  id: 'convex-hull-trick',
  entryRev: 3,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t4-dp-optimize'],
  title: m('Bao lồi các đường thẳng (CHT)', 'Convex hull trick'),
  code: {
    pseudo: [
      'deque ← rỗng',
      'for mỗi đường mới (k, m): while deque có ≥ 2 đường và đường cuối bị đường mới che: pop_back; push_back(đường mới)',
      'for mỗi truy vấn x (tăng dần):',
      '    while deque có ≥ 2 đường và đường thứ hai ≤ đường đầu tại x: pop_front',
      '    ghi nhận giá trị của đường đầu tại x',
    ],
    impl: {
      cpp: [
        'bool bad(long long k1, long long m1, long long k2, long long m2, long long k3, long long m3) {',
        '    return (m3 - m1) * (k1 - k2) <= (m2 - m1) * (k1 - k3);',
        '}',
        'std::vector<long long> min_at(const std::vector<std::pair<int, int>>& lines, const std::vector<int>& xs) {',
        '    std::deque<std::pair<int, int>> dq;',
        '    for (const auto& ln : lines) {',
        '        while (dq.size() >= 2 && bad(dq[dq.size() - 2].first, dq[dq.size() - 2].second, dq.back().first, dq.back().second, ln.first, ln.second)) dq.pop_back();',
        '        dq.push_back(ln);',
        '    }',
        '    std::vector<long long> res;',
        '    for (int x : xs) {',
        '        while (dq.size() >= 2 && (long long)dq[1].first * x + dq[1].second <= (long long)dq[0].first * x + dq[0].second) dq.pop_front();',
        '        res.push_back((long long)dq[0].first * x + dq[0].second);',
        '    }',
        '    return res;',
        '}',
      ],
      py: [
        'from collections import deque',
        'def bad(k1, m1, k2, m2, k3, m3):',
        '    return (m3 - m1) * (k1 - k2) <= (m2 - m1) * (k1 - k3)',
        'def min_at(lines, xs):',
        '    dq = deque()',
        '    for k, m in lines:',
        '        while len(dq) >= 2 and bad(dq[-2][0], dq[-2][1], dq[-1][0], dq[-1][1], k, m):',
        '            dq.pop()',
        '        dq.append((k, m))',
        '    res = []',
        '    for x in xs:',
        '        while len(dq) >= 2 and dq[1][0] * x + dq[1][1] <= dq[0][0] * x + dq[0][1]:',
        '            dq.popleft()',
        '        res.append(dq[0][0] * x + dq[0][1])',
        '    return res',
      ],
    },
    map: {
      cpp: { 1: [5], 2: [1, 2, 3, 6, 7, 8], 3: [11], 4: [12], 5: [13] },
      py: { 1: [5], 2: [2, 3, 6, 7, 8, 9], 3: [11], 4: [12, 13], 5: [14] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      lines: { kind: 'grid', rows: [1, 5], cols: [2, 2], cell: 'int', range: [-10, 10] },
      xs: { kind: 'int-array', len: [1, 5], range: [-10, 10], strictlyIncreasing: true },
    },
  },
  check: (input) =>
    input.lines.every((ln, i) => i === 0 || input.lines[i - 1][0] > ln[0])
      ? []
      : ['slopes-not-decreasing'],
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: {
        lines: [
          [3, 0],
          [1, -2],
          [-1, 4],
          [-3, 10],
        ],
        xs: [-4, -1, 2, 5],
      },
    },
    {
      id: 'useless-line',
      label: m('Một đường vô dụng', 'A useless line'),
      input: {
        lines: [
          [2, 0],
          [1, 8],
          [0, 0],
        ],
        xs: [-3, 0, 4],
      },
    },
    {
      id: 'single-line',
      label: m('Một đường', 'A single line'),
      input: { lines: [[1, 1]], xs: [-1, 0] },
    },
    {
      id: 'parallel-like',
      label: m('Ba đường đồng quy', 'Three concurrent lines'),
      input: {
        lines: [
          [3, 0],
          [2, 1],
          [1, 2],
        ],
        xs: [-2, 1, 3],
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'add-line',
      text: m(
        'So giao điểm bằng nhân chéo số nguyên, không chia số thực; các đường phải thêm theo k giảm dần và truy vấn theo x tăng dần.',
        'Compare crossings by integer cross-multiplication, not real division; lines must be added by decreasing k and queries asked by increasing x.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'add-line',
      text: m(
        'Tích (m3 − m1)(k1 − k2) có thể vượt int khi hệ số lớn: ép sang long long trước khi nhân.',
        'The product (m3 − m1)(k1 − k2) can overflow int for large coefficients: cast to long long before multiplying.',
      ),
    },
    {
      lang: 'py',
      beat: 'pop-front',
      text: m(
        'Dùng collections.deque với popleft(); list.pop(0) tốn O(n) mỗi lần và làm cả thuật toán chậm đi.',
        'Use collections.deque with popleft(); list.pop(0) costs O(n) each time and slows the whole algorithm.',
      ),
    },
  ],
  maxFrames: 50,
  maxBytes: 200_000,
  run,
};
