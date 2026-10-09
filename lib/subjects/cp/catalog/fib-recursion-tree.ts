/**
 * Walkthrough entry: the recursion tree of Fibonacci, with and without memoization
 * (SCHEMA §5, card 2A-04). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; memo: 'off' | 'on' };
type TreeNode = { id: string; label: string; parent?: string; note?: string };
type S = { nodes: TreeNode[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  startPlain: m(
    'Tính f({n}) bằng định nghĩa đệ quy f(k) = f(k − 1) + f(k − 2), với f(0) = 0 và f(1) = 1. Chưa dùng bảng nhớ.',
    'Compute f({n}) from the recursive definition f(k) = f(k − 1) + f(k − 2), with f(0) = 0 and f(1) = 1. No memo table yet.',
  ),
  startMemo: m(
    'Tính f({n}) bằng định nghĩa đệ quy f(k) = f(k − 1) + f(k − 2), có thêm bảng nhớ: giá trị đã tính thì không tính lại.',
    'Compute f({n}) from the recursive definition f(k) = f(k − 1) + f(k − 2), with a memo table: a value computed once is not computed again.',
  ),
  call: m(
    'Gọi f({k}). Vì {k} ≥ 2 nên f({k}) chưa biết ngay: phải gọi hai lời gọi con rồi cộng kết quả.',
    'Call f({k}). Since {k} ≥ 2, f({k}) is not known at once: make two child calls and add their results.',
  ),
  base: m(
    'f({k}) là trường hợp cơ sở: trả về {val} ngay, không gọi tiếp.',
    'f({k}) is a base case: return {val} at once, with no further calls.',
  ),
  ret: m(
    'f({k}) = f({k1}) + f({k2}) = {a} + {b} = {val}. Trả kết quả về cho lời gọi cha.',
    'f({k}) = f({k1}) + f({k2}) = {a} + {b} = {val}. Hand the result back to the parent call.',
  ),
  hit: m(
    'f({k}) đã được tính trước đó: lấy ngay {val} từ bảng nhớ, không gọi lại.',
    'f({k}) was computed before: take {val} from the memo table at once, no new call.',
  ),
  done: m(
    'Xong: f({n}) = {val}. Cây có {calls} node, mỗi node là một lần gọi hàm.',
    'Done: f({n}) = {val}. The tree has {calls|node|nodes}, one per function call.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Hàm đệ quy gọi lại chính nó. Mỗi lần gọi là một node của cây; con của node là các lời gọi nó sinh ra. Ta tính f({n}).',
      'A recursive function calls itself. Each call is a node of the tree; the children of a node are the calls it makes. We compute f({n}).',
    ),
    hints: [
      m(
        'Để tính f(5), em cần biết những giá trị nào trước?',
        'To compute f(5), which values do you need first?',
      ),
      m(
        'Cần f(4) và f(3). Mỗi giá trị này lại cần hai giá trị nhỏ hơn.',
        'You need f(4) and f(3). Each of those needs two smaller values.',
      ),
      m(
        'Cứ gọi tiếp cho tới khi gặp f(0) hoặc f(1) mà đã biết sẵn; các lời gọi tạo thành một cây.',
        'Keep calling until f(0) or f(1), whose values are known; the calls form a tree.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đệ quy chỉ là vòng lặp viết khác đi: mỗi lần gọi còn có biến riêng của nó.',
        'Thinking recursion is just a loop in disguise: every call also has its own variables.',
      ),
    ],
  },
  {
    id: 'call',
    label: m('Gọi hàm', 'A call'),
    narration: m(
      'f({k}) chưa biết ngay nên ta gọi hai lời gọi con, lời gọi đầu tiên chạy hết trước rồi mới tới lời gọi thứ hai.',
      'f({k}) is not known at once, so we make two child calls; the first runs to the end before the second starts.',
    ),
    ask: {
      text: m('Lời gọi con tiếp theo là f(?)', 'The next child call is f(?)'),
      predict: {
        kind: 'choice',
        options: [m('f(k − 1)', 'f(k − 1)'), m('f(k − 2)', 'f(k − 2)')],
        answer: (frame, next) => {
          const k = frame.meta.vars?.k;
          const nk = next?.meta.vars?.k;
          return typeof k === 'number' && nk === k - 1 ? 0 : 1;
        },
      },
    },
    hints: [
      m(
        'Công thức viết f(k − 1) trước hay f(k − 2) trước?',
        'In the formula, is f(k − 1) written before f(k − 2)?',
      ),
      m(
        'Chương trình chạy từ trái sang phải, nên gặp f(k − 1) trước.',
        'The program runs left to right, so it meets f(k − 1) first.',
      ),
      m(
        'Lời gọi con tiếp theo là f(k − 1); f(k − 2) chỉ được gọi sau khi f(k − 1) trả về.',
        'The next child call is f(k − 1); f(k − 2) is called only after f(k − 1) returns.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai lời gọi con chạy cùng lúc: thực ra lời gọi thứ hai chỉ bắt đầu sau khi lời gọi đầu trả về.',
        'Thinking both child calls run at the same time: the second starts only after the first returns.',
      ),
    ],
  },
  {
    id: 'base',
    label: m('Trường hợp cơ sở', 'Base case'),
    narration: m(
      'f({k}) = {val} là giá trị cho sẵn. Không gọi thêm: đây là điều kiện dừng giúp đệ quy kết thúc.',
      'f({k}) = {val} is given. No more calls: this stopping condition is what makes the recursion end.',
    ),
    hints: [
      m(
        'Điều gì xảy ra nếu hàm cứ gọi mãi mà không bao giờ dừng?',
        'What happens if the function keeps calling and never stops?',
      ),
      m(
        'Cần một trường hợp đủ nhỏ để trả lời ngay: f(0) và f(1).',
        'We need cases small enough to answer at once: f(0) and f(1).',
      ),
      m(
        'Nếu k < 2 thì trả về k: đó là điều kiện dừng.',
        'If k < 2 return k: that is the stopping condition.',
      ),
    ],
    misconceptions: [
      m(
        'Quên điều kiện dừng k < 2: hàm gọi mãi, tràn stack và chương trình sập.',
        'Forgetting the stop test k < 2: the function recurses forever and the stack overflows.',
      ),
    ],
  },
  {
    id: 'return',
    label: m('Trả kết quả', 'Return'),
    narration: m(
      'Cả hai lời gọi con đã trả về {a} và {b}. f({k}) bằng tổng của chúng: {val}, trả cho lời gọi cha.',
      'Both child calls returned {a} and {b}. f({k}) is their sum: {val}, handed back to the parent.',
    ),
    hints: [
      m(
        'Khi cả hai lời gọi con xong, ta có gì trong tay?',
        'When both child calls are done, what do we hold?',
      ),
      m(
        'Hai giá trị f(k − 1) và f(k − 2). Ta cần làm gì với chúng?',
        'The two values f(k − 1) and f(k − 2). What do we do with them?',
      ),
      m(
        'Cộng lại: f(k) = f(k − 1) + f(k − 2), rồi trả về cho nơi đã gọi.',
        'Add them: f(k) = f(k − 1) + f(k − 2), then return to the caller.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng giá trị đi xuống cây: thực ra các lời gọi đi xuống, còn kết quả đi ngược lên.',
        'Thinking values travel down the tree: calls go down, results come back up.',
      ),
    ],
  },
  {
    id: 'memo-hit',
    label: m('Trúng bảng nhớ', 'Memo hit'),
    narration: m(
      'f({k}) đã từng được tính nên lấy luôn {val} từ bảng nhớ. Cả nhánh con dưới nó bị bỏ qua.',
      'f({k}) was computed before, so we take {val} from the memo table. The whole subtree below it is skipped.',
    ),
    hints: [
      m(
        'Em thấy f(k) này đã xuất hiện ở đâu trên cây chưa?',
        'Have you seen this f(k) elsewhere in the tree already?',
      ),
      m(
        'Nếu đã có kết quả, tính lại có ích gì không?',
        'If the result is already known, does computing it again help?',
      ),
      m(
        'Ghi kết quả vào bảng nhớ lần đầu; lần sau chỉ cần tra bảng, mỗi giá trị chỉ tính một lần.',
        'Store the result in the table the first time; later just look it up, so each value is computed once.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bảng nhớ làm đổi kết quả: nó chỉ tránh tính trùng, kết quả vẫn y nguyên.',
        'Thinking the memo table changes the result: it only avoids repeated work, the answer stays the same.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'f({n}) = {val}, với {calls} node trên cây. Không nhớ thì số node tăng gần gấp 1,6 lần mỗi khi n tăng 1; có nhớ thì chỉ khoảng 2n.',
      'f({n}) = {val}, with {calls|node|nodes} in the tree. Without memo the tree grows by about 1.6 times per step of n; with memo it has about 2n nodes.',
    ),
    hints: [
      m('Cây lớn hay nhỏ so với n?', 'Is the tree big or small compared with n?'),
      m(
        'Không nhớ: cùng một f(k) bị tính lại nhiều lần ở các nhánh khác nhau.',
        'Without memo: the same f(k) is recomputed many times in different branches.',
      ),
      m(
        'Có nhớ: mỗi f(k) chỉ tính một lần, số lời gọi giảm từ cấp mũ xuống cấp tuyến tính.',
        'With memo: each f(k) is computed once, so the number of calls drops from exponential to linear.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đệ quy luôn chậm: đệ quy có nhớ cho cùng độ phức tạp O(n) như vòng lặp.',
        'Thinking recursion is always slow: memoized recursion has the same O(n) cost as a loop.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const useMemo = input.memo === 'on';
  const nodes: TreeNode[] = [];
  const status = new Map<string, HighlightKind>();
  const memo = new Map<number, number>();
  const stack: string[] = []; // ids of the calls still running

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    cur: string | undefined,
    curKind: HighlightKind | undefined,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (const [id, kind] of status) highlights[id] = kind;
    for (const id of stack) highlights[id] = 'active';
    if (cur !== undefined && curKind) highlights[cur] = curKind;
    emit(
      { nodes: nodes.map((x) => ({ ...x })) },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        pointers: cur === undefined ? {} : { cur },
        ...(useMemo
          ? {
              aux: [
                {
                  id: 'memo',
                  label: msg(m('Bảng nhớ', 'Memo table'), ctx.locale),
                  items: [...memo].map(([k, v]) => `f(${k}) = ${v}`),
                },
              ],
            }
          : {}),
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(useMemo ? EX.startMemo : EX.startPlain, 1, { n }, undefined, undefined, 'start');

  /** One call f(k); returns its value. */
  function fib(k: number, parent: string | undefined): number {
    tick();
    const id = `c${nodes.length}`;
    const node: TreeNode = { id, label: `f(${k})`, ...(parent ? { parent } : {}) };
    nodes.push(node);
    if (k < 2) {
      node.note = `= ${k}`;
      put(EX.base, 2, { k, val: k }, id, 'result', 'base');
      status.set(id, 'visited');
      return k;
    }
    const known = memo.get(k);
    if (useMemo && known !== undefined) {
      node.note = `= ${known}`;
      put(EX.hit, 3, { k, val: known }, id, 'muted', 'memo-hit');
      status.set(id, 'muted');
      return known;
    }
    put(EX.call, 1, { k }, id, 'compare', 'call');
    stack.push(id);
    const a = fib(k - 1, id);
    const b = fib(k - 2, id);
    stack.pop();
    const val = a + b;
    node.note = `= ${val}`;
    if (useMemo) memo.set(k, val);
    put(EX.ret, 4, { k, k1: k - 1, k2: k - 2, a, b, val }, id, 'result', 'return');
    status.set(id, 'visited');
    return val;
  }

  const val = fib(n, undefined);
  put(EX.done, 5, { n, val, calls: nodes.length }, undefined, undefined, 'done');
}

