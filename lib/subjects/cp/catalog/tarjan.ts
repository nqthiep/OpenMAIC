/**
 * Walkthrough entry: Tarjan's strongly connected components on a directed graph
 * (SCHEMA §5, card 2E-02). Neighbours are visited by increasing index; roots by increasing index.
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; directed: boolean }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const ASKED_BACK = 2;

const EX = {
  start: m(
    'Tìm các thành phần liên thông mạnh của đồ thị có hướng {n} đỉnh: nhóm đỉnh đi được tới nhau. Nhãn đỉnh là disc/low; stack giữ các đỉnh chưa gán thành phần.',
    'Find the strongly connected components of a directed graph of {n} nodes: groups reaching each other. Labels are disc/low; the stack holds unassigned nodes.',
  ),
  visit: m(
    'Thăm {u}: disc = low = {d} (thứ tự thăm). Đẩy {u} lên stack. Sau đó xét các cạnh đi ra từ {u}.',
    'Visit {u}: disc = low = {d} (visit order). Push {u} on the stack. Then look at the edges leaving {u}.',
  ),
  askBack: m(
    'Cạnh {u}→{v} tới đỉnh {v} đã thăm (disc = {dv}) và vẫn đang trên stack. low[{u}] = {lu} cập nhật thành bao nhiêu?',
    'The edge {u}→{v} leads to the visited node {v} (disc = {dv}) still on the stack. What does low[{u}] = {lu} become?',
  ),
  back: m(
    'Cạnh ngược {u}→{v}: {v} đang trên stack nên low[{u}] = min({lu}, disc[{v}] = {dv}) = {nl}.',
    'Back edge {u}→{v}: {v} is on the stack so low[{u}] = min({lu}, disc[{v}] = {dv}) = {nl}.',
  ),
  cross: m(
    'Cạnh {u}→{v} tới {v} đã thăm nhưng KHÔNG còn trên stack (đã thuộc một thành phần): bỏ qua, low[{u}] giữ {lu}.',
    'The edge {u}→{v} leads to {v}, visited but NOT on the stack (already in a component): ignore it, low[{u}] stays {lu}.',
  ),
  ret: m(
    'Từ con {v} quay về {u}: cạnh cây nên low[{u}] = min({lu}, low[{v}] = {lv}) = {nl}.',
    'Back from the child {v} to {u}: a tree edge so low[{u}] = min({lu}, low[{v}] = {lv}) = {nl}.',
  ),
  pop: m(
    'low[{u}] = disc[{u}] = {d}: {u} là gốc của một thành phần. Lấy stack tới {u}: thành phần {comp}.',
    'low[{u}] = disc[{u}] = {d}: {u} is the root of a component. Pop the stack down to {u}: component {comp}.',
  ),
  done: m(
    'Có {k} thành phần liên thông mạnh. Mỗi đỉnh và cạnh xét O(1) lần: O(n + m), chỉ một lượt DFS.',
    'There are {k} strongly connected components. Each node and edge is handled O(1) times: O(n + m), a single DFS.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Hai đỉnh thuộc cùng một thành phần liên thông mạnh khi đi được từ đỉnh này tới đỉnh kia và ngược lại. Tarjan tìm mọi thành phần trong một lượt DFS với disc, low và một stack. Có {n} đỉnh.',
      'Two nodes are in the same strongly connected component when each can reach the other. Tarjan finds all components in one DFS with disc, low and a stack. There are {n} nodes.',
    ),
    hints: [
      m(
        'Hai đỉnh trên một chu trình có đi được tới nhau không?',
        'Can two nodes on a cycle reach each other?',
      ),
      m(
        'Có. Thành phần là các đỉnh cùng nằm trên những chu trình chồng lên nhau.',
        'Yes. A component is made of nodes on overlapping cycles.',
      ),
      m(
        'disc là thứ tự thăm; low là disc nhỏ nhất đạt tới được từ cây con qua một cạnh ngược.',
        'disc is the visit order; low is the smallest disc reachable from the subtree through a back edge.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm với thành phần liên thông của đồ thị vô hướng: ở đồ thị có hướng phải đi được hai chiều.',
        'Mixing it up with connected components of an undirected graph: in a directed graph reachability must hold both ways.',
      ),
    ],
  },
  {
    id: 'visit',
    label: m('Thăm đỉnh', 'Visit a node'),
    narration: m(
      'Mỗi đỉnh được thăm nhận disc = low = {d} và được đẩy lên stack. Stack giữ các đỉnh đã thăm mà chưa thuộc thành phần nào.',
      'Each visited node gets disc = low = {d} and is pushed on the stack. The stack keeps visited nodes that belong to no component yet.',
    ),
    hints: [
      m('disc để làm gì?', 'What is disc for?'),
      m(
        'Ghi thứ tự thăm: đỉnh thăm sau có disc lớn hơn.',
        'It records the visit order: a later node has a larger disc.',
      ),
      m(
        'low ban đầu bằng disc; cạnh ngược sẽ kéo low xuống.',
        'low starts equal to disc; back edges pull it down.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng low luôn bằng disc: low nhỏ hơn khi cây con quay về một đỉnh cũ.',
        'Thinking low always equals disc: low is smaller when the subtree returns to an older node.',
      ),
    ],
  },
  {
    id: 'back-edge',
    label: m('Cạnh ngược', 'Back edge'),
    narration: m(
      'Cạnh {u}→{v} tới đỉnh đã thăm và còn trên stack: {v} là tổ tiên cùng thành phần. Ta hạ low[{u}] xuống disc[{v}], vì low dùng disc của đỉnh được tới.',
      'The edge {u}→{v} leads to a visited node still on the stack: {v} is an ancestor in the same component. We lower low[{u}] to disc[{v}], since low uses the disc of the node reached.',
    ),
    ask: {
      text: m('Theo em, low[u] cập nhật thành giá trị nào?', 'What does low[u] become?'),
      predict: {
        kind: 'choice',
        options: [
          m('Giữ nguyên', 'Unchanged'),
          m('min(low[u], disc[v])', 'min(low[u], disc[v])'),
          m('min(low[u], low[v])', 'min(low[u], low[v])'),
        ],
        answer: (_frame, next) => (next ? 1 : -1),
      },
    },
    hints: [
      m(
        'Đỉnh v đã thăm: có đang là tổ tiên của u không?',
        'The node v was visited: is it an ancestor of u?',
      ),
      m(
        'Có nếu v còn trên stack; khi đó đường u → v khép một vòng.',
        'Yes if v is still on the stack; then the path u → v closes a cycle.',
      ),
      m(
        'Dùng disc[v] cho cạnh ngược (đỉnh v đã tồn tại), low[v] chỉ cho cạnh cây.',
        'Use disc[v] for a back edge (v already exists), low[v] only for a tree edge.',
      ),
    ],
    misconceptions: [
      m(
        'Cập nhật low qua mọi cạnh tới đỉnh đã thăm: chỉ đỉnh ĐANG TRÊN STACK mới được.',
        'Updating low through every edge to a visited node: only a node ON THE STACK counts.',
      ),
    ],
  },
  {
    id: 'tree-return',
    label: m('Quay về từ con', 'Return from a child'),
    narration: m(
      'Sau khi xử lý xong con {v}, ta lấy low[{v}] về cho {u}: nếu cây con của {v} quay lại được một đỉnh cũ thì {u} cũng vậy. Đây là cạnh cây nên dùng low[{v}].',
      'After finishing the child {v} we bring low[{v}] back to {u}: if the subtree of {v} reaches an older node so does {u}. It is a tree edge so we use low[{v}].',
    ),
    hints: [
      m(
        'Cây con của v quay lại được đỉnh cũ thì ảnh hưởng gì tới u?',
        'If the subtree of v reaches an older node, what does that mean for u?',
      ),
      m('u cũng quay lại được đỉnh đó thông qua v.', 'u reaches that node too, through v.'),
      m('low[u] = min(low[u], low[v]) khi quay về.', 'low[u] = min(low[u], low[v]) on return.'),
    ],
    misconceptions: [
      m(
        'Dùng disc[v] cho cạnh cây: sẽ mất thông tin các cạnh ngược sâu hơn trong cây con.',
        'Using disc[v] for a tree edge: that loses the deeper back edges in the subtree.',
      ),
    ],
  },
  {
    id: 'pop-scc',
    label: m('Lấy thành phần', 'Pop a component'),
    narration: m(
      'low[{u}] = disc[{u}] nghĩa là cây con của {u} không quay lại đỉnh nào cũ hơn: {u} là gốc thành phần. Mọi đỉnh trên stack từ {u} trở lên thuộc cùng thành phần: ta lấy chúng ra.',
      'low[{u}] = disc[{u}] means the subtree of {u} reaches no older node: {u} is the root of a component. Everything on the stack from {u} up belongs to it: we pop them.',
    ),
    hints: [
      m('Khi nào một đỉnh là gốc của thành phần?', 'When is a node the root of a component?'),
      m(
        'Khi low bằng disc: không có đường ngược lên trên nó.',
        'When low equals disc: no path leads back above it.',
      ),
      m(
        'Lấy stack tới u; các đỉnh đó cùng thành phần và không còn trên stack nữa.',
        'Pop the stack down to u; those nodes share a component and leave the stack.',
      ),
    ],
    misconceptions: [
      m(
        'Lấy riêng đỉnh u: phải lấy cả các đỉnh nằm trên u trong stack.',
        'Popping only u: the nodes above it on the stack must go too.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Mọi đỉnh đã được gán vào {k} thành phần. Một lượt DFS, mỗi cạnh xét một lần: O(n + m). Co mỗi thành phần thành một đỉnh ta được một đồ thị không chu trình.',
      'Every node is assigned to one of {k} components. One DFS, each edge examined once: O(n + m). Contracting each component to a node gives an acyclic graph.',
    ),
    hints: [
      m('Có bao nhiêu lượt DFS?', 'How many DFS passes are there?'),
      m('Một lượt (Kosaraju cần hai).', 'One (Kosaraju needs two).'),
      m(
        'Đồ thị các thành phần là DAG, hữu ích cho nhiều bài.',
        'The graph of components is a DAG, useful in many problems.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số thành phần bằng số chu trình: các chu trình chung đỉnh gộp thành một thành phần.',
        'Thinking the number of components equals the number of cycles: cycles sharing nodes merge into one component.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of input.edges) adj[a].push(b);
  adj.forEach((l) => l.sort((x, y) => x - y));
  const disc: number[] = Array(n).fill(0);
  const low: number[] = Array(n).fill(0);
  const on: boolean[] = Array(n).fill(false);
  const stack: number[] = [];
  const comp: number[] = Array(n).fill(-1);
  let timer = 0;
  let comps = 0;
  let asked = 0;
  const edges = input.edges.map(([a, b]) => ({ from: letter(a), to: letter(b), directed: true }));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let i = 0; i < n; i++) if (comp[i] >= 0) highlights[letter(i)] = `group-${comp[i] % 6}`;
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: letter(i),
          label: disc[i] ? `${letter(i)} (${disc[i]}/${low[i]})` : letter(i),
        })),
        edges,
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [{ id: 'stack', label: 'Stack', items: stack.map(letter) }],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n }, {}, 'start');
  const dfs = (u: number): void => {
    tick();
    disc[u] = low[u] = ++timer;
    stack.push(u);
    on[u] = true;
    put(EX.visit, 1, { u: letter(u), d: disc[u] }, { [letter(u)]: 'active' }, 'visit');
    for (const v of adj[u]) {
      tick();
      if (disc[v] === 0) {
        dfs(v);
        const lu = low[u];
        low[u] = Math.min(low[u], low[v]);
        put(
          EX.ret,
          3,
          { u: letter(u), v: letter(v), lu, lv: low[v], nl: low[u] },
          { [letter(u)]: 'active', [letter(v)]: 'compare' },
          'tree-return',
        );
      } else if (on[v]) {
        const lu = low[u];
        if (asked < ASKED_BACK) {
          asked++;
          put(
            EX.askBack,
            4,
            { u: letter(u), v: letter(v), dv: disc[v], lu },
            {
              [letter(u)]: 'active',
              [letter(v)]: 'compare',
              [`${letter(u)}-${letter(v)}`]: 'compare',
            },
            'back-edge',
          );
        }
        low[u] = Math.min(low[u], disc[v]);
        put(
          EX.back,
          4,
          { u: letter(u), v: letter(v), dv: disc[v], lu, nl: low[u] },
          {
            [letter(u)]: 'active',
            [letter(v)]: 'compare',
            [`${letter(u)}-${letter(v)}`]: 'active',
          },
        );
      } else {
        put(
          EX.cross,
          4,
          { u: letter(u), v: letter(v), lu: low[u] },
          { [letter(u)]: 'active', [letter(v)]: 'muted' },
        );
      }
    }
    if (low[u] === disc[u]) {
      const members: number[] = [];
      for (;;) {
        const w = stack.pop() as number;
        on[w] = false;
        comp[w] = comps;
        members.push(w);
        if (w === u) break;
      }
      comps++;
      put(
        EX.pop,
        5,
        { u: letter(u), d: disc[u], comp: `[${members.map(letter).reverse().join(', ')}]` },
        {},
        'pop-scc',
      );
    }
  };
  for (let u = 0; u < n; u++) if (disc[u] === 0) dfs(u);
  put(EX.done, 5, { k: comps }, {}, 'done');
}

export const tarjanEntry: WalkthroughEntry<In, S> = {
  id: 'tarjan',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t3-scc-bridges'],
  title: m('Tarjan: thành phần liên thông mạnh', 'Tarjan: strongly connected components'),
  code: {
    pseudo: [
      'dfs(u): disc[u] ← low[u] ← ++timer; push u lên stack; on[u] ← đúng',
      '    for v kề u:',
      '        if v chưa thăm: dfs(v); low[u] ← min(low[u], low[v])   (cạnh cây)',
      '        else if v đang trên stack: low[u] ← min(low[u], disc[v])   (cạnh ngược)',
      '    if low[u] = disc[u]: pop stack tới u: các đỉnh đó là một thành phần',
    ],
    impl: {
      cpp: [
        'void dfs(int u, const std::vector<std::vector<int>>& adj, std::vector<int>& disc, std::vector<int>& low, std::vector<bool>& on, std::vector<int>& st, int& timer, int& sccs) {',
        '    disc[u] = low[u] = ++timer;',
        '    st.push_back(u);',
        '    on[u] = true;',
        '    for (int v : adj[u]) {',
        '        if (disc[v] == 0) {',
        '            dfs(v, adj, disc, low, on, st, timer, sccs);',
        '            low[u] = std::min(low[u], low[v]);',
        '        } else if (on[v]) {',
        '            low[u] = std::min(low[u], disc[v]);',
        '        }',
        '    }',
        '    if (low[u] == disc[u]) {',
        '        sccs++;',
        '        while (true) {',
        '            int w = st.back();',
        '            st.pop_back();',
        '            on[w] = false;',
        '            if (w == u) break;',
        '        }',
        '    }',
        '}',
        'int count_scc(int n, const std::vector<std::vector<int>>& adj) {',
        '    std::vector<int> disc(n, 0), low(n, 0), st;',
        '    std::vector<bool> on(n, false);',
        '    int timer = 0, sccs = 0;',
        '    for (int u = 0; u < n; u++)',
        '        if (disc[u] == 0) dfs(u, adj, disc, low, on, st, timer, sccs);',
        '    return sccs;',
        '}',
      ],
      py: [
        'def dfs(u, adj, disc, low, on, st, timer, out):',
        '    timer[0] += 1',
        '    disc[u] = low[u] = timer[0]',
        '    st.append(u)',
        '    on[u] = True',
        '    for v in adj[u]:',
        '        if disc[v] == 0:',
        '            dfs(v, adj, disc, low, on, st, timer, out)',
        '            low[u] = min(low[u], low[v])',
        '        elif on[v]:',
        '            low[u] = min(low[u], disc[v])',
        '    if low[u] == disc[u]:',
        '        out[0] += 1',
        '        while True:',
        '            w = st.pop()',
        '            on[w] = False',
        '            if w == u:',
        '                break',
        'def count_scc(n, adj):',
        '    disc = [0] * n',
        '    low = [0] * n',
        '    on = [False] * n',
        '    st = []',
        '    timer = [0]',
        '    out = [0]',
        '    for u in range(n):',
        '        if disc[u] == 0:',
        '            dfs(u, adj, disc, low, on, st, timer, out)',
        '    return out[0]',
      ],
    },
    map: {
      cpp: {
        1: [2, 3, 4],
        2: [5],
        3: [6, 7, 8],
        4: [9, 10],
        5: [13, 14, 15, 16, 17, 18, 19, 20, 21],
      },
      py: { 1: [2, 3, 4, 5], 2: [6], 3: [7, 8, 9], 4: [10, 11], 5: [12, 13, 14, 15, 16, 17, 18] },
    },
  },
  inputSpec: { kind: 'edge-list', nodes: [1, 8], edges: [0, 14] },
  customInput: false,
  presets: [
    {
      id: 'two-scc',
      label: m('Hai thành phần', 'Two components'),
      input: {
        n: 6,
        edges: [
          [0, 1],
          [1, 2],
          [2, 0],
          [2, 3],
          [3, 4],
          [4, 5],
          [5, 3],
        ],
      },
    },
    {
      id: 'dag',
      label: m('Đồ thị không chu trình', 'An acyclic graph'),
      input: {
        n: 5,
        edges: [
          [0, 1],
          [0, 2],
          [1, 3],
          [2, 3],
          [3, 4],
        ],
      },
    },
    {
      id: 'one-cycle',
      label: m('Một chu trình lớn', 'One big cycle'),
      input: {
        n: 5,
        edges: [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 0],
        ],
      },
    },
    { id: 'single', label: m('Một đỉnh', 'One node'), input: { n: 1, edges: [] } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'back-edge',
      text: m(
        'Chỉ cập nhật low qua cạnh tới đỉnh ĐANG TRÊN STACK; cạnh ngược dùng disc[v], cạnh cây dùng low[v]. Nhầm hai cái cho thành phần sai.',
        'Update low only through edges to a node ON THE STACK; a back edge uses disc[v], a tree edge uses low[v]. Mixing them gives wrong components.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'visit',
      text: m(
        'Đệ quy sâu có thể tràn stack hệ thống với đồ thị lớn; khi đó dùng bản lặp với stack tự quản lý.',
        'Deep recursion can overflow the system stack on large graphs; use an iterative version with your own stack then.',
      ),
    },
    {
      lang: 'py',
      beat: 'visit',
      text: m(
        'Python giới hạn độ sâu đệ quy: đồ thị dài cần sys.setrecursionlimit hoặc bản lặp. Dùng list làm bộ đếm (timer[0]) vì số nguyên là bất biến.',
        'Python limits recursion depth: long graphs need sys.setrecursionlimit or an iterative version. Use a list as a counter (timer[0]) since integers are immutable.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
