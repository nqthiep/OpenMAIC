/**
 * Walkthrough entry: maximum-weight independent set on a tree by DP over the children
 * (SCHEMA §5, card 2C-06). The tree is rooted at node 0; children are visited by increasing index.
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { g: { n: number; edges: number[][] }; w: number[] };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);

/** Is the edge list a tree on n nodes: n - 1 edges and every node reachable from node 0. */
export function isTree(n: number, edges: readonly number[][]): boolean {
  if (edges.length !== n - 1) return false;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const seen = new Set([0]);
  const queue = [0];
  for (let q = 0; q < queue.length; q++)
    for (const v of adj[queue[q]])
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
  return seen.size === n;
}

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Chọn các đỉnh của cây {n} đỉnh sao cho không hai đỉnh kề nhau cùng được chọn và tổng trọng số lớn nhất. Gốc là A; nhãn hiện trọng số w.',
    'Pick nodes of a tree with {n|node|nodes} so that no two adjacent nodes are both picked and the total weight is largest. The root is A; labels show the weight w.',
  ),
  down: m(
    'Đi xuống {u} (w = {wu}). Muốn tính cho {u} ta cần kết quả của các con của nó trước.',
    'Go down to {u} (w = {wu}). To compute for {u} we need the results of its children first.',
  ),
  leaf: m(
    '{u} là lá, không có con: dp0 = 0 (không chọn), dp1 = w = {wu} (chọn). Ghi [dp0, dp1] = [0, {wu}].',
    '{u} is a leaf with no children: dp0 = 0 (not picked), dp1 = w = {wu} (picked). Write [dp0, dp1] = [0, {wu}].',
  ),
  ask: m(
    'Các con của {u} (w = {wu}) đã có [dp0, dp1]. Nếu chọn {u} thì các con của nó có được chọn không?',
    'The children of {u} (w = {wu}) have their [dp0, dp1]. If {u} is picked, may its children be picked?',
  ),
  combine: m(
    'dp1[{u}] = {wu} + Σ dp0[con] = {wu} + {s1} = {d1}; dp0[{u}] = Σ max(dp0, dp1)[con] = {d0}.',
    'dp1[{u}] = {wu} + Σ dp0[child] = {wu} + {s1} = {d1}; dp0[{u}] = Σ max(dp0, dp1)[child] = {d0}.',
  ),
  root: m(
    'Đáp án là max(dp0, dp1) của gốc: max({r0}, {r1}) = {best}.',
    'The answer is max(dp0, dp1) of the root: max({r0}, {r1}) = {best}.',
  ),
  doneSome: m(
    'Tổng trọng số lớn nhất là {best}, đạt khi chọn các đỉnh {chosen} (không hai đỉnh nào kề nhau).',
    'The largest total weight is {best}, reached by picking nodes {chosen} (no two are adjacent).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Tập độc lập là tập đỉnh không có hai đỉnh kề nhau. Ta muốn tập có tổng trọng số lớn nhất trên một cây {n} đỉnh. Vét cạn 2^n tập thì chậm; DP trên cây làm theo từng cây con.',
      'An independent set has no two adjacent nodes. We want the one of largest total weight on a tree of {n|node|nodes}. Trying all 2^n sets is slow; tree DP works subtree by subtree.',
    ),
    hints: [
      m('Nếu chọn một đỉnh, các đỉnh nào bị cấm?', 'If we pick a node, which nodes are forbidden?'),
      m(
        'Các hàng xóm của nó, tức cha và các con. Cây con của mỗi con thì sao?',
        'Its neighbours, that is its parent and children. What about the subtree of each child?',
      ),
      m(
        'Mỗi cây con là một bài toán nhỏ hơn với hai trạng thái của gốc: được chọn hay không; ta tính dp0, dp1 cho từng đỉnh.',
        'Each subtree is a smaller problem with two states of its root: picked or not; we compute dp0 and dp1 for each node.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chọn các đỉnh có trọng số lớn nhất trước (tham lam) là đúng: một đỉnh nặng có thể chặn nhiều đỉnh nhẹ hơn tổng của chúng.',
        'Thinking picking the heaviest nodes first (greedy) is right: one heavy node can block lighter ones that together weigh more.',
      ),
    ],
  },
  {
    id: 'dfs-down',
    label: m('Đi xuống', 'Go down'),
    narration: m(
      'Ta duyệt cây từ gốc xuống, gọi dfs cho từng con. dp của {u} phụ thuộc vào dp của các con, nên phải xử lý các con xong rồi mới tính {u}.',
      'We walk down the tree from the root, calling dfs on each child. The dp of {u} depends on the dp of its children, so the children are finished before {u}.',
    ),
    hints: [
      m(
        'Muốn tính cho một đỉnh, ta cần biết gì trước?',
        'To compute for a node, what must we know first?',
      ),
      m('Kết quả của các con của nó.', 'The results of its children.'),
      m(
        'Vì vậy dùng đệ quy: dfs(u, parent) gọi dfs cho mọi hàng xóm khác parent rồi mới tính u.',
        'So use recursion: dfs(u, parent) calls dfs on every neighbour other than parent, then computes u.',
      ),
    ],
    misconceptions: [
      m(
        'Quên truyền parent: dfs sẽ đi ngược về cha và lặp mãi.',
        'Forgetting to pass parent: dfs would walk back to the parent and loop forever.',
      ),
    ],
  },
  {
    id: 'leaf',
    label: m('Lá', 'A leaf'),
    narration: m(
      'Lá {u} không có con nên không bị ràng buộc: không chọn thì được 0, chọn thì được w = {wu}. Đây là điểm xuất phát của DP.',
      'The leaf {u} has no children so nothing constrains it: not picking gives 0, picking gives w = {wu}. This is where the DP starts.',
    ),
    hints: [
      m(
        'Đỉnh không có con thì chọn nó cần xét thêm gì không?',
        'For a node without children, does picking it involve anything else?',
      ),
      m('Không: chỉ cần hai giá trị đơn giản.', 'No: just two simple values.'),
      m('dp0 = 0 và dp1 = w[u].', 'dp0 = 0 and dp1 = w[u].'),
    ],
    misconceptions: [
      m(
        'Đặt dp0 của lá bằng w: dp0 là trường hợp KHÔNG chọn lá, nên bằng 0.',
        'Setting dp0 of a leaf to w: dp0 is the case where the leaf is NOT picked, so it is 0.',
      ),
    ],
  },
  {
    id: 'combine',
    label: m('Ghép các con', 'Combine the children'),
    narration: m(
      'Nếu chọn {u} thì không con nào được chọn: dp1 = w[{u}] + tổng dp0 của các con. Nếu không chọn {u} thì mỗi con tự do chọn tốt hơn: dp0 = tổng max(dp0, dp1).',
      'If {u} is picked no child may be: dp1 = w[{u}] + the sum of dp0 over the children. If {u} is not picked each child is free to take its better option: dp0 = the sum of max(dp0, dp1).',
    ),
    ask: {
      text: m(
        'Theo em, nếu chọn đỉnh này thì các con của nó có được chọn không?',
        'If this node is picked, may its children be picked?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Có, được chọn', 'Yes, they may be'),
          m('Không, bị cấm', 'No, they are forbidden'),
        ],
        answer: (_frame, next) => (next ? 1 : -1),
      },
    },
    hints: [
      m('Hai đỉnh kề nhau có cùng được chọn không?', 'May two adjacent nodes both be picked?'),
      m('Không. Con của u kề với u.', 'No. A child of u is adjacent to u.'),
      m(
        'Vậy khi chọn u, mỗi con phải ở trạng thái không chọn, dùng dp0 của nó.',
        'So when u is picked, every child must be in its not-picked state, using its dp0.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng max(dp0, dp1) của các con cho cả dp1[u]: sẽ cho phép chọn hai đỉnh kề nhau.',
        'Using max(dp0, dp1) of the children for dp1[u] as well: that would let two adjacent nodes be picked.',
      ),
    ],
  },
  {
    id: 'choose-root',
    label: m('Chọn đáp án ở gốc', 'The answer at the root'),
    narration: m(
      'Gốc A là đỉnh cuối cùng được tính. Toàn cây là cây con của gốc, nên đáp án là tốt hơn trong hai trạng thái của gốc: max({r0}, {r1}) = {best}.',
      'The root A is computed last. The whole tree is the subtree of the root, so the answer is the better of the two states of the root: max({r0}, {r1}) = {best}.',
    ),
    hints: [
      m('Gốc có thể ở trạng thái nào?', 'Which states can the root be in?'),
      m('Được chọn (dp1) hoặc không (dp0).', 'Picked (dp1) or not (dp0).'),
      m(
        'Lấy max(dp0[gốc], dp1[gốc]); không cần xét thêm điều kiện nào ngoài.',
        'Take max(dp0[root], dp1[root]); no other condition is left to check.',
      ),
    ],
    misconceptions: [
      m(
        'Luôn lấy dp1 của gốc: có cây mà bỏ gốc đi cho kết quả lớn hơn.',
        'Always taking dp1 of the root: on some trees skipping the root gives more.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng lớn nhất là {best}. Mỗi đỉnh tính một lần theo các con của nó, nên O(n); các đỉnh được chọn tìm lại bằng cách đi từ gốc xuống.',
      'The largest total is {best}. Each node is computed once from its children, so O(n); the picked nodes are recovered by walking down from the root.',
    ),
    hints: [
      m('Mỗi đỉnh được tính bao nhiêu lần?', 'How many times is each node computed?'),
      m(
        'Đúng một lần, và mỗi cạnh được duyệt hai lần (xuống rồi lên).',
        'Exactly once, and each edge is walked twice (down and back up).',
      ),
      m(
        'Tổng O(n); để biết đỉnh nào được chọn, đi từ gốc: chọn nếu dp1 tốt hơn và cha không chọn.',
        'In total O(n); to know which nodes are picked, walk from the root: pick if dp1 is better and the parent is not picked.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tập tối ưu là duy nhất: có thể có nhiều tập cùng tổng lớn nhất.',
        'Thinking the optimal set is unique: several sets can share the largest total.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input.g;
  const w = input.w;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of input.g.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  adj.forEach((list) => list.sort((x, y) => x - y));
  const par: number[] = Array(n).fill(-1);
  const kids: number[][] = Array.from({ length: n }, () => []);
  const order = [0];
  for (let q = 0; q < order.length; q++)
    for (const v of adj[order[q]])
      if (v !== par[order[q]]) {
        par[v] = order[q];
        kids[order[q]].push(v);
        order.push(v);
      }
  const dp0: (number | undefined)[] = Array(n).fill(undefined);
  const dp1: (number | undefined)[] = Array(n).fill(undefined);
  const done = new Set<number>();

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
    final = false,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const u of done) highlights[letter(u)] = 'visited';
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: letter(i),
          label: `${letter(i)} (w=${w[i]})`,
          ...(par[i] >= 0 ? { parent: letter(par[i]) } : {}),
          ...(dp0[i] !== undefined ? { note: `[${dp0[i]},${dp1[i]}]` } : {}),
        })),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: final ? marks : { ...highlights, ...marks },
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n }, {}, 'start');
  const dfs = (u: number): void => {
    tick();
    put(EX.down, 1, { u: letter(u), wu: w[u] }, { [letter(u)]: 'active' }, 'dfs-down');
    for (const v of kids[u]) dfs(v);
    if (kids[u].length === 0) {
      dp0[u] = 0;
      dp1[u] = w[u];
      done.add(u);
      put(EX.leaf, 2, { u: letter(u), wu: w[u] }, { [letter(u)]: 'result' }, 'leaf');
      return;
    }
    put(EX.ask, 3, { u: letter(u), wu: w[u] }, { [letter(u)]: 'active' }, 'combine');
    const s1 = kids[u].reduce((s, v) => s + (dp0[v] as number), 0);
    const s0 = kids[u].reduce((s, v) => s + Math.max(dp0[v] as number, dp1[v] as number), 0);
    dp0[u] = s0;
    dp1[u] = w[u] + s1;
    done.add(u);
    put(
      EX.combine,
      3,
      { u: letter(u), wu: w[u], s1, d1: dp1[u] as number, d0: s0 },
      { [letter(u)]: 'result' },
    );
  };
  dfs(0);
  const r0 = dp0[0] as number;
  const r1 = dp1[0] as number;
  const best = Math.max(r0, r1);
  put(EX.root, 4, { r0, r1, best }, { A: 'active' }, 'choose-root');
  // recover the picked set top-down: a node is picked when its dp1 beats dp0 and its parent is not picked
  const pick: boolean[] = Array(n).fill(false);
  for (const u of order)
    pick[u] = par[u] < 0 ? r1 > r0 : !pick[par[u]] && (dp1[u] as number) > (dp0[u] as number);
  const marks: Record<string, HighlightKind> = {};
  for (let i = 0; i < n; i++) marks[letter(i)] = pick[i] ? 'result' : 'muted';
  const chosen = order
    .filter((u) => pick[u])
    .sort((x, y) => x - y)
    .map(letter)
    .join(', ');
  put(EX.doneSome, 4, { best, chosen: chosen || '∅' }, marks, 'done', true);
}

