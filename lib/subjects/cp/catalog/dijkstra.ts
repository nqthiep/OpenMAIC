/**
 * Walkthrough entry: Dijkstra's shortest paths with a binary heap and stale entries
 * (SCHEMA §5, card 2C-03). Neighbours are relaxed by increasing index; heap ties by node index.
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { g: { n: number; edges: number[][] }; source: number };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const edgeKey = (a: number, b: number): string =>
  `${letter(Math.min(a, b))}-${letter(Math.max(a, b))}`;
const INF = Number.POSITIVE_INFINITY;
/** The pop question frame appears for the first two pops only (a script asks each beat twice at most). */
const ASKED_POPS = 2;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Tìm đường ngắn nhất từ {s} tới mọi đỉnh (trọng số dương). dist[{s}] = 0, các đỉnh khác là ∞. Heap chứa cặp (d, đỉnh); lúc đầu là (0, {s}).',
    'Find shortest paths from {s} to every node (positive weights). dist[{s}] = 0, the others are ∞. The heap holds (d, node) pairs; at first (0, {s}).',
  ),
  pop: m(
    'Lấy một phần tử ra khỏi heap. Phần tử nào ra trước: đỉnh có d nhỏ nhất, hay đỉnh vào heap sớm nhất?',
    'Take one element out of the heap. Which comes first: the node with the smallest d, or the one that entered the heap first?',
  ),
  settle: m(
    'Ra khỏi heap: ({d}, {u}). d = dist[{u}] nên {u} được chốt với khoảng cách {d}: không còn đường nào ngắn hơn.',
    'Out of the heap: ({d}, {u}). d = dist[{u}], so {u} is settled with distance {d}: no shorter path exists.',
  ),
  stale: m(
    'Ra khỏi heap: ({d}, {u}) nhưng dist[{u}] = {cur} < {d}: đây là mục cũ đã bị cải thiện, bỏ qua.',
    'Out of the heap: ({d}, {u}) but dist[{u}] = {cur} < {d}: this is an old entry that was improved, skip it.',
  ),
  relax: m(
    'Từ {u} qua cạnh {u}–{v} (trọng số {w}): {d} + {w} = {nd} < dist[{v}] = {old}. Cập nhật dist[{v}] = {nd} và đẩy ({nd}, {v}) vào heap.',
    'From {u} along {u}–{v} (weight {w}): {d} + {w} = {nd} < dist[{v}] = {old}. Update dist[{v}] = {nd} and push ({nd}, {v}) into the heap.',
  ),
  done: m(
    'Heap rỗng: mọi đỉnh tới được đã được chốt. Khoảng cách xa nhất là {far}; đỉnh không có số là không tới được từ {s}.',
    'The heap is empty: every reachable node is settled. The farthest distance is {far}; a node without a number is unreachable from {s}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Dijkstra tìm đường ngắn nhất theo tổng trọng số (dương) từ {s}. Nó luôn chốt đỉnh gần nhất chưa chốt, nhờ một heap (hàng đợi ưu tiên, lấy ra phần tử nhỏ nhất trước).',
      'Dijkstra finds shortest paths by total (positive) weight from {s}. It always settles the nearest unsettled node, using a heap (a priority queue that yields the smallest element first).',
    ),
    hints: [
      m(
        'BFS đếm cạnh. Khi cạnh có trọng số khác nhau, đỉnh gần nhất tính thế nào?',
        'BFS counts edges. With different weights, how is the nearest node found?',
      ),
      m(
        'Theo tổng trọng số. Đỉnh có khoảng cách nhỏ nhất chưa chốt chắc chắn đã đúng.',
        'By total weight. The unsettled node with the smallest distance is surely final.',
      ),
      m(
        'Heap cho ta lấy đỉnh nhỏ nhất nhanh; mỗi lần chốt một đỉnh ta cập nhật (nới lỏng) các hàng xóm.',
        'A heap gives the smallest quickly; each time we settle a node we relax its neighbours.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng Dijkstra dùng được với trọng số âm: nó cần trọng số không âm, nếu không đỉnh đã chốt có thể còn cải thiện.',
        'Thinking Dijkstra works with negative weights: it needs non-negative weights, otherwise a settled node could still improve.',
      ),
    ],
  },
  {
    id: 'pop',
    label: m('Lấy khỏi heap', 'Pop from the heap'),
    narration: m(
      'Heap luôn trả về cặp có d nhỏ nhất. Đó chính là đỉnh chưa chốt gần nguồn nhất, nên khoảng cách của nó đã tối ưu.',
      'The heap always returns the pair with the smallest d. That is the unsettled node nearest the source, so its distance is already optimal.',
    ),
    ask: {
      text: m(
        'Theo em, phần tử nào ra khỏi heap tiếp theo?',
        'Which element leaves the heap next?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Cái có d nhỏ nhất', 'The one with the smallest d'),
          m('Cái vào heap sớm nhất', 'The one that entered first'),
        ],
        answer: (_frame, next) => (next ? 0 : -1),
      },
    },
    hints: [
      m('Heap khác hàng đợi ở điểm nào?', 'How does a heap differ from a queue?'),
      m(
        'Hàng đợi trả phần tử vào sớm nhất; heap trả phần tử nhỏ nhất theo khoá (ở đây là d).',
        'A queue returns what entered first; a heap returns the smallest by key (here d).',
      ),
      m(
        'Vậy phần tử có d nhỏ nhất ra trước, bất kể nó vào heap lúc nào.',
        'So the element with the smallest d comes out first, whenever it entered.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm heap với queue của BFS: BFS lấy theo thứ tự vào, Dijkstra lấy theo khoảng cách nhỏ nhất.',
        'Mixing the heap up with the BFS queue: BFS takes by arrival order, Dijkstra by smallest distance.',
      ),
    ],
  },
  {
    id: 'settle',
    label: m('Chốt đỉnh', 'Settle a node'),
    narration: m(
      'Cặp ({d}, {u}) khớp với dist[{u}] = {d}, nên {u} được chốt. Với trọng số dương, mọi đường khác tới {u} đều phải đi qua đỉnh xa hơn, nên không ngắn hơn {d}.',
      'The pair ({d}, {u}) matches dist[{u}] = {d}, so {u} is settled. With positive weights every other path to {u} goes through a farther node, so it is no shorter than {d}.',
    ),
    hints: [
      m(
        'Vì sao một đỉnh ra khỏi heap lần đầu thì khoảng cách là cuối cùng?',
        'Why is the distance final the first time a node leaves the heap?',
      ),
      m(
        'Mọi đường khác phải đi qua đỉnh còn trong heap, vốn có d lớn hơn hoặc bằng.',
        'Every other path must pass through a node still in the heap, whose d is larger or equal.',
      ),
      m(
        'Vì trọng số dương, thêm cạnh chỉ làm đường dài hơn, nên d của đỉnh vừa lấy là nhỏ nhất.',
        'Because weights are positive, adding edges only lengthens a path, so the d of the node just taken is the smallest.',
      ),
    ],
    misconceptions: [
      m(
        'Chốt đỉnh ngay khi nó được đẩy vào heap: lúc đó khoảng cách chỉ là ước lượng tạm.',
        'Settling a node as soon as it is pushed: at that time the distance is only a tentative estimate.',
      ),
    ],
  },
  {
    id: 'relax',
    label: m('Nới lỏng cạnh', 'Relax an edge'),
    narration: m(
      'Đi từ {u} sang {v} qua cạnh trọng số {w} cho khoảng cách {nd}, ngắn hơn dist[{v}] hiện tại ({old}). Ta cập nhật và đẩy cặp mới vào heap.',
      'Going from {u} to {v} along the edge of weight {w} gives {nd}, shorter than the current dist[{v}] ({old}). We update it and push the new pair into the heap.',
    ),
    hints: [
      m(
        'So hai số: khoảng cách tới {v} qua {u} và khoảng cách đã biết.',
        'Compare two numbers: the distance to {v} through {u} and the one already known.',
      ),
      m(
        'Nếu đường qua u ngắn hơn thì ta tìm được đường tốt hơn.',
        'If the path through u is shorter we have found a better route.',
      ),
      m(
        'dist[u] + w < dist[v] ⇒ dist[v] = dist[u] + w, rồi push (dist[v], v); mục cũ của v vẫn nằm trong heap.',
        'dist[u] + w < dist[v] ⇒ dist[v] = dist[u] + w, then push (dist[v], v); the old entry of v stays in the heap.',
      ),
    ],
    misconceptions: [
      m(
        'Xoá mục cũ của v khỏi heap: heap thường không xoá được giữa chừng, ta để nó và bỏ qua khi lấy ra.',
        'Deleting the old entry of v from the heap: a heap usually cannot delete from the middle, we leave it and skip it later.',
      ),
    ],
  },
  {
    id: 'skip-stale',
    label: m('Bỏ mục cũ', 'Skip a stale entry'),
    narration: m(
      'Mục ({d}, {u}) cũ hơn dist[{u}] = {cur} đã được cải thiện sau đó. {u} đã được chốt với khoảng cách nhỏ hơn, nên ta bỏ mục này.',
      'The entry ({d}, {u}) is older than dist[{u}] = {cur}, which improved afterwards. {u} was settled with a smaller distance, so we drop this entry.',
    ),
    hints: [
      m(
        'Vì sao trong heap có hai mục cho cùng một đỉnh?',
        'Why does the heap hold two entries for the same node?',
      ),
      m(
        'Mỗi lần cải thiện ta đẩy một mục mới và không xoá mục cũ.',
        'Each improvement pushes a new entry and the old one is not removed.',
      ),
      m(
        'Khi lấy mục cũ ra, d lớn hơn dist[u]: bỏ qua bằng điều kiện if d > dist[u]: continue.',
        'When the old entry comes out, d exceeds dist[u]: skip it with the test if d > dist[u]: continue.',
      ),
    ],
    misconceptions: [
      m(
        'Quên dòng bỏ mục cũ: kết quả vẫn đúng nhưng đỉnh bị xử lý lại nhiều lần, có thể chậm đi nhiều.',
        'Forgetting the stale test: the result stays correct but nodes are processed repeatedly, which can be much slower.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Heap rỗng nên xong: dist[v] là đường ngắn nhất từ {s}. Mỗi cạnh làm tối đa một lần đẩy heap: O((n + m) log n).',
      'The heap is empty, so we are done: dist[v] is the shortest path from {s}. Each edge causes at most one heap push: O((n + m) log n).',
    ),
    hints: [
      m(
        'Có tối đa bao nhiêu phần tử được đẩy vào heap?',
        'At most how many elements are pushed into the heap?',
      ),
      m(
        'Mỗi lần nới lỏng thành công đẩy một phần tử, tối đa một lần cho mỗi cạnh (hai chiều).',
        'Each successful relaxation pushes one element, at most once per edge (both directions).',
      ),
      m(
        'Mỗi lần heap tốn O(log n), vậy O((n + m) log n).',
        'Each heap operation costs O(log n), so O((n + m) log n).',
      ),
    ],
    misconceptions: [
      m(
        'Dùng priority_queue mặc định của C++ (max-heap) mà không đổi: phải dùng greater<> để lấy phần tử nhỏ nhất.',
        'Using the default C++ priority_queue (a max-heap) unchanged: you must use greater<> to get the smallest element.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input.g;
  const s = input.source;
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [a, b, w] of input.g.edges) {
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  }
  adj.forEach((list) => list.sort((p, q) => p[0] - q[0]));
  const dist: number[] = Array(n).fill(INF);
  const settled = new Set<number>();
  const heap: [number, number][] = [];
  const edgesState = input.g.edges.map(([a, b, w]) => ({
    from: letter(Math.min(a, b)),
    to: letter(Math.max(a, b)),
    weight: w,
  }));
  let pops = 0;

  const sortedHeap = (): [number, number][] => [...heap].sort((p, q) => p[0] - q[0] || p[1] - q[1]);

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
      if (settled.has(i)) highlights[letter(i)] = 'result';
      else if (final && dist[i] === INF) highlights[letter(i)] = 'muted';
    }
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({
          id: letter(i),
          label: dist[i] === INF ? letter(i) : `${letter(i)} (${dist[i]})`,
        })),
        edges: edgesState,
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [
          {
            id: 'heap',
            label: 'Heap (d, v)',
            items: sortedHeap().map(([d, v]) => `(${d}, ${letter(v)})`),
          },
        ],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  dist[s] = 0;
  heap.push([0, s]);
  put(EX.start, 1, { s: letter(s) }, { [letter(s)]: 'active' }, 'start');
  while (heap.length > 0) {
    tick();
    const sorted = sortedHeap();
    const [d, u] = sorted[0];
    heap.splice(
      heap.findIndex(([hd, hv]) => hd === d && hv === u),
      1,
    );
    if (pops < ASKED_POPS) {
      put(EX.pop, 3, { s: letter(s) }, {}, 'pop');
    }
    pops++;
    if (d > dist[u]) {
      put(EX.stale, 4, { d, u: letter(u), cur: dist[u] }, { [letter(u)]: 'compare' }, 'skip-stale');
      continue;
    }
    settled.add(u);
    put(EX.settle, 3, { d, u: letter(u) }, { [letter(u)]: 'active' }, 'settle');
    for (const [v, w] of adj[u]) {
      if (settled.has(v)) continue;
      const nd = d + w;
      if (nd < dist[v]) {
        const old = dist[v];
        dist[v] = nd;
        heap.push([nd, v]);
        put(
          EX.relax,
          5,
          { u: letter(u), v: letter(v), w, d, nd, old: old === INF ? '∞' : old },
          { [letter(u)]: 'active', [letter(v)]: 'compare', [edgeKey(u, v)]: 'compare' },
          'relax',
        );
      }
    }
  }
  const finite = dist.filter((x) => x !== INF);
  put(EX.done, 6, { far: Math.max(...finite), s: letter(s) }, {}, 'done', true);
}

