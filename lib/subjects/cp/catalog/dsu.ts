/**
 * Walkthrough entry: disjoint set union with path compression and union by size
 * (SCHEMA §5, card 2C-01). The edges of the input are the sequence of union(a, b) calls.
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; edges: number[][] };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    '{n} đỉnh, ban đầu mỗi đỉnh là một tập riêng (đỉnh nào cũng là gốc). Ta làm {k} phép union(a, b); mỗi tập là một cây, gốc ghi kích thước |S|.',
    '{n|node|nodes}, each its own set at first (every node is a root). We perform {k} union(a, b) calls; each set is a tree whose root shows its size |S|.',
  ),
  find: m(
    'union({a}, {b}) – bước 1: tìm gốc của {a}. Từ {a} đi lên theo cha cho tới khi gặp một gốc. Cần đi lên mấy bước?',
    'union({a}, {b}) – step 1: find the root of {a}. From {a} go up through parents until a root. How many steps up?',
  ),
  findB: m(
    'union({a}, {b}) – bước 2: gốc của {a} là {ra}. Giờ tìm gốc của {b}: cần đi lên mấy bước?',
    'union({a}, {b}) – step 2: the root of {a} is {ra}. Now find the root of {b}: how many steps up?',
  ),
  compress: m(
    'Nén đường: mọi đỉnh trên đường từ {x} lên gốc {r} giờ trỏ thẳng tới {r}, nên lần tìm sau chỉ mất một bước.',
    'Path compression: every node on the way from {x} up to the root {r} now points straight at {r}, so the next find takes one step.',
  ),
  union: m(
    'Gốc {ra} (kích thước {sa}) và gốc {rb} (kích thước {sb}) khác nhau: gắn gốc nhỏ hơn vào gốc lớn hơn, tập mới có kích thước {s}.',
    'The roots {ra} (size {sa}) and {rb} (size {sb}) differ: hang the smaller root under the larger one; the new set has size {s}.',
  ),
  same: m(
    '{a} và {b} cùng gốc {ra}: đã cùng một tập, phép union này không đổi gì.',
    '{a} and {b} share the root {ra}: they are already in one set, so this union changes nothing.',
  ),
  done: m(
    'Sau {k} phép union còn {sets} tập rời nhau trong {n} đỉnh.',
    'After {k|union|unions} there are {sets} disjoint sets among the {n|node|nodes}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Hợp nhất tập (DSU) quản lý các tập rời nhau: hỏi hai đỉnh có cùng tập không và gộp hai tập. Mỗi tập là một cây; gốc là đại diện của tập. Có {n} đỉnh.',
      'A disjoint set union keeps disjoint sets: it answers whether two nodes share a set and merges two sets. Each set is a tree; the root represents the set. There are {n|node|nodes}.',
    ),
    hints: [
      m(
        'Làm sao biết hai đỉnh có thuộc cùng một nhóm sau nhiều lần nối?',
        'How can we tell whether two nodes are in the same group after many links?',
      ),
      m(
        'Mỗi nhóm cần một người đại diện duy nhất; hai đỉnh cùng nhóm khi cùng đại diện.',
        'Each group needs one representative; two nodes are in one group when they share it.',
      ),
      m(
        'Dùng cây: gốc là đại diện, find(x) đi lên tới gốc, union nối hai gốc với nhau.',
        'Use trees: the root is the representative, find(x) climbs to the root, union joins two roots.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng union nối trực tiếp hai đỉnh a và b: nó nối gốc của hai tập.',
        'Thinking union links the nodes a and b directly: it links the roots of their sets.',
      ),
    ],
  },
  {
    id: 'find',
    label: m('Tìm gốc', 'Find the root'),
    narration: m(
      'find({x}) đi lên theo cha: nếu {x} là gốc thì dừng ngay, nếu không thì hỏi cha của nó. Số bước đi lên bằng độ sâu của {x}.',
      'find({x}) climbs through parents: if {x} is a root it stops at once, otherwise it asks its parent. The number of steps equals the depth of {x}.',
    ),
    ask: {
      text: m(
        'Theo em, từ đỉnh này phải đi lên mấy bước để tới gốc?',
        'How many steps up does it take from this node to its root?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('0 bước (nó là gốc)', '0 steps (it is the root)'),
          m('1 bước', '1 step'),
          m('2 bước trở lên', '2 or more steps'),
        ],
        answer: (frame) => {
          const x = frame.meta.vars?.x;
          const nodes = (frame.state as { nodes?: TreeNode[] }).nodes;
          if (typeof x !== 'number' || !nodes) return -1;
          let depth = 0;
          let cur = nodes[x];
          while (cur.parent !== undefined) {
            depth++;
            cur = nodes[Number(cur.parent)];
          }
          return Math.min(depth, 2);
        },
      },
    },
    hints: [
      m(
        'Nhìn đỉnh này trên cây: nó có cha không?',
        'Look at this node in the tree: does it have a parent?',
      ),
      m(
        'Không có cha thì nó là gốc (0 bước); có cha thì xem cha có phải gốc không.',
        'No parent means it is a root (0 steps); with a parent, check whether the parent is a root.',
      ),
      m(
        'Đếm số cạnh đi lên tới đỉnh đầu tiên không có cha.',
        'Count the edges going up to the first node without a parent.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng find tìm kiếm trong cả tập: nó chỉ đi lên một đường duy nhất tới gốc.',
        'Thinking find searches the whole set: it just walks one path upward to the root.',
      ),
    ],
  },
  {
    id: 'compress',
    label: m('Nén đường', 'Path compression'),
    narration: m(
      'Đường tới gốc {r} dài, nên ta cho mọi đỉnh trên đường trỏ thẳng tới {r}. Cây thấp đi, các find sau gần như O(1).',
      'The path to the root {r} was long, so we make every node on it point straight at {r}. The tree gets flatter and later finds are nearly O(1).',
    ),
    hints: [
      m(
        'Sau khi biết gốc, ta có thể làm lần tìm sau nhanh hơn không?',
        'Once we know the root, can we make later finds faster?',
      ),
      m(
        'Có: gắn thẳng mọi đỉnh đã đi qua vào gốc.',
        'Yes: attach every node we passed straight to the root.',
      ),
      m(
        'p[x] = find(p[x]) trong đệ quy làm đúng việc đó khi quay lui.',
        'p[x] = find(p[x]) in the recursion does exactly that on the way back.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng nén đường đổi tập của các đỉnh: các đỉnh vẫn ở cùng tập, chỉ cây thấp hơn.',
        'Thinking compression changes which set nodes belong to: they stay in the same set, the tree is just flatter.',
      ),
    ],
  },
  {
    id: 'union',
    label: m('Hợp hai tập', 'Merge two sets'),
    narration: m(
      'Hai gốc khác nhau nên hai đỉnh ở hai tập khác nhau. Ta gắn gốc của tập nhỏ hơn (theo kích thước) vào gốc tập lớn hơn để cây không bị cao.',
      'The two roots differ, so the nodes are in different sets. We hang the root of the smaller set (by size) under the larger one so the tree stays low.',
    ),
    hints: [
      m(
        'Có hai gốc khác nhau; ta nối gốc nào vào gốc nào?',
        'There are two different roots; which do we hang under which?',
      ),
      m(
        'Nối gốc của tập nhỏ vào gốc tập lớn: chỉ một ít đỉnh bị sâu thêm một tầng.',
        'Hang the root of the small set under the large one: only a few nodes get one level deeper.',
      ),
      m(
        'So kích thước của hai GỐC (không so hai đỉnh a, b); cộng kích thước vào gốc mới.',
        'Compare the sizes of the two ROOTS (not the nodes a, b); add the sizes into the new root.',
      ),
    ],
    misconceptions: [
      m(
        'So kích thước của chính a và b thay vì của hai gốc: kích thước chỉ được lưu ở gốc.',
        'Comparing the sizes of a and b themselves instead of the two roots: sizes are kept only at roots.',
      ),
    ],
  },
  {
    id: 'same-set',
    label: m('Đã cùng tập', 'Already together'),
    narration: m(
      'Hai đỉnh có cùng gốc {ra}, nghĩa là đã cùng một tập. Nối thêm sẽ tạo chu trình, nên ta bỏ qua phép union này.',
      'The two nodes share the root {ra}, so they are already in one set. Linking again would form a cycle, so we skip this union.',
    ),
    hints: [
      m('Hai đỉnh cùng gốc thì sao?', 'What if two nodes have the same root?'),
      m(
        'Chúng đã cùng một tập; không có gì để gộp.',
        'They already share a set; there is nothing to merge.',
      ),
      m(
        'Nếu ra = rb thì bỏ qua: không đổi cây và không cộng kích thước lần nữa.',
        'If ra = rb skip: do not change the tree and do not add the size again.',
      ),
    ],
    misconceptions: [
      m(
        'Vẫn nối gốc với chính nó: sẽ tạo vòng và cộng kích thước hai lần.',
        'Still linking the root to itself: that makes a loop and counts the size twice.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Còn {sets} tập rời nhau. Với nén đường và hợp theo kích thước, mỗi phép tốn gần như O(1) (hàm Ackermann ngược).',
      'There are {sets} disjoint sets left. With path compression and union by size each operation costs almost O(1) (the inverse Ackermann function).',
    ),
    hints: [
      m(
        'Mỗi phép union làm số tập thay đổi thế nào?',
        'How does each union change the number of sets?',
      ),
      m(
        'Giảm đúng 1 nếu hai tập khác nhau, giữ nguyên nếu cùng tập.',
        'It drops by exactly 1 if the sets differ, and stays if they are the same.',
      ),
      m(
        'Số tập = n − (số phép union thực sự gộp được).',
        'Number of sets = n − (number of unions that really merged).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng DSU hỗ trợ tách tập: nó chỉ gộp, không có thao tác tách.',
        'Thinking a DSU can split sets: it only merges, there is no split.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const parent: number[] = Array.from({ length: n }, (_, i) => i);
  const size: number[] = Array(n).fill(1);
  let sets = n;

  const root = (x: number): number => {
    let cur = x;
    while (parent[cur] !== cur) cur = parent[cur];
    return cur;
  };
  const depth = (x: number): number => {
    let d = 0;
    for (let cur = x; parent[cur] !== cur; cur = parent[cur]) d++;
    return d;
  };

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let i = 0; i < n; i++) highlights[String(i)] = `group-${root(i) % 6}`;
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: String(i),
          label: String(i),
          ...(parent[i] !== i ? { parent: String(parent[i]) } : { note: `|S|=${size[i]}` }),
        })),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  /** Climb to the root; a path of two or more steps is compressed and shown in its own frame. */
  const climb = (x: number): number => {
    const r = root(x);
    if (depth(x) >= 2) {
      for (let cur = x; cur !== r && parent[cur] !== r; ) {
        const next = parent[cur];
        parent[cur] = r;
        cur = next;
      }
      put(EX.compress, 1, { x, r }, { [String(x)]: 'active', [String(r)]: 'compare' }, 'compress');
    }
    return r;
  };

  const k = input.edges.length;
  put(EX.start, 1, { n, k }, {}, 'start');
  for (const [a, b] of input.edges) {
    tick();
    put(EX.find, 1, { a, b, x: a }, { [String(a)]: 'active' }, 'find');
    const ra = climb(a);
    put(
      EX.findB,
      3,
      { a, b, ra, x: b },
      { [String(b)]: 'active', [String(ra)]: 'compare' },
      'find',
    );
    const rb = climb(b);
    if (ra === rb) {
      put(EX.same, 4, { a, b, ra }, { [String(ra)]: 'compare' }, 'same-set');
      continue;
    }
    let big = ra;
    let small = rb;
    if (size[big] < size[small]) [big, small] = [small, big];
    const sa = size[ra];
    const sb = size[rb];
    parent[small] = big;
    size[big] += size[small];
    sets--;
    put(
      EX.union,
      5,
      { ra, rb, sa, sb, s: size[big] },
      { [String(big)]: 'result', [String(small)]: 'compare' },
      'union',
    );
  }
  put(EX.done, 6, { k, sets, n }, {}, 'done');
}

