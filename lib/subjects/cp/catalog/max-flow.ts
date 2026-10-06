/**
 * Walkthrough entry: maximum flow with Edmonds–Karp (BFS augmenting paths) and the final min cut
 * (SCHEMA §5, card 2D-02). Source 0, sink n − 1; edges are directed with a capacity.
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number; directed: boolean; label: string }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const key = (a: number, b: number): string => `${letter(a)}-${letter(b)}`;

const EX = {
  start: m(
    'Tìm luồng lớn nhất từ {s} tới {t}. Mỗi cạnh có sức chứa; nhãn cạnh là luồng/sức chứa, lúc đầu luồng bằng 0.',
    'Find the maximum flow from {s} to {t}. Each edge has a capacity; the edge label is flow/capacity, with flow 0 at first.',
  ),
  path: m(
    'BFS trong đồ thị dư tìm được đường tăng luồng {path} (dài {len} cạnh, ít cạnh nhất).',
    'BFS in the residual graph found the augmenting path {path} ({len} edges, the fewest).',
  ),
  ask: m(
    'Đường tăng luồng {path}. Mỗi cạnh còn dư một lượng; có thể đẩy thêm bao nhiêu dọc đường này?',
    'The augmenting path {path}. Each edge has some room left; how much more can we push along this path?',
  ),
  aug: m(
    'Lượng tăng = dư nhỏ nhất trên đường = {b}. Đẩy {b} dọc đường: luồng tổng = {total}.',
    'The amount = the smallest residual on the path = {b}. Push {b} along it: total flow = {total}.',
  ),
  residual: m(
    'Đồ thị dư đổi: cạnh đã đẩy còn ít dư hơn, và có thêm cạnh ngược để huỷ luồng nếu cần.',
    'The residual graph changes: pushed edges have less room, and reverse edges appear so flow can be undone if needed.',
  ),
  cut: m(
    'BFS không tới được {t}: tập S gồm {side} tới được từ {s}. Các cạnh từ S ra ngoài đều đầy; tổng sức chứa của chúng = {total}.',
    'BFS cannot reach {t}: the set S = {side} is reachable from {s}. Every edge leaving S is full; their total capacity = {total}.',
  ),
  done: m(
    'Luồng lớn nhất là {total}, bằng sức chứa lát cắt nhỏ nhất, sau {rounds} lần tăng.',
    'The maximum flow is {total}, equal to the minimum cut capacity, after {rounds} augmentations.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Luồng đẩy "hàng" từ {s} tới {t} qua các cạnh có sức chứa, và với mỗi đỉnh trong thì vào bằng ra. Ta tăng luồng dần cho tới khi không còn đường tăng.',
      'A flow pushes "goods" from {s} to {t} along capacitated edges, with inflow equal to outflow at every inner node. We raise it step by step until no augmenting path is left.',
    ),
    hints: [
      m('Một cạnh chứa được tối đa bao nhiêu?', 'How much can an edge carry at most?'),
      m(
        'Đúng sức chứa của nó; luồng trên cạnh không vượt quá.',
        'Exactly its capacity; the flow on an edge never exceeds it.',
      ),
      m(
        'Tìm một đường còn dư từ nguồn tới đích, đẩy thêm, lặp lại.',
        'Find a path with room left from source to sink, push more, repeat.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chọn đường có sức chứa lớn nhất trước là đủ: cần cả cạnh ngược để sửa các lựa chọn sai.',
        'Thinking taking the biggest-capacity path first is enough: reverse edges are needed to repair poor choices.',
      ),
    ],
  },
  {
    id: 'bfs-path',
    label: m('Tìm đường tăng', 'Find an augmenting path'),
    narration: m(
      'Ta chạy BFS trong đồ thị dư (chỉ đi qua cạnh còn dư > 0) để tìm đường ngắn nhất theo số cạnh: {path}. Dùng BFS làm số lần tăng bị chặn bởi O(n·m).',
      'We run BFS in the residual graph (only edges with residual > 0) to find the path with the fewest edges: {path}. Using BFS bounds the number of augmentations by O(n·m).',
    ),
    hints: [
      m('Đồ thị dư gồm những cạnh nào?', 'Which edges make up the residual graph?'),
      m(
        'Cạnh còn dư (sức chứa − luồng > 0) và cạnh ngược của cạnh đang có luồng.',
        'Edges with residual (capacity − flow > 0) and the reverse edges of edges that carry flow.',
      ),
      m(
        'BFS tìm đường ít cạnh nhất từ nguồn tới đích trong đồ thị dư.',
        'BFS finds the path with the fewest edges from source to sink in the residual graph.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng DFS thay BFS: vẫn đúng nhưng mất cận số lần tăng, có thể rất chậm.',
        'Using DFS instead of BFS: still correct but the bound on augmentations is lost and it can be very slow.',
      ),
    ],
  },
  {
    id: 'bottleneck',
    label: m('Nút cổ chai', 'The bottleneck'),
    narration: m(
      'Lượng đẩy được dọc đường {path} bị giới hạn bởi cạnh còn ít dư nhất: nút cổ chai. Ở đây là {b}.',
      'The amount we can push along the path {path} is limited by the edge with the least room: the bottleneck. Here it is {b}.',
    ),
    ask: {
      text: m(
        'Theo em, lượng tăng trên đường này bằng bao nhiêu?',
        'How much can be pushed along this path?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Dư nhỏ nhất trên đường', 'The smallest residual on the path'),
          m('Dư lớn nhất trên đường', 'The largest residual on the path'),
          m('Tổng dư các cạnh', 'The sum of the residuals'),
        ],
        answer: (_frame, next) => (next ? 0 : -1),
      },
    },
    hints: [
      m(
        'Đẩy thêm x qua một đường: mỗi cạnh trên đường phải làm gì?',
        'Pushing x more along a path: what must each edge on it do?',
      ),
      m('Mỗi cạnh phải còn dư ít nhất x.', 'Each edge must have at least x room left.'),
      m(
        'Vậy x lớn nhất là dư nhỏ nhất trên đường.',
        'So the largest x is the smallest residual on the path.',
      ),
    ],
    misconceptions: [
      m(
        'Lấy tổng sức chứa: luồng qua một đường luôn bị cạnh hẹp nhất chặn.',
        'Taking the sum of capacities: flow along a path is always limited by its narrowest edge.',
      ),
    ],
  },
  {
    id: 'augment',
    label: m('Tăng luồng', 'Augment'),
    narration: m(
      'Ta cộng {b} vào luồng của mọi cạnh trên đường, nên luồng tổng tăng {b} lên {total}. Cạnh nút cổ chai giờ đầy.',
      'We add {b} to the flow of every edge on the path, so the total flow grows by {b} to {total}. The bottleneck edge is now full.',
    ),
    hints: [
      m(
        'Sau khi đẩy, luồng trên mỗi cạnh của đường đổi thế nào?',
        'After pushing, how does the flow on each path edge change?',
      ),
      m('Tăng đúng lượng đẩy.', 'It grows by exactly the amount pushed.'),
      m(
        'Luồng tổng cũng tăng lượng đó; ít nhất một cạnh trên đường trở nên đầy.',
        'The total flow grows by the same amount; at least one edge on the path becomes full.',
      ),
    ],
    misconceptions: [
      m(
        'Quên cập nhật cạnh ngược: cạnh ngược ghi nhận phần luồng có thể huỷ sau này.',
        'Forgetting to update the reverse edge: it records the flow that may be undone later.',
      ),
    ],
  },
  {
    id: 'residual',
    label: m('Đồ thị dư', 'The residual graph'),
    narration: m(
      'Mỗi cạnh u→v có luồng f và sức chứa c cho hai cạnh dư: u→v còn c − f, và cạnh ngược v→u còn f. Cạnh ngược cho phép lấy lại luồng đã đẩy.',
      'Each edge u→v with flow f and capacity c gives two residual edges: u→v with room c − f, and the reverse v→u with room f. The reverse edge lets us take back pushed flow.',
    ),
    hints: [
      m('Vì sao cần cạnh ngược?', 'Why are reverse edges needed?'),
      m(
        'Một lựa chọn đường trước có thể chặn đường tốt hơn; cạnh ngược cho phép sửa.',
        'An earlier choice may block a better route; reverse edges let us repair it.',
      ),
      m(
        'Đi qua cạnh ngược v→u nghĩa là giảm luồng trên u→v.',
        'Walking the reverse edge v→u means reducing the flow on u→v.',
      ),
    ],
    misconceptions: [
      m(
        'Bỏ cạnh ngược cho đơn giản: kết quả có thể thấp hơn luồng lớn nhất thật.',
        'Dropping reverse edges for simplicity: the result may fall below the true maximum flow.',
      ),
    ],
  },
  {
    id: 'min-cut',
    label: m('Lát cắt nhỏ nhất', 'The minimum cut'),
    narration: m(
      'Khi BFS không tới được {t}, tập S các đỉnh tới được từ {s} cho lát cắt (S, phần còn lại). Mọi cạnh đi ra khỏi S đều đầy, nên luồng bằng sức chứa lát cắt.',
      'When BFS cannot reach {t}, the set S of nodes reachable from {s} gives a cut (S, the rest). Every edge leaving S is full, so the flow equals the cut capacity.',
    ),
    hints: [
      m(
        'Khi hết đường tăng, những đỉnh nào còn tới được từ nguồn?',
        'When no augmenting path is left, which nodes can still be reached from the source?',
      ),
      m(
        'Tập S; cạnh từ S ra ngoài phải đầy, nếu không BFS đã đi tiếp.',
        'The set S; edges leaving S must be full, otherwise BFS would have gone on.',
      ),
      m(
        'Luồng = tổng sức chứa các cạnh đi ra S = sức chứa lát cắt nhỏ nhất.',
        'Flow = total capacity of the edges leaving S = the minimum cut capacity.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng lát cắt nhỏ nhất là các cạnh có sức chứa nhỏ nhất: nó là tập cạnh tách nguồn khỏi đích với tổng sức chứa nhỏ nhất.',
        'Thinking the minimum cut is the edges with the smallest capacities: it is the edge set separating source from sink with the smallest total capacity.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Luồng lớn nhất là {total}, bằng sức chứa lát cắt nhỏ nhất. Edmonds–Karp chạy O(n·m²) vì có tối đa O(n·m) lần tăng, mỗi lần BFS O(m).',
      'The maximum flow is {total}, equal to the minimum cut capacity. Edmonds–Karp runs in O(n·m²): at most O(n·m) augmentations, each a BFS of O(m).',
    ),
    hints: [
      m('Vì sao luồng tối đa bằng lát cắt nhỏ nhất?', 'Why does the max flow equal the min cut?'),
      m(
        'Luồng không thể vượt sức chứa của bất kỳ lát cắt nào; khi hết đường tăng ta tìm được lát cắt đầy.',
        'Flow cannot exceed the capacity of any cut; when no path is left we find a saturated cut.',
      ),
      m('Đó là định lý luồng cực đại – lát cắt cực tiểu.', 'That is the max-flow min-cut theorem.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng luồng tối đa duy nhất: giá trị duy nhất, nhưng cách phân luồng có thể khác nhau.',
        'Thinking the max flow is unique: its value is, but the way the flow is split may differ.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const s = 0;
  const t = n - 1;
  const cap: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const flow: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (const [a, b, c] of input.edges) cap[a][b] += c;
  const resid = (a: number, b: number): number => cap[a][b] - flow[a][b] + flow[b][a];
  let total = 0;
  let rounds = 0;
  const edgesState = (): S['edges'] =>
    input.edges.map(([a, b, c]) => ({
      from: letter(a),
      to: letter(b),
      weight: c,
      directed: true,
      label: `${flow[a][b]}/${cap[a][b]}`,
    }));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({ id: letter(i), label: letter(i) })),
        edges: edgesState(),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(
    EX.start,
    1,
    { s: letter(s), t: letter(t) },
    { [letter(s)]: 'active', [letter(t)]: 'active' },
    'start',
  );
  for (;;) {
    tick();
    const prev: number[] = Array(n).fill(-2);
    prev[s] = -1;
    const queue = [s];
    for (let q = 0; q < queue.length && prev[t] === -2; q++)
      for (let v = 0; v < n; v++)
        if (prev[v] === -2 && resid(queue[q], v) > 0) {
          prev[v] = queue[q];
          queue.push(v);
        }
    if (prev[t] === -2) {
      const side = queue.map(letter).join(', ');
      let capCut = 0;
      const marks: Record<string, HighlightKind> = {};
      for (const [a, b, c] of input.edges)
        if (prev[a] !== -2 && prev[b] === -2) {
          capCut += c;
          marks[key(a, b)] = 'result';
        }
      put(EX.cut, 3, { t: letter(t), side, s: letter(s), total: capCut }, marks, 'min-cut');
      put(EX.done, 3, { total, rounds }, marks, 'done');
      return;
    }
    const nodes: number[] = [];
    for (let x = t; x !== -1; x = prev[x]) nodes.unshift(x);
    const marks: Record<string, HighlightKind> = {};
    for (let i = 0; i + 1 < nodes.length; i++) marks[key(nodes[i], nodes[i + 1])] = 'active';
    const path = nodes.map(letter).join('→');
    put(EX.path, 2, { path, len: nodes.length - 1 }, marks, 'bfs-path');
    const b = Math.min(...nodes.slice(0, -1).map((x, i) => resid(x, nodes[i + 1])));
    put(EX.ask, 2, { path, b }, marks, 'bottleneck');
    // apply: cancel opposite flow first, as the residual graph says
    const left = b;
    for (let i = 0; i + 1 < nodes.length; i++) {
      const [x, y] = [nodes[i], nodes[i + 1]];
      const back = Math.min(flow[y][x], left);
      flow[y][x] -= back;
      flow[x][y] += left - back;
    }
    total += b;
    rounds++;
    put(EX.aug, 2, { b, total }, marks, 'augment');
    put(EX.residual, 2, {}, {}, 'residual');
  }
}

export const maxFlowEntry: WalkthroughEntry<In, S> = {
  id: 'max-flow',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t4-flow-matching'],
  title: m('Luồng cực đại (Edmonds–Karp)', 'Maximum flow (Edmonds–Karp)'),
  code: {
    pseudo: [
      'flow ← 0; mọi luồng cạnh ← 0',
      'while BFS trong đồ thị dư tìm được đường tăng từ s tới t:',
      '    b ← dư nhỏ nhất trên đường; đẩy b dọc đường (cộng luồng xuôi, trừ luồng ngược); flow ← flow + b',
      'return flow   (S = các đỉnh tới được từ s là lát cắt nhỏ nhất)',
    ],
    impl: {
      cpp: [
        'int max_flow(int n, std::vector<std::vector<int>> cap) {',
        '    int s = 0, t = n - 1, flow = 0;',
        '    while (true) {',
        '        std::vector<int> prev(n, -2);',
        '        prev[s] = -1;',
        '        std::queue<int> q;',
        '        q.push(s);',
        '        while (!q.empty() && prev[t] == -2) {',
        '            int u = q.front();',
        '            q.pop();',
        '            for (int v = 0; v < n; v++)',
        '                if (prev[v] == -2 && cap[u][v] > 0) { prev[v] = u; q.push(v); }',
        '        }',
        '        if (prev[t] == -2) break;',
        '        int b = 1000000;',
        '        for (int v = t; v != s; v = prev[v]) b = std::min(b, cap[prev[v]][v]);',
        '        for (int v = t; v != s; v = prev[v]) { cap[prev[v]][v] -= b; cap[v][prev[v]] += b; }',
        '        flow += b;',
        '    }',
        '    return flow;',
        '}',
      ],
      py: [
        'from collections import deque',
        'def max_flow(n, cap):',
        '    s, t, flow = 0, n - 1, 0',
        '    while True:',
        '        prev = [-2] * n',
        '        prev[s] = -1',
        '        q = deque([s])',
        '        while q and prev[t] == -2:',
        '            u = q.popleft()',
        '            for v in range(n):',
        '                if prev[v] == -2 and cap[u][v] > 0:',
        '                    prev[v] = u',
        '                    q.append(v)',
        '        if prev[t] == -2:',
        '            break',
        '        b, v = 10 ** 6, t',
        '        while v != s:',
        '            b = min(b, cap[prev[v]][v])',
        '            v = prev[v]',
        '        v = t',
        '        while v != s:',
        '            cap[prev[v]][v] -= b',
        '            cap[v][prev[v]] += b',
        '            v = prev[v]',
        '        flow += b',
        '    return flow',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 3: [15, 16, 17, 18], 4: [20] },
      py: {
        1: [3],
        2: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        3: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
        4: [26],
      },
    },
  },
  inputSpec: { kind: 'edge-list', nodes: [2, 6], edges: [1, 10], weight: [1, 10] },
  check: (input) => {
    const seen = new Set<string>();
    const issues: string[] = [];
    for (const [a, b] of input.edges) {
      const k = `${a}>${b}`;
      if (seen.has(k)) issues.push('duplicate-edge');
      seen.add(k);
    }
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn (6 đỉnh)', 'Standard example (6 nodes)'),
      input: {
        n: 6,
        edges: [
          [0, 1, 10],
          [0, 2, 8],
          [1, 2, 2],
          [1, 3, 5],
          [2, 4, 9],
          [3, 4, 6],
          [3, 5, 7],
          [4, 5, 10],
        ],
      },
    },
    {
      id: 'bottleneck',
      label: m('Một nút cổ chai', 'A bottleneck'),
      input: {
        n: 4,
        edges: [
          [0, 1, 9],
          [1, 2, 2],
          [2, 3, 9],
        ],
      },
    },
    {
      id: 'back-edge',
      label: m('Cần cạnh ngược', 'Needs a reverse edge'),
      input: {
        n: 4,
        edges: [
          [0, 1, 1],
          [0, 2, 1],
          [1, 2, 1],
          [1, 3, 1],
          [2, 3, 1],
        ],
      },
    },
    {
      id: 'no-path',
      label: m('Không có đường', 'No path'),
      input: {
        n: 4,
        edges: [
          [0, 1, 5],
          [2, 3, 4],
        ],
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'residual',
      text: m(
        'Phải thêm cạnh ngược (cap[v][u] += b) khi đẩy luồng; thiếu nó, thuật toán có thể dừng ở luồng chưa cực đại.',
        'Add the reverse edge (cap[v][u] += b) when pushing; without it the algorithm may stop at a flow below the maximum.',
      ),
    },
    {
      beat: 'bfs-path',
      text: m(
        'Dùng BFS (ít cạnh nhất) thay vì DFS để số lần tăng bị chặn O(n·m), không phụ thuộc sức chứa.',
        'Use BFS (fewest edges) instead of DFS so the number of augmentations is bounded by O(n·m), independent of the capacities.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'augment',
      text: m(
        'Truyền cap theo giá trị (bản sao) vì hàm sửa nó; và giá trị khởi tạo b phải lớn hơn mọi sức chứa.',
        'Pass cap by value (a copy) since the function edits it; and the initial b must exceed every capacity.',
      ),
    },
    {
      lang: 'py',
      beat: 'augment',
      text: m(
        'cap là list lồng: tạo bằng [[0] * n for _ in range(n)], không [[0] * n] * n, để các hàng không dùng chung.',
        'cap is a nested list: build it with [[0] * n for _ in range(n)], not [[0] * n] * n, so rows are not shared.',
      ),
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
