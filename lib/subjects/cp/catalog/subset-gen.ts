/**
 * Walkthrough entry: generating all subsets by recursion, take-or-skip (SCHEMA §5, card 2A-07).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { items: number[] };
type TreeNode = { id: string; label: string; parent?: string; edgeLabel?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const EDGE = {
  take: m('lấy a[{i}]', 'take a[{i}]'),
  skip: m('bỏ a[{i}]', 'skip a[{i}]'),
};

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Liệt kê mọi tập con của {n} phần tử bằng đệ quy: với mỗi phần tử ta hoặc lấy hoặc bỏ. Bắt đầu từ tập rỗng.',
    'List every subset of {n|item|items} by recursion: for each item we either take it or skip it. We start from the empty set.',
  ),
  choose: m(
    'Ở nút {set}: đã quyết định {i} phần tử đầu. Xét a[{i}] = {ai}: cho nó vào tập hay không?',
    'At node {set}: the first {i|item|items} are decided. Look at a[{i}] = {ai}: does it go into the set or not?',
  ),
  backtrack: m(
    'Nhánh lấy a[{i}] = {ai} đã xong. Quay lui: bỏ {ai} khỏi tập, quay về nút {set}.',
    'The branch that takes a[{i}] = {ai} is finished. Backtrack: remove {ai} from the set and return to node {set}.',
  ),
  skip: m(
    'Đi nhánh bỏ a[{i}] = {ai}: sang nút mới, tập vẫn là {set}.',
    'Take the branch that skips a[{i}] = {ai}: a new node, the set is still {set}.',
  ),
  leaf: m(
    'Đã quyết định cả {n} phần tử: {set} là một tập con. Tới giờ đã có {count} tập con.',
    'All {n|item|items} are decided: {set} is one subset. So far there are {count|subset|subsets}.',
  ),
  done: m(
    '{n} phần tử cho {count} tập con: mỗi phần tử thêm vào làm số tập con gấp đôi.',
    '{n|item|items} give {count|subset|subsets}: each item added doubles the number of subsets.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Mỗi nút của cây là một trạng thái: đã quyết định một số phần tử đầu và đang giữ một tập. Ta liệt kê tập con của {n} phần tử.',
      'Each node of the tree is a state: some leading items are decided and a set is held. We list the subsets of {n|item|items}.',
    ),
    hints: [
      m(
        'Với một phần tử, có mấy cách xử lý nó trong một tập con?',
        'For one item, in how many ways can a subset treat it?',
      ),
      m(
        'Hai cách: có mặt hoặc không có mặt. Với mỗi cách ta lại xét phần tử tiếp theo.',
        'Two ways: present or absent. For each way we move on to the next item.',
      ),
      m(
        'Đệ quy theo chỉ số i: rẽ hai nhánh (lấy, bỏ) và dừng khi i = n.',
        'Recurse on the index i: branch two ways (take, skip) and stop when i = n.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ liệt kê các tập con có đúng một phần tử hoặc toàn bộ: còn mọi kích thước ở giữa.',
        'Thinking we list only the one-element or full subsets: every size in between counts too.',
      ),
    ],
  },
  {
    id: 'choose',
    label: m('Lấy hay bỏ', 'Take or skip'),
    narration: m(
      'Tại nút {set} ta xét phần tử a[{i}] = {ai}. Có hai nhánh: lấy nó, hoặc bỏ nó; ta đi nhánh lấy trước.',
      'At node {set} we look at the item a[{i}] = {ai}. There are two branches: take it, or skip it; we go down the take branch first.',
    ),
    ask: {
      text: m(
        'Theo em, nhánh tiếp theo là lấy hay bỏ a[i]?',
        'Which branch comes next: take or skip a[i]?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Lấy a[i]', 'Take a[i]'), m('Bỏ a[i]', 'Skip a[i]')],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:skip') ? 1 : 0),
      },
    },
    hints: [
      m(
        'Trong mã, lệnh nào chạy trước: push a[i] hay gọi nhánh bỏ?',
        'In the code, which runs first: pushing a[i] or calling the skip branch?',
      ),
      m(
        'Mã push a[i] rồi gọi đệ quy, sau đó mới pop và gọi nhánh còn lại.',
        'The code pushes a[i] and recurses, and only then pops and calls the other branch.',
      ),
      m(
        'Nhánh lấy chạy trước: ta đi sâu hết nhánh lấy rồi mới quay lại nhánh bỏ.',
        'The take branch runs first: we go all the way down it before returning to the skip branch.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai nhánh được duyệt song song: máy chỉ đi một nhánh rồi mới quay lại nhánh kia.',
        'Thinking both branches are explored in parallel: the machine finishes one branch before returning to the other.',
      ),
    ],
  },
  {
    id: 'skip',
    label: m('Nhánh bỏ', 'The skip branch'),
    narration: m(
      'Sau nhánh lấy, ta đi nhánh bỏ a[{i}] = {ai}: tập vẫn là {set}, chỉ chuyển sang phần tử kế tiếp.',
      'After the take branch we take the skip branch for a[{i}] = {ai}: the set stays {set}, we just move to the next item.',
    ),
    hints: [
      m(
        'Khi bỏ một phần tử, tập đang giữ thay đổi không?',
        'When we skip an item, does the held set change?',
      ),
      m('Không: chỉ có chỉ số i tăng lên.', 'No: only the index i moves up.'),
      m(
        'Gọi gen(i + 1, cur) mà không push gì; cur giữ nguyên.',
        'Call gen(i + 1, cur) without pushing anything; cur stays as it was.',
      ),
    ],
    misconceptions: [
      m(
        'Quên nhánh bỏ: khi đó chỉ liệt kê được tập con chứa mọi phần tử.',
        'Forgetting the skip branch: only the subset with every item would be listed.',
      ),
    ],
  },
  {
    id: 'leaf',
    label: m('Một tập con', 'One subset'),
    narration: m(
      'Mọi phần tử đã được quyết định (i = n = {n}), nên tập {set} là một tập con hoàn chỉnh. Ta ghi nó lại; đã có {count}.',
      'Every item is decided (i = n = {n}), so the set {set} is a complete subset. We record it; there are {count} so far.',
    ),
    hints: [
      m(
        'Khi i = n, còn phần tử nào để quyết định không?',
        'When i = n, is there any item left to decide?',
      ),
      m(
        'Không: mỗi phần tử đã được lấy hoặc bỏ, tập hiện tại đã đầy đủ.',
        'No: every item was taken or skipped, so the current set is complete.',
      ),
      m(
        'Ghi lại bản sao của cur vào kết quả rồi return.',
        'Record a copy of cur in the result and return.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ ghi nhận tham chiếu tới cur thay vì một bản sao: sau khi quay lui cur đổi và các kết quả cũ bị đổi theo.',
        'Recording a reference to cur instead of a copy: after backtracking cur changes and the stored results change with it.',
      ),
    ],
  },
  {
    id: 'backtrack',
    label: m('Quay lui', 'Backtrack'),
    narration: m(
      'Nhánh lấy đã duyệt hết, ta pop {ai} khỏi tập để quay về trạng thái {set} trước khi thử nhánh bỏ.',
      'The take branch is fully explored, so we pop {ai} off the set to restore the state {set} before trying the skip branch.',
    ),
    hints: [
      m(
        'Trước khi thử nhánh bỏ, tập cur cần ở trạng thái nào?',
        'Before trying the skip branch, what state must cur be in?',
      ),
      m(
        'Trạng thái lúc chưa lấy a[i], tức không còn a[i] trong cur.',
        'The state from before a[i] was taken, i.e. without a[i] in cur.',
      ),
      m(
        'Pop phần tử vừa push: cur.pop_back() hoặc cur.pop().',
        'Pop the element just pushed: cur.pop_back() or cur.pop().',
      ),
    ],
    misconceptions: [
      m(
        'Quên pop khi quay lui: tập giữ lại các phần tử cũ và các tập con sau sai.',
        'Forgetting to pop when backtracking: the set keeps old elements and later subsets are wrong.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      '{n} phần tử cho {count} tập con vì mỗi phần tử có hai lựa chọn độc lập: 2 × 2 × … × 2 = 2^n. Cây có đúng 2^(n+1) − 1 nút.',
      '{n|item|items} give {count|subset|subsets} because each item has two independent choices: 2 × 2 × … × 2 = 2^n. The tree has exactly 2^(n+1) − 1 nodes.',
    ),
    hints: [
      m('Có bao nhiêu tập con?', 'How many subsets are there?'),
      m(
        'Mỗi phần tử có hai lựa chọn và các lựa chọn độc lập nhau.',
        'Each item has two choices and the choices are independent.',
      ),
      m(
        'Nhân hai lần n lần: 2^n tập con, nên liệt kê hết cũng tốn cỡ 2^n.',
        'Multiply two by itself n times: 2^n subsets, so listing them all costs about 2^n too.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng liệt kê tập con là nhanh cho n lớn: 2^n tăng rất nhanh, n quá 25 đã khó chạy.',
        'Thinking listing subsets is fast for large n: 2^n explodes, n beyond about 25 is already hard.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a = input.items;
  const n = a.length;
  const nodes: TreeNode[] = [];
  const status = new Map<string, HighlightKind>();
  const stack: string[] = []; // ancestors of the current node whose subtree is still running
  const cur: number[] = [];
  let count = 0;
  const out: string[] = [];
  const setStr = (): string => `{${cur.join(',')}}`;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    at: string,
    tag: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const [id, kind] of status) highlights[id] = kind;
    for (const id of stack) highlights[id] = 'active';
    if (status.get(at) !== 'result') highlights[at] = 'compare';
    emit(
      { nodes: nodes.map((x) => ({ ...x })) },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        pointers: { cur: at },
        aux: [
          {
            id: 'out',
            label: msg(m('Các tập con đã ghi', 'Subsets recorded'), ctx.locale),
            items: [...out],
          },
        ],
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  function gen(i: number, parent: string | undefined, edge: 'take' | 'skip' | undefined): void {
    tick();
    const id = `n${nodes.length}`;
    const node: TreeNode = { id, label: setStr() };
    if (parent !== undefined && edge) {
      node.parent = parent;
      node.edgeLabel = fill(msg(EDGE[edge], ctx.locale), { i: i - 1 });
    }
    nodes.push(node);
    if (edge === 'skip') {
      put(EX.skip, 4, { i: i - 1, ai: a[i - 1], set: node.label }, id, 'skip');
    }
    if (i === n) {
      count++;
      out.push(node.label);
      status.set(id, 'result');
      put(EX.leaf, 2, { n, set: node.label, count }, id, 'leaf');
      return;
    }
    put(EX.choose, 1, { i, ai: a[i], set: node.label }, id, 'choose');
    stack.push(id);
    cur.push(a[i]);
    gen(i + 1, id, 'take');
    cur.pop();
    stack.pop();
    put(EX.backtrack, 3, { i, ai: a[i], set: node.label }, id, 'backtrack');
    stack.push(id);
    gen(i + 1, id, 'skip');
    stack.pop();
    status.set(id, 'visited');
  }

  // start frame: the root alone
  nodes.push({ id: 'n0', label: '{}' });
  emit(
    { nodes: nodes.map((x) => ({ ...x })) },
    {
      explanation: fill(msg(EX.start, ctx.locale), { n }),
      codeLine: 1,
      highlights: { n0: 'compare' },
      pointers: { cur: 'n0' },
      aux: [
        {
          id: 'out',
          label: msg(m('Các tập con đã ghi', 'Subsets recorded'), ctx.locale),
          items: [],
        },
      ],
      vars: { n },
      tags: ['beat:start'],
    },
  );
  nodes.length = 0; // gen() creates the root itself with the same id
  gen(0, undefined, undefined);
  put(EX.done, 2, { n, count }, 'n0', 'done');
}

export const subsetGenEntry: WalkthroughEntry<In, S> = {
  id: 'subset-gen',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t2-brute-force'],
  title: m('Sinh mọi tập con bằng đệ quy', 'Generating all subsets by recursion'),
  code: {
    pseudo: [
      'gen(i, cur):',
      '    if i = n: ghi lại cur; return',
      '    cur.push(a[i]); gen(i + 1, cur); cur.pop()',
      '    gen(i + 1, cur)',
    ],
    impl: {
      cpp: [
        'void gen(const std::vector<int>& a, int i, std::vector<int>& cur, std::vector<std::vector<int>>& out) {',
        '    if (i == (int)a.size()) {',
        '        out.push_back(cur);',
        '        return;',
        '    }',
        '    cur.push_back(a[i]);',
        '    gen(a, i + 1, cur, out);',
        '    cur.pop_back();',
        '    gen(a, i + 1, cur, out);',
        '}',
      ],
      py: [
        'def gen(a, i, cur, out):',
        '    if i == len(a):',
        '        out.append(cur[:])',
        '        return',
        '    cur.append(a[i])',
        '    gen(a, i + 1, cur, out)',
        '    cur.pop()',
        '    gen(a, i + 1, cur, out)',
      ],
    },
    map: {
      cpp: { 1: [1], 2: [2, 3, 4], 3: [6, 7, 8], 4: [9] },
      py: { 1: [1], 2: [2, 3, 4], 3: [5, 6, 7], 4: [8] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { items: { kind: 'int-array', len: [1, 4], range: [1, 9] } },
  },
  customInput: false,
  presets: [
    { id: 'n3', label: m('Ba phần tử', 'Three items'), input: { items: [1, 2, 3] } },
    { id: 'n1', label: m('Một phần tử', 'One item'), input: { items: [5] } },
    { id: 'n2', label: m('Hai phần tử', 'Two items'), input: { items: [4, 7] } },
    { id: 'n4', label: m('Bốn phần tử', 'Four items'), input: { items: [1, 2, 3, 4] } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'leaf',
      text: m(
        'Số tập con là 2^n, tăng rất nhanh: n = 20 đã hơn một triệu tập, n = 30 hơn một tỉ.',
        'The number of subsets is 2^n and grows very fast: n = 20 is over a million, n = 30 over a billion.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'backtrack',
      text: m(
        'Quên cur.pop_back() khi quay lui: cur giữ phần tử cũ và các tập con sau bị sai.',
        'Forgetting cur.pop_back() when backtracking: cur keeps old elements and later subsets are wrong.',
      ),
    },
    {
      lang: 'py',
      beat: 'leaf',
      text: m(
        'out.append(cur) lưu tham chiếu tới cùng một list: phải thêm bản sao cur[:] (hoặc list(cur)), nếu không mọi kết quả cuối cùng trống.',
        'out.append(cur) stores a reference to the same list: append a copy cur[:] (or list(cur)), or every stored result ends up empty.',
      ),
    },
  ],
  maxFrames: 80,
  maxBytes: 260_000, // [Inference] measured 213 KB (tree frames repeat every node); NFR-P2 allows up to 512 KB
  run,
};