export const dijkstraEntry: WalkthroughEntry<In, S> = {
  id: 'dijkstra',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t4-shortest-path'],
  title: m('Dijkstra: đường đi ngắn nhất', 'Dijkstra: shortest paths'),
  code: {
    pseudo: [
      'dist[s] ← 0; heap ← {(0, s)}',
      'while heap không rỗng:',
      '    (d, u) ← lấy phần tử nhỏ nhất của heap',
      '    if d > dist[u]: bỏ (mục cũ)',
      '    for mỗi cạnh (u, v, w): if dist[u] + w < dist[v]: cập nhật dist[v]; đẩy (dist[v], v) vào heap',
      'return dist',
    ],
    impl: {
      cpp: [
        'std::vector<int> dijkstra(int n, const std::vector<std::vector<std::pair<int, int>>>& adj, int s) {',
        '    const int INF = 1000000000;',
        '    std::vector<int> dist(n, INF);',
        '    std::priority_queue<std::pair<int, int>, std::vector<std::pair<int, int>>, std::greater<>> pq;',
        '    dist[s] = 0;',
        '    pq.push({0, s});',
        '    while (!pq.empty()) {',
        '        auto [d, u] = pq.top();',
        '        pq.pop();',
        '        if (d > dist[u]) continue;',
        '        for (auto [v, w] : adj[u]) {',
        '            if (dist[u] + w < dist[v]) {',
        '                dist[v] = dist[u] + w;',
        '                pq.push({dist[v], v});',
        '            }',
        '        }',
        '    }',
        '    return dist;',
        '}',
      ],
      py: [
        'import heapq',
        'def dijkstra(n, adj, s):',
        '    INF = 10 ** 9',
        '    dist = [INF] * n',
        '    dist[s] = 0',
        '    pq = [(0, s)]',
        '    while pq:',
        '        d, u = heapq.heappop(pq)',
        '        if d > dist[u]:',
        '            continue',
        '        for v, w in adj[u]:',
        '            if dist[u] + w < dist[v]:',
        '                dist[v] = dist[u] + w',
        '                heapq.heappush(pq, (dist[v], v))',
        '    return dist',
      ],
    },
    map: {
      cpp: { 1: [3, 4, 5, 6], 2: [7], 3: [8, 9], 4: [10], 5: [11, 12, 13, 14], 6: [18] },
      py: { 1: [4, 5, 6], 2: [7], 3: [8], 4: [9, 10], 5: [11, 12, 13, 14], 6: [15] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      g: { kind: 'edge-list', nodes: [1, 8], edges: [0, 14], weight: [1, 20] },
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
      id: 'classic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: {
        g: {
          n: 6,
          edges: [
            [0, 1, 7],
            [0, 2, 9],
            [0, 5, 14],
            [1, 2, 10],
            [1, 3, 15],
            [2, 3, 11],
            [2, 5, 2],
            [3, 4, 6],
            [4, 5, 9],
          ],
        },
        source: 0,
      },
    },
    {
      id: 'relax-twice',
      label: m('Một đỉnh cải thiện hai lần', 'A node improved twice'),
      input: {
        g: {
          n: 4,
          edges: [
            [0, 1, 10],
            [0, 2, 3],
            [1, 2, 4],
            [1, 3, 2],
            [2, 3, 8],
          ],
        },
        source: 0,
      },
    },
    {
      id: 'unreachable',
      label: m('Có đỉnh không tới được', 'An unreachable node'),
      input: {
        g: {
          n: 5,
          edges: [
            [0, 1, 4],
            [1, 2, 3],
            [3, 4, 1],
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
      id: 'line',
      label: m('Đường thẳng', 'A line'),
      input: {
        g: {
          n: 5,
          edges: [
            [0, 1, 2],
            [1, 2, 3],
            [2, 3, 4],
            [3, 4, 5],
          ],
        },
        source: 0,
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'skip-stale',
      text: m(
        'Bỏ qua mục cũ bằng if d > dist[u]: continue; thiếu dòng này thuật toán vẫn đúng nhưng có thể chậm đi rất nhiều.',
        'Skip stale entries with if d > dist[u]: continue; without it the algorithm stays correct but can slow down a lot.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'pop',
      text: m(
        'priority_queue mặc định là max-heap: dùng priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> để lấy phần tử nhỏ nhất. INF phải đủ nhỏ để dist[u] + w không tràn.',
        'priority_queue is a max-heap by default: use priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> for the smallest. INF must be small enough that dist[u] + w does not overflow.',
      ),
    },
    {
      lang: 'py',
      beat: 'pop',
      text: m(
        'heapq là min-heap trên tuple: đẩy (d, v) để so theo d trước. Đừng đẩy (v, d): heap sẽ sắp theo chỉ số đỉnh.',
        'heapq is a min-heap on tuples: push (d, v) so it orders by d first. Do not push (v, d): the heap would order by node index.',
      ),
    },
  ],
  // [Inference] 8 nodes and 14 edges can need over 60 frames (a stale pop is one frame, so is each relax).
  maxFrames: 90,
  maxBytes: 200_000,
  run,
};
