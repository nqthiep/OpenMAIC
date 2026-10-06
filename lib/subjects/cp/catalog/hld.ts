/**
 * Walkthrough entry: heavy-light decomposition and a path query u–v (SCHEMA §5, card 2D-01).
 * Tree rooted at node 0; children by increasing index; the heavy child is the first child with the
 * largest subtree. Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import { isTree } from '@/lib/subjects/cp/catalog/dp-tree';

type In = { g: { n: number; edges: number[][] }; u: number; v: number };
type TreeNode = { id: string; label: string; parent?: string; note?: string; edgeLabel?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const ASKED_HEAVY = 2;

const EX = {
  start: m(
    'Cây {n} đỉnh, gốc A. Ta muốn xử lý đường đi giữa hai đỉnh nhanh bằng cách chia cây thành ít chuỗi dọc. Cần biết kích thước cây con trước.',
    'A tree of {n} nodes rooted at A. To handle a path between two nodes fast we split the tree into a few vertical chains. First we need subtree sizes.',
  ),
  sizes: m(
    'size[x] = 1 + tổng size của các con: số đỉnh trong cây con của x (ghi dưới mỗi đỉnh). Gốc có size {n}.',
    'size[x] = 1 + the sum of the children’s sizes: the number of nodes in the subtree of x (written under each node). The root has size {n}.',
  ),
  ask: m(
    'Đỉnh {x} có {k} con. Con nào của {x} là con nặng?',
    'Node {x} has {k} children. Which child of {x} is the heavy child?',
  ),
  heavy: m(
    'Con nặng của {x} là {c} (size {sc}): con có cây con lớn nhất. Cạnh {x}–{c} là cạnh nặng.',
    'The heavy child of {x} is {c} (size {sc}): the child with the largest subtree. The edge {x}–{c} is heavy.',
  ),
  chains: m(
    'Nối các cạnh nặng thành {k} chuỗi, mỗi chuỗi một màu; mỗi đỉnh thuộc đúng một chuỗi. Đầu chuỗi (head) là đỉnh trên cùng.',
    'Joining heavy edges gives {k} chains, one colour each; every node is in exactly one chain. The head of a chain is its top node.',
  ),
  query: m(
    'Đường {a}–{b} gồm các đoạn thuộc chuỗi. Đoạn {i}: từ {x} lên đầu chuỗi {h}, rồi nhảy sang cha {p}.',
    'The path {a}–{b} consists of chain pieces. Piece {i}: from {x} up to the chain head {h}, then jump to its parent {p}.',
  ),
  last: m(
    'Đoạn {i} cuối cùng: {x} và {y} cùng chuỗi nên nối thẳng trong chuỗi đó.',
    'Last piece {i}: {x} and {y} are in the same chain, so they connect directly inside it.',
  ),
  done: m(
    'Đường {a}–{b} gồm {segs} đoạn chuỗi. Mỗi lần nhảy qua cạnh nhẹ làm size ít nhất gấp đôi, nên tối đa khoảng log₂ n đoạn.',
    'The path {a}–{b} has {segs} chain pieces. Each jump over a light edge at least doubles the size, so there are at most about log₂ n pieces.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Phân tách nặng–nhẹ chia cây {n} đỉnh thành các chuỗi sao cho mọi đường đi chỉ cắt qua rất ít chuỗi. Nhờ đó truy vấn trên đường đi thành vài truy vấn trên đoạn.',
      'Heavy-light decomposition splits a tree of {n} nodes into chains so that any path crosses very few chains. A path query becomes a few range queries.',
    ),
    hints: [
      m(
        'Đường đi trên cây có thể dài; làm sao xử lý nhanh?',
        'A tree path can be long; how can it be handled fast?',
      ),
      m(
        'Chia cây thành các đường thẳng (chuỗi) rồi xử lý từng chuỗi như một mảng.',
        'Split the tree into straight chains and treat each chain like an array.',
      ),
      m(
        'Chọn chuỗi sao cho mọi đường đi cắt ít chuỗi: luôn đi tiếp xuống con có cây con lớn nhất.',
        'Pick chains so any path crosses few of them: always continue into the child with the biggest subtree.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chia theo độ sâu cũng được: cây lệch có thể cho rất nhiều chuỗi.',
        'Thinking splitting by depth works as well: a skewed tree could give very many chains.',
      ),
    ],
  },
  {
    id: 'sizes',
    label: m('Kích thước cây con', 'Subtree sizes'),
    narration: m(
      'Tính size[x] từ lá lên: đỉnh bằng 1 cộng size các con. Gốc có size {n}. Size cho biết con nào "nặng".',
      'Compute size[x] from the leaves up: a node is 1 plus its children’s sizes. The root has size {n}. Size tells which child is "heavy".',
    ),
    hints: [
      m('Lá có size bao nhiêu?', 'What is the size of a leaf?'),
      m(
        '1. Đỉnh trong có size 1 cộng size các con.',
        '1. An inner node has size 1 plus its children’s sizes.',
      ),
      m(
        'Tính bằng DFS hoặc BFS ngược; tổng cộng O(n).',
        'Compute by DFS or reverse BFS; O(n) in total.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm size với độ sâu: size đếm đỉnh trong cây con, độ sâu đếm cạnh tới gốc.',
        'Mixing up size and depth: size counts nodes in the subtree, depth counts edges to the root.',
      ),
    ],
  },
  {
    id: 'heavy',
    label: m('Con nặng', 'The heavy child'),
    narration: m(
      'Đỉnh {x} có {k} con và chọn đúng một con nặng: con có cây con lớn nhất. Chọn theo kích thước cây con, không theo độ sâu.',
      'Node {x} has {k} children and picks exactly one heavy child: the one with the biggest subtree. Choose by subtree size, not by depth.',
    ),
    ask: {
      text: m(
        'Theo em, con nặng của đỉnh này là con nào?',
        'Which child is the heavy child of this node?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Con có cây con lớn nhất', 'The child with the largest subtree'),
          m('Con có cây con sâu nhất', 'The child with the deepest subtree'),
          m('Con có chỉ số nhỏ nhất', 'The child with the smallest index'),
        ],
        answer: (_frame, next) => (next ? 0 : -1),
      },
    },
    hints: [
      m(
        'Ta muốn ít chuỗi cắt qua mọi đường đi: nên đi tiếp vào nhánh nhiều đỉnh hay ít đỉnh?',
        'We want few chains crossing any path: continue into the branch with many nodes or few?',
      ),
      m(
        'Nhánh nhiều đỉnh: các đường qua nhánh nhẹ chỉ chiếm ít đỉnh.',
        'The branch with many nodes: paths over the light branches touch few nodes.',
      ),
      m(
        'Con nặng = con có size lớn nhất; hòa thì lấy con đầu tiên.',
        'Heavy child = child with the largest size; on a tie take the first.',
      ),
    ],
    misconceptions: [
      m(
        'Chọn con sâu nhất (đó là phân tách theo độ dài): không đảm bảo log n chuỗi.',
        'Choosing the deepest child (long-path decomposition): it does not guarantee log n chains.',
      ),
    ],
  },
  {
    id: 'chains',
    label: m('Các chuỗi', 'The chains'),
    narration: m(
      'Nối các cạnh nặng ta được {k} chuỗi. Mỗi đỉnh thuộc đúng một chuỗi; đỉnh trên cùng của chuỗi là head. Các cạnh còn lại là cạnh nhẹ.',
      'Joining heavy edges gives {k} chains. Every node is in exactly one chain; the top node is its head. The remaining edges are light.',
    ),
    hints: [
      m(
        'Mỗi đỉnh có tối đa bao nhiêu cạnh nặng đi xuống?',
        'At most how many heavy edges go down from a node?',
      ),
      m(
        'Một, nên các cạnh nặng tạo thành các đường thẳng rời nhau.',
        'One, so the heavy edges form disjoint straight paths.',
      ),
      m(
        'head[x] = x nếu x là gốc hoặc không phải con nặng; ngược lại head[x] = head[cha].',
        'head[x] = x if x is the root or not a heavy child; otherwise head[x] = head[parent].',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chuỗi có thể rẽ nhánh: chuỗi chỉ đi theo một con nặng mỗi bước.',
        'Thinking a chain can branch: it follows just one heavy child at each step.',
      ),
    ],
  },
  {
    id: 'query-path',
    label: m('Đường đi u–v', 'The path u–v'),
    narration: m(
      'Để đi từ {x} lên, ta nhảy tới đầu chuỗi {h} (một đoạn liền trong chuỗi) rồi sang cha {p} qua cạnh nhẹ. Lặp lại cho tới khi hai đỉnh cùng chuỗi.',
      'To climb from {x} we jump to the chain head {h} (one contiguous piece of the chain) then cross a light edge to the parent {p}. Repeat until both nodes share a chain.',
    ),
    hints: [
      m(
        'Hai đỉnh khác chuỗi: nên đưa đỉnh nào lên trước?',
        'The nodes are in different chains: which one should climb first?',
      ),
      m('Đỉnh có đầu chuỗi sâu hơn.', 'The one whose chain head is deeper.'),
      m(
        'Mỗi lần nhảy qua một cạnh nhẹ; có tối đa khoảng log₂ n lần.',
        'Each jump crosses one light edge; there are at most about log₂ n of them.',
      ),
    ],
    misconceptions: [
      m(
        'Đưa cả hai đỉnh lên cùng lúc: phải luôn đưa đỉnh có đầu chuỗi sâu hơn.',
        'Climbing both nodes at once: always climb the one with the deeper chain head.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Đường {a}–{b} gồm {segs} đoạn chuỗi. Mỗi đoạn là một khoảng liên tiếp nên dùng cây đoạn được: mỗi truy vấn đường đi O(log² n).',
      'The path {a}–{b} has {segs} chain pieces. Each piece is a contiguous range so a segment tree applies: O(log² n) per path query.',
    ),
    hints: [
      m('Số đoạn chuỗi phụ thuộc vào gì?', 'What decides the number of chain pieces?'),
      m(
        'Số cạnh nhẹ trên đường; mỗi cạnh nhẹ làm size cây con ít nhất gấp đôi.',
        'The number of light edges on the path; each doubles the subtree size at least.',
      ),
      m(
        'Vậy tối đa log₂ n cạnh nhẹ, tức O(log n) đoạn.',
        'So at most log₂ n light edges, that is O(log n) pieces.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng HLD nhanh hơn cây đoạn thường: nó mở rộng cây đoạn cho đường đi trên cây.',
        'Thinking HLD is faster than a plain segment tree: it extends segment trees to paths on trees.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input.g;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of input.g.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  adj.forEach((l) => l.sort((x, y) => x - y));
  const par: number[] = Array(n).fill(-1);
  const dep: number[] = Array(n).fill(0);
  const order = [0];
  for (let i = 0; i < order.length; i++)
    for (const c of adj[order[i]])
      if (c !== par[order[i]]) {
        par[c] = order[i];
        dep[c] = dep[order[i]] + 1;
        order.push(c);
      }
  const sz: number[] = Array(n).fill(1);
  for (let i = n - 1; i > 0; i--) sz[par[order[i]]] += sz[order[i]];
  const heavy: number[] = Array(n).fill(-1);
  for (const x of order)
    for (const c of adj[x])
      if (c !== par[x] && (heavy[x] === -1 || sz[c] > sz[heavy[x]])) heavy[x] = c;
  const head: number[] = Array(n).fill(0);
  for (const x of order) head[x] = x === 0 || heavy[par[x]] !== x ? x : head[par[x]];
  const heads = order.filter((x) => head[x] === x);
  const group = (x: number): HighlightKind => `group-${heads.indexOf(head[x]) % 6}`;

  let showSizes = false;
  const heavySet = new Set<number>();
  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
    colour = false,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    if (colour) for (let x = 0; x < n; x++) highlights[letter(x)] = group(x);
    emit(
      {
        nodes: Array.from({ length: n }, (_, x) => ({
          id: letter(x),
          label: letter(x),
          ...(par[x] >= 0 ? { parent: letter(par[x]) } : {}),
          ...(showSizes ? { note: String(sz[x]) } : {}),
          ...(heavySet.has(x) ? { edgeLabel: msg(m('nặng', 'heavy'), ctx.locale) } : {}),
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

  put(EX.start, 1, { n }, {}, 'start');
  showSizes = true;
  put(EX.sizes, 1, { n }, {}, 'sizes');
  let asked = 0;
  for (const x of order) {
    if (heavy[x] < 0) continue;
    tick();
    const kids = adj[x].filter((c) => c !== par[x]);
    if (asked < ASKED_HEAVY) {
      asked++;
      put(EX.ask, 2, { x: letter(x), k: kids.length }, { [letter(x)]: 'active' }, 'heavy');
    }
    heavySet.add(heavy[x]);
    put(
      EX.heavy,
      2,
      { x: letter(x), c: letter(heavy[x]), sc: sz[heavy[x]] },
      { [letter(x)]: 'active', [letter(heavy[x])]: 'compare' },
    );
  }
  put(EX.chains, 3, { k: heads.length }, {}, 'chains', true);

  let { u, v } = input;
  const a = letter(u);
  const b = letter(v);
  let segs = 0;
  while (head[u] !== head[v]) {
    tick();
    if (dep[head[u]] < dep[head[v]]) [u, v] = [v, u];
    segs++;
    const piece: Record<string, HighlightKind> = {};
    for (let x = u; ; x = par[x]) {
      piece[letter(x)] = 'active';
      if (x === head[u]) break;
    }
    put(
      EX.query,
      4,
      { a, b, i: segs, x: letter(u), h: letter(head[u]), p: letter(par[head[u]]) },
      piece,
      'query-path',
      true,
    );
    u = par[head[u]];
  }
  segs++;
  put(
    EX.last,
    5,
    { i: segs, x: letter(u), y: letter(v) },
    { [letter(u)]: 'active', [letter(v)]: 'active' },
    undefined,
    true,
  );
  put(EX.done, 5, { a, b, segs }, {}, 'done', true);
}

export const hldEntry: WalkthroughEntry<In, S> = {
  id: 'hld',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t4-tree-advanced'],
  title: m('Phân tách nặng–nhẹ (HLD)', 'Heavy-light decomposition'),
  code: {
    pseudo: [
      'sz[x] ← 1 + Σ sz[con của x]',
      'heavy[x] ← con của x có sz lớn nhất',
      'head[x] ← x nếu x là gốc hoặc không phải con nặng của cha; ngược lại head[cha]',
      'while head[u] ≠ head[v]: nếu độ sâu head[u] < độ sâu head[v] thì đổi u, v; ghi đoạn [u..head[u]]; u ← cha[head[u]]',
      'ghi đoạn cuối giữa u và v; return số đoạn',
    ],
    impl: {
      cpp: [
        'int count_segments(int n, const std::vector<std::vector<int>>& adj, int u, int v) {',
        '    std::vector<int> par(n, -1), dep(n, 0), sz(n, 1), heavy(n, -1), head(n, 0), order;',
        '    order.push_back(0);',
        '    for (size_t i = 0; i < order.size(); i++)',
        '        for (int c : adj[order[i]])',
        '            if (c != par[order[i]]) { par[c] = order[i]; dep[c] = dep[order[i]] + 1; order.push_back(c); }',
        '    for (int i = n - 1; i > 0; i--) sz[par[order[i]]] += sz[order[i]];',
        '    for (int x : order)',
        '        for (int c : adj[x])',
        '            if (c != par[x] && (heavy[x] == -1 || sz[c] > sz[heavy[x]])) heavy[x] = c;',
        '    for (int x : order) {',
        '        if (x == 0 || heavy[par[x]] != x) head[x] = x;',
        '        else head[x] = head[par[x]];',
        '    }',
        '    int segs = 0;',
        '    while (head[u] != head[v]) {',
        '        if (dep[head[u]] < dep[head[v]]) std::swap(u, v);',
        '        segs++;',
        '        u = par[head[u]];',
        '    }',
        '    return segs + 1;',
        '}',
      ],
      py: [
        'def count_segments(n, adj, u, v):',
        '    par = [-1] * n',
        '    dep = [0] * n',
        '    order = [0]',
        '    for x in order:',
        '        for c in adj[x]:',
        '            if c != par[x]:',
        '                par[c] = x',
        '                dep[c] = dep[x] + 1',
        '                order.append(c)',
        '    sz = [1] * n',
        '    for x in reversed(order[1:]):',
        '        sz[par[x]] += sz[x]',
        '    heavy = [-1] * n',
        '    for x in order:',
        '        for c in adj[x]:',
        '            if c != par[x] and (heavy[x] == -1 or sz[c] > sz[heavy[x]]):',
        '                heavy[x] = c',
        '    head = [0] * n',
        '    for x in order:',
        '        head[x] = x if x == 0 or heavy[par[x]] != x else head[par[x]]',
        '    segs = 0',
        '    while head[u] != head[v]:',
        '        if dep[head[u]] < dep[head[v]]:',
        '            u, v = v, u',
        '        segs += 1',
        '        u = par[head[u]]',
        '    return segs + 1',
      ],
    },
    map: {
      cpp: {
        1: [2, 3, 4, 5, 6, 7],
        2: [8, 9, 10],
        3: [11, 12, 13, 14],
        4: [16, 17, 18, 19, 20],
        5: [21],
      },
      py: {
        1: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
        2: [14, 15, 16, 17, 18],
        3: [19, 20, 21],
        4: [23, 24, 25, 26, 27],
        5: [28],
      },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      g: { kind: 'edge-list', nodes: [2, 10], edges: [1, 9] },
      u: { kind: 'int', range: [0, 9] },
      v: { kind: 'int', range: [0, 9] },
    },
  },
  check: (input) => {
    const issues: string[] = [];
    if (!isTree(input.g.n, input.g.edges)) issues.push('not-a-tree');
    if (input.u >= input.g.n || input.v >= input.g.n) issues.push('node-out-of-range');
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'binary',
      label: m('Cây nhị phân 7 đỉnh', 'A binary tree of 7 nodes'),
      input: {
        g: {
          n: 7,
          edges: [
            [0, 1],
            [0, 2],
            [1, 3],
            [1, 4],
            [2, 5],
            [2, 6],
          ],
        },
        u: 3,
        v: 6,
      },
    },
    {
      id: 'caterpillar',
      label: m('Sâu bướm', 'A caterpillar'),
      input: {
        g: {
          n: 8,
          edges: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [1, 5],
            [2, 6],
            [3, 7],
          ],
        },
        u: 5,
        v: 7,
      },
    },
    {
      id: 'path',
      label: m('Một đường thẳng', 'A single path'),
      input: {
        g: {
          n: 6,
          edges: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [4, 5],
          ],
        },
        u: 0,
        v: 5,
      },
    },
    {
      id: 'star',
      label: m('Hình sao', 'A star'),
      input: {
        g: {
          n: 6,
          edges: [
            [0, 1],
            [0, 2],
            [0, 3],
            [0, 4],
            [0, 5],
          ],
        },
        u: 2,
        v: 5,
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'heavy',
      text: m(
        'Chọn con nặng theo KÍCH THƯỚC cây con, không theo độ sâu; và đánh số vị trí liên tục dọc mỗi chuỗi để dùng cây đoạn.',
        'Pick the heavy child by subtree SIZE, not depth; and number positions contiguously along each chain so a segment tree applies.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'query-path',
      text: m(
        'Đổi chỗ u, v bằng std::swap khi đầu chuỗi của u nông hơn; quên đổi làm vòng lặp đi sai hướng.',
        'Swap u and v with std::swap when the head of u is shallower; forgetting makes the loop climb the wrong side.',
      ),
    },
    {
      lang: 'py',
      beat: 'query-path',
      text: m(
        'Python: dùng u, v = v, u để đổi chỗ; và đệ quy sâu có thể vượt giới hạn, nên dùng BFS thứ tự như trên.',
        'Python: swap with u, v = v, u; and deep recursion may hit the limit, so use a BFS order as above.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
