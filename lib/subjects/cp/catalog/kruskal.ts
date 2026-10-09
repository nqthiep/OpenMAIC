/**
 * Walkthrough entry: Kruskal's minimum spanning tree with a disjoint set union
 * (SCHEMA §5, card 2C-02). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; edges: number[][] };
type S = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; weight: number }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const letter = (i: number): string => String.fromCharCode(65 + i);
const edgeKey = (a: number, b: number): string =>
  `${letter(Math.min(a, b))}-${letter(Math.max(a, b))}`;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Tìm cây khung nhỏ nhất của đồ thị {n} đỉnh, {m} cạnh có trọng số: nối mọi đỉnh liên thông bằng các cạnh có tổng trọng số nhỏ nhất. DSU: mỗi đỉnh một tập.',
    'Find a minimum spanning tree of the graph with {n|node|nodes} and {m|weighted edge|weighted edges}: connect every connected node with the smallest total weight. DSU: each node alone.',
  ),
  sort: m(
    'Sắp các cạnh tăng dần theo trọng số, rồi xét lần lượt từ cạnh nhẹ nhất. Cạnh trùng trọng số giữ thứ tự ban đầu.',
    'Sort the edges by increasing weight and look at them from the lightest. Edges of equal weight keep their input order.',
  ),
  consider: m(
    'Xét cạnh {u}–{v} trọng số {w}. Nối {u} với {v} có tạo chu trình với các cạnh đã chọn không?',
    'Consider the edge {u}–{v} of weight {w}. Does joining {u} and {v} close a cycle with the edges already chosen?',
  ),
  take: m(
    'Gốc của {u} là {ru}, của {v} là {rv}: hai tập khác nhau, nên chọn cạnh {u}–{v} (+{w}) và hợp hai tập. Tổng = {total}.',
    'The root of {u} is {ru}, of {v} is {rv}: different sets, so take the edge {u}–{v} (+{w}) and merge the sets. Total = {total}.',
  ),
  reject: m(
    '{u} và {v} cùng gốc {ru}: đã nối với nhau qua các cạnh đã chọn, nên cạnh {u}–{v} tạo chu trình và bị bỏ.',
    '{u} and {v} share the root {ru}: they are already connected through chosen edges, so {u}–{v} would form a cycle and is dropped.',
  ),
  doneTree: m(
    'Đủ {taken} cạnh (n − 1) nên dừng sớm: cây khung nhỏ nhất có tổng trọng số {total}.',
    'We have {taken|edge|edges} (n − 1), so we stop early: the minimum spanning tree has total weight {total}.',
  ),
  doneForest: m(
    'Hết cạnh: chọn {taken} cạnh, còn {comps} thành phần liên thông (rừng khung nhỏ nhất), tổng trọng số {total}.',
    'Out of edges: {taken|edge|edges} chosen, {comps} connected components remain (a minimum spanning forest), total weight {total}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Cây khung nối mọi đỉnh bằng n − 1 cạnh mà không có chu trình. Kruskal xây nó bằng cách luôn thử cạnh nhẹ nhất còn lại. Đồ thị có {n} đỉnh và {m} cạnh.',
      'A spanning tree connects all nodes with n − 1 edges and no cycle. Kruskal builds it by always trying the lightest remaining edge. The graph has {n|node|nodes} and {m|edge|edges}.',
    ),
    hints: [
      m(
        'Muốn tổng trọng số nhỏ thì nên thử cạnh nhẹ hay nặng trước?',
        'To keep the total small, should we try light or heavy edges first?',
      ),
      m(
        'Nhẹ trước. Nhưng nếu cạnh tạo chu trình thì có cần không?',
        'Light first. But if an edge closes a cycle, is it needed?',
      ),
      m(
        'Không: chu trình có cạnh thừa. Thử cạnh nhẹ nhất, bỏ nếu tạo chu trình; dùng DSU để kiểm nhanh.',
        'No: a cycle has a spare edge. Try the lightest edge, drop it if it closes a cycle; a DSU checks that fast.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cây khung nhỏ nhất là cây đường đi ngắn nhất từ một đỉnh: hai cây này khác nhau.',
        'Thinking the minimum spanning tree is a shortest-path tree from one node: the two trees differ.',
      ),
    ],
  },
  {
    id: 'sort',
    label: m('Sắp xếp cạnh', 'Sort the edges'),
    narration: m(
      'Ta sắp {m} cạnh theo trọng số tăng dần, nên mỗi lần xét ta luôn có cạnh nhẹ nhất chưa xét. Việc sắp xếp chiếm O(m log m).',
      'We sort the {m|edge|edges} by increasing weight, so each time we hold the lightest edge not yet looked at. Sorting costs O(m log m).',
    ),
    hints: [
      m('Vì sao cần sắp xếp các cạnh trước?', 'Why must the edges be sorted first?'),
      m(
        'Để luôn xét cạnh nhẹ nhất còn lại, đúng quy tắc tham lam.',
        'So that we always look at the lightest remaining edge, as the greedy rule says.',
      ),
      m(
        'Sắp theo trọng số tăng dần; trong C++ có thể sắp các bộ (w, u, v).',
        'Sort by weight, increasing; in C++ you can sort tuples (w, u, v).',
      ),
    ],
    misconceptions: [
      m(
        'Sắp theo chỉ số đỉnh thay vì theo trọng số: sẽ không cho cây nhỏ nhất.',
        'Sorting by node index instead of by weight: that does not give the smallest tree.',
      ),
    ],
  },
  {
    id: 'consider',
    label: m('Xét một cạnh', 'Consider an edge'),
    narration: m(
      'Cạnh {u}–{v} (trọng số {w}) là cạnh nhẹ nhất chưa xét. Nó chỉ có ích nếu {u} và {v} chưa được nối với nhau bởi các cạnh đã chọn.',
      'The edge {u}–{v} (weight {w}) is the lightest not yet looked at. It helps only if {u} and {v} are not yet connected by the chosen edges.',
    ),
    ask: {
      text: m('Theo em, cạnh này có tạo chu trình không?', 'Does this edge close a cycle?'),
      predict: {
        kind: 'choice',
        options: [
          m('Có, tạo chu trình', 'Yes, it closes a cycle'),
          m('Không, nối hai tập khác nhau', 'No, it joins two different sets'),
        ],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:take') ? 1 : 0),
      },
    },
    hints: [
      m(
        'Nhìn các cạnh đã chọn (tô đậm): có đường đi nào từ đầu này tới đầu kia chưa?',
        'Look at the chosen edges (highlighted): is there already a path from one end to the other?',
      ),
      m(
        'Có đường nghĩa là hai đầu cùng một tập, và thêm cạnh sẽ khép vòng.',
        'A path means both ends are in one set, and adding the edge would close a loop.',
      ),
      m(
        'Dùng DSU: find(u) = find(v) ⇒ chu trình; khác nhau ⇒ cạnh an toàn.',
        'Use the DSU: find(u) = find(v) ⇒ cycle; different ⇒ the edge is safe.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chu trình chỉ hình thành khi cả hai đầu đều đã có cạnh chọn: cần đường đi giữa hai đầu, không chỉ có cạnh ở mỗi đầu.',
        'Thinking a cycle needs both ends to have chosen edges: it needs a path between the ends, not just edges at each end.',
      ),
    ],
  },
  {
    id: 'take',
    label: m('Chọn cạnh', 'Take the edge'),
    narration: m(
      'Hai đầu thuộc hai tập khác nhau, nên cạnh {u}–{v} nối hai thành phần và không tạo chu trình. Ta chọn nó, cộng {w} vào tổng và hợp hai tập.',
      'The ends are in different sets, so the edge {u}–{v} joins two components without a cycle. We take it, add {w} to the total and merge the sets.',
    ),
    hints: [
      m(
        'Khi hai đầu ở hai tập khác nhau, thêm cạnh làm số thành phần thay đổi thế nào?',
        'When the ends are in two different sets, how does adding the edge change the number of components?',
      ),
      m('Giảm đi 1: hai thành phần thành một.', 'It drops by 1: two components become one.'),
      m('Chọn cạnh, total += w, union(ru, rv).', 'Take the edge, total += w, union(ru, rv).'),
    ],
    misconceptions: [
      m(
        'Chọn cạnh rồi quên hợp hai tập: các cạnh sau sẽ bị coi nhầm là chưa nối.',
        'Taking the edge but forgetting to merge the sets: later edges would wrongly look unconnected.',
      ),
    ],
  },
  {
    id: 'reject',
    label: m('Bỏ cạnh', 'Drop the edge'),
    narration: m(
      '{u} và {v} đã cùng thành phần liên thông nên cạnh {u}–{v} tạo chu trình. Trong chu trình cạnh nặng nhất luôn thừa, và nó là cạnh này (xét sau): bỏ.',
      '{u} and {v} are already in one component, so {u}–{v} closes a cycle. The heaviest edge of a cycle is never needed, and it is this one (looked at later): drop it.',
    ),
    hints: [
      m(
        'Nếu hai đỉnh đã nối rồi, cạnh mới có làm chúng liên thông hơn không?',
        'If two nodes are already connected, does a new edge connect them more?',
      ),
      m(
        'Không, nó chỉ thêm trọng số. Hơn nữa nó không nhẹ hơn các cạnh đã chọn trong vòng đó.',
        'No, it only adds weight. And it is no lighter than the chosen edges in that loop.',
      ),
      m('Bỏ cạnh, không đổi DSU.', 'Drop the edge and leave the DSU unchanged.'),
    ],
    misconceptions: [
      m(
        'Đổi cạnh đã chọn bằng cạnh mới này: cạnh mới nặng hơn hoặc bằng, nên không có lợi.',
        'Swapping a chosen edge for this one: the new edge is heavier or equal, so it brings no gain.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng trọng số là {total} với {taken} cạnh. Kruskal dừng khi đủ n − 1 cạnh hoặc hết cạnh; độ phức tạp O(m log m) do bước sắp xếp.',
      'The total weight is {total} with {taken|edge|edges}. Kruskal stops at n − 1 edges or when edges run out; the cost is O(m log m) from sorting.',
    ),
    hints: [
      m('Khi nào ta có thể dừng sớm?', 'When can we stop early?'),
      m(
        'Khi đã chọn đủ n − 1 cạnh: cây khung đã hoàn chỉnh.',
        'Once n − 1 edges are chosen: the spanning tree is complete.',
      ),
      m(
        'Nếu hết cạnh mà chưa đủ n − 1, đồ thị không liên thông và ta được rừng khung nhỏ nhất.',
        'If edges run out before n − 1, the graph is disconnected and we get a minimum spanning forest.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cây khung nhỏ nhất là duy nhất: khi có trọng số trùng có thể có nhiều cây, nhưng tổng trọng số luôn bằng nhau.',
        'Thinking the minimum spanning tree is unique: with equal weights there may be several, yet the total is always the same.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const list = input.edges.map(([a, b, w], idx) => ({ a, b, w, idx }));
  const sorted = [...list].sort((p, q) => p.w - q.w || p.idx - q.idx);
  const parent: number[] = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    let cur = x;
    while (parent[cur] !== cur) cur = parent[cur];
    return cur;
  };
  const status = new Map<string, HighlightKind>();
  let total = 0;
  let taken = 0;
  const edgesState = list.map((e) => ({
    from: letter(Math.min(e.a, e.b)),
    to: letter(Math.max(e.a, e.b)),
    weight: e.w,
  }));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag: string,
    order?: string[],
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const [k, v] of status) highlights[k] = v;
    emit(
      {
        nodes: Array.from({ length: n }, (_, i) => ({ id: letter(i), label: letter(i) })),
        edges: edgesState,
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        aux: [
          {
            id: 'dsu',
            label: 'DSU',
            items: parent.map((p, i) => `${letter(i)}→${letter(p)}`),
          },
          ...(order
            ? [
                {
                  id: 'order',
                  label: msg(m('Thứ tự xét', 'Order of scan'), ctx.locale),
                  items: order,
                },
              ]
            : []),
        ],
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  put(EX.start, 2, { n, m: list.length }, {}, 'start');
  put(
    EX.sort,
    1,
    { m: list.length },
    {},
    'sort',
    sorted.map((e) => `${edgeKey(e.a, e.b)}:${e.w}`),
  );
  for (const e of sorted) {
    if (taken === n - 1) break;
    tick();
    const key = edgeKey(e.a, e.b);
    put(
      EX.consider,
      3,
      { u: letter(e.a), v: letter(e.b), w: e.w },
      { [key]: 'compare' },
      'consider',
    );
    const ru = find(e.a);
    const rv = find(e.b);
    if (ru !== rv) {
      parent[ru] = rv;
      total += e.w;
      taken++;
      status.set(key, 'result');
      put(
        EX.take,
        4,
        { u: letter(e.a), v: letter(e.b), w: e.w, ru: letter(ru), rv: letter(rv), total },
        {},
        'take',
      );
    } else {
      status.set(key, 'muted');
      put(EX.reject, 5, { u: letter(e.a), v: letter(e.b), ru: letter(ru) }, {}, 'reject');
    }
  }
  const comps = n - taken;
  put(comps === 1 ? EX.doneTree : EX.doneForest, 6, { taken, total, comps }, {}, 'done');
}

export const kruskalEntry: WalkthroughEntry<In, S> = {
  id: 'kruskal',
  entryRev: 3,
  subject: 'cp',
  visualizer: 'graph',
  curriculumTopics: ['t4-mst'],
  title: m('Kruskal: cây khung nhỏ nhất', 'Kruskal: the minimum spanning tree'),
  code: {
    pseudo: [
      'sắp các cạnh tăng dần theo trọng số',
      'DSU: mỗi đỉnh một tập; total ← 0',
      'for mỗi cạnh (u, v, w) theo thứ tự đó:',
      '    if find(u) ≠ find(v): chọn cạnh; union(u, v); total ← total + w',
      '    else: bỏ cạnh (tạo chu trình)',
      'return total',
    ],
    impl: {
      cpp: [
        'int find_root(std::vector<int>& p, int x) {',
        '    while (p[x] != x) x = p[x];',
        '    return x;',
        '}',
        'int kruskal(int n, std::vector<std::tuple<int, int, int>> edges) {',
        '    std::sort(edges.begin(), edges.end());',
        '    std::vector<int> p(n);',
        '    for (int i = 0; i < n; i++) p[i] = i;',
        '    int total = 0;',
        '    for (const auto& [w, u, v] : edges) {',
        '        int ru = find_root(p, u), rv = find_root(p, v);',
        '        if (ru != rv) {',
        '            p[ru] = rv;',
        '            total += w;',
        '        }',
        '    }',
        '    return total;',
        '}',
      ],
      py: [
        'def find_root(p, x):',
        '    while p[x] != x:',
        '        x = p[x]',
        '    return x',
        'def kruskal(n, edges):',
        '    p = list(range(n))',
        '    total = 0',
        '    for w, u, v in sorted(edges):',
        '        ru, rv = find_root(p, u), find_root(p, v)',
        '        if ru != rv:',
        '            p[ru] = rv',
        '            total += w',
        '    return total',
      ],
    },
    map: {
      cpp: { 1: [6], 2: [7, 8, 9], 3: [10], 4: [11, 12, 13, 14], 5: [11], 6: [17] },
      py: { 1: [8], 2: [6, 7], 3: [8], 4: [9, 10, 11, 12], 5: [9], 6: [13] },
    },
  },
  inputSpec: { kind: 'edge-list', nodes: [2, 8], edges: [1, 10], weight: [1, 20] },
  check: (input) => {
    const issues: string[] = [];
    const seen = new Set<string>();
    for (const [a, b] of input.edges) {
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
        n: 6,
        edges: [
          [0, 1, 4],
          [0, 2, 3],
          [1, 2, 1],
          [1, 3, 2],
          [2, 3, 4],
          [3, 4, 2],
          [4, 5, 6],
          [3, 5, 7],
          [2, 4, 5],
        ],
      },
    },
    {
      id: 'ties',
      label: m('Trọng số trùng', 'Equal weights'),
      input: {
        n: 4,
        edges: [
          [0, 1, 2],
          [1, 2, 2],
          [2, 3, 2],
          [0, 3, 2],
          [0, 2, 3],
        ],
      },
    },
    {
      id: 'forest',
      label: m('Không liên thông', 'Disconnected'),
      input: {
        n: 6,
        edges: [
          [0, 1, 3],
          [1, 2, 1],
          [0, 2, 2],
          [3, 4, 5],
        ],
      },
    },
    {
      id: 'already-tree',
      label: m('Đã là cây', 'Already a tree'),
      input: {
        n: 5,
        edges: [
          [0, 1, 4],
          [1, 2, 2],
          [2, 3, 9],
          [3, 4, 1],
        ],
      },
    },
    {
      id: 'min',
      label: m('Nhỏ nhất: 2 đỉnh', 'Smallest: 2 nodes'),
      input: { n: 2, edges: [[0, 1, 5]] },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'sort',
      text: m(
        'Phải sắp theo TRỌNG SỐ; và có thể dừng sớm khi đã đủ n − 1 cạnh. Thứ tự giữa các cạnh cùng trọng số không đổi tổng.',
        'Sort by WEIGHT; and you may stop early once n − 1 edges are chosen. The order among equal weights does not change the total.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'sort',
      text: m(
        'Sắp các bộ std::tuple<int, int, int> theo thứ tự (w, u, v): trọng số phải đứng đầu bộ để std::sort sắp theo nó.',
        'Sort std::tuple<int, int, int> triples as (w, u, v): the weight must come first so std::sort orders by it.',
      ),
    },
    {
      lang: 'py',
      beat: 'sort',
      text: m(
        'sorted(edges) sắp bộ (w, u, v) theo w trước nên đúng; nếu lưu (u, v, w) thì cần key=lambda e: e[2].',
        'sorted(edges) orders (w, u, v) tuples by w first, which is right; if you store (u, v, w) you need key=lambda e: e[2].',
      ),
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
