/**
 * Walkthrough entry: Aho–Corasick, trie + failure links built by BFS, scanning a text for two patterns
 * over {a, b} (SCHEMA §5, card 2D-03). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { p1: string; p2: string; text: string };
type TreeNode = { id: string; label: string; parent?: string; edgeLabel?: string; note?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const ASKED_FAIL = 2;

const EX = {
  start: m(
    'Tìm mọi chỗ xuất hiện của hai mẫu "{p1}" và "{p2}" trong "{text}" bằng một lần quét. Trước hết dựng trie của các mẫu.',
    'Find every occurrence of the patterns "{p1}" and "{p2}" in "{text}" with a single scan. First build a trie of the patterns.',
  ),
  insert: m(
    'Chèn mẫu {k} "{p}" vào trie: mỗi ký tự là một cạnh, nút cuối được đánh dấu là kết thúc mẫu (tô sáng). Trie có {nodes} nút.',
    'Insert pattern {k} "{p}" into the trie: each character is an edge and the last node is marked as a pattern end (highlighted). The trie has {nodes|node|nodes}.',
  ),
  ask: m(
    'Nút "{x}": liên kết thất bại trỏ về đâu? Đó là nút ứng với hậu tố dài nhất của "{x}" cũng là một tiền tố trong trie.',
    'Node "{x}": where does its failure link point? It is the node of the longest suffix of "{x}" that is also a prefix in the trie.',
  ),
  fail: m(
    'Liên kết thất bại của "{x}" trỏ tới "{y}": hậu tố dài nhất của "{x}" còn là tiền tố trong trie.',
    'The failure link of "{x}" points to "{y}": the longest suffix of "{x}" that is still a prefix in the trie.',
  ),
  scan: m(
    'Đọc text[{i}] = {c}: từ nút "{from}" ta tới nút "{to}" (lùi theo liên kết thất bại khi thiếu cạnh {c}).',
    'Read text[{i}] = {c}: from node "{from}" we reach node "{to}" (following failure links when the edge {c} is missing).',
  ),
  out: m(
    'Khớp mẫu {k} "{p}" kết thúc ở vị trí {i}. Đã có {count} lần khớp.',
    'Pattern {k} "{p}" matches, ending at position {i}. So far {count|match|matches}.',
  ),
  done: m(
    'Quét xong {n} ký tự: {count} lần khớp. Một lượt quét tìm mọi mẫu cùng lúc: O(độ dài text + tổng độ dài mẫu + số khớp).',
    'Scanned {n|character|characters}: {count|match|matches}. One pass finds all patterns at once: O(text length + total pattern length + matches).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Tìm từng mẫu riêng sẽ quét text nhiều lần. Aho–Corasick gộp mọi mẫu vào một trie rồi quét text đúng một lần. Ta tìm "{p1}" và "{p2}" trong "{text}".',
      'Searching each pattern separately scans the text many times. Aho–Corasick merges all patterns into one trie and scans the text exactly once. We look for "{p1}" and "{p2}" in "{text}".',
    ),
    hints: [
      m(
        'Có k mẫu: tìm riêng từng mẫu tốn thế nào?',
        'With k patterns: what does searching each separately cost?',
      ),
      m('Quét text k lần: chậm khi k lớn.', 'k scans of the text: slow for large k.'),
      m(
        'Gộp các mẫu vào trie và dùng liên kết thất bại để không phải quay lại, như KMP cho nhiều mẫu.',
        'Merge the patterns into a trie and use failure links so we never back up, like KMP for many patterns.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chạy KMP cho từng mẫu rẻ như một lượt quét: tốn k lượt.',
        'Thinking running KMP per pattern costs as much as one pass: it costs k passes.',
      ),
    ],
  },
  {
    id: 'insert',
    label: m('Chèn mẫu', 'Insert a pattern'),
    narration: m(
      'Mẫu {k} "{p}" đi từ gốc theo từng ký tự, tạo cạnh mới khi chưa có. Nút cuối là kết thúc mẫu. Các mẫu có tiền tố chung dùng chung nút.',
      'Pattern {k} "{p}" walks from the root character by character, creating new edges when missing. The last node is a pattern end. Patterns with a common prefix share nodes.',
    ),
    hints: [
      m(
        'Hai mẫu bắt đầu giống nhau thì trie xử lý thế nào?',
        'How does the trie treat two patterns that start alike?',
      ),
      m(
        'Chúng dùng chung đường từ gốc cho tới chỗ khác nhau.',
        'They share the path from the root up to where they differ.',
      ),
      m(
        'Mỗi ký tự là một cạnh; đánh dấu nút cuối để biết đó là hết một mẫu.',
        'Each character is an edge; mark the last node to know a pattern ends there.',
      ),
    ],
    misconceptions: [
      m(
        'Đánh dấu kết thúc ở mọi nút trên đường: chỉ nút cuối của mẫu mới là kết thúc.',
        'Marking an end at every node on the way: only the last node of the pattern is an end.',
      ),
    ],
  },
  {
    id: 'fail-link',
    label: m('Liên kết thất bại', 'Failure links'),
    narration: m(
      'Khi cạnh tiếp theo không có, thay vì quay lại đầu ta nhảy theo liên kết thất bại tới nút của hậu tố dài nhất vẫn khớp. Liên kết tính theo BFS: nút nông trước, nên liên kết của cha đã có.',
      'When the next edge is missing, instead of restarting we jump along the failure link to the node of the longest suffix that still matches. Links are computed by BFS: shallow nodes first, so the parent’s link is known.',
    ),
    ask: {
      text: m(
        'Theo em, liên kết thất bại của nút này trỏ về đâu?',
        'Where does the failure link of this node point?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Về gốc', 'To the root'),
          m(
            'Về nút của hậu tố dài nhất là tiền tố',
            'To the node of the longest suffix that is a prefix',
          ),
        ],
        answer: (_frame, next) => (next?.meta.vars?.rootfail === 1 ? 0 : 1),
      },
    },
    hints: [
      m(
        'Hậu tố dài nhất của xâu này mà cũng là tiền tố của một mẫu nào đó là gì?',
        'What is the longest suffix of this string that is also a prefix of some pattern?',
      ),
      m(
        'Bỏ dần ký tự đầu cho tới khi phần còn lại có trong trie.',
        'Drop leading characters until the rest exists in the trie.',
      ),
      m(
        'Không có hậu tố nào thì trỏ về gốc (xâu rỗng). Dùng BFS, không DFS, để dựa vào liên kết của cha.',
        'If no suffix exists, point to the root (empty string). Use BFS, not DFS, to rely on the parent’s link.',
      ),
    ],
    misconceptions: [
      m(
        'Tính liên kết bằng DFS: liên kết của nút phụ thuộc vào các nút nông hơn, nên phải đi theo từng tầng.',
        'Computing links by DFS: a node’s link depends on shallower nodes, so go level by level.',
      ),
    ],
  },
  {
    id: 'scan',
    label: m('Quét text', 'Scan the text'),
    narration: m(
      'Với mỗi ký tự của text, ta đi theo cạnh tương ứng từ nút hiện tại; thiếu cạnh thì lùi theo liên kết thất bại cho tới khi có. Ta không bao giờ quay lại vị trí text trước.',
      'For each text character we follow the matching edge from the current node; if it is missing we fall back along failure links until one exists. We never go back in the text.',
    ),
    hints: [
      m(
        'Khi không có cạnh cho ký tự hiện tại thì làm gì?',
        'What do we do when there is no edge for the current character?',
      ),
      m('Lùi theo liên kết thất bại rồi thử lại.', 'Fall back along the failure link and retry.'),
      m(
        'Con trỏ text chỉ tiến; tổng số lần lùi không vượt tổng số lần tiến nên O(n).',
        'The text pointer only advances; falls never exceed advances, so O(n) in total.',
      ),
    ],
    misconceptions: [
      m(
        'Quay lại vị trí text trước khi thất bại: đó là cách ngây thơ O(n·m); liên kết thất bại tránh được.',
        'Backing up in the text on a failure: that is the naive O(n·m) way; failure links avoid it.',
      ),
    ],
  },
  {
    id: 'output',
    label: m('Báo khớp', 'Report a match'),
    narration: m(
      'Nút hiện tại (hoặc một nút trên chuỗi liên kết thất bại của nó) là kết thúc mẫu {k} "{p}": mẫu này khớp, kết thúc ở vị trí {i}. Phải gộp kết quả theo cả chuỗi liên kết.',
      'The current node (or a node on its failure chain) ends pattern {k} "{p}": it matches, ending at position {i}. Results must be merged along the whole failure chain.',
    ),
    hints: [
      m(
        'Khi ta đứng ở một nút, những mẫu nào vừa kết thúc?',
        'Standing at a node, which patterns just ended?',
      ),
      m(
        'Mẫu kết thúc ở nút đó, và các mẫu là hậu tố của nó (nút trên chuỗi liên kết thất bại).',
        'The pattern ending at that node, and patterns that are suffixes of it (nodes on the failure chain).',
      ),
      m(
        'Cộng cnt[u] += cnt[fail[u]] lúc dựng để không phải đi dọc chuỗi mỗi lần.',
        'Add cnt[u] += cnt[fail[u]] while building so we need not walk the chain each time.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ kiểm nút hiện tại: bỏ sót mẫu là hậu tố của mẫu dài hơn (như "b" trong "ab").',
        'Checking only the current node: it misses patterns that are suffixes of longer ones (like "b" inside "ab").',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Một lượt quét {n} ký tự cho {count} lần khớp của mọi mẫu. Chi phí tuyến tính theo độ dài text cộng tổng độ dài mẫu cộng số khớp.',
      'One pass over {n|character|characters} found {count|match|matches} of all patterns. The cost is linear in the text length plus the total pattern length plus the matches.',
    ),
    hints: [
      m('Chi phí phụ thuộc vào số mẫu không?', 'Does the cost depend on the number of patterns?'),
      m(
        'Chỉ qua tổng độ dài mẫu (dựng trie), không nhân với độ dài text.',
        'Only through the total pattern length (building the trie), not multiplied by the text length.',
      ),
      m('Tổng O(|text| + Σ|mẫu| + số khớp).', 'In total O(|text| + Σ|patterns| + matches).'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng số khớp luôn nhỏ: có thể tới O(n·k), nên phần báo kết quả cũng tính vào chi phí.',
        'Thinking the number of matches is always small: it can reach O(n·k), so reporting counts in the cost.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const pats = [input.p1, input.p2];
  const kids: Map<string, number>[] = [new Map()];
  const par: number[] = [-1];
  const via: string[] = [''];
  const term: number[][] = [[]]; // pattern numbers ending here
  const fail: (number | undefined)[] = [0];
  const labelOf = (x: number): string => {
    let s = '';
    for (let c = x; c > 0; c = par[c]) s = via[c] + s;
    return s === '' ? 'ε' : s;
  };
  const showFail = new Set<number>();
  const matches: string[] = [];

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
    cur?: number,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    kids.forEach((_, x) => {
      if (term[x].length > 0) highlights[String(x)] = 'result';
    });
    emit(
      {
        nodes: kids.map((_, x) => ({
          id: String(x),
          label: labelOf(x),
          ...(par[x] >= 0 ? { parent: String(par[x]), edgeLabel: via[x] } : {}),
          ...(showFail.has(x) ? { note: `fail→${labelOf(fail[x] as number)}` } : {}),
        })),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        pointers: cur === undefined ? {} : { state: String(cur) },
        aux: [
          { id: 'text', label: 'text', items: Array.from(input.text) },
          { id: 'matches', label: msg(m('Khớp', 'Matches'), ctx.locale), items: [...matches] },
        ],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { p1: input.p1, p2: input.p2, text: input.text }, {}, 'start');
  pats.forEach((p, idx) => {
    let u = 0;
    for (const ch of p) {
      let v = kids[u].get(ch);
      if (v === undefined) {
        v = kids.length;
        kids.push(new Map());
        par.push(u);
        via.push(ch);
        term.push([]);
        fail.push(undefined);
        kids[u].set(ch, v);
      }
      u = v;
    }
    term[u].push(idx + 1);
    put(EX.insert, 1, { k: idx + 1, p, nodes: kids.length }, { [String(u)]: 'active' }, 'insert');
  });

  // failure links by BFS
  const go = (u: number, ch: string): number => {
    let x = u;
    while (x !== 0 && !kids[x].has(ch)) x = fail[x] as number;
    return kids[x].get(ch) ?? 0;
  };
  const queue: number[] = [...kids[0].values()];
  for (const x of queue) fail[x] = 0;
  const order: number[] = [];
  for (let q = 0; q < queue.length; q++) {
    order.push(queue[q]);
    for (const [ch, v] of kids[queue[q]]) {
      fail[v] = queue[q] === 0 ? 0 : go(fail[queue[q]] as number, ch);
      queue.push(v);
    }
  }
  let asked = 0;
  for (const x of order) {
    tick();
    if (asked < ASKED_FAIL) {
      asked++;
      put(EX.ask, 2, { x: labelOf(x) }, { [String(x)]: 'active' }, 'fail-link');
    }
    showFail.add(x);
    put(
      EX.fail,
      2,
      { x: labelOf(x), y: labelOf(fail[x] as number), rootfail: fail[x] === 0 ? 1 : 0 },
      { [String(x)]: 'active', [String(fail[x])]: 'compare' },
    );
  }

  // outputs along the failure chain
  const endsAt = (u: number): number[] => {
    const res: number[] = [];
    for (let x = u; ; x = fail[x] as number) {
      res.push(...term[x]);
      if (x === 0) break;
    }
    return res;
  };
  let cur = 0;
  for (let i = 0; i < input.text.length; i++) {
    tick();
    const c = input.text[i];
    const from = cur;
    cur = go(cur, c);
    put(
      EX.scan,
      4,
      { i, c, from: labelOf(from), to: labelOf(cur) },
      { [String(cur)]: 'active' },
      'scan',
      cur,
    );
    for (const k of endsAt(cur)) {
      matches.push(`${k}@${i}`);
      put(
        EX.out,
        5,
        { k, p: pats[k - 1], i, count: matches.length },
        { [String(cur)]: 'result' },
        'output',
        cur,
      );
    }
  }
  put(EX.done, 5, { n: input.text.length, count: matches.length }, {}, 'done');
}

export const ahoCorasickEntry: WalkthroughEntry<In, S> = {
  id: 'aho-corasick',
  entryRev: 3,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t4-string-advanced'],
  title: m('Aho–Corasick: tìm nhiều mẫu cùng lúc', 'Aho–Corasick: many patterns at once'),
  code: {
    pseudo: [
      'chèn từng mẫu vào trie (mỗi ký tự một cạnh); đánh dấu nút cuối của mẫu',
      'BFS từ gốc: fail[v] ← goto(fail[u], c) cho con v của u; gộp cnt[v] += cnt[fail[v]]',
      'u ← gốc; total ← 0',
      'for mỗi ký tự c của text: u ← goto(u, c)  (lùi theo fail khi thiếu cạnh)',
      'total ← total + cnt[u]; return total',
    ],
    impl: {
      cpp: [
        'int count_matches(const std::vector<std::string>& pats, const std::string& text) {',
        '    std::vector<std::array<int, 2>> go(1, {-1, -1});',
        '    std::vector<int> fail(1, 0), cnt(1, 0);',
        '    for (const auto& p : pats) {',
        '        int u = 0;',
        '        for (char ch : p) {',
        "            int c = ch - 'a';",
        '            if (go[u][c] == -1) {',
        '                go[u][c] = go.size();',
        '                go.push_back({-1, -1});',
        '                fail.push_back(0);',
        '                cnt.push_back(0);',
        '            }',
        '            u = go[u][c];',
        '        }',
        '        cnt[u]++;',
        '    }',
        '    std::queue<int> q;',
        '    for (int c = 0; c < 2; c++) {',
        '        if (go[0][c] == -1) go[0][c] = 0;',
        '        else q.push(go[0][c]);',
        '    }',
        '    while (!q.empty()) {',
        '        int u = q.front();',
        '        q.pop();',
        '        cnt[u] += cnt[fail[u]];',
        '        for (int c = 0; c < 2; c++) {',
        '            int v = go[u][c];',
        '            if (v == -1) go[u][c] = go[fail[u]][c];',
        '            else {',
        '                fail[v] = go[fail[u]][c];',
        '                q.push(v);',
        '            }',
        '        }',
        '    }',
        '    int u = 0, total = 0;',
        '    for (char ch : text) {',
        "        u = go[u][ch - 'a'];",
        '        total += cnt[u];',
        '    }',
        '    return total;',
        '}',
      ],
      py: [
        'from collections import deque',
        'def count_matches(pats, text):',
        '    go = [{}]',
        '    fail = [0]',
        '    cnt = [0]',
        '    for p in pats:',
        '        u = 0',
        '        for ch in p:',
        '            if ch not in go[u]:',
        '                go[u][ch] = len(go)',
        '                go.append({})',
        '                fail.append(0)',
        '                cnt.append(0)',
        '            u = go[u][ch]',
        '        cnt[u] += 1',
        '    q = deque(go[0].values())',
        '    while q:',
        '        u = q.popleft()',
        '        cnt[u] += cnt[fail[u]]',
        '        for ch, v in go[u].items():',
        '            f = fail[u]',
        '            while f and ch not in go[f]:',
        '                f = fail[f]',
        '            fail[v] = go[f][ch] if ch in go[f] else 0',
        '            q.append(v)',
        '    u = 0',
        '    total = 0',
        '    for ch in text:',
        '        while u and ch not in go[u]:',
        '            u = fail[u]',
        '        u = go[u].get(ch, 0)',
        '        total += cnt[u]',
        '    return total',
      ],
    },
    map: {
      cpp: {
        1: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
        2: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35],
        3: [36],
        4: [37, 38],
        5: [39, 41],
      },
      py: {
        1: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        2: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
        3: [26, 27],
        4: [28, 29, 30, 31],
        5: [32, 33],
      },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      p1: { kind: 'string', len: [1, 3], alphabet: 'ab' },
      p2: { kind: 'string', len: [1, 3], alphabet: 'ab' },
      text: { kind: 'string', len: [1, 10], alphabet: 'ab' },
    },
  },
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: { p1: 'ab', p2: 'b', text: 'abab' },
    },
    {
      id: 'nested',
      label: m('Mẫu lồng nhau', 'Nested patterns'),
      input: { p1: 'a', p2: 'aa', text: 'aaaa' },
    },
    { id: 'none', label: m('Không khớp', 'No match'), input: { p1: 'aa', p2: 'bb', text: 'abab' } },
    {
      id: 'same',
      label: m('Hai mẫu giống nhau', 'Two equal patterns'),
      input: { p1: 'ab', p2: 'ab', text: 'ab' },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'fail-link',
      text: m(
        'Tính liên kết thất bại theo BFS (từng tầng), không DFS; và khi báo kết quả phải gộp theo cả chuỗi liên kết thất bại.',
        'Compute failure links by BFS (level by level), not DFS; and when reporting, merge results along the whole failure chain.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'scan',
      text: m(
        'Hoàn tất bảng chuyển go[u][c] bằng go[fail[u]][c] khi thiếu cạnh để lúc quét không cần vòng lùi.',
        'Complete the transition table go[u][c] with go[fail[u]][c] when an edge is missing so the scan needs no fall-back loop.',
      ),
    },
    {
      lang: 'py',
      beat: 'scan',
      text: m(
        'Dùng dict cho cạnh và vòng while u and ch not in go[u] để lùi; u = 0 là gốc nên điều kiện u dừng ở gốc.',
        'Use dicts for edges and a while u and ch not in go[u] loop to fall back; u = 0 is the root so the condition stops at the root.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
