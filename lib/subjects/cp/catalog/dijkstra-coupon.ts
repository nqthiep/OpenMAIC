/**
 * Walkthrough entry: shortest path with one free edge, Dijkstra on a state graph (v, used)
 * (SCHEMA §5, card 2C-08, P3; the statement is the leader's proposal [Inference], README D16).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; edges: number[][] };
type GNode = { id: string; label: string; x: number; y: number };
type GEdge = { from: string; to: string; weight: number; directed?: boolean; label?: string };
type S = { nodes: GNode[]; edges: GEdge[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const sid = (v: number, k: number): string => `${letter(v)}${k}`;
const ukey = (a: number, b: number, k: number): string =>
  `${sid(Math.min(a, b), k)}-${sid(Math.max(a, b), k)}`;
const INF = Number.POSITIVE_INFINITY;
/** The free-edge question frame appears for the first two ticket relaxations only (a script asks each beat twice at most). */
const ASKED_FREE = 2;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Đi từ {a0} tới {tn} với một vé miễn phí một cạnh. Dijkstra trên đồ thị trạng thái; chi phí nhỏ nhất bắt đầu ở ({a0}, chưa dùng vé) = 0.',
    'Travel from {a0} to {tn} with one ticket that makes one edge free. Dijkstra on a state graph; the cheapest cost starts at ({a0}, ticket unused) = 0.',
  ),
  states: m(
    'Trạng thái (v, k): k = 0 chưa dùng vé (hàng trên, như A0), k = 1 đã dùng (hàng dưới, A1). Cạnh vé đi từ lớp 0 sang lớp 1 với trọng số 0.',
    'A state (v, k): k = 0 ticket unused (top row, like A0), k = 1 used (bottom row, A1). Ticket edges go from layer 0 to layer 1 with weight 0.',
  ),
  pop: m(
    'Lấy ({d}, {s}) ra khỏi heap: d = dist[{s}] nên trạng thái {s} được chốt với chi phí {d}.',
    'Pop ({d}, {s}) from the heap: d = dist[{s}], so the state {s} is settled with cost {d}.',
  ),
  stale: m(
    'Lấy ({d}, {s}) nhưng dist[{s}] = {cur} < {d}: mục cũ đã được cải thiện, bỏ qua.',
    'Pop ({d}, {s}) but dist[{s}] = {cur} < {d}: an old entry that was improved, skip it.',
  ),
  normal: m(
    'Đi bình thường {s} → {t} (cạnh {w}): {d} + {w} = {nd} < {old}. Cập nhật dist[{t}] = {nd}, đẩy vào heap.',
    'Walk normally {s} → {t} (edge {w}): {d} + {w} = {nd} < {old}. Update dist[{t}] = {nd} and push it.',
  ),
  ask: m(
    'Từ {s} (chi phí {d}) có thể dùng vé trên cạnh tới {u}: sang {t} với trọng số 0. Dùng vé ở cạnh này có lợi hơn không?',
    'From {s} (cost {d}) the ticket can cover the edge to {u}: go to {t} with weight 0. Is using the ticket on this edge better?',
  ),
  free: m(
    'Dùng vé {s} → {t} (trọng số 0): {d} + 0 = {nd} < {old}. Cập nhật dist[{t}] = {nd}, đẩy vào heap.',
    'Use the ticket {s} → {t} (weight 0): {d} + 0 = {nd} < {old}. Update dist[{t}] = {nd} and push it.',
  ),
  noFree: m(
    'Dùng vé {s} → {t}: {d} + 0 = {nd}, không nhỏ hơn dist[{t}] = {old}. Không có lợi.',
    'Using the ticket {s} → {t}: {d} + 0 = {nd}, not below dist[{t}] = {old}. No gain.',
  ),
  done: m(
    'Chi phí nhỏ nhất tới {tn} là min(dist[{tn}][0], dist[{tn}][1]) = min({c0}, {c1}) = {best}.',
    'The least cost to {tn} is min(dist[{tn}][0], dist[{tn}][1]) = min({c0}, {c1}) = {best}.',
  ),
  none: m(
    'Không có đường từ {a0} tới {tn}: cả hai trạng thái đích đều là ∞.',
    'There is no path from {a0} to {tn}: both target states are ∞.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đề bài', 'The task'),
    narration: m(
      'Đi từ {a0} tới {tn} qua các cạnh có trọng số; được dùng MỘT vé để một cạnh trên đường đi miễn phí. Tìm tổng chi phí nhỏ nhất.',
      'Go from {a0} to {tn} along weighted edges; you may use ONE ticket to make a single edge of the route free. Find the least total cost.',
    ),
    hints: [
      m('Nếu có vé, nên miễn phí cạnh nào?', 'With a ticket, which edge should be made free?'),
      m(
        'Thử từng cạnh làm miễn phí rồi chạy Dijkstra: được nhưng chậm, m lần chạy.',
        'Try each edge free and run Dijkstra: it works but is slow, m runs.',
      ),
      m(
        'Gọn hơn: thêm một chiều cho đồ thị, "đã dùng vé chưa", rồi chạy Dijkstra một lần.',
        'Neater: add one dimension to the graph, "has the ticket been used", and run Dijkstra once.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng luôn nên miễn phí cạnh nặng nhất của đường ngắn nhất cũ: có thể có đường khác tốt hơn khi dùng vé.',
        'Thinking one should always free the heaviest edge of the old shortest path: a different route may be better once the ticket is used.',
      ),
    ],
  },
  {
    id: 'states',
    label: m('Đồ thị trạng thái', 'The state graph'),
    narration: m(
      'Mỗi đỉnh thành hai trạng thái: (v, 0) chưa dùng vé và (v, 1) đã dùng. Đi bình thường giữ nguyên lớp; cạnh vé đi từ lớp 0 sang lớp 1 với trọng số 0.',
      'Each node becomes two states: (v, 0) ticket unused and (v, 1) used. A normal move stays in its layer; a ticket edge goes from layer 0 to layer 1 with weight 0.',
    ),
    hints: [
      m(
        'Ngoài đỉnh đang đứng, ta cần nhớ thêm điều gì để biết còn dùng được vé không?',
        'Besides the node we stand at, what else must we remember to know whether the ticket can still be used?',
      ),
      m(
        'Một bit: đã dùng vé chưa. Cặp (v, k) là một trạng thái.',
        'One bit: whether the ticket was used. The pair (v, k) is one state.',
      ),
      m(
        'Đồ thị trạng thái có 2n đỉnh; ta tìm đường từ (0, 0) tới (n − 1, 0) hoặc (n − 1, 1).',
        'The state graph has 2n nodes; we look for a path from (0, 0) to (n − 1, 0) or (n − 1, 1).',
      ),
    ],
    misconceptions: [
      m(
        'Cho phép dùng vé nhiều lần bằng cách thêm cạnh vé giữa các nút cùng lớp: vé chỉ dùng một lần nên cạnh vé đi sang lớp mới.',
        'Allowing several tickets by adding ticket edges inside one layer: the ticket works once, so ticket edges lead to the next layer.',
      ),
    ],
  },
  {
    id: 'pop',
    label: m('Lấy khỏi heap', 'Pop from the heap'),
    narration: m(
      'Heap trả về trạng thái chưa chốt có chi phí nhỏ nhất, ({d}, {s}). Dijkstra chạy nguyên như bình thường, chỉ khác là đỉnh đã mang theo bit "đã dùng vé".',
      'The heap returns the unsettled state of least cost, ({d}, {s}). Dijkstra runs exactly as usual, except that nodes now carry the "ticket used" bit.',
    ),
    hints: [
      m(
        'Có phải mọi thứ trong Dijkstra đều đổi vì có thêm vé không?',
        'Does everything in Dijkstra change because of the ticket?',
      ),
      m(
        'Không: chỉ thêm một loại cạnh (vé) và một bit trong trạng thái.',
        'No: only one extra kind of edge (the ticket) and one bit in the state.',
      ),
      m(
        'Lấy trạng thái có d nhỏ nhất; mục cũ (d > dist) vẫn bị bỏ như thường.',
        'Take the state with the smallest d; stale entries (d > dist) are still dropped as usual.',
      ),
    ],
    misconceptions: [
      m(
        'Chốt đỉnh v khi một trong hai trạng thái của nó ra khỏi heap: (v, 0) và (v, 1) là hai trạng thái riêng.',
        'Settling node v when one of its two states leaves the heap: (v, 0) and (v, 1) are separate states.',
      ),
    ],
  },
  {
    id: 'relax-normal',
    label: m('Đi bình thường', 'A normal move'),
    narration: m(
      'Đi qua cạnh trọng số {w} từ {s} sang {t} cùng lớp, tốn {w}: {d} + {w} = {nd}, tốt hơn dist hiện tại, nên cập nhật và đẩy vào heap.',
      'Taking the edge of weight {w} from {s} to {t} in the same layer costs {w}: {d} + {w} = {nd}, better than the current dist, so we update and push.',
    ),
    hints: [
      m(
        'Đi bình thường có đổi lớp (đã dùng vé hay chưa) không?',
        'Does a normal move change the layer (ticket used or not)?',
      ),
      m('Không: ta ở lại cùng lớp k.', 'No: we stay in the same layer k.'),
      m(
        'dist[u][k] > dist[v][k] + w ⇒ cập nhật và đẩy (dist, u, k).',
        'dist[u][k] > dist[v][k] + w ⇒ update and push (dist, u, k).',
      ),
    ],
    misconceptions: [
      m(
        'Đổi lớp mỗi khi đi qua cạnh: chỉ cạnh vé mới đưa từ lớp 0 sang lớp 1.',
        'Switching layer on every edge: only a ticket edge takes you from layer 0 to layer 1.',
      ),
    ],
  },
  {
    id: 'relax-free',
    label: m('Dùng vé', 'Use the ticket'),
    narration: m(
      'Đang ở lớp 0 (chưa dùng vé), ta có thể dùng vé cho cạnh vừa xét: sang lớp 1 mà không mất chi phí. Điều đó có lợi nếu {d} nhỏ hơn dist hiện tại của trạng thái lớp 1.',
      'Standing in layer 0 (ticket unused) we may spend the ticket on the edge just examined: move to layer 1 at no cost. That helps if {d} is below the current dist of the layer-1 state.',
    ),
    ask: {
      text: m(
        'Theo em, dùng vé ở cạnh này có lợi hơn không?',
        'Is using the ticket on this edge better?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Có, có lợi hơn', 'Yes, it is better'), m('Không, giữ nguyên', 'No, keep it')],
        answer: (_frame, next) => (next?.meta.vars?.imp === 1 ? 0 : 1),
      },
    },
    hints: [
      m(
        'Dùng vé thì chi phí đi qua cạnh này là bao nhiêu?',
        'If the ticket is used, what does crossing this edge cost?',
      ),
      m(
        'Bằng 0: ta tới trạng thái lớp 1 với chi phí d, không cộng trọng số cạnh.',
        'Zero: we reach the layer-1 state at cost d, without adding the edge weight.',
      ),
      m(
        'So d với dist hiện có của trạng thái lớp 1 đó: nhỏ hơn thì có lợi.',
        'Compare d with the current dist of that layer-1 state: smaller means a gain.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng vé và vẫn cộng trọng số cạnh: vé làm cạnh đó miễn phí hoàn toàn.',
        'Using the ticket yet still adding the edge weight: the ticket makes that edge entirely free.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Đáp án là min của chi phí hai trạng thái đích: {c0} (không dùng vé) và {c1} (đã dùng vé). Quên trường hợp không dùng vé là lỗi hay gặp.',
      'The answer is the min of the cost of the two target states: {c0} (ticket unused) and {c1} (ticket used). Forgetting the no-ticket case is a common bug.',
    ),
    hints: [
      m('Có phải lúc nào cũng nên dùng vé?', 'Is it always right to use the ticket?'),
      m(
        'Không bắt buộc: vé không dùng cũng hợp lệ; trạng thái đích có hai bản.',
        'Not required: leaving the ticket unused is valid; the target state has two copies.',
      ),
      m(
        'Đáp án = min(dist[n − 1][0], dist[n − 1][1]); độ phức tạp O(m log n) vì đồ thị chỉ lớn gấp đôi.',
        'The answer = min(dist[n − 1][0], dist[n − 1][1]); O(m log n) since the graph is only twice as big.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ lấy dist[n − 1][1]: nếu một cạnh duy nhất đã đủ, vẫn đúng, nhưng đồ thị không có cạnh thì phải xét lớp 0.',
        'Taking only dist[n − 1][1]: usually fine, but the layer-0 state must still be considered when it is smaller or reachable alone.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const adj: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [a, b, w] of input.edges) {
    adj[a].push([b, w]);
    adj[b].push([a, w]);
  }
  adj.forEach((list) => list.sort((p, q) => p[0] - q[0]));
  const dist: number[][] = Array.from({ length: n }, () => [INF, INF]);
  const settled = new Set<string>();
  const heap: [number, number, number][] = [];
  let asked = 0;

  const gnodes = (): GNode[] =>
    [0, 1].flatMap((k) =>
      Array.from({ length: n }, (_, v) => ({
        id: sid(v, k),
        label: dist[v][k] === INF ? sid(v, k) : `${sid(v, k)} (${dist[v][k]})`,
        x: v,
        y: k * 2,
      })),
    );
  const gedges: GEdge[] = [
    ...[0, 1].flatMap((k) =>
      input.edges.map(([a, b, w]) => ({
        from: sid(Math.min(a, b), k),
        to: sid(Math.max(a, b), k),
        weight: w,
      })),
    ),
    ...input.edges.flatMap(([a, b, w]) => [
      { from: sid(a, 0), to: sid(b, 1), weight: 0, directed: true, label: `vé (${w})` },
      { from: sid(b, 0), to: sid(a, 1), weight: 0, directed: true, label: `vé (${w})` },
    ]),
  ];
  // the label above is "vé"/"ticket" and the replaced weight; localised per run below
  const ticketLabel = (w: number): string => `${msg(m('vé', 'ticket'), ctx.locale)} (${w})`;
  for (const e of gedges)
    if (e.directed) e.label = ticketLabel(Number(/\((\d+)\)/.exec(e.label as string)![1]));

  const sorted = (): [number, number, number][] =>
    [...heap].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag: string | undefined,
    final = false,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const id of settled) highlights[id] = 'result';
    if (final) {
      for (let v = 0; v < n; v++)
        for (const k of [0, 1]) if (dist[v][k] === INF) highlights[sid(v, k)] = 'muted';
    }
    emit(
      { nodes: gnodes(), edges: gedges },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [
          {
            id: 'heap',
            label: 'Heap (d, v, k)',
            items: sorted().map(([d, v, k]) => `(${d}, ${letter(v)}, ${k})`),
          },
        ],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  const a0 = sid(0, 0);
  const tn = letter(n - 1);
  dist[0][0] = 0;
  heap.push([0, 0, 0]);
  put(EX.start, 1, { a0, tn }, { [a0]: 'active' }, 'start');
  put(EX.states, 1, {}, {}, 'states');
  while (heap.length > 0) {
    tick();
    const [d, v, k] = sorted()[0];
    heap.splice(
      heap.findIndex(([hd, hv, hk]) => hd === d && hv === v && hk === k),
      1,
    );
    const s = sid(v, k);
    if (d > dist[v][k]) {
      put(EX.stale, 4, { d, s, cur: dist[v][k] }, { [s]: 'compare' }, 'pop');
      continue;
    }
    settled.add(s);
    put(EX.pop, 3, { d, s }, { [s]: 'active' }, 'pop');
    for (const [u, w] of adj[v]) {
      const t = sid(u, k);
      const nd = d + w;
      if (nd < dist[u][k]) {
        const old = dist[u][k];
        dist[u][k] = nd;
        heap.push([nd, u, k]);
        put(
          EX.normal,
          5,
          { s, t, w, d, nd, old: old === INF ? '∞' : old },
          { [s]: 'active', [t]: 'compare', [ukey(v, u, k)]: 'compare' },
          'relax-normal',
        );
      }
      if (k === 0) {
        const t1 = sid(u, 1);
        if (asked < ASKED_FREE) {
          asked++;
          put(
            EX.ask,
            6,
            { s, d, u: letter(u), t: t1 },
            { [s]: 'active', [t1]: 'compare' },
            'relax-free',
          );
        }
        const old = dist[u][1];
        const better = d < old;
        if (better) {
          dist[u][1] = d;
          heap.push([d, u, 1]);
        }
        put(
          better ? EX.free : EX.noFree,
          6,
          { s, t: t1, d, nd: d, old: old === INF ? '∞' : old, imp: better ? 1 : 0 },
          { [s]: 'active', [t1]: better ? 'result' : 'muted', [`${s}-${t1}`]: 'active' },
          undefined,
        );
      }
    }
  }
  const c0 = dist[n - 1][0];
  const c1 = dist[n - 1][1];
  const best = Math.min(c0, c1);
  if (best === INF) put(EX.none, 7, { a0, tn, c0: '∞', c1: '∞' }, {}, 'done', true);
  else
    put(
      EX.done,
      7,
      { tn, c0: c0 === INF ? '∞' : c0, c1: c1 === INF ? '∞' : c1, best },
      {},
      'done',
      true,
    );
}

export const dijkstraCouponEntry: WalkthroughEntry<In, S> = {
  id: 'dijkstra-coupon',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t4-shortest-path'],
  title: m('Bài giải đề: đi với một vé miễn phí', 'Problem walkthrough: one free edge'),
  code: {
    pseudo: [
      'dist[(0, 0)] ← 0; heap ← {(0, 0, 0)}   (trạng thái (v, k): k = 1 nếu đã dùng vé)',
      'while heap không rỗng:',
      '    (d, v, k) ← lấy phần tử nhỏ nhất của heap',
      '    if d > dist[v][k]: bỏ (mục cũ)',
      '    for mỗi cạnh (v, u, w): nới lỏng (u, k) với d + w   (đi bình thường)',
      '        nếu k = 0: nới lỏng (u, 1) với d + 0   (dùng vé miễn phí cạnh này)',
      'return min(dist[n − 1][0], dist[n − 1][1])',
    ],
    impl: {
      cpp: [
        'int min_cost_with_coupon(int n, const std::vector<std::vector<std::pair<int, int>>>& adj) {',
        '    const int INF = 1000000000;',
        '    std::vector<std::vector<int>> dist(n, std::vector<int>(2, INF));',
        '    std::priority_queue<std::tuple<int, int, int>, std::vector<std::tuple<int, int, int>>, std::greater<>> pq;',
        '    dist[0][0] = 0;',
        '    pq.push({0, 0, 0});',
        '    while (!pq.empty()) {',
        '        auto [d, v, k] = pq.top();',
        '        pq.pop();',
        '        if (d > dist[v][k]) continue;',
        '        for (auto [u, w] : adj[v]) {',
        '            if (d + w < dist[u][k]) {',
        '                dist[u][k] = d + w;',
        '                pq.push({dist[u][k], u, k});',
        '            }',
        '            if (k == 0 && d < dist[u][1]) {',
        '                dist[u][1] = d;',
        '                pq.push({d, u, 1});',
        '            }',
        '        }',
        '    }',
        '    int best = std::min(dist[n - 1][0], dist[n - 1][1]);',
        '    return best >= INF ? -1 : best;',
        '}',
      ],
      py: [
        'import heapq',
        'def min_cost_with_coupon(n, adj):',
        '    INF = 10 ** 9',
        '    dist = [[INF, INF] for _ in range(n)]',
        '    dist[0][0] = 0',
        '    pq = [(0, 0, 0)]',
        '    while pq:',
        '        d, v, k = heapq.heappop(pq)',
        '        if d > dist[v][k]:',
        '            continue',
        '        for u, w in adj[v]:',
        '            if d + w < dist[u][k]:',
        '                dist[u][k] = d + w',
        '                heapq.heappush(pq, (d + w, u, k))',
        '            if k == 0 and d < dist[u][1]:',
        '                dist[u][1] = d',
        '                heapq.heappush(pq, (d, u, 1))',
        '    best = min(dist[n - 1])',
        '    return -1 if best >= INF else best',
      ],
    },
    map: {
      cpp: {
        1: [3, 5, 6],
        2: [7],
        3: [8, 9],
        4: [10],
        5: [11, 12, 13, 14, 15],
        6: [16, 17, 18, 19],
        7: [22, 23],
      },
      py: {
        1: [4, 5, 6],
        2: [7],
        3: [8],
        4: [9, 10],
        5: [11, 12, 13, 14],
        6: [15, 16, 17],
        7: [18, 19],
      },
    },
  },
  inputSpec: { kind: 'edge-list', nodes: [2, 6], edges: [1, 8], weight: [1, 20] },
  check: (input) => {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const [a, b] of input.edges) {
      const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
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
        n: 5,
        edges: [
          [0, 1, 6],
          [0, 2, 3],
          [1, 3, 4],
          [2, 3, 12],
          [3, 4, 8],
        ],
      },
    },
    {
      id: 'free-last',
      label: m('Nên miễn phí cạnh cuối', 'Free the last edge'),
      input: {
        n: 4,
        edges: [
          [0, 1, 2],
          [1, 2, 3],
          [2, 3, 10],
        ],
      },
    },
    {
      id: 'no-gain',
      label: m('Chỉ một cạnh', 'A single edge'),
      input: { n: 2, edges: [[0, 1, 7]] },
    },
    {
      id: 'unreachable',
      label: m('Không tới được', 'Unreachable'),
      input: {
        n: 4,
        edges: [
          [0, 1, 3],
          [2, 3, 5],
        ],
      },
    },
  ],
  beatDefs,
  problem: {
    statement: {
      'vi-VN':
        'Cho đồ thị vô hướng có trọng số. Đi từ đỉnh 0 tới đỉnh n − 1; được dùng MỘT vé để một cạnh trên đường đi có chi phí 0. Tìm tổng chi phí nhỏ nhất (hoặc −1 nếu không có đường).',
      'en-US':
        'Given a weighted undirected graph, travel from node 0 to node n − 1; you may use ONE ticket so that a single edge of the route costs 0. Find the least total cost (or −1 if there is no route).',
    },
    constraints: [
      { 'vi-VN': '2 ≤ n ≤ 10^5', 'en-US': '2 ≤ n ≤ 10^5' },
      { 'vi-VN': '1 ≤ m ≤ 2·10^5, 1 ≤ w ≤ 10^9', 'en-US': '1 ≤ m ≤ 2·10^5, 1 ≤ w ≤ 10^9' },
    ],
    subtasks: [
      {
        id: 'no-ticket',
        limit: { 'vi-VN': 'không có vé', 'en-US': 'no ticket' },
        idea: {
          'vi-VN': 'Dijkstra thường; nhưng đề có vé nên chỉ cho điểm một phần.',
          'en-US': 'Plain Dijkstra; but the task has a ticket so it scores only partially.',
        },
        complexity: 'O(m log n)',
      },
      {
        id: 'try-each',
        limit: { 'vi-VN': 'n, m ≤ 100', 'en-US': 'n, m ≤ 100' },
        idea: {
          'vi-VN': 'Thử miễn phí từng cạnh (đặt trọng số 0) rồi chạy Dijkstra; lấy nhỏ nhất.',
          'en-US': 'Try each edge as the free one (weight 0), run Dijkstra, keep the smallest.',
        },
        complexity: 'O(m·m log n)',
      },
      {
        id: 'state-graph',
        limit: { 'vi-VN': 'n ≤ 10^5', 'en-US': 'n ≤ 10^5' },
        idea: {
          'vi-VN': 'Dijkstra trên đồ thị trạng thái (v, đã dùng vé?) với cạnh vé trọng số 0.',
          'en-US': 'Dijkstra on the state graph (v, ticket used?) with weight-0 ticket edges.',
        },
        complexity: 'O(m log n)',
      },
    ],
  },
  pitfalls: [
    {
      beat: 'done',
      text: m(
        'Quên trường hợp không dùng vé: đích là min(dist[n − 1][0], dist[n − 1][1]), và kết quả −1 chỉ khi cả hai đều không tới được.',
        'Forgetting the no-ticket case: the target is min(dist[n − 1][0], dist[n − 1][1]), and −1 only when both are unreachable.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'pop',
      text: m(
        'priority_queue cần greater<> để là min-heap trên tuple (d, v, k); INF phải nhỏ hơn giới hạn int để d + w không tràn.',
        'priority_queue needs greater<> to be a min-heap on tuples (d, v, k); INF must be below the int limit so d + w does not overflow.',
      ),
    },
    {
      lang: 'py',
      beat: 'pop',
      text: m(
        'heapq với tuple (d, v, k): d đứng đầu để heap sắp theo chi phí; dùng list lồng [[INF, INF] for _ in range(n)], không [[INF, INF]] * n.',
        'heapq with tuples (d, v, k): put d first so the heap orders by cost; use the nested list [[INF, INF] for _ in range(n)], not [[INF, INF]] * n.',
      ),
    },
  ],
  maxFrames: 120,
  maxBytes: 260_000,
  run,
};
