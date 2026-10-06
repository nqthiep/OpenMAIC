/**
 * Walkthrough entry: the Fenwick tree (binary indexed tree), build by point updates and a prefix
 * sum query (SCHEMA §5, card 2C-05). Node i covers (i − lowbit(i), i]; its parent in the update
 * tree is i + lowbit(i). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[]; q: number };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const low = (i: number): number => i & -i;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Cây Fenwick cho {n} số (chỉ số từ 1). Nút i lưu tổng của a trên khoảng (i − lowbit(i), i]; cha của i là i + lowbit(i). Ban đầu mọi nút là 0.',
    'A Fenwick tree for {n} numbers (indices from 1). Node i stores the sum of a over (i − lowbit(i), i]; the parent of i is i + lowbit(i). All nodes start at 0.',
  ),
  lowbit: m(
    'Thêm a[{i}] = {ai}. Trước hết lowbit({i}) = {i} & {ni}: nó bằng bao nhiêu?',
    'Add a[{i}] = {ai}. First lowbit({i}) = {i} & {ni}: what is it?',
  ),
  add: m(
    'Cộng {ai} vào nút {j}: tree[{j}] = {tj}. Nhảy tiếp j ← j + lowbit(j) = {j} + {lb}.',
    'Add {ai} to node {j}: tree[{j}] = {tj}. Jump on with j ← j + lowbit(j) = {j} + {lb}.',
  ),
  addLast: m(
    'Cộng {ai} vào nút {j}: tree[{j}] = {tj}. j + lowbit(j) = {nj} vượt quá n, nên dừng.',
    'Add {ai} to node {j}: tree[{j}] = {tj}. j + lowbit(j) = {nj} exceeds n, so stop.',
  ),
  query: m(
    'Tổng tiền tố a[1..{q}]: bắt đầu từ j = {q}, cộng tree[j] rồi bỏ bit thấp nhất, j ← j − lowbit(j), tới khi j = 0.',
    'Prefix sum a[1..{q}]: start at j = {q}, add tree[j] then drop the lowest set bit, j ← j − lowbit(j), until j = 0.',
  ),
  jump: m(
    'tree[{j}] phủ ({jl}, {j}] nên cộng {tj}: tổng = {sum}. Rồi j ← {j} − lowbit({j}) = {nj}.',
    'tree[{j}] covers ({jl}, {j}], add {tj}: sum = {sum}. Then j ← {j} − lowbit({j}) = {nj}.',
  ),
  done: m(
    'Tổng a[1..{q}] = {sum}, gộp từ {steps} nút: số bước chỉ bằng số bit 1 của {q}, tối đa log₂ n.',
    'The sum a[1..{q}] = {sum}, combined from {steps} nodes: the step count equals the number of 1-bits of {q}, at most log₂ n.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Cây Fenwick cần ít mã hơn cây đoạn nhưng trả lời tổng tiền tố cũng trong O(log n). Mỗi nút phụ trách một khoảng có độ dài bằng bit thấp nhất của chỉ số. Có {n} số.',
      'A Fenwick tree needs less code than a segment tree yet also answers prefix sums in O(log n). Each node is responsible for a range whose length is the lowest set bit of its index. There are {n} numbers.',
    ),
    hints: [
      m(
        'Mảng cộng dồn trả lời tổng tiền tố rất nhanh; điều gì làm nó khó dùng khi giá trị hay thay đổi?',
        'A prefix array answers prefix sums fast; what makes it hard to use when values change?',
      ),
      m(
        'Đổi một giá trị phải sửa O(n) ô cộng dồn.',
        'Changing one value means fixing O(n) prefix cells.',
      ),
      m(
        'Fenwick chia mảng thành các khoảng có độ dài luỹ thừa hai theo chỉ số nhị phân, nên cập nhật và truy vấn đều O(log n).',
        'A Fenwick tree splits the array into power-of-two lengths given by the binary index, so updates and queries are both O(log n).',
      ),
    ],
    misconceptions: [
      m(
        'Đánh chỉ số từ 0: cây Fenwick dùng chỉ số từ 1, vì lowbit(0) = 0 sẽ làm vòng lặp không tiến.',
        'Indexing from 0: a Fenwick tree uses indices from 1, since lowbit(0) = 0 would stall the loop.',
      ),
    ],
  },
  {
    id: 'lowbit',
    label: m('Bit thấp nhất', 'The lowest bit'),
    narration: m(
      'lowbit(i) = i & −i là luỹ thừa hai nhỏ nhất trong biểu diễn nhị phân của i. Với i = {i}, đó là {lb}; nó là độ dài khoảng nút {i} phụ trách.',
      'lowbit(i) = i & −i is the smallest power of two in the binary form of i. For i = {i} it is {lb}; it is the length of the range node {i} covers.',
    ),
    ask: {
      text: m('Theo em, i & −i bằng bao nhiêu?', 'What is i & −i?'),
      predict: {
        kind: 'choice',
        options: [m('1', '1'), m('2', '2'), m('4', '4'), m('8', '8')],
        answer: (frame) => {
          const i = frame.meta.vars?.i;
          if (typeof i !== 'number') return -1;
          let k = 0;
          while (1 << k < (i & -i)) k++; // the exponent of the lowest set bit
          return k;
        },
      },
    },
    hints: [
      m(
        'Viết i ở dạng nhị phân: bit 1 thấp nhất ở vị trí nào?',
        'Write i in binary: where is the lowest 1 bit?',
      ),
      m(
        'i & −i giữ lại đúng bit 1 thấp nhất và xoá các bit khác.',
        'i & −i keeps exactly the lowest 1 bit and clears the others.',
      ),
      m(
        'Giá trị là 2^k với k là số chữ số 0 ở cuối i; ví dụ 6 = 110₂ nên lowbit = 2.',
        'The value is 2^k where k is the number of trailing zeros of i; for example 6 = 110₂ so lowbit = 2.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng i & −i là bit cao nhất: nó là bit thấp nhất.',
        'Thinking i & −i is the highest bit: it is the lowest one.',
      ),
    ],
  },
  {
    id: 'build-add',
    label: m('Cộng lên các nút phủ', 'Add up the covering nodes'),
    narration: m(
      'Cộng a[{i}] = {ai} vào nút {j} rồi nhảy lên cha j + lowbit(j): mọi nút trên đường này đều phủ vị trí {i}. Đường nhảy dài tối đa log₂ n.',
      'Add a[{i}] = {ai} to node {j} then jump to the parent j + lowbit(j): every node on this path covers position {i}. The jump path has at most log₂ n nodes.',
    ),
    hints: [
      m(
        'Những nút nào có khoảng chứa vị trí i?',
        'Which nodes have a range containing position i?',
      ),
      m(
        'Chính nút i, rồi cha của nó, cha của cha, … đi lên theo j + lowbit(j).',
        'Node i itself, then its parent, its grandparent, … going up with j + lowbit(j).',
      ),
      m(
        'Vòng lặp: for (j = i; j <= n; j += j & -j) tree[j] += a[i].',
        'The loop: for (j = i; j <= n; j += j & -j) tree[j] += a[i].',
      ),
    ],
    misconceptions: [
      m(
        'Quên điều kiện j ≤ n: j nhảy vượt quá n và ghi ra ngoài mảng.',
        'Forgetting the condition j ≤ n: j jumps past n and writes outside the array.',
      ),
    ],
  },
  {
    id: 'query-jump',
    label: m('Nhảy khi truy vấn', 'Jump while querying'),
    narration: m(
      'Để cộng tiền tố, ta lấy tree[{j}] (phủ ({jl}, {j}]) rồi bỏ bit 1 thấp nhất của j để sang khoảng liền kề bên trái. Cứ thế tới 0.',
      'To add a prefix we take tree[{j}] (covering ({jl}, {j}]) then clear the lowest 1 bit of j to reach the neighbouring range on the left. Repeat down to 0.',
    ),
    hints: [
      m('Tiền tố [1, q] ghép từ các khoảng nào?', 'Which ranges make up the prefix [1, q]?'),
      m(
        'Khoảng (q − lowbit(q), q] rồi tiếp phần còn lại [1, q − lowbit(q)].',
        'The range (q − lowbit(q), q], then the remaining part [1, q − lowbit(q)].',
      ),
      m(
        'Vòng lặp: for (j = q; j > 0; j -= j & -j) s += tree[j]; số bước bằng số bit 1 của q.',
        'The loop: for (j = q; j > 0; j -= j & -j) s += tree[j]; the step count is the number of 1 bits of q.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng j += lowbit khi truy vấn: đó là hướng cập nhật; truy vấn đi xuống bằng j −= lowbit.',
        'Using j += lowbit when querying: that is the update direction; a query goes down with j −= lowbit.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng a[1..{q}] = {sum}. Cả cập nhật lẫn truy vấn đều O(log n); bộ nhớ chỉ n + 1 số, ít hơn cây đoạn.',
      'The sum a[1..{q}] = {sum}. Both update and query cost O(log n); memory is only n + 1 numbers, less than a segment tree.',
    ),
    hints: [
      m(
        'Số bước truy vấn phụ thuộc vào điều gì của q?',
        'What property of q decides the number of query steps?',
      ),
      m(
        'Số bit 1 trong biểu diễn nhị phân của q.',
        'The number of 1 bits in the binary form of q.',
      ),
      m(
        'Tối đa log₂ n bước; để tính tổng đoạn [l, r] ta lấy prefix(r) − prefix(l − 1).',
        'At most log₂ n steps; for a range [l, r] take prefix(r) − prefix(l − 1).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng Fenwick làm được mọi thao tác như cây đoạn: nó hợp cho phép toán có phép ngược (cộng/trừ), không cho min/max đoạn.',
        'Thinking a Fenwick tree does everything a segment tree does: it suits operations with an inverse (add/subtract), not range min/max.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a = input.values;
  const n = a.length;
  const { q } = input;
  const tree: number[] = Array(n + 1).fill(0);
  let built = false;

  const nodes = (): TreeNode[] =>
    Array.from({ length: n }, (_, k) => {
      const i = k + 1;
      const p = i + low(i);
      return {
        id: String(i),
        label: `${i}:(${i - low(i)},${i}]`,
        ...(p <= n ? { parent: String(p) } : {}),
        ...(built ? { note: String(tree[i]) } : {}),
      };
    });

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    emit(
      { nodes: nodes() },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n }, {}, 'start');
  built = true;
  for (let i = 1; i <= n; i++) {
    tick();
    put(EX.lowbit, 3, { i, ni: -i, ai: a[i - 1], lb: low(i) }, { [String(i)]: 'active' }, 'lowbit');
    for (let j = i; j <= n; j += low(j)) {
      tick();
      tree[j] += a[i - 1];
      const nj = j + low(j);
      put(
        nj <= n ? EX.add : EX.addLast,
        3,
        { i, ai: a[i - 1], j, tj: tree[j], lb: low(j), nj },
        { [String(j)]: 'result', [String(i)]: 'active' },
        'build-add',
      );
    }
  }

  put(EX.query, 4, { q }, { [String(q)]: 'active' }, undefined);
  let sum = 0;
  let steps = 0;
  const used: Record<string, HighlightKind> = {};
  for (let j = q; j > 0; j -= low(j)) {
    tick();
    sum += tree[j];
    steps++;
    used[String(j)] = 'result';
    put(
      EX.jump,
      4,
      { j, jl: j - low(j), tj: tree[j], sum, nj: j - low(j) },
      { ...used },
      'query-jump',
    );
  }
  put(EX.done, 5, { q, sum, steps }, used, 'done');
}

export const fenwickEntry: WalkthroughEntry<In, S> = {
  id: 'fenwick',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t3-fenwick'],
  title: m('Cây chỉ số nhị phân (Fenwick)', 'The binary indexed tree (Fenwick)'),
  code: {
    pseudo: [
      'tree[1..n] ← 0',
      'for i ← 1 .. n:  (xây dựng: cộng a[i] vào cây)',
      '    for j ← i; j ≤ n; j ← j + (j & −j): tree[j] ← tree[j] + a[i]',
      's ← 0; for j ← q; j > 0; j ← j − (j & −j): s ← s + tree[j]',
      'return s',
    ],
    impl: {
      cpp: [
        'long long prefix_sum(const std::vector<int>& a, int q) {',
        '    int n = a.size();',
        '    std::vector<long long> tree(n + 1, 0);',
        '    for (int i = 1; i <= n; i++) {',
        '        for (int j = i; j <= n; j += j & -j) tree[j] += a[i - 1];',
        '    }',
        '    long long s = 0;',
        '    for (int j = q; j > 0; j -= j & -j) s += tree[j];',
        '    return s;',
        '}',
      ],
      py: [
        'def prefix_sum(a, q):',
        '    n = len(a)',
        '    tree = [0] * (n + 1)',
        '    for i in range(1, n + 1):',
        '        j = i',
        '        while j <= n:',
        '            tree[j] += a[i - 1]',
        '            j += j & -j',
        '    s = 0',
        '    j = q',
        '    while j > 0:',
        '        s += tree[j]',
        '        j -= j & -j',
        '    return s',
      ],
    },
    map: {
      cpp: { 1: [3], 2: [4], 3: [5], 4: [7, 8], 5: [9] },
      py: { 1: [3], 2: [4], 3: [5, 6, 7, 8], 4: [9, 10, 11, 12, 13], 5: [14] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      values: { kind: 'int-array', len: [4, 8], range: [-99, 99] },
      q: { kind: 'int', range: [1, 8] },
    },
  },
  check: (input) => {
    const issues: string[] = [];
    const n = input.values.length;
    if (n !== 4 && n !== 8) issues.push('length-not-4-or-8');
    if (input.q > n) issues.push('q-out-of-range');
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'n8-q7',
      label: m('n = 8, q = 7 (nhiều bước nhảy)', 'n = 8, q = 7 (many jumps)'),
      input: { values: [5, 3, 8, 1, 9, 2, 7, 4], q: 7 },
    },
    {
      id: 'n8-q8',
      label: m('n = 8, q = 8 (một nút)', 'n = 8, q = 8 (one node)'),
      input: { values: [5, 3, 8, 1, 9, 2, 7, 4], q: 8 },
    },
    {
      id: 'n4-q1',
      label: m('n = 4, q = 1', 'n = 4, q = 1'),
      input: { values: [6, -2, 4, 3], q: 1 },
    },
    {
      id: 'n8-q5',
      label: m('n = 8, q = 5', 'n = 8, q = 5'),
      input: { values: [5, 3, 8, 1, 9, 2, 7, 4], q: 5 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'build-add',
      text: m(
        'Chỉ số từ 1 và i & −i là bit thấp nhất; cập nhật dùng j += j & −j, truy vấn dùng j −= j & −j. Lẫn hai hướng là lỗi phổ biến.',
        'Indices start at 1 and i & −i is the lowest bit; updates use j += j & −j, queries use j −= j & −j. Mixing up the two directions is a common bug.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'lowbit',
      text: m(
        'i & -i đúng với số nguyên có dấu bù hai; với unsigned phải viết i & (~i + 1). Dùng long long cho tree nếu tổng lớn.',
        'i & -i works for two’s-complement signed integers; for unsigned write i & (~i + 1). Use long long for tree if sums are large.',
      ),
    },
    {
      lang: 'py',
      beat: 'lowbit',
      text: m(
        'Số nguyên Python không giới hạn nhưng i & -i vẫn đúng với số dương; tree dài n + 1 để bỏ ô 0.',
        'Python integers are unbounded but i & -i is still right for positive numbers; make tree n + 1 long to skip cell 0.',
      ),
    },
  ],
  maxFrames: 50,
  maxBytes: 200_000,
  run,
};