export const dsuEntry: WalkthroughEntry<In, S> = {
  id: 'dsu',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t3-dsu'],
  title: m('Hợp nhất tập (DSU)', 'Disjoint set union (DSU)'),
  code: {
    pseudo: [
      'find(x): if p[x] ≠ x: p[x] ← find(p[x]); return p[x]',
      'for mỗi phép union(a, b):',
      '    ra ← find(a); rb ← find(b)',
      '    if ra = rb: bỏ qua (đã cùng tập)',
      '    else: gắn gốc nhỏ hơn vào gốc lớn hơn (so kích thước hai gốc); cộng kích thước',
      'return số tập',
    ],
    impl: {
      cpp: [
        'int find_root(std::vector<int>& p, int x) {',
        '    if (p[x] != x) p[x] = find_root(p, p[x]);',
        '    return p[x];',
        '}',
        'int count_sets(int n, const std::vector<std::pair<int, int>>& edges) {',
        '    std::vector<int> p(n), sz(n, 1);',
        '    for (int i = 0; i < n; i++) p[i] = i;',
        '    int sets = n;',
        '    for (const auto& e : edges) {',
        '        int ra = find_root(p, e.first), rb = find_root(p, e.second);',
        '        if (ra == rb) continue;',
        '        if (sz[ra] < sz[rb]) std::swap(ra, rb);',
        '        p[rb] = ra;',
        '        sz[ra] += sz[rb];',
        '        sets--;',
        '    }',
        '    return sets;',
        '}',
      ],
      py: [
        'def find_root(p, x):',
        '    if p[x] != x:',
        '        p[x] = find_root(p, p[x])',
        '    return p[x]',
        'def count_sets(n, edges):',
        '    p = list(range(n))',
        '    sz = [1] * n',
        '    sets = n',
        '    for a, b in edges:',
        '        ra, rb = find_root(p, a), find_root(p, b)',
        '        if ra == rb:',
        '            continue',
        '        if sz[ra] < sz[rb]:',
        '            ra, rb = rb, ra',
        '        p[rb] = ra',
        '        sz[ra] += sz[rb]',
        '        sets -= 1',
        '    return sets',
      ],
    },
    map: {
      cpp: { 1: [1, 2, 3, 4], 2: [9], 3: [10], 4: [11], 5: [12, 13, 14, 15], 6: [17] },
      py: { 1: [1, 2, 3, 4], 2: [9], 3: [10], 4: [11, 12], 5: [13, 14, 15, 16, 17], 6: [18] },
    },
  },
  inputSpec: { kind: 'edge-list', nodes: [2, 8], edges: [1, 8] },
  customInput: false,
  presets: [
    {
      id: 'chain',
      label: m('Nối thành đường thẳng', 'A chain of unions'),
      input: {
        n: 6,
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
      },
    },
    {
      id: 'star',
      label: m('Nối vào một đỉnh', 'A star of unions'),
      input: {
        n: 6,
        edges: [
          [0, 1],
          [0, 2],
          [0, 3],
          [0, 4],
        ],
      },
    },
    {
      id: 'redundant',
      label: m('Có phép union thừa', 'A redundant union'),
      input: {
        n: 4,
        edges: [
          [0, 1],
          [1, 2],
          [0, 2],
        ],
      },
    },
    {
      id: 'two-sets',
      label: m('Hai tập rời nhau', 'Two separate sets'),
      input: {
        n: 6,
        edges: [
          [0, 1],
          [2, 3],
          [1, 3],
          [3, 0],
          [4, 5],
        ],
      },
    },
    {
      id: 'min',
      label: m('Nhỏ nhất: 2 đỉnh', 'Smallest: 2 nodes'),
      input: { n: 2, edges: [[0, 1]] },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'union',
      text: m(
        'Hợp theo kích thước phải so kích thước của hai GỐC, không phải của a và b; kích thước chỉ hợp lệ ở gốc.',
        'Union by size must compare the sizes of the two ROOTS, not of a and b; sizes are valid only at roots.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'compress',
      text: m(
        'Nén đường bằng đệ quy p[x] = find_root(p, p[x]); với cây rất sâu (hàng trăm nghìn) dễ tràn stack, khi đó dùng bản lặp.',
        'Compressing recursively with p[x] = find_root(p, p[x]) can overflow the stack on very deep trees (hundreds of thousands); use an iterative version then.',
      ),
    },
    {
      lang: 'py',
      beat: 'compress',
      text: m(
        'Python giới hạn độ sâu đệ quy: find đệ quy trên cây cao cần sys.setrecursionlimit hoặc bản lặp (while p[x] != x). Nhờ hợp theo kích thước cây thấp nên ít khi gặp.',
        'Python limits recursion depth: a recursive find on tall trees needs sys.setrecursionlimit or a loop (while p[x] != x). Union by size keeps trees low so this is rare.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
