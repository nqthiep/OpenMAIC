/**
 * Walkthrough entry: the Held-Karp bitmask DP for the travelling-salesman tour, n ≤ 4
 * (SCHEMA §5, card 2C-07, README D18: n = 5 would need 32 rows, over the 16 × 13 grid).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { d: number[][] };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
  arrows: { from: string; to: string }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const INF = Number.POSITIVE_INFINITY;
/** The question frame appears for the first two transitions only (a script asks each beat twice at most). */
const ASKED_TRANSITIONS = 2;

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Chu trình ngắn nhất từ đỉnh 0, qua mọi đỉnh đúng một lần rồi về 0 ({n} đỉnh). dp[mask][v] = chi phí ít nhất, đã thăm các đỉnh của mask, đang ở v.',
    'The shortest tour from node 0 through every node once and back to 0 ({n|node|nodes}). dp[mask][v] = the least cost, visited the nodes of mask, standing at v.',
  ),
  base: m(
    'Khởi tạo: mọi trạng thái hợp lệ là ∞, chỉ dp[0001][0] = 0 (mới ở đỉnh 0, đã thăm {0}). Hàng là mặt nạ nhị phân (bit v = đã thăm v).',
    'Initialise: every valid state is ∞ and only dp[0001][0] = 0 (standing at node 0, visited {0}). Rows are binary masks (bit v = visited v).',
  ),
  ask: m(
    'Đang ở trạng thái (mask {mb}, đỉnh {v}) với chi phí {cost}. Đi tới đỉnh {u} chưa thăm: mặt nạ mới là gì?',
    'In the state (mask {mb}, node {v}) with cost {cost}. Move to the unvisited node {u}: what is the new mask?',
  ),
  better: m(
    'Đi {v} → {u}: mặt nạ {mb} → {nb}; chi phí {cost} + d[{v}][{u}] = {cost} + {duv} = {nd} < {old}: cập nhật dp[{nb}][{u}] = {nd}.',
    'Go {v} → {u}: mask {mb} → {nb}; cost {cost} + d[{v}][{u}] = {cost} + {duv} = {nd} < {old}: update dp[{nb}][{u}] = {nd}.',
  ),
  keep: m(
    'Đi {v} → {u}: mặt nạ {mb} → {nb}; chi phí {cost} + {duv} = {nd}, không nhỏ hơn dp[{nb}][{u}] = {old}: giữ nguyên.',
    'Go {v} → {u}: mask {mb} → {nb}; cost {cost} + {duv} = {nd}, not below dp[{nb}][{u}] = {old}: keep it.',
  ),
  close: m(
    'Đóng chu trình từ {v}: dp[{fb}][{v}] + d[{v}][0] = {dv} + {dv0} = {total}. Tốt nhất tới giờ là {best}.',
    'Close the tour from {v}: dp[{fb}][{v}] + d[{v}][0] = {dv} + {dv0} = {total}. Best so far is {best}.',
  ),
  done: m(
    'Chu trình ngắn nhất qua {n} đỉnh có chi phí {best}. Có 2^n·n trạng thái, mỗi trạng thái n bước: O(2^n·n²), tốt hơn n!.',
    'The shortest tour through {n|node|nodes} costs {best}. There are 2^n·n states, each with n moves: O(2^n·n²), far better than n!.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Bài người bán hàng: thăm {n} đỉnh đúng một lần rồi về nơi xuất phát với chi phí ít nhất. Thử mọi thứ tự là (n − 1)!; DP trên mặt nạ nhớ tập đỉnh đã thăm nên chỉ O(2^n·n²).',
      'The travelling salesman: visit {n|node|nodes} exactly once and return to the start at least cost. Trying every order is (n − 1)!; a bitmask DP remembers the set of visited nodes, so only O(2^n·n²).',
    ),
    hints: [
      m(
        'Để đi tiếp, ta cần nhớ những gì về đường đã đi?',
        'To go on, what must we remember about the path so far?',
      ),
      m(
        'Chỉ cần biết đã thăm những đỉnh nào và đang ở đâu, không cần thứ tự đã đi.',
        'Only which nodes were visited and where we are, not the order we took.',
      ),
      m(
        'Mã hoá tập đã thăm bằng một mặt nạ bit: dp[mask][v] là chi phí nhỏ nhất.',
        'Encode the visited set as a bitmask: dp[mask][v] is the minimum cost.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cần lưu cả thứ tự đã đi: hai đường cùng tập đỉnh và cùng điểm cuối là tương đương cho phần còn lại.',
        'Thinking the full order must be stored: two paths with the same visited set and end node are equivalent for the rest.',
      ),
    ],
  },
  {
    id: 'base',
    label: m('Khởi tạo', 'Initialise'),
    narration: m(
      'Trước khi đi, ta ở đỉnh 0 và mới thăm đỉnh 0: dp[0001][0] = 0. Mọi trạng thái khác bắt đầu bằng ∞ để phép min sau này chọn được giá trị thật.',
      'Before moving we stand at node 0 having visited only node 0: dp[0001][0] = 0. Every other state starts at ∞ so the later min can pick a real value.',
    ),
    hints: [
      m('Trạng thái xuất phát là gì?', 'What is the starting state?'),
      m(
        'Đang ở đỉnh 0, tập đã thăm là {0}, chi phí 0.',
        'At node 0, the visited set is {0}, cost 0.',
      ),
      m(
        'dp[1][0] = 0 và mọi ô khác là ∞ (một số lớn) để min không bị 0 chặn.',
        'dp[1][0] = 0 and every other cell is ∞ (a big number) so min is not blocked by a 0.',
      ),
    ],
    misconceptions: [
      m(
        'Khởi tạo mọi ô bằng 0: phép min sẽ luôn chọn 0 và cho đáp án sai.',
        'Initialising every cell to 0: the min would always pick 0 and give a wrong answer.',
      ),
    ],
  },
  {
    id: 'transition',
    label: m('Chuyển trạng thái', 'A transition'),
    narration: m(
      'Từ trạng thái (mask {mb}, đỉnh {v}) ta đi tới đỉnh {u} chưa thăm. Mặt nạ mới là mask | (1 << {u}) và chi phí tăng d[{v}][{u}].',
      'From the state (mask {mb}, node {v}) we move to an unvisited node {u}. The new mask is mask | (1 << {u}) and the cost grows by d[{v}][{u}].',
    ),
    ask: {
      text: m(
        'Theo em, mặt nạ mới sau khi đi tới đỉnh u là gì?',
        'What is the new mask after moving to node u?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Bật thêm bit u (mask | 1 << u)', 'Set bit u as well (mask | 1 << u)'),
          m('Tắt bit u (mask & ~(1 << u))', 'Clear bit u (mask & ~(1 << u))'),
          m('Giữ nguyên mặt nạ', 'Keep the mask'),
        ],
        answer: (_frame, next) => (next ? 0 : -1),
      },
    },
    hints: [
      m(
        'Mặt nạ ghi lại điều gì, và ta vừa làm gì với đỉnh u?',
        'What does the mask record, and what did we just do to node u?',
      ),
      m(
        'Mặt nạ ghi các đỉnh đã thăm; ta vừa thăm u.',
        'The mask records the visited nodes; we just visited u.',
      ),
      m(
        'Bật bit u: mask | (1 << u). Chỉ chuyển tới u khi bit u đang tắt.',
        'Set bit u: mask | (1 << u). Move to u only when bit u is off.',
      ),
    ],
    misconceptions: [
      m(
        'Quên kiểm mask & (1 << u) trước khi đi: sẽ thăm một đỉnh hai lần.',
        'Forgetting to test mask & (1 << u) before moving: a node would be visited twice.',
      ),
    ],
  },
  {
    id: 'close-tour',
    label: m('Đóng chu trình', 'Close the tour'),
    narration: m(
      'Khi đã thăm đủ mọi đỉnh (mask toàn bit 1) ở đỉnh {v}, ta phải quay về 0: chi phí thêm d[{v}][0]. Ta lấy min trên mọi đỉnh cuối {v} ≠ 0.',
      'When every node has been visited (the mask is all 1s) and we stand at {v}, we must return to 0: an extra d[{v}][0]. We take the min over every last node {v} ≠ 0.',
    ),
    hints: [
      m(
        'Sau khi thăm hết, bài còn yêu cầu gì?',
        'After visiting everything, what does the task still ask?',
      ),
      m(
        'Về lại đỉnh xuất phát 0, tốn d[v][0] từ đỉnh cuối v.',
        'Return to the start 0, costing d[v][0] from the last node v.',
      ),
      m(
        'Đáp án = min trên v ≠ 0 của dp[đủ][v] + d[v][0].',
        'The answer = min over v ≠ 0 of dp[full][v] + d[v][0].',
      ),
    ],
    misconceptions: [
      m(
        'Quên chi phí quay về: đó là đường đi mở chứ không phải chu trình.',
        'Forgetting the cost of returning: that is an open path, not a tour.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Chi phí chu trình ngắn nhất là {best}. Số trạng thái là 2^n·n, mỗi trạng thái thử n đỉnh tiếp theo: O(2^n·n²), dùng được tới n khoảng 20.',
      'The cost of the shortest tour is {best}. There are 2^n·n states, each trying n next nodes: O(2^n·n²), usable up to n about 20.',
    ),
    hints: [
      m('Có bao nhiêu trạng thái (mask, v)?', 'How many states (mask, v) are there?'),
      m('2^n mặt nạ, mỗi mặt nạ n đỉnh cuối.', '2^n masks, each with n end nodes.'),
      m(
        'Mỗi trạng thái thử tối đa n bước, nên O(2^n·n²); so với (n − 1)! thì nhanh hơn nhiều khi n ≥ 10.',
        'Each state tries at most n moves, so O(2^n·n²); far faster than (n − 1)! once n ≥ 10.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đây là thuật toán đa thức: nó vẫn mũ theo n, chỉ tốt hơn vét cạn n!.',
        'Thinking this is a polynomial algorithm: it is still exponential in n, just better than n! brute force.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const d = input.d;
  const n = d.length;
  const full = (1 << n) - 1;
  const bin = (mask: number): string => mask.toString(2).padStart(n, '0');
  const dp: (number | undefined)[][] = Array.from({ length: full + 1 }, () =>
    Array<number | undefined>(n).fill(undefined),
  );
  const key = (r: number, c: number): string => `${r},${c}`;
  const rowLabels = Array.from({ length: full + 1 }, (_, mask) => bin(mask));
  const colLabels = Array.from({ length: n }, (_, v) => String(v));
  let asked = 0;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    arrows: { from: string; to: string }[],
    tag?: string,
  ): void => {
    emit(
      {
        rows: full + 1,
        cols: n,
        cells: dp.map((row) => row.map((x) => (x === undefined ? '' : x === INF ? '∞' : x))),
        rowLabels,
        colLabels,
        arrows,
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

  put(EX.start, 1, { n }, {}, [], 'start');
  for (let mask = 1; mask <= full; mask++)
    if (mask & 1) for (let v = 0; v < n; v++) if ((mask >> v) & 1) dp[mask][v] = INF;
  dp[1][0] = 0;
  put(EX.base, 2, {}, { [key(1, 0)]: 'active' }, [], 'base');

  for (let mask = 1; mask <= full; mask++) {
    for (let v = 0; v < n; v++) {
      if (!((mask >> v) & 1)) continue;
      const cost = dp[mask][v];
      if (cost === undefined || cost === INF) continue;
      for (let u = 0; u < n; u++) {
        if ((mask >> u) & 1) continue;
        tick();
        const nm = mask | (1 << u);
        const nd = cost + d[v][u];
        const old = dp[nm][u] as number;
        if (asked < ASKED_TRANSITIONS) {
          asked++;
          put(
            EX.ask,
            4,
            { mb: bin(mask), v, u, cost },
            { [key(mask, v)]: 'active' },
            [],
            'transition',
          );
        }
        const better = nd < old;
        if (better) dp[nm][u] = nd;
        put(
          better ? EX.better : EX.keep,
          4,
          {
            mb: bin(mask),
            nb: bin(nm),
            v,
            u,
            cost,
            duv: d[v][u],
            nd,
            old: old === INF ? '∞' : old,
          },
          { [key(mask, v)]: 'compare', [key(nm, u)]: better ? 'result' : 'muted' },
          [{ from: key(mask, v), to: key(nm, u) }],
        );
      }
    }
  }

  let best = INF;
  for (let v = 1; v < n; v++) {
    tick();
    const dv = dp[full][v] as number;
    const total = dv + d[v][0];
    best = Math.min(best, total);
    put(
      EX.close,
      5,
      { fb: bin(full), v, dv, dv0: d[v][0], total, best },
      { [key(full, v)]: 'active' },
      [],
      'close-tour',
    );
  }
  put(EX.done, 5, { n, best }, {}, [], 'done');
}

export const dpBitmaskEntry: WalkthroughEntry<In, S> = {
  id: 'dp-bitmask',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t4-dp-bitmask'],
  title: m(
    'DP mặt nạ bit: người bán hàng (Held-Karp)',
    'Bitmask DP: the travelling salesman (Held-Karp)',
  ),
  code: {
    pseudo: [
      'dp[mask][v] ← ∞ với mọi trạng thái hợp lệ',
      'dp[1][0] ← 0',
      'for mask ← 1 .. 2^n − 1:  for v trong mask:  for u không trong mask:',
      '        dp[mask | (1 << u)][u] ← min(dp[mask | (1 << u)][u], dp[mask][v] + d[v][u])',
      'return min trên v ≠ 0 của dp[2^n − 1][v] + d[v][0]',
    ],
    impl: {
      cpp: [
        'int tsp(const std::vector<std::vector<int>>& d) {',
        '    int n = d.size();',
        '    const int INF = 1000000;',
        '    std::vector<std::vector<int>> dp(1 << n, std::vector<int>(n, INF));',
        '    dp[1][0] = 0;',
        '    for (int mask = 1; mask < (1 << n); mask++) {',
        '        for (int v = 0; v < n; v++) {',
        '            if (!(mask & (1 << v)) || dp[mask][v] >= INF) continue;',
        '            for (int u = 0; u < n; u++) {',
        '                if (mask & (1 << u)) continue;',
        '                int nm = mask | (1 << u);',
        '                dp[nm][u] = std::min(dp[nm][u], dp[mask][v] + d[v][u]);',
        '            }',
        '        }',
        '    }',
        '    int best = INF;',
        '    for (int v = 1; v < n; v++) best = std::min(best, dp[(1 << n) - 1][v] + d[v][0]);',
        '    return best;',
        '}',
      ],
      py: [
        'def tsp(d):',
        '    n = len(d)',
        '    INF = 10 ** 6',
        '    dp = [[INF] * n for _ in range(1 << n)]',
        '    dp[1][0] = 0',
        '    for mask in range(1, 1 << n):',
        '        for v in range(n):',
        '            if not (mask >> v) & 1 or dp[mask][v] >= INF:',
        '                continue',
        '            for u in range(n):',
        '                if (mask >> u) & 1:',
        '                    continue',
        '                nm = mask | (1 << u)',
        '                dp[nm][u] = min(dp[nm][u], dp[mask][v] + d[v][u])',
        '    return min(dp[(1 << n) - 1][v] + d[v][0] for v in range(1, n))',
      ],
    },
    map: {
      cpp: { 1: [3, 4], 2: [5], 3: [6, 7, 8, 9, 10], 4: [11, 12], 5: [16, 17, 18] },
      py: { 1: [3, 4], 2: [5], 3: [6, 7, 8, 9, 10, 11, 12], 4: [13, 14], 5: [15] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { d: { kind: 'grid', rows: [2, 4], cols: [2, 4], cell: 'int', range: [0, 20] } },
  },
  check: (input) => {
    const issues: string[] = [];
    const n = input.d.length;
    if (input.d.some((row) => row.length !== n)) issues.push('not-square');
    else if (input.d.some((row, i) => row[i] !== 0)) issues.push('diagonal-not-zero');
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'n4',
      label: m('4 đỉnh, đối xứng', '4 nodes, symmetric'),
      input: {
        d: [
          [0, 10, 15, 20],
          [10, 0, 12, 17],
          [15, 12, 0, 11],
          [20, 17, 11, 0],
        ],
      },
    },
    {
      id: 'n3',
      label: m('3 đỉnh', '3 nodes'),
      input: {
        d: [
          [0, 4, 9],
          [4, 0, 5],
          [9, 5, 0],
        ],
      },
    },
    {
      id: 'n2',
      label: m('Biên: 2 đỉnh', 'Edge: 2 nodes'),
      input: {
        d: [
          [0, 6],
          [6, 0],
        ],
      },
    },
    {
      id: 'n4-asym',
      label: m('4 đỉnh, không đối xứng', '4 nodes, asymmetric'),
      input: {
        d: [
          [0, 3, 8, 5],
          [7, 0, 2, 9],
          [4, 6, 0, 1],
          [2, 8, 7, 0],
        ],
      },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'base',
      text: m(
        'Khởi tạo các ô bằng INF (không phải 0) và nhớ rằng đỉnh 0 luôn nằm trong mặt nạ; kiểm mask & (1 << v) trước khi dùng dp[mask][v].',
        'Initialise cells to INF (not 0), and remember node 0 is always in the mask; test mask & (1 << v) before using dp[mask][v].',
      ),
    },
    {
      lang: 'cpp',
      beat: 'transition',
      text: m(
        'INF phải đủ nhỏ để INF + d không tràn int (ở đây 10^6); và phải bỏ qua trạng thái còn INF khi chuyển.',
        'INF must be small enough that INF + d does not overflow int (10^6 here); and states still at INF must be skipped when transitioning.',
      ),
    },
    {
      lang: 'py',
      beat: 'transition',
      text: m(
        'Python: viết (mask >> v) & 1 có ngoặc; not mask >> v & 1 sẽ bị hiểu khác do độ ưu tiên của not.',
        'In Python write (mask >> v) & 1 with parentheses; not mask >> v & 1 parses differently because of the precedence of not.',
      ),
    },
  ],
  maxFrames: 80,
  maxBytes: 200_000,
  run,
};
