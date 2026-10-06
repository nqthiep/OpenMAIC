/**
 * Walkthrough entry: 0/1 knapsack by dynamic programming (SCHEMA §5, card 2B-09).
 * Row labels read `item:weight/value` (the card's `1:w3/v4` does not fit the 8 characters a grid
 * label may have once weights reach two digits). Deterministic and browser-safe: no
 * Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { w: number[]; v: number[]; cap: number };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
  arrows: { from: string; to: string }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Túi chứa tối đa {cap}, có {n} món (nhãn hàng: món:khối lượng/giá trị). dp[i][c] = giá trị lớn nhất khi chỉ dùng i món đầu với sức chứa c.',
    'The bag holds at most {cap} and there are {n} items (row label: item:weight/value). dp[i][c] = the best value using the first i items with capacity c.',
  ),
  base: m(
    'Hàng 0: chưa dùng món nào nên dp[0][c] = 0 với mọi sức chứa c.',
    'Row 0: no item used yet, so dp[0][c] = 0 for every capacity c.',
  ),
  ask: m(
    'Tính dp[{i}][{c}]: món {i} nặng {wi}, giá trị {vi}, sức chứa {c}. Món này vừa túi: lấy hay bỏ?',
    'Compute dp[{i}][{c}]: item {i} weighs {wi}, worth {vi}, capacity {c}. It fits: take it or skip it?',
  ),
  take: m(
    'dp[{i}][{c}] = max(bỏ: {a}, lấy: dp[{i1}][{cw}] + {vi} = {b}) = {val}: lấy món {i}.',
    'dp[{i}][{c}] = max(skip: {a}, take: dp[{i1}][{cw}] + {vi} = {b}) = {val}: take item {i}.',
  ),
  skip: m(
    'dp[{i}][{c}] = max(bỏ: {a}, lấy: dp[{i1}][{cw}] + {vi} = {b}) = {val}: bỏ món {i}.',
    'dp[{i}][{c}] = max(skip: {a}, take: dp[{i1}][{cw}] + {vi} = {b}) = {val}: skip item {i}.',
  ),
  noFit: m(
    'Món {i} nặng {wi} > sức chứa {c}: không vừa, nên dp[{i}][{c}] = dp[{i1}][{c}] = {val}.',
    'Item {i} weighs {wi} > capacity {c}: it does not fit, so dp[{i}][{c}] = dp[{i1}][{c}] = {val}.',
  ),
  traceTake: m(
    'Truy vết ô ({i}, {c}): {x} ≠ {y} = dp[{i1}][{c}] nên món {i} được lấy; sức chứa còn {cn}.',
    'Trace cell ({i}, {c}): {x} ≠ {y} = dp[{i1}][{c}] so item {i} was taken; capacity left {cn}.',
  ),
  traceSkip: m(
    'Truy vết ô ({i}, {c}): {x} = dp[{i1}][{c}] nên món {i} không được lấy.',
    'Trace cell ({i}, {c}): {x} = dp[{i1}][{c}] so item {i} was not taken.',
  ),
  doneSome: m(
    'Giá trị lớn nhất là {best}, đạt khi lấy các món {chosen}.',
    'The best value is {best}, reached by taking items {chosen}.',
  ),
  doneNone: m(
    'Giá trị lớn nhất là {best}: không món nào được lấy.',
    'The best value is {best}: no item is taken.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Túi chứa tối đa {cap}, có {n} món, mỗi món chỉ lấy một lần hoặc không. Thử mọi tập món thì 2^n; quy hoạch động dùng bảng dp thay thế.',
      'The bag holds at most {cap} and there are {n} items, each taken once or not at all. Trying every set costs 2^n; dynamic programming uses a table instead.',
    ),
    hints: [
      m(
        'Nếu đã biết đáp án tốt nhất cho i − 1 món đầu ở mọi sức chứa, thêm món thứ i thì tính thế nào?',
        'If you know the best answers for the first i − 1 items at every capacity, how do you add item i?',
      ),
      m(
        'Món i hoặc không lấy (đáp án như cũ), hoặc lấy (mất w[i] sức chứa, được thêm v[i]).',
        'Item i is either skipped (same answer as before) or taken (costs w[i] capacity, adds v[i]).',
      ),
      m(
        'dp[i][c] = max(dp[i − 1][c], dp[i − 1][c − w[i]] + v[i]); bảng có (n + 1) × (cap + 1) ô.',
        'dp[i][c] = max(dp[i − 1][c], dp[i − 1][c − w[i]] + v[i]); the table has (n + 1) × (cap + 1) cells.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chọn món có giá trị / khối lượng cao nhất trước (tham lam) luôn đúng: với túi 0/1 nó có thể sai.',
        'Thinking taking the best value-per-weight item first (greedy) is always right: for the 0/1 bag it can fail.',
      ),
    ],
  },
  {
    id: 'base-row',
    label: m('Hàng cơ sở', 'The base row'),
    narration: m(
      'Với 0 món thì dù túi lớn bao nhiêu giá trị vẫn là 0. Hàng 0 toàn số 0 là điểm xuất phát cho mọi hàng sau.',
      'With 0 items the value is 0 no matter how big the bag is. Row 0 of zeros is the starting point for every later row.',
    ),
    hints: [
      m(
        'Chưa có món nào thì tổng giá trị là bao nhiêu?',
        'With no item at all, what is the total value?',
      ),
      m('Bằng 0, bất kể sức chứa.', 'Zero, whatever the capacity.'),
      m(
        'dp[0][c] = 0 với mọi c; các hàng sau chỉ dựa vào hàng ngay trên.',
        'dp[0][c] = 0 for all c; later rows depend only on the row right above.',
      ),
    ],
    misconceptions: [
      m(
        'Khởi tạo bảng bằng một số rất nhỏ (−∞): với bài "tối đa giá trị, không bắt buộc đầy túi" thì 0 mới đúng.',
        'Initialising the table with a very small number (−∞): for "maximum value, bag need not be full" the right start is 0.',
      ),
    ],
  },
  {
    id: 'cell',
    label: m('Một ô', 'One cell'),
    narration: m(
      'Ô dp[{i}][{c}]: món {i} nặng {wi}, giá trị {vi}, mà sức chứa là {c}. Món này vừa túi, nên ta cân nhắc cả hai lựa chọn: lấy hoặc bỏ.',
      'The cell dp[{i}][{c}]: item {i} weighs {wi}, is worth {vi}, and the capacity is {c}. It fits, so we weigh both options: take it or skip it.',
    ),
    ask: {
      text: m(
        'Theo em, ô này sẽ lấy món i hay bỏ món i?',
        'Will this cell take item i or skip it?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Lấy món i', 'Take item i'), m('Bỏ món i', 'Skip item i')],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:take') ? 0 : 1),
      },
    },
    hints: [
      m(
        'So hai giá trị: giữ nguyên (dp ô ngay trên) và lấy món (dp ở sức chứa nhỏ hơn rồi cộng giá trị).',
        'Compare two values: keep as is (the cell right above) and take the item (the dp at a smaller capacity plus the value).',
      ),
      m(
        'Giá trị khi lấy là dp[i − 1][c − w[i]] + v[i]; giá trị khi bỏ là dp[i − 1][c].',
        'The value when taking is dp[i − 1][c − w[i]] + v[i]; when skipping it is dp[i − 1][c].',
      ),
      m(
        'Chọn giá trị lớn hơn: lấy nếu và chỉ nếu giá trị lấy lớn hơn hẳn giá trị bỏ.',
        'Pick the larger: take if and only if the take value is strictly larger than the skip value.',
      ),
    ],
    misconceptions: [
      m(
        'Luôn lấy món nếu vừa túi: có khi bỏ nó để dành chỗ cho món tốt hơn thì lợi hơn.',
        'Always taking an item that fits: sometimes skipping it to keep room for better items is worth more.',
      ),
    ],
  },
  {
    id: 'take',
    label: m('Lấy món', 'Take the item'),
    narration: m(
      'Lấy món {i} cho {b}, lớn hơn bỏ ({a}), nên dp[{i}][{c}] = {val}. Mũi tên chỉ hai ô nguồn: ô ngay trên và ô ở sức chứa nhỏ hơn {wi}.',
      'Taking item {i} gives {b}, more than skipping ({a}), so dp[{i}][{c}] = {val}. The arrows show the two source cells: the one above and the one {wi} capacity to the left.',
    ),
    hints: [
      m('Hai giá trị nào được so sánh?', 'Which two values are compared?'),
      m(
        'Bỏ: ô ngay trên; lấy: ô ở hàng trên, lùi w[i] cột, cộng v[i].',
        'Skip: the cell right above; take: the cell in the row above, w[i] columns to the left, plus v[i].',
      ),
      m(
        'Giá trị lấy lớn hơn, nên dp[i][c] nhận giá trị đó.',
        'The take value is larger, so dp[i][c] gets it.',
      ),
    ],
    misconceptions: [
      m(
        'Lấy dp[i][c − w[i]] (cùng hàng) thay vì dp[i − 1][c − w[i]]: sẽ cho phép dùng một món nhiều lần (túi không giới hạn).',
        'Using dp[i][c − w[i]] (same row) instead of dp[i − 1][c − w[i]]: that would let one item be used many times (unbounded bag).',
      ),
    ],
  },
  {
    id: 'skip',
    label: m('Bỏ món', 'Skip the item'),
    narration: m(
      'Món {i} không giúp thêm giá trị ở sức chứa {c} (hoặc không vừa), nên dp[{i}][{c}] chép lại ô ngay trên: {val}.',
      'Item {i} adds no value at capacity {c} (or does not fit), so dp[{i}][{c}] copies the cell above: {val}.',
    ),
    hints: [
      m(
        'Khi món không vừa túi, còn lựa chọn nào?',
        'When the item does not fit, which choice is left?',
      ),
      m(
        'Chỉ còn bỏ nó: giá trị bằng ô ngay trên.',
        'Only skipping it: the value equals the cell above.',
      ),
      m(
        'Khi vừa mà không lợi hơn, ta cũng bỏ; dùng > chứ không phải ≥ để tránh lấy thừa.',
        'When it fits but does not help, we skip too; use > rather than ≥ to avoid a pointless take.',
      ),
    ],
    misconceptions: [
      m(
        'Truy cập dp[i − 1][c − w[i]] khi c < w[i]: chỉ số âm; luôn kiểm c ≥ w[i] trước.',
        'Reading dp[i − 1][c − w[i]] when c < w[i]: a negative index; always check c ≥ w[i] first.',
      ),
    ],
  },
  {
    id: 'traceback',
    label: m('Truy vết', 'Traceback'),
    narration: m(
      'Bảng cho giá trị tốt nhất, chưa cho biết lấy món nào. Từ ô cuối ({i}, {c}) ta đi ngược: nếu dp khác ô ngay trên thì món {i} đã được lấy.',
      'The table gives the best value but not which items. From the last cell we walk back: if dp differs from the cell above, item {i} was taken.',
    ),
    hints: [
      m(
        'Làm sao biết món i có được lấy trong lời giải tối ưu?',
        'How can we tell whether item i was taken in the optimal answer?',
      ),
      m(
        'So dp[i][c] với dp[i − 1][c]: khác nhau tức là món i đã làm tăng giá trị.',
        'Compare dp[i][c] with dp[i − 1][c]: if they differ, item i raised the value.',
      ),
      m(
        'Nếu khác: lấy món i và giảm c đi w[i]; nếu bằng: bỏ món i. Lặp lên tới hàng 0.',
        'If different: item i is taken and c drops by w[i]; if equal: skipped. Repeat up to row 0.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải lưu thêm một bảng "đã lấy gì": chỉ cần bảng dp và đi ngược từ ô cuối.',
        'Thinking an extra table of "what was taken" is needed: the dp table and a walk back from the last cell suffice.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Giá trị lớn nhất là {best}. Bảng có n·cap ô, mỗi ô tính O(1): O(n·cap) thời gian, tốt hơn nhiều so với 2^n khi cap nhỏ.',
      'The best value is {best}. The table has n·cap cells, each computed in O(1): O(n·cap) time, far better than 2^n when cap is small.',
    ),
    hints: [
      m(
        'Có bao nhiêu ô cần tính, và mỗi ô tốn bao nhiêu?',
        'How many cells are computed, and what does each cost?',
      ),
      m('(n + 1) × (cap + 1) ô, mỗi ô O(1).', '(n + 1) × (cap + 1) cells, each O(1).'),
      m(
        'O(n·cap): "giả đa thức" vì phụ thuộc vào độ lớn của cap, không chỉ vào số chữ số của nó.',
        'O(n·cap): "pseudo-polynomial" because it depends on the size of cap, not only on its number of digits.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng O(n·cap) là đa thức theo kích thước input: cap lớn (10^9) thì bảng quá lớn.',
        'Thinking O(n·cap) is polynomial in the input size: for a huge cap (10^9) the table is far too big.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { w, v, cap } = input;
  const n = w.length;
  const dp: (number | undefined)[][] = Array.from({ length: n + 1 }, () =>
    Array<number | undefined>(cap + 1).fill(undefined),
  );
  const rowLabels = ['0', ...w.map((x, k) => `${k + 1}:${x}/${v[k]}`)];
  const colLabels = Array.from({ length: cap + 1 }, (_, c) => String(c));
  const key = (r: number, c: number): string => `${r},${c}`;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    arrows: { from: string; to: string }[],
    tag?: string,
    aux?: string[],
  ): void => {
    emit(
      {
        rows: n + 1,
        cols: cap + 1,
        cells: dp.map((row) => row.map((x) => (x === undefined ? '' : x))),
        rowLabels,
        colLabels,
        arrows,
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        ...(aux
          ? {
              aux: [
                {
                  id: 'chosen',
                  label: msg(m('Món đã lấy', 'Items taken'), ctx.locale),
                  items: aux,
                },
              ],
            }
          : {}),
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { cap, n }, {}, [], 'start');
  for (let c = 0; c <= cap; c++) dp[0][c] = 0;
  put(
    EX.base,
    1,
    { cap },
    Object.fromEntries(
      Array.from({ length: cap + 1 }, (_, c) => [key(0, c), 'visited' as HighlightKind]),
    ),
    [],
    'base-row',
  );

  for (let i = 1; i <= n; i++) {
    let asked = false;
    for (let c = 0; c <= cap; c++) {
      tick();
      const wi = w[i - 1];
      const vi = v[i - 1];
      const fits = c >= wi;
      if (fits && !asked) {
        asked = true;
        put(EX.ask, 2, { i, c, wi, vi }, { [key(i, c)]: 'active' }, [], 'cell');
      }
      const a = dp[i - 1][c] as number;
      if (!fits) {
        dp[i][c] = a;
        put(
          EX.noFit,
          3,
          { i, wi, c, i1: i - 1, val: a },
          { [key(i, c)]: 'active', [key(i - 1, c)]: 'compare' },
          [{ from: key(i - 1, c), to: key(i, c) }],
          'skip',
        );
        continue;
      }
      const b = (dp[i - 1][c - wi] as number) + vi;
      const takeIt = b > a;
      dp[i][c] = takeIt ? b : a;
      put(
        takeIt ? EX.take : EX.skip,
        4,
        { i, c, i1: i - 1, cw: c - wi, vi, a, b, val: dp[i][c] as number, wi },
        {
          [key(i, c)]: takeIt ? 'result' : 'active',
          [key(i - 1, c)]: 'compare',
          [key(i - 1, c - wi)]: 'compare',
        },
        [
          { from: key(i - 1, c), to: key(i, c) },
          { from: key(i - 1, c - wi), to: key(i, c) },
        ],
        takeIt ? 'take' : 'skip',
      );
    }
  }

  // traceback from the last cell
  const best = dp[n][cap] as number;
  const chosen: number[] = [];
  const path: Record<string, HighlightKind> = {};
  let c = cap;
  path[key(n, c)] = 'result';
  for (let i = n; i >= 1; i--) {
    const x = dp[i][c] as number;
    const y = dp[i - 1][c] as number;
    if (x !== y) {
      chosen.unshift(i);
      c -= w[i - 1];
      path[key(i - 1, c)] = 'result';
      put(
        EX.traceTake,
        5,
        { i, c: c + w[i - 1], x, y, i1: i - 1, cn: c },
        path,
        [],
        'traceback',
        chosen.map(String),
      );
    } else {
      path[key(i - 1, c)] = 'result';
      put(EX.traceSkip, 5, { i, c, x, i1: i - 1 }, path, [], 'traceback', chosen.map(String));
    }
  }
  put(
    chosen.length > 0 ? EX.doneSome : EX.doneNone,
    5,
    chosen.length > 0 ? { best, chosen: chosen.join(', ') } : { best },
    path,
    [],
    'done',
    chosen.map(String),
  );
}

export const knapsack01Entry: WalkthroughEntry<In, S> = {
  id: 'knapsack-01',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t3-dp-basic'],
  title: m('Quy hoạch động: cái túi 0/1', 'Dynamic programming: the 0/1 knapsack'),
  code: {
    pseudo: [
      'dp[0][0..cap] ← 0',
      'for i ← 1 .. n:  for c ← 0 .. cap:',
      '    dp[i][c] ← dp[i − 1][c]   (bỏ món i)',
      '    if c ≥ w[i]: dp[i][c] ← max(dp[i][c], dp[i − 1][c − w[i]] + v[i])   (lấy món i)',
      'return dp[n][cap]   (truy vết từ ô này để biết món nào được lấy)',
    ],
    impl: {
      cpp: [
        'int knapsack(const std::vector<int>& w, const std::vector<int>& v, int cap) {',
        '    int n = w.size();',
        '    std::vector<std::vector<int>> dp(n + 1, std::vector<int>(cap + 1, 0));',
        '    for (int i = 1; i <= n; i++) {',
        '        for (int c = 0; c <= cap; c++) {',
        '            dp[i][c] = dp[i - 1][c];',
        '            if (c >= w[i - 1]) dp[i][c] = std::max(dp[i][c], dp[i - 1][c - w[i - 1]] + v[i - 1]);',
        '        }',
        '    }',
        '    return dp[n][cap];',
        '}',
      ],
      py: [
        'def knapsack(w, v, cap):',
        '    n = len(w)',
        '    dp = [[0] * (cap + 1) for _ in range(n + 1)]',
        '    for i in range(1, n + 1):',
        '        for c in range(cap + 1):',
        '            dp[i][c] = dp[i - 1][c]',
        '            if c >= w[i - 1]:',
        '                dp[i][c] = max(dp[i][c], dp[i - 1][c - w[i - 1]] + v[i - 1])',
        '    return dp[n][cap]',
      ],
    },
    map: {
      cpp: { 1: [3], 2: [4, 5], 3: [6], 4: [7], 5: [10] },
      py: { 1: [3], 2: [4, 5], 3: [6], 4: [7, 8], 5: [9] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      w: { kind: 'int-array', len: [1, 5], range: [1, 20] },
      // [Unverified] the card says range [1, 20] but its own `classic` preset has a value of 30
      v: { kind: 'int-array', len: [1, 5], range: [1, 30] },
      cap: { kind: 'int', range: [0, 12] },
    },
  },
  check: (input) => (input.w.length === input.v.length ? [] : ['length-mismatch']),
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: { w: [1, 3, 4], v: [15, 20, 30], cap: 4 },
    },
    {
      id: 'cap-zero',
      label: m('Túi sức chứa 0', 'A bag of capacity 0'),
      input: { w: [2, 3], v: [4, 5], cap: 0 },
    },
    { id: 'one-item', label: m('Một món', 'One item'), input: { w: [2], v: [3], cap: 5 } },
    {
      id: 'too-heavy',
      label: m('Món quá nặng', 'Items too heavy'),
      input: { w: [9, 10], v: [5, 6], cap: 8 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'take',
      text: m(
        'Bản dùng mảng một chiều dp[c] phải duyệt c GIẢM dần (từ cap xuống w[i]); duyệt tăng dần sẽ lấy một món nhiều lần.',
        'The one-dimensional version dp[c] must loop c DOWNWARD (from cap to w[i]); looping upward takes one item many times.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'start',
      text: m(
        'Chỉ số món bắt đầu từ 1 trong bảng nhưng từ 0 trong mảng w, v: dùng w[i − 1], v[i − 1].',
        'Item numbers start at 1 in the table but at 0 in the arrays w, v: use w[i − 1], v[i − 1].',
      ),
    },
    {
      lang: 'py',
      beat: 'start',
      text: m(
        'Tạo bảng bằng [[0] * (cap + 1) for _ in range(n + 1)]; viết [[0] * (cap + 1)] * (n + 1) làm mọi hàng là cùng một list.',
        'Build the table with [[0] * (cap + 1) for _ in range(n + 1)]; [[0] * (cap + 1)] * (n + 1) makes every row the same list.',
      ),
    },
  ],
  maxFrames: 100,
  maxBytes: 200_000,
  run,
};