export const dpTreeEntry: WalkthroughEntry<In, S> = {
  id: 'dp-tree',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t4-dp-tree'],
  title: m('DP trên cây: tập độc lập trọng số lớn nhất', 'Tree DP: maximum-weight independent set'),
  code: {
    pseudo: [
      'dfs(u, parent):',
      '    dp1[u] ← w[u]; dp0[u] ← 0',
      '    for con v của u (v ≠ parent): dfs(v, u); dp1[u] ← dp1[u] + dp0[v]; dp0[u] ← dp0[u] + max(dp0[v], dp1[v])',
      'return max(dp0[gốc], dp1[gốc])',
    ],
    impl: {
      cpp: [
        'void dfs(int u, int parent, const std::vector<std::vector<int>>& adj, const std::vector<int>& w, std::vector<int>& dp0, std::vector<int>& dp1) {',
        '    dp1[u] = w[u];',
        '    dp0[u] = 0;',
        '    for (int v : adj[u]) {',
        '        if (v == parent) continue;',
        '        dfs(v, u, adj, w, dp0, dp1);',
        '        dp1[u] += dp0[v];',
        '        dp0[u] += std::max(dp0[v], dp1[v]);',
        '    }',
        '}',
        'int max_independent(int n, const std::vector<std::vector<int>>& adj, const std::vector<int>& w) {',
        '    std::vector<int> dp0(n, 0), dp1(n, 0);',
        '    dfs(0, -1, adj, w, dp0, dp1);',
        '    return std::max(dp0[0], dp1[0]);',
        '}',
      ],
      py: [
        'def dfs(u, parent, adj, w, dp0, dp1):',
        '    dp1[u] = w[u]',
        '    dp0[u] = 0',
        '    for v in adj[u]:',
        '        if v == parent:',
        '            continue',
        '        dfs(v, u, adj, w, dp0, dp1)',
        '        dp1[u] += dp0[v]',
        '        dp0[u] += max(dp0[v], dp1[v])',
        'def max_independent(n, adj, w):',
        '    dp0 = [0] * n',
        '    dp1 = [0] * n',
        '    dfs(0, -1, adj, w, dp0, dp1)',
        '    return max(dp0[0], dp1[0])',
      ],
    },
    map: {
      cpp: { 1: [1], 2: [2, 3], 3: [4, 5, 6, 7, 8], 4: [14] },
      py: { 1: [1], 2: [2, 3], 3: [4, 5, 6, 7, 8, 9], 4: [14] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      g: { kind: 'edge-list', nodes: [1, 8], edges: [0, 7] },
      w: { kind: 'int-array', len: [1, 8], range: [1, 20] },
    },
  },
  check: (input) => {
    const issues: string[] = [];
    if (!isTree(input.g.n, input.g.edges)) issues.push('not-a-tree');
    if (input.w.length !== input.g.n) issues.push('weights-length');
    return issues;
  },
  customInput: false,
  presets: [
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
        w: [9, 3, 4, 2, 5, 3],
      },
    },
    {
      id: 'path',
      label: m('Đường thẳng', 'A path'),
      input: {
        g: {
          n: 5,
          edges: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
          ],
        },
        w: [4, 9, 3, 8, 2],
      },
    },
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
        w: [5, 6, 4, 3, 7, 8, 2],
      },
    },
    { id: 'single', label: m('Một đỉnh', 'One node'), input: { g: { n: 1, edges: [] }, w: [7] } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'combine',
      text: m(
        'dp1[u] = w[u] + Σ dp0[con] (chọn u thì con không được chọn); dp0[u] = Σ max(dp0, dp1)[con]. Đổi hai công thức cho nhau là lỗi hay gặp.',
        'dp1[u] = w[u] + Σ dp0[child] (picking u forbids its children); dp0[u] = Σ max(dp0, dp1)[child]. Swapping the two formulas is a common slip.',
      ),
    },
    {
      beat: 'dfs-down',
      text: m(
        'Truyền parent vào dfs để không đi ngược lên cha; cây thì không cần mảng visited.',
        'Pass parent into dfs so we never walk back up; on a tree no visited array is needed.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'dfs-down',
      text: m(
        'Đệ quy quá sâu có thể tràn stack với cây dài hàng trăm nghìn đỉnh; dùng thứ tự duyệt BFS ngược hoặc dfs lặp.',
        'Very deep recursion can overflow the stack on trees with hundreds of thousands of nodes; use a reversed BFS order or an iterative dfs.',
      ),
    },
    {
      lang: 'py',
      beat: 'dfs-down',
      text: m(
        'Python giới hạn độ sâu đệ quy: với cây dài cần sys.setrecursionlimit hoặc dfs lặp.',
        'Python limits recursion depth: for deep trees use sys.setrecursionlimit or an iterative dfs.',
      ),
    },
  ],
  maxFrames: 50,
  maxBytes: 200_000,
  run,
};
