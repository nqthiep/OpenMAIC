/**
 * Walkthrough entry: breadth-first search with a queue, unit distances (SCHEMA §5, card 2B-07).
 * Neighbours are scanned by increasing index, so the trace is deterministic.
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
    'BFS từ đỉnh {s}: d[{s}] = 0, đánh dấu đã thăm và đưa {s} vào queue. Queue cho ta duyệt theo từng lớp khoảng cách.',
    'BFS from node {s}: d[{s}] = 0, mark it visited and put {s} in the queue. The queue lets us go layer by layer.',
  ),
  dequeue: m(
    'Lấy {u} (d = {du}) ra khỏi đầu queue; xét các hàng xóm của {u} theo chỉ số tăng.',
    'Take {u} (d = {du}) off the front of the queue; look at its neighbours in increasing index order.',
  ),
  layer: m(
    'Sang lớp khoảng cách mới d = {du}: lấy {u} ra khỏi queue. Mọi đỉnh ở d = {pd} đã xử lý xong.',
    'On to a new distance layer d = {du}: take {u} off the queue. Every node at d = {pd} is done.',
  ),
  test: m(
    'Hàng xóm {v} của {u}: ta có đưa nó vào queue không?',
    'Neighbour {v} of {u}: do we put it into the queue?',
  ),
  enqueue: m(
    '{v} chưa thăm: đánh dấu, d[{v}] = d[{u}] + 1 = {dv}, đưa vào cuối queue.',
    '{v} is unvisited: mark it, d[{v}] = d[{u}] + 1 = {dv}, push it at the back of the queue.',
  ),
  skip: m(
    '{v} đã thăm (d = {dv}): bỏ qua, không đưa vào queue lần nữa.',
    '{v} is already visited (d = {dv}): skip it, it is not queued again.',
  ),
  done: m(
    'Queue rỗng: đã thăm {count} trong {n} đỉnh từ {s}; lớp xa nhất có d = {far}.',
    'The queue is empty: visited {count} of {n} nodes from {s}; the farthest layer has d = {far}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'BFS tìm đường đi ít cạnh nhất từ đỉnh nguồn {s}. Nó thăm các đỉnh theo từng lớp khoảng cách: cách {s} 1 cạnh, rồi 2 cạnh, …',
      'BFS finds the fewest-edges path from the source {s}. It visits nodes layer by layer: 1 edge from {s}, then 2 edges, …',
    ),
    hints: [
      m(
        'Muốn tìm đường ngắn nhất theo số cạnh, ta nên xét đỉnh gần nguồn trước hay xa trước?',
        'To find the fewest-edges path, should we look at near nodes first or far ones?',
      ),
      m(
        'Gần trước. Cần một cấu trúc cho đỉnh vào trước thì ra trước.',
        'Near ones first. We need a structure where what goes in first comes out first.',
      ),
      m(
        'Queue (hàng đợi): lấy đỉnh ở đầu, đưa các hàng xóm mới vào cuối; các đỉnh ra theo thứ tự khoảng cách tăng dần.',
        'A queue: take the node at the front, push new neighbours at the back; nodes come out in increasing distance.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng BFS dùng stack: stack cho DFS; BFS cần queue để duyệt theo lớp.',
        'Thinking BFS uses a stack: a stack gives DFS; BFS needs a queue to go layer by layer.',
      ),
    ],
  },
  {
    id: 'dequeue',
    label: m('Lấy khỏi queue', 'Dequeue'),
    narration: m(
      'Lấy đỉnh {u} ở đầu queue (khoảng cách {du}). Mọi đỉnh trong queue có khoảng cách bằng nhau hoặc hơn nhau một.',
      'Take the node {u} at the front of the queue (distance {du}). All queued nodes have equal distance or differ by one.',
    ),
    hints: [
      m(
        'Đỉnh nào được lấy ra tiếp theo: đỉnh mới vào hay đỉnh vào sớm nhất?',
        'Which node is taken next: the newest or the one that entered first?',
      ),
      m(
        'Đỉnh vào sớm nhất, đang ở đầu queue.',
        'The one that entered first, at the front of the queue.',
      ),
      m(
        'Lấy đầu queue u, rồi duyệt hàng xóm của u theo chỉ số tăng.',
        'Pop the front u, then scan the neighbours of u in increasing index order.',
      ),
    ],
    misconceptions: [
      m(
        'Lấy đỉnh ở cuối queue: sẽ thành DFS và mất tính chất đường ngắn nhất.',
        'Taking the back of the queue: that becomes DFS and loses the shortest-path property.',
      ),
    ],
  },
  {
    id: 'enqueue',
    label: m('Xét hàng xóm', 'Look at a neighbour'),
    narration: m(
      'Với hàng xóm {v} của {u}: nếu chưa thăm thì d[{v}] = d[{u}] + 1 và đưa vào queue; nếu đã thăm thì bỏ qua.',
      'For the neighbour {v} of {u}: if unvisited then d[{v}] = d[{u}] + 1 and queue it; if already visited, skip it.',
    ),
    ask: {
      text: m(
        'Theo em, hàng xóm này có được đưa vào queue không?',
        'Will this neighbour be put into the queue?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Có, đưa vào queue', 'Yes, queue it'),
          m('Không, đã thăm rồi', 'No, already visited'),
        ],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:skip-visited') ? 1 : 0),
      },
    },
    hints: [
      m(
        'Nhìn nhãn của hàng xóm: nó đã có khoảng cách d chưa?',
        'Look at the neighbour’s label: does it already show a distance d?',
      ),
      m(
        'Đã có d nghĩa là đã được thăm trước đó (bởi đường ngắn hơn hoặc bằng).',
        'Having d means it was visited before (by a path no longer than this).',
      ),
      m(
        'Chưa thăm ⇒ đưa vào queue với d + 1; đã thăm ⇒ bỏ qua.',
        'Unvisited ⇒ queue it with d + 1; visited ⇒ skip it.',
      ),
    ],
    misconceptions: [
      m(
        'Đưa lại đỉnh đã thăm vào queue: với đồ thị có chu trình sẽ lặp mãi.',
        'Queuing an already-visited node again: with a cycle that would loop forever.',
      ),
    ],
  },
  {
    id: 'skip-visited',
    label: m('Bỏ qua đỉnh đã thăm', 'Skip a visited node'),
    narration: m(
      '{v} đã được thăm với khoảng cách {dv}. Ta đánh dấu khi đưa vào queue, nên đường tới {v} từ nguồn đã được tính, không đưa lại.',
      '{v} was already visited with distance {dv}. We mark nodes when they enter the queue, so the path to {v} is already counted, and it is not queued again.',
    ),
    hints: [
      m(
        'Đỉnh này đã có khoảng cách. Có nên thay đổi nó không?',
        'This node already has a distance. Should we change it?',
      ),
      m(
        'Không: BFS đến đỉnh từ lớp gần nhất trước, nên khoảng cách đầu tiên là nhỏ nhất.',
        'No: BFS reaches a node from the nearest layer first, so its first distance is the smallest.',
      ),
      m(
        'Bỏ qua; đánh dấu đã thăm lúc đưa vào queue, không phải lúc lấy ra.',
        'Skip it; mark visited when queuing, not when dequeuing.',
      ),
    ],
    misconceptions: [
      m(
        'Đánh dấu đã thăm khi lấy khỏi queue: một đỉnh có thể bị đưa vào queue nhiều lần trước đó.',
        'Marking visited at dequeue time: a node could be queued many times before then.',
      ),
    ],
  },
  {
    id: 'layer',
    label: m('Lớp mới', 'A new layer'),
    narration: m(
      'Mọi đỉnh ở khoảng cách {pd} đã xử lý xong, ta chuyển sang lớp khoảng cách {du}. Queue luôn chứa tối đa hai lớp liên tiếp.',
      'Every node at distance {pd} is done, so we move to layer {du}. The queue holds at most two consecutive layers.',
    ),
    hints: [
      m(
        'Khoảng cách của đỉnh vừa lấy khác đỉnh trước ở điểm nào?',
        'How does the distance of the node just taken differ from the previous one?',
      ),
      m(
        'Nó lớn hơn một: ta đã xong lớp trước.',
        'It is one larger: the previous layer is finished.',
      ),
      m(
        'BFS xử lý hết lớp d rồi mới sang lớp d + 1, nhờ tính chất FIFO của queue.',
        'BFS finishes layer d before layer d + 1, thanks to the FIFO property of the queue.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cần đếm lớp riêng: khoảng cách d[v] đã cho biết lớp của v.',
        'Thinking layers need separate counting: the distance d[v] already tells the layer.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Queue rỗng nên xong: d[v] là số cạnh ít nhất từ {s} tới v, các đỉnh không có d là không tới được. Mỗi đỉnh và cạnh xét O(1) lần: O(n + m).',
      'The queue is empty, so we are done: d[v] is the fewest edges from {s} to v, nodes without d are unreachable. Each node and edge is handled O(1) times: O(n + m).',
    ),
    hints: [
      m(
        'Khi nào queue rỗng, và lúc đó còn đỉnh nào chưa thăm?',
        'When does the queue run empty, and are any nodes left unvisited then?',
      ),
      m(
        'Có thể còn: các đỉnh không nối với nguồn thì không bao giờ vào queue.',
        'Possibly: nodes not connected to the source never enter the queue.',
      ),
      m(
        'Mỗi đỉnh vào queue tối đa một lần và mỗi cạnh được xét hai lần: O(n + m).',
        'Each node enters the queue at most once and each edge is examined twice: O(n + m).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng BFS luôn thăm hết đồ thị: nó chỉ thăm thành phần liên thông chứa nguồn.',
        'Thinking BFS always visits the whole graph: it only visits the component containing the source.',
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
  const dist: number[] = Array(n).fill(-1);
  const treeEdges = new Set<string>();
  const queue: number[] = [];
  const edges = input.g.edges.map(([a, b]) => ({
    from: letter(Math.min(a, b)),
    to: letter(Math.max(a, b)),
  }));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag: string | undefined,
    final = false,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let i = 0; i < n; i++) {
      if (dist[i] >= 0) highlights[letter(i)] = final ? 'result' : 'visited';
      else if (final) highlights[letter(i)] = 'muted';
    }
    for (const k of treeEdges) highlights[k] = 'result';
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: letter(i),
          label: dist[i] >= 0 ? `${letter(i)} (d=${dist[i]})` : letter(i),
        })),
        edges,
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [{ id: 'queue', label: 'Queue', items: queue.map(letter) }],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  dist[s] = 0;
  queue.push(s);
  put(EX.start, 1, { s: letter(s) }, { [letter(s)]: 'active' }, 'start');
  let level = 0;
  while (queue.length > 0) {
    tick();
    const u = queue.shift() as number;
    const du = dist[u];
    const newLayer = du > level;
    put(
      newLayer ? EX.layer : EX.dequeue,
      3,
      newLayer ? { u: letter(u), du, pd: level } : { u: letter(u), du },
      { [letter(u)]: 'active' },
      newLayer ? 'layer' : 'dequeue',
    );
    level = du;
    for (const v of adj[u]) {
      tick();
      put(
        EX.test,
        4,
        { u: letter(u), v: letter(v) },
        { [letter(u)]: 'active', [letter(v)]: 'compare', [edgeKey(u, v)]: 'compare' },
        'enqueue',
      );
      if (dist[v] === -1) {
        dist[v] = du + 1;
        queue.push(v);
        treeEdges.add(edgeKey(u, v));
        put(
          EX.enqueue,
          5,
          { u: letter(u), v: letter(v), dv: dist[v] },
          { [letter(u)]: 'active', [letter(v)]: 'compare' },
          undefined,
        );
      } else {
        put(
          EX.skip,
          5,
          { u: letter(u), v: letter(v), dv: dist[v] },
          { [letter(u)]: 'active', [letter(v)]: 'compare', [edgeKey(u, v)]: 'compare' },
          'skip-visited',
        );
      }
    }
  }
  const reach = dist.filter((d) => d >= 0);
  put(
    EX.done,
    6,
    { count: reach.length, n, s: letter(s), far: Math.max(...reach) },
    {},
    'done',
    true,
  );
}

export const bfsEntry: WalkthroughEntry<In, S> = {
  id: 'bfs',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t3-graph-traversal'],
  title: m('BFS: tìm kiếm theo chiều rộng', 'BFS: breadth-first search'),
  code: {
    pseudo: [
      'd[s] ← 0; đánh dấu s; queue ← [s]',
      'while queue không rỗng:',
      '    u ← lấy đầu queue',
      '    for v kề u (theo chỉ số tăng):',
      '        if v chưa thăm: đánh dấu v; d[v] ← d[u] + 1; đưa v vào queue',
      'return d',
    ],
    impl: {
      cpp: [
        'std::vector<int> bfs(int n, const std::vector<std::vector<int>>& adj, int s) {',
        '    std::vector<int> d(n, -1);',
        '    std::queue<int> q;',
        '    d[s] = 0;',
        '    q.push(s);',
        '    while (!q.empty()) {',
        '        int u = q.front();',
        '        q.pop();',
        '        for (int v : adj[u]) {',
        '            if (d[v] == -1) {',
        '                d[v] = d[u] + 1;',
        '                q.push(v);',
        '            }',
        '        }',
        '    }',
        '    return d;',
        '}',
      ],
      py: [
        'from collections import deque',
        'def bfs(n, adj, s):',
        '    d = [-1] * n',
        '    d[s] = 0',
        '    q = deque([s])',
        '    while q:',
        '        u = q.popleft()',
        '        for v in adj[u]:',
        '            if d[v] == -1:',
        '                d[v] = d[u] + 1',
        '                q.append(v)',
        '    return d',
      ],
    },
    map: {
      cpp: { 1: [2, 3, 4, 5], 2: [6], 3: [7, 8], 4: [9], 5: [10, 11, 12], 6: [16] },
      py: { 1: [3, 4, 5], 2: [6], 3: [7], 4: [8], 5: [9, 10, 11], 6: [12] },
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
      id: 'two-paths',
      label: m('Hai đường cùng độ dài', 'Two equal paths'),
      input: {
        g: {
          n: 5,
          edges: [
            [0, 1],
            [0, 2],
            [1, 3],
            [2, 3],
            [3, 4],
          ],
        },
        source: 0,
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'skip-visited',
      text: m(
        'Đánh dấu đã thăm khi ĐƯA VÀO queue, không phải khi lấy ra: nếu không một đỉnh có thể vào queue nhiều lần và d bị tính lại.',
        'Mark visited when a node ENTERS the queue, not when it leaves: otherwise a node can be queued many times and d is recomputed.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'dequeue',
      text: m(
        'std::queue::front() trên queue rỗng là hành vi không xác định: kiểm !q.empty() (đã có trong vòng while).',
        'std::queue::front() on an empty queue is undefined: check !q.empty() (already in the while).',
      ),
    },
    {
      lang: 'py',
      beat: 'dequeue',
      text: m(
        'Dùng collections.deque và popleft(); list.pop(0) tốn O(n) mỗi lần làm BFS chậm thành O(n²).',
        'Use collections.deque and popleft(); list.pop(0) costs O(n) each time and turns BFS into O(n²).',
      ),
    },
  ],
  // [Inference] 8 nodes and 12 edges need up to 58 frames (2 per neighbour check); the card says 50.
  maxFrames: 70,
  maxBytes: 200_000,
  run,
};
