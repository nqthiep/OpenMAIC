/**
 * Walkthrough entry: depth-first search, recursive, with visit order and call stack
 * (SCHEMA §5, card 2B-08). Neighbours are scanned by increasing index (deterministic).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { g: { n: number; edges: number[][] }; source: number };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const edgeKey = (a: number, b: number): string =>
  `${letter(Math.min(a, b))}-${letter(Math.max(a, b))}`;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'DFS từ đỉnh {s}: đi sâu theo một hướng tới khi hết đường, rồi quay lui. Ta ghi thứ tự thăm (#) của từng đỉnh.',
    'DFS from node {s}: go deep in one direction until stuck, then backtrack. We record the visit order (#) of each node.',
  ),
  visit: m(
    'Thăm {u} và đánh số #{k}. Call stack có {size} đỉnh. Tiếp theo DFS làm gì ở {u}?',
    'Visit {u} and number it #{k}. The call stack holds {size|node|nodes}. What does DFS do next at {u}?',
  ),
  tree: m(
    '{v} chưa thăm: đi từ {u} sang {v}. Cạnh {u}–{v} trở thành cạnh cây của DFS.',
    '{v} is unvisited: go from {u} to {v}. The edge {u}–{v} becomes a tree edge of the DFS.',
  ),
  skip: m(
    '{v} đã thăm (#{kv}): bỏ qua, không đi lại. Cạnh {u}–{v} không thuộc cây DFS.',
    '{v} is already visited (#{kv}): skip it, no second visit. The edge {u}–{v} is not in the DFS tree.',
  ),
  back: m(
    '{u} đã hết hàng xóm chưa thăm: quay lui, bỏ {u} khỏi call stack (còn {size}).',
    '{u} has no unvisited neighbour left: backtrack and pop {u} off the call stack ({size} left).',
  ),
  done: m(
    'Xong: DFS thăm {count} trong {n} đỉnh từ {s} qua {tree} cạnh cây.',
    'Done: DFS visited {count} of {n|node|nodes} from {s} through {tree} tree edges.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'DFS đi sâu: từ {s} chọn một hàng xóm chưa thăm, đi tiếp mãi, hết đường mới lùi lại. Ta đánh số thứ tự mỗi đỉnh được thăm.',
      'DFS goes deep: from {s} pick an unvisited neighbour and keep going, backing up only when stuck. We number each node as it is visited.',
    ),
    hints: [
      m(
        'Khác BFS (đi theo lớp), DFS ưu tiên điều gì?',
        'Unlike BFS (layer by layer), what does DFS prefer?',
      ),
      m(
        'Đi càng sâu càng tốt; cần nhớ đường đã đi để lùi lại.',
        'Going as deep as possible; it must remember the path to step back.',
      ),
      m(
        'Đệ quy làm điều đó: mỗi lời gọi dfs(v) nằm trên call stack, kết thúc lời gọi là quay lui.',
        'Recursion does that: each call dfs(v) sits on the call stack, and finishing the call is the backtrack.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng DFS tìm đường ngắn nhất: nó chỉ tìm một đường, có thể rất dài.',
        'Thinking DFS finds shortest paths: it finds some path, possibly a very long one.',
      ),
    ],
  },
  {
    id: 'visit',
    label: m('Thăm một đỉnh', 'Visit a node'),
    narration: m(
      'Thăm {u}: đánh dấu và gán số #{k}, đưa {u} lên call stack (đang có {size} đỉnh). Sau đó xét hàng xóm theo chỉ số tăng.',
      'Visit {u}: mark it and give it #{k}, push {u} on the call stack ({size} deep). Then examine neighbours in increasing index order.',
    ),
    ask: {
      text: m(
        'Theo em, bước tiếp theo của DFS tại đỉnh này là gì?',
        'What will DFS do next at this node?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Đi sâu sang hàng xóm chưa thăm', 'Go deeper to an unvisited neighbour'),
          m('Bỏ qua một hàng xóm đã thăm', 'Skip an already visited neighbour'),
          m('Quay lui (hết hàng xóm)', 'Backtrack (no neighbour left)'),
        ],
        answer: (_frame, next) => {
          const tags = next?.meta.tags ?? [];
          if (tags.includes('beat:tree-edge')) return 0;
          if (tags.includes('beat:skip-visited')) return 1;
          return 2; // beat:backtrack
        },
      },
    },
    hints: [
      m(
        'Nhìn hàng xóm đầu tiên (chỉ số nhỏ nhất) của đỉnh này: nó đã được thăm chưa?',
        'Look at this node’s first neighbour (smallest index): has it been visited?',
      ),
      m(
        'Chưa thăm ⇒ đi sâu sang nó; đã thăm (ví dụ cha của nó) ⇒ bỏ qua rồi xét hàng xóm kế.',
        'Unvisited ⇒ go deeper into it; visited (such as its parent) ⇒ skip and look at the next neighbour.',
      ),
      m('Không có hàng xóm nào ⇒ quay lui ngay.', 'No neighbour at all ⇒ backtrack at once.'),
    ],
    misconceptions: [
      m(
        'Quên đánh dấu đã thăm trước khi duyệt hàng xóm: đồ thị có chu trình làm đệ quy vô hạn.',
        'Forgetting to mark visited before scanning neighbours: a cycle makes the recursion endless.',
      ),
    ],
  },
  {
    id: 'tree-edge',
    label: m('Cạnh cây', 'A tree edge'),
    narration: m(
      '{v} chưa được thăm nên ta đi từ {u} sang {v}: cạnh {u}–{v} là cạnh cây. Các cạnh cây tạo thành cây DFS.',
      '{v} has not been visited, so we go from {u} to {v}: the edge {u}–{v} is a tree edge. Tree edges form the DFS tree.',
    ),
    hints: [
      m('Khi nào ta đi sâu qua một cạnh?', 'When do we go deeper along an edge?'),
      m('Khi đầu kia chưa được thăm.', 'When its other end has not been visited.'),
      m(
        'Gọi dfs(v); cạnh u–v được ghi là cạnh cây vì nó đưa ta tới một đỉnh mới.',
        'Call dfs(v); the edge u–v is a tree edge because it brings us to a new node.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng mọi cạnh của đồ thị đều thuộc cây DFS: cây chỉ có đúng (số đỉnh thăm − 1) cạnh.',
        'Thinking every edge of the graph is in the DFS tree: the tree has exactly (visited nodes − 1) edges.',
      ),
    ],
  },
  {
    id: 'skip-visited',
    label: m('Bỏ qua đỉnh đã thăm', 'Skip a visited node'),
    narration: m(
      '{v} đã có số thứ tự #{kv}, nên đi lại là vô ích (và gây vòng lặp). Ta bỏ qua cạnh {u}–{v} và xét hàng xóm kế.',
      '{v} already has the number #{kv}, so going again is useless (and would loop). We skip the edge {u}–{v} and take the next neighbour.',
    ),
    hints: [
      m('Đỉnh này có số # chưa?', 'Does this node already have a # number?'),
      m(
        'Có: nó đã được thăm, thường là cha của {u} hoặc một đỉnh nối vòng.',
        'Yes: it was visited, often the parent of {u} or a node closing a cycle.',
      ),
      m(
        'Bỏ qua: chỉ gọi dfs(v) khi v chưa thăm.',
        'Skip it: call dfs(v) only when v is unvisited.',
      ),
    ],
    misconceptions: [
      m(
        'Đi lại về cha của {u}: tạo vòng lặp vô tận giữa hai đỉnh.',
        'Walking back to the parent of {u}: that makes an endless loop between two nodes.',
      ),
    ],
  },
  {
    id: 'backtrack',
    label: m('Quay lui', 'Backtrack'),
    narration: m(
      '{u} không còn hàng xóm chưa thăm. Lời gọi dfs({u}) kết thúc: ta bỏ {u} khỏi call stack và quay về đỉnh đã gọi nó.',
      '{u} has no unvisited neighbour left. The call dfs({u}) ends: we pop {u} off the call stack and return to the node that called it.',
    ),
    hints: [
      m(
        'Khi hết hàng xóm chưa thăm, DFS làm gì?',
        'When there is no unvisited neighbour, what does DFS do?',
      ),
      m(
        'Kết thúc lời gọi hiện tại và quay về lời gọi trước đó trên stack.',
        'It ends the current call and returns to the previous call on the stack.',
      ),
      m(
        'Đỉnh ở đáy stack (nguồn) kết thúc cuối cùng thì cả DFS xong.',
        'When the node at the bottom of the stack (the source) ends, the whole DFS is done.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng quay lui là bỏ dấu đã thăm của {u}: dấu giữ nguyên, ta chỉ trở về.',
        'Thinking backtracking clears the visited mark of {u}: the mark stays, we only return.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'DFS thăm {count} đỉnh qua {tree} cạnh cây; đỉnh không nối với {s} không được thăm. Mỗi đỉnh và cạnh xét O(1) lần: O(n + m).',
      'DFS visited {count|node|nodes} through {tree} tree edges; nodes not connected to {s} are not visited. Each node and edge is handled O(1) times: O(n + m).',
    ),
    hints: [
      m('DFS thăm được những đỉnh nào?', 'Which nodes can DFS visit?'),
      m(
        'Mọi đỉnh tới được từ nguồn, tức thành phần liên thông của nguồn.',
        'Every node reachable from the source, that is its connected component.',
      ),
      m(
        'Mỗi đỉnh thăm một lần và mỗi cạnh xét hai lần: O(n + m).',
        'Each node is visited once and each edge examined twice: O(n + m).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng DFS thăm mọi đỉnh của đồ thị: với đồ thị không liên thông phải gọi DFS từ nhiều nguồn.',
        'Thinking DFS visits every node of the graph: for a disconnected graph you must start DFS from several sources.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input.g;
  const s = input.source;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of input.g.edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  adj.forEach((list) => list.sort((x, y) => x - y));
  const order: number[] = Array(n).fill(0);
  const stack: number[] = [];
  const treeEdges = new Set<string>();
  let timer = 0;
  const edges = input.g.edges.map(([a, b]) => ({
    from: letter(Math.min(a, b)),
    to: letter(Math.max(a, b)),
  }));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag: string,
    final = false,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let i = 0; i < n; i++) {
      if (order[i] > 0) highlights[letter(i)] = final ? 'result' : 'visited';
      else if (final) highlights[letter(i)] = 'muted';
    }
    for (const id of stack) highlights[letter(id)] = 'active';
    for (const k of treeEdges) highlights[k] = 'result';
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: letter(i),
          label: order[i] > 0 ? `${letter(i)} (#${order[i]})` : letter(i),
        })),
        edges,
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [
          {
            id: 'stack',
            label: msg(m('Call stack', 'Call stack'), ctx.locale),
            items: stack.map(letter),
          },
        ],
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  put(EX.start, 1, { s: letter(s) }, {}, 'start');

  function dfs(u: number): void {
    tick();
    order[u] = ++timer;
    stack.push(u);
    put(
      EX.visit,
      2,
      { u: letter(u), k: order[u], size: stack.length },
      { [letter(u)]: 'compare' },
      'visit',
    );
    for (const v of adj[u]) {
      if (order[v] === 0) {
        treeEdges.add(edgeKey(u, v));
        put(EX.tree, 4, { u: letter(u), v: letter(v) }, { [letter(v)]: 'compare' }, 'tree-edge');
        dfs(v);
      } else {
        put(
          EX.skip,
          4,
          { u: letter(u), v: letter(v), kv: order[v] },
          { [letter(u)]: 'compare', [edgeKey(u, v)]: 'muted' },
          'skip-visited',
        );
      }
    }
    stack.pop();
    put(EX.back, 5, { u: letter(u), size: stack.length }, { [letter(u)]: 'compare' }, 'backtrack');
  }
  dfs(s);
  put(EX.done, 5, { count: timer, n, s: letter(s), tree: treeEdges.size }, {}, 'done', true);
}

export const dfsEntry: WalkthroughEntry<In, S> = {
  id: 'dfs',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t3-graph-traversal'],
  title: m('DFS: tìm kiếm theo chiều sâu', 'DFS: depth-first search'),
  code: {
    pseudo: [
      'dfs(u):',
      '    đánh dấu u đã thăm; order[u] ← ++timer',
      '    for v kề u (theo chỉ số tăng):',
      '        if v chưa thăm: dfs(v)',
      '    (xong u: quay lui)',
    ],
    impl: {
      cpp: [
        'void dfs(int u, const std::vector<std::vector<int>>& adj, std::vector<int>& order, int& timer) {',
        '    order[u] = ++timer;',
        '    for (int v : adj[u]) {',
        '        if (order[v] == 0) dfs(v, adj, order, timer);',
        '    }',
        '}',
      ],
      py: [
        'def dfs(u, adj, order, timer):',
        '    timer[0] += 1',
        '    order[u] = timer[0]',
        '    for v in adj[u]:',
        '        if order[v] == 0:',
        '            dfs(v, adj, order, timer)',
      ],
    },
    map: {
      cpp: { 1: [1], 2: [2], 3: [3], 4: [4], 5: [5, 6] },
      py: { 1: [1], 2: [2, 3], 3: [4], 4: [5, 6], 5: [6] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      g: { kind: 'edge-list', nodes: [1, 8], edges: [0, 12] },
      source: { kind: 'int', range: [0, 7] },
    },
  },
  check: (input) => {
    const issues: string[] = [];
    if (input.source >= input.g.n) issues.push('source-out-of-range');
    const seen = new Set<string>();
    for (const [a, b] of input.g.edges) {
      const k = edgeKey(a, b);
      if (seen.has(k)) issues.push('duplicate-edge');
      seen.add(k);
    }
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'tree',
      label: m('Một cây', 'A tree'),
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
        source: 0,
      },
    },
    {
      id: 'cycle',
      label: m('Có chu trình', 'With a cycle'),
      input: {
        g: {
          n: 6,
          edges: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [4, 5],
            [5, 0],
          ],
        },
        source: 0,
      },
    },
    {
      id: 'disconnected',
      label: m('Không liên thông', 'Disconnected'),
      input: {
        g: {
          n: 6,
          edges: [
            [0, 1],
            [1, 2],
            [3, 4],
          ],
        },
        source: 0,
      },
    },
    {
      id: 'single',
      label: m('Một đỉnh', 'One node'),
      input: { g: { n: 1, edges: [] }, source: 0 },
    },
    {
      id: 'deep-chain',
      label: m('Đường thẳng 8 đỉnh', 'A straight path of 8 nodes'),
      input: {
        g: {
          n: 8,
          edges: [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [4, 5],
            [5, 6],
            [6, 7],
          ],
        },
        source: 0,
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'visit',
      text: m(
        'Đánh dấu đã thăm NGAY khi vào dfs(u), trước khi duyệt hàng xóm; đánh dấu muộn làm đồ thị có chu trình lặp vô hạn.',
        'Mark visited AS SOON AS dfs(u) starts, before scanning neighbours; marking later makes a graph with a cycle loop forever.',
      ),
    },
    {
      beat: 'tree-edge',
      text: m(
        'Bản dùng stack lặp phải đẩy hàng xóm theo thứ tự NGƯỢC (từ chỉ số lớn xuống nhỏ) mới thăm đúng thứ tự như bản đệ quy.',
        'An iterative version with a stack must push neighbours in REVERSE order (from large index to small) to visit in the same order as the recursive one.',
      ),
    },
    {
      lang: 'py',
      beat: 'visit',
      text: m(
        'Python giới hạn độ sâu đệ quy (mặc định khoảng 1000): đồ thị dài hàng chục nghìn đỉnh cần sys.setrecursionlimit hoặc DFS lặp. Ở đây đồ thị nhỏ nên không sao.',
        'Python limits recursion depth (about 1000 by default): graphs with tens of thousands of nodes need sys.setrecursionlimit or an iterative DFS. Here the graph is small.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'visit',
      text: m(
        'Đệ quy sâu có thể tràn stack hệ thống với đồ thị lớn (vài trăm nghìn đỉnh trên một đường); khi đó dùng DFS lặp.',
        'Deep recursion can overflow the system stack on big graphs (hundreds of thousands of nodes on one path); use an iterative DFS then.',
      ),
    },
  ],
  maxFrames: 50,
  maxBytes: 200_000,
  run,
};