export const fibRecursionTreeEntry: WalkthroughEntry<In, S> = {
  id: 'fib-recursion-tree',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'tree',
  curriculumTopics: ['t1-recursion'],
  title: m('Cây gọi đệ quy của Fibonacci', 'The recursion tree of Fibonacci'),
  code: {
    pseudo: [
      'fib(k):',
      '    if k < 2: return k',
      '    if memo[k] đã có: return memo[k]',
      '    memo[k] ← fib(k − 1) + fib(k − 2)',
      '    return memo[k]',
    ],
    impl: {
      cpp: [
        'long long fib(int k, std::vector<long long>& memo) {',
        '    if (k < 2) return k;',
        '    if (memo[k] != -1) return memo[k];',
        '    memo[k] = fib(k - 1, memo) + fib(k - 2, memo);',
        '    return memo[k];',
        '}',
      ],
      py: [
        'def fib(k, memo):',
        '    if k < 2:',
        '        return k',
        '    if k in memo:',
        '        return memo[k]',
        '    memo[k] = fib(k - 1, memo) + fib(k - 2, memo)',
        '    return memo[k]',
      ],
    },
    map: {
      cpp: { 1: [1], 2: [2], 3: [3], 4: [4], 5: [5] },
      py: { 1: [1], 2: [2, 3], 3: [4, 5], 4: [6], 5: [7] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      n: { kind: 'int', range: [0, 6] },
      memo: { kind: 'enum', values: ['off', 'on'] },
    },
  },
  customInput: false,
  presets: [
    { id: 'plain-5', label: m('Không nhớ, n = 5', 'No memo, n = 5'), input: { n: 5, memo: 'off' } },
    { id: 'memo-5', label: m('Có nhớ, n = 5', 'With memo, n = 5'), input: { n: 5, memo: 'on' } },
    { id: 'base-0', label: m('Biên n = 0', 'Edge n = 0'), input: { n: 0, memo: 'off' } },
    { id: 'base-1', label: m('Biên n = 1', 'Edge n = 1'), input: { n: 1, memo: 'off' } },
    { id: 'memo-6', label: m('Có nhớ, n = 6', 'With memo, n = 6'), input: { n: 6, memo: 'on' } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'base',
      text: m(
        'Thiếu điều kiện dừng k < 2: f(1) sẽ gọi f(0) rồi f(−1), … không bao giờ dừng.',
        'Missing the stop test k < 2: f(1) would call f(0) and then f(−1), … and never stop.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'memo-hit',
      text: m(
        'Bảng nhớ phải khởi tạo bằng một giá trị "chưa có" (ví dụ −1) và đủ kích thước n + 1; kết quả dùng long long.',
        'The memo table needs a "not computed" value (such as −1) and size n + 1; use long long for the results.',
      ),
    },
    {
      lang: 'py',
      beat: 'memo-hit',
      text: m(
        'Nhớ bằng dict: phải kiểm `k in memo` TRƯỚC khi gọi đệ quy; kiểm sau thì lời gọi đã diễn ra rồi.',
        'With a dict memo, test `k in memo` BEFORE recursing; testing afterwards is too late, the call already happened.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
