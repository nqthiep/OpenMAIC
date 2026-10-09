/**
 * Walkthrough entry: a segment tree, bottom-up build and a range-sum query
 * (SCHEMA §5, card 2C-04). Node k has children 2k and 2k + 1; n is 4 or 8, so the tree has
 * at most 15 nodes. Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[]; l: number; r: number };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Cây đoạn cho {n} số: mỗi nút ứng với một đoạn [l, r] và lưu tổng của nó. Gốc là [0, {last}]; con của nút k là 2k và 2k + 1.',
    'A segment tree for {n|number|numbers}: each node covers a range [l, r] and stores its sum. The root is [0, {last}]; node k has children 2k and 2k + 1.',
  ),
  buildLeaves: m(
    'Dựng từ dưới lên, trước hết các lá: lá [i, i] lưu chính a[i].',
    'Build bottom-up, leaves first: the leaf [i, i] stores a[i] itself.',
  ),
  buildLevel: m(
    'Tầng {lv}: tổng của nút bằng tổng hai con, ví dụ nút [{l}, {r}] = {sum}. Mỗi nút tính trong O(1).',
    'Level {lv}: a node’s sum is the sum of its two children, for instance node [{l}, {r}] = {sum}. Each node costs O(1).',
  ),
  query: m(
    'Truy vấn tổng a[{ql}..{qr}]. Ta đi từ gốc xuống, ở mỗi nút xét đoạn [l, r] của nó so với [{ql}, {qr}]: trong, ngoài hay cắt.',
    'Query the sum of a[{ql}..{qr}]. We walk down from the root and, at each node, compare its range [l, r] with [{ql}, {qr}]: inside, outside or overlapping.',
  ),
  visit: m(
    'Tới nút {k} với đoạn [{nl}, {nr}], so với đoạn hỏi [{ql}, {qr}]. Đoạn của nút nằm trong, ngoài hay cắt đoạn hỏi?',
    'At node {k} with range [{nl}, {nr}], against the query range [{ql}, {qr}]. Does the node’s range lie inside, outside or overlap the query?',
  ),
  full: m(
    'Đoạn [{nl}, {nr}] nằm trọn trong [{ql}, {qr}]: lấy luôn tổng {sum} của nút {k}, không đi xuống nữa. Tổng tích luỹ = {acc}.',
    'The range [{nl}, {nr}] lies inside [{ql}, {qr}]: take the stored sum {sum} of node {k} and stop. Running total = {acc}.',
  ),
  none: m(
    'Đoạn [{nl}, {nr}] nằm ngoài [{ql}, {qr}]: không đóng góp gì, trả về 0 và bỏ cả nhánh này.',
    'The range [{nl}, {nr}] lies outside [{ql}, {qr}]: it adds nothing, return 0 and drop this whole branch.',
  ),
  split: m(
    'Đoạn [{nl}, {nr}] cắt [{ql}, {qr}] một phần: chia đôi tại mid = {mid} và hỏi cả hai con, nút {k2} và nút {k3}.',
    'The range [{nl}, {nr}] overlaps [{ql}, {qr}] partly: split at mid = {mid} and ask both children, nodes {k2} and {k3}.',
  ),
  done: m(
    'Tổng a[{ql}..{qr}] = {acc}, gộp từ {parts} nút; mỗi truy vấn chỉ thăm O(log n) nút.',
    'The sum of a[{ql}..{qr}] = {acc}, combined from {parts|node|nodes}; each query visits only O(log n) nodes.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Cây đoạn lưu tổng của các đoạn "đẹp": nửa mảng, một phần tư, … đến từng phần tử. Nhờ đó một truy vấn tổng đoạn chỉ cần O(log n) nút. Mảng có {n} số.',
      'A segment tree stores the sums of "nice" ranges: half the array, a quarter, …, down to single elements. So a range-sum query needs only O(log n) nodes. The array has {n|number|numbers}.',
    ),
    hints: [
      m(
        'Mảng cộng dồn trả lời tổng đoạn nhanh; nó thiếu gì nếu giá trị hay đổi?',
        'A prefix array answers range sums fast; what does it lack if values change?',
      ),
      m(
        'Cập nhật một giá trị phải sửa O(n) ô. Cây đoạn cân bằng cả truy vấn lẫn cập nhật.',
        'Updating a value costs O(n) cells. A segment tree balances queries and updates.',
      ),
      m(
        'Chia đôi mảng đệ quy; mỗi nút giữ tổng của đoạn của nó; truy vấn ghép một vài nút.',
        'Halve the array recursively; each node keeps the sum of its range; a query combines a few nodes.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cây đoạn là cây tìm kiếm nhị phân: nó chia theo vị trí trong mảng, không theo giá trị.',
        'Thinking a segment tree is a binary search tree: it splits by position in the array, not by value.',
      ),
    ],
  },
  {
    id: 'build',
    label: m('Dựng cây', 'Build the tree'),
    narration: m(
      'Ta dựng từ lá lên gốc: lá giữ giá trị, nút trong cộng hai con của nó. Có {n} lá và n − 1 nút trong, mỗi nút tính O(1), nên dựng cây mất O(n).',
      'We build from the leaves up: leaves keep values, an inner node adds its two children. There are {n} leaves and n − 1 inner nodes, each O(1), so the build costs O(n).',
    ),
    hints: [
      m(
        'Muốn biết tổng của một đoạn, ta dùng các đoạn nhỏ hơn nào?',
        'To know the sum of a range, which smaller ranges do we use?',
      ),
      m(
        'Hai nửa của nó: tổng đoạn = tổng nửa trái + tổng nửa phải.',
        'Its two halves: range sum = left half sum + right half sum.',
      ),
      m(
        'Vì vậy dựng từ lá lên: t[k] = t[2k] + t[2k + 1].',
        'So build upward from the leaves: t[k] = t[2k] + t[2k + 1].',
      ),
    ],
    misconceptions: [
      m(
        'Cấp phát mảng cây cỡ 2n: mảng chỉ số kiểu heap cần cỡ 4n để chắc chắn đủ cho mọi n.',
        'Allocating a tree array of size 2n: the heap-indexed array needs about 4n to be safe for every n.',
      ),
    ],
  },
  {
    id: 'visit',
    label: m('Thăm một nút', 'Visit a node'),
    narration: m(
      'Ở nút {k} với đoạn [{nl}, {nr}], ta so nó với đoạn hỏi [{ql}, {qr}]. Có ba khả năng: ngoài (bỏ), trong (lấy tổng sẵn có), cắt (chia đôi).',
      'At node {k} with range [{nl}, {nr}] we compare it with the query range [{ql}, {qr}]. Three cases: outside (drop), inside (take the stored sum), overlapping (split).',
    ),
    ask: {
      text: m(
        'Theo em, đoạn của nút này nằm trong, ngoài hay cắt đoạn hỏi?',
        'Does this node’s range lie inside, outside or overlap the query range?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Nằm trọn trong', 'Fully inside'),
          m('Nằm ngoài', 'Outside'),
          m('Cắt một phần', 'Partly overlapping'),
        ],
        answer: (_frame, next) => {
          const tags = next?.meta.tags ?? [];
          if (tags.includes('beat:full-cover')) return 0;
          if (tags.includes('beat:no-overlap')) return 1;
          return 2; // beat:split
        },
      },
    },
    hints: [
      m(
        'Đặt hai đoạn lên một trục số và nhìn chúng.',
        'Put the two ranges on a number line and look at them.',
      ),
      m(
        'Ngoài: không có điểm chung. Trong: đoạn của nút nằm gọn trong đoạn hỏi.',
        'Outside: no common point. Inside: the node’s range fits entirely within the query.',
      ),
      m(
        'Còn lại là cắt một phần: có điểm chung nhưng nút còn phần ngoài đoạn hỏi.',
        'Anything else is a partial overlap: common points exist but the node also covers outside parts.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm "cắt" với "trong": nếu nút còn chứa phần tử ngoài đoạn hỏi thì không dùng được tổng của nó.',
        'Mixing up "overlapping" with "inside": if the node still covers elements outside the query, its sum cannot be used.',
      ),
    ],
  },
  {
    id: 'full-cover',
    label: m('Phủ trọn', 'Fully covered'),
    narration: m(
      'Đoạn của nút {k} nằm hoàn toàn trong đoạn hỏi, nên tổng sẵn có {sum} đúng là phần đóng góp của nó. Ta cộng và không cần xuống các con.',
      'The range of node {k} lies entirely inside the query, so its stored sum {sum} is exactly its contribution. We add it and do not descend.',
    ),
    hints: [
      m(
        'Khi nút nằm gọn trong đoạn hỏi, có cần xem các con của nó không?',
        'When a node fits entirely within the query, do we need its children?',
      ),
      m(
        'Không: tổng của nút đã gồm đủ các con của nó.',
        'No: the node’s sum already includes all its children.',
      ),
      m(
        'Cộng t[k] vào kết quả và return; đây là lý do truy vấn nhanh.',
        'Add t[k] to the answer and return; that is why queries are fast.',
      ),
    ],
    misconceptions: [
      m(
        'Vẫn xuống các lá của nút phủ trọn: sẽ mất O(n) thay vì O(log n).',
        'Still descending to the leaves of a fully covered node: that costs O(n) instead of O(log n).',
      ),
    ],
  },
  {
    id: 'no-overlap',
    label: m('Không giao', 'No overlap'),
    narration: m(
      'Đoạn [{nl}, {nr}] không có điểm chung với [{ql}, {qr}], nên cả nhánh này không đóng góp gì: trả về 0.',
      'The range [{nl}, {nr}] shares no point with [{ql}, {qr}], so this whole branch contributes nothing: return 0.',
    ),
    hints: [
      m(
        'Nếu đoạn của nút hoàn toàn nằm bên ngoài đoạn hỏi, nó đóng góp bao nhiêu?',
        'If the node’s range lies completely outside the query, how much does it contribute?',
      ),
      m('Bằng 0, và các con của nó cũng vậy.', 'Zero, and so do its children.'),
      m('Điều kiện: qr < l hoặc r < ql ⇒ return 0.', 'The test: qr < l or r < ql ⇒ return 0.'),
    ],
    misconceptions: [
      m(
        'Quên trường hợp ngoài: đệ quy sẽ đi xuống mãi các nhánh không liên quan.',
        'Forgetting the outside case: the recursion would keep walking into unrelated branches.',
      ),
    ],
  },
  {
    id: 'split',
    label: m('Chia đôi', 'Split'),
    narration: m(
      'Đoạn [{nl}, {nr}] chỉ cắt một phần đoạn hỏi nên chưa dùng được tổng của nó. Ta chia đôi tại mid = {mid} rồi hỏi hai con.',
      'The range [{nl}, {nr}] only partly overlaps the query, so its sum cannot be used yet. We split at mid = {mid} and ask both children.',
    ),
    hints: [
      m(
        'Khi nút cắt đoạn hỏi, tổng của nút có đúng không?',
        'When a node overlaps the query, is the node’s sum right?',
      ),
      m(
        'Không, vì nó gồm cả phần ngoài đoạn hỏi.',
        'No, because it also includes parts outside the query.',
      ),
      m(
        'Hỏi hai con: [l, mid] và [mid + 1, r], rồi cộng kết quả.',
        'Ask both children: [l, mid] and [mid + 1, r], then add the results.',
      ),
    ],
    misconceptions: [
      m(
        'Chia sai nửa phải: nửa phải là [mid + 1, r], không phải [mid, r].',
        'Splitting the right half wrongly: it is [mid + 1, r], not [mid, r].',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng a[{ql}..{qr}] = {acc}, ghép từ {parts} nút. Một truy vấn thăm tối đa khoảng 4·log₂ n nút, nên O(log n); dựng cây O(n).',
      'The sum of a[{ql}..{qr}] = {acc}, assembled from {parts|node|nodes}. A query visits at most about 4·log₂ n nodes, so O(log n); the build is O(n).',
    ),
    hints: [
      m(
        'Ở mỗi tầng ta thăm nhiều nhất mấy nút "cắt"?',
        'At most how many "overlapping" nodes do we visit per level?',
      ),
      m(
        'Tối đa hai: chỉ nút chứa đầu trái và đầu phải của đoạn hỏi.',
        'At most two: only the nodes containing the left and right ends of the query.',
      ),
      m(
        'Vậy mỗi tầng thăm O(1) nút và có log n tầng: O(log n).',
        'So each level visits O(1) nodes and there are log n levels: O(log n).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cây đoạn chỉ để tính tổng: với hàm kết hợp bất kỳ (min, max, gcd) nó đều dùng được.',
        'Thinking a segment tree is only for sums: it works for any associative combine (min, max, gcd).',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a = input.values;
  const n = a.length;
  const { l: ql, r: qr } = input;
  // structure: node k covers [lo[k], hi[k]]
  const lo: number[] = [];
  const hi: number[] = [];
  const level: number[] = [];
  const sumOf: (number | undefined)[] = [];
  const ids: number[] = [];
  const mk = (k: number, l: number, r: number, lv: number): void => {
    ids.push(k);
    lo[k] = l;
    hi[k] = r;
    level[k] = lv;
    if (l === r) return;
    const mid = Math.floor((l + r) / 2);
    mk(2 * k, l, mid, lv + 1);
    mk(2 * k + 1, mid + 1, r, lv + 1);
  };
  mk(1, 0, n - 1, 0);
  ids.sort((x, y) => x - y);
  const depth = Math.max(...ids.map((k) => level[k]));
  const status = new Map<number, HighlightKind>();

  const nodes = (): TreeNode[] =>
    ids.map((k) => ({
      id: String(k),
      label: `[${lo[k]},${hi[k]}]`,
      ...(k > 1 ? { parent: String(Math.floor(k / 2)) } : {}),
      ...(sumOf[k] !== undefined ? { note: String(sumOf[k]) } : {}),
    }));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    marks: Record<string, HighlightKind>,
    tag?: string,
    parts?: string[],
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const [k, v] of status) highlights[String(k)] = v;
    emit(
      { nodes: nodes() },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        ...(parts
          ? { aux: [{ id: 'parts', label: msg(m('Đã cộng', 'Added'), ctx.locale), items: parts }] }
          : {}),
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n, last: n - 1 }, {}, 'start');
  // build: leaves first, then each higher level
  for (const k of ids) if (lo[k] === hi[k]) sumOf[k] = a[lo[k]];
  put(
    EX.buildLeaves,
    1,
    { n },
    Object.fromEntries(
      ids.filter((k) => lo[k] === hi[k]).map((k) => [String(k), 'visited' as HighlightKind]),
    ),
    'build',
  );
  for (let lv = depth - 1; lv >= 0; lv--) {
    tick();
    const here = ids.filter((k) => level[k] === lv && lo[k] !== hi[k]);
    for (const k of here) sumOf[k] = (sumOf[2 * k] as number) + (sumOf[2 * k + 1] as number);
    if (here.length === 0) continue;
    const k0 = here[0];
    put(
      EX.buildLevel,
      1,
      { n, lv, l: lo[k0], r: hi[k0], sum: sumOf[k0] as number },
      Object.fromEntries(here.map((k) => [String(k), 'visited' as HighlightKind])),
      'build',
    );
  }

  put(EX.query, 2, { ql, qr }, {}, undefined);
  let acc = 0;
  const parts: string[] = [];
  const walk = (k: number): void => {
    tick();
    const [nl, nr] = [lo[k], hi[k]];
    const vars = { k, nl, nr, ql, qr };
    put(EX.visit, 2, vars, { [String(k)]: 'active' }, 'visit', [...parts]);
    if (qr < nl || nr < ql) {
      status.set(k, 'muted');
      put(EX.none, 3, vars, {}, 'no-overlap', [...parts]);
      return;
    }
    if (ql <= nl && nr <= qr) {
      acc += sumOf[k] as number;
      parts.push(`[${nl},${nr}]=${sumOf[k]}`);
      status.set(k, 'result');
      put(EX.full, 4, { ...vars, sum: sumOf[k] as number, acc }, {}, 'full-cover', [...parts]);
      return;
    }
    status.set(k, 'compare');
    const mid = Math.floor((nl + nr) / 2);
    put(EX.split, 5, { ...vars, mid, k2: 2 * k, k3: 2 * k + 1 }, {}, 'split', [...parts]);
    walk(2 * k);
    walk(2 * k + 1);
  };
  walk(1);
  put(EX.done, 6, { ql, qr, acc, parts: parts.length }, {}, 'done', [...parts]);
}

export const segmentTreeEntry: WalkthroughEntry<In, S> = {
  id: 'segment-tree',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t3-segment-tree'],
  title: m('Cây đoạn: dựng và truy vấn tổng', 'Segment tree: build and range-sum query'),
  code: {
    pseudo: [
      'build(k, l, r): nếu l = r: t[k] ← a[l]; ngược lại dựng hai nửa, t[k] ← t[2k] + t[2k + 1]',
      'query(k, l, r, ql, qr):',
      '    if [l, r] ngoài [ql, qr]: return 0',
      '    if [l, r] nằm trọn trong [ql, qr]: return t[k]',
      '    mid ← ⌊(l + r) / 2⌋; return query(2k, l, mid, …) + query(2k + 1, mid + 1, r, …)',
      'return query(1, 0, n − 1, ql, qr)',
    ],
    impl: {
      cpp: [
        'void build(std::vector<long long>& t, const std::vector<int>& a, int k, int l, int r) {',
        '    if (l == r) { t[k] = a[l]; return; }',
        '    int mid = (l + r) / 2;',
        '    build(t, a, 2 * k, l, mid);',
        '    build(t, a, 2 * k + 1, mid + 1, r);',
        '    t[k] = t[2 * k] + t[2 * k + 1];',
        '}',
        'long long query(const std::vector<long long>& t, int k, int l, int r, int ql, int qr) {',
        '    if (qr < l || r < ql) return 0;',
        '    if (ql <= l && r <= qr) return t[k];',
        '    int mid = (l + r) / 2;',
        '    return query(t, 2 * k, l, mid, ql, qr) + query(t, 2 * k + 1, mid + 1, r, ql, qr);',
        '}',
        'long long range_sum(const std::vector<int>& a, int ql, int qr) {',
        '    int n = a.size();',
        '    std::vector<long long> t(4 * n);',
        '    build(t, a, 1, 0, n - 1);',
        '    return query(t, 1, 0, n - 1, ql, qr);',
        '}',
      ],
      py: [
        'def build(t, a, k, l, r):',
        '    if l == r:',
        '        t[k] = a[l]',
        '        return',
        '    mid = (l + r) // 2',
        '    build(t, a, 2 * k, l, mid)',
        '    build(t, a, 2 * k + 1, mid + 1, r)',
        '    t[k] = t[2 * k] + t[2 * k + 1]',
        'def query(t, k, l, r, ql, qr):',
        '    if qr < l or r < ql:',
        '        return 0',
        '    if ql <= l and r <= qr:',
        '        return t[k]',
        '    mid = (l + r) // 2',
        '    return query(t, 2 * k, l, mid, ql, qr) + query(t, 2 * k + 1, mid + 1, r, ql, qr)',
        'def range_sum(a, ql, qr):',
        '    n = len(a)',
        '    t = [0] * (4 * n)',
        '    build(t, a, 1, 0, n - 1)',
        '    return query(t, 1, 0, n - 1, ql, qr)',
      ],
    },
    map: {
      cpp: { 1: [1, 2, 3, 4, 5, 6, 17], 2: [8], 3: [9], 4: [10], 5: [11, 12], 6: [18] },
      py: {
        1: [1, 2, 3, 4, 5, 6, 7, 8, 19],
        2: [9],
        3: [10, 11],
        4: [12, 13],
        5: [14, 15],
        6: [20],
      },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      values: { kind: 'int-array', len: [4, 8], range: [-99, 99] },
      l: { kind: 'int', range: [0, 7] },
      r: { kind: 'int', range: [0, 7] },
    },
  },
  check: (input) => {
    const issues: string[] = [];
    const n = input.values.length;
    if (n !== 4 && n !== 8) issues.push('length-not-4-or-8');
    if (input.l > input.r) issues.push('l-after-r');
    if (input.r >= n) issues.push('r-out-of-range');
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'n8-mid',
      label: m('n = 8, đoạn giữa', 'n = 8, a middle range'),
      input: { values: [5, 3, 8, 1, 9, 2, 7, 4], l: 2, r: 5 },
    },
    {
      id: 'n8-full',
      label: m('n = 8, cả mảng', 'n = 8, the whole array'),
      input: { values: [5, 3, 8, 1, 9, 2, 7, 4], l: 0, r: 7 },
    },
    {
      id: 'n4-point',
      label: m('n = 4, một điểm', 'n = 4, a single point'),
      input: { values: [6, -2, 4, 3], l: 1, r: 1 },
    },
    {
      id: 'n8-edge',
      label: m('n = 8, phần tử đầu', 'n = 8, the first element'),
      input: { values: [5, 3, 8, 1, 9, 2, 7, 4], l: 0, r: 0 },
    },
    {
      id: 'n4-span',
      label: m('n = 4, đoạn 1..3', 'n = 4, range 1..3'),
      input: { values: [6, -2, 4, 3], l: 1, r: 3 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'build',
      text: m(
        'Mảng cây kích thước 4n (không phải 2n) để chắc chắn đủ cho mọi n; chia đôi bằng mid = (l + r) / 2 với hai nửa [l, mid] và [mid + 1, r].',
        'Make the tree array 4n (not 2n) to be safe for every n; halve with mid = (l + r) / 2 and the two halves [l, mid] and [mid + 1, r].',
      ),
    },
    {
      lang: 'cpp',
      beat: 'full-cover',
      text: m(
        'Tổng có thể vượt int khi n lớn: dùng long long cho mảng cây và kết quả.',
        'Sums can overflow int for large n: use long long for the tree array and the result.',
      ),
    },
    {
      lang: 'py',
      beat: 'split',
      text: m(
        'Chia nguyên bằng // : mid = (l + r) // 2; dùng / cho ra số thực và làm chỉ số sai.',
        'Use integer division //: mid = (l + r) // 2; / gives a float and breaks the index.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
