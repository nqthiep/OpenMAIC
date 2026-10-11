/**
 * Walkthrough entry: minimise the total waiting time, greedy by shortest service first with the
 * exchange argument (SCHEMA §5, card 2B-12, P2; the statement is the leader's proposal [Inference],
 * README D16). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { t: number[] };
type S = {
  values: number[];
  mode: 'bars';
  rows: { label: string; values: (number | null)[]; offset: number }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    '{n} khách xếp hàng theo thứ tự đề cho; khách thứ k phải đợi tổng thời gian phục vụ của những người đứng trước. Tổng thời gian chờ hiện tại là {total}.',
    '{n|customer|customers} queue in the given order; customer k waits for the total service time of those before. The current total waiting time is {total}.',
  ),
  brute: m(
    'Thử mọi cách xếp: có {perms} thứ tự (n!), mỗi thứ tự tính trong O(n). Tổng chờ nhỏ nhất tìm được là {best}.',
    'Try every order: there are {perms} orders (n!), each costing O(n). The smallest total waiting time found is {best}.',
  ),
  ask: m(
    'Hai khách kề nhau có thời gian {x} (trước) và {y} (sau), với {x} > {y}. Nếu đổi chỗ để khách ngắn đứng trước thì tổng chờ đổi thế nào?',
    'Two neighbours need {x} (first) and {y} (second), with {x} > {y}. If the shorter one is moved to the front, how does the total waiting time change?',
  ),
  swapped: m(
    'Đổi chỗ: khách ngắn ({y}) lên trước. Tổng chờ giảm {gain}, từ {before} xuống {after}; các khách khác không bị ảnh hưởng.',
    'Swap: the shorter customer ({y}) goes first. The total waiting time drops by {gain}, from {before} to {after}; the other customers are unaffected.',
  ),
  sort: m(
    'Lặp lại phép đổi chừng nào còn khách dài đứng trước khách ngắn: ta được thứ tự tăng dần. Tổng chờ còn {total}.',
    'Repeat the swap while a longer customer stands before a shorter one: we reach increasing order. The total waiting time is {total}.',
  ),
  acc: m(
    'Khách {k}: chờ {w} = tổng thời gian của các khách trước; phục vụ {tk}. Đã cộng dồn tổng chờ = {total}.',
    'Customer {k}: waits {w} = the total service time of those before; service {tk}. Total waiting so far = {total}.',
  ),
  done: m(
    'Tổng thời gian chờ nhỏ nhất là {total}, đạt khi phục vụ khách ngắn nhất trước.',
    'The smallest total waiting time is {total}, reached by serving the shortest customer first.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Đề bài', 'The task'),
    narration: m(
      'Một quầy phục vụ {n} khách; khách k cần t[k] phút. Thời gian chờ của khách là tổng thời gian phục vụ những người đứng trước. Ta chọn thứ tự để tổng chờ nhỏ nhất.',
      'One counter serves {n|customer|customers}; customer k needs t[k] minutes. A customer’s waiting time is the total service time of those before. We choose the order that minimises the total wait.',
    ),
    hints: [
      m(
        'Thời gian chờ của khách đứng đầu là bao nhiêu?',
        'What is the waiting time of the customer at the front?',
      ),
      m(
        'Bằng 0; mỗi khách sau phải đợi mọi khách trước nó.',
        'Zero; every later customer waits for all before them.',
      ),
      m(
        'Tổng chờ = Σ (số khách đứng sau) × t[k]: khách phục vụ lâu mà đứng đầu làm mọi người sau phải đợi lâu.',
        'Total wait = Σ (number of customers behind) × t[k]: a long customer at the front makes everyone behind wait long.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm thời gian chờ với thời gian hoàn thành: chờ không gồm thời gian phục vụ của chính khách đó.',
        'Mixing waiting time with completion time: waiting does not include the customer’s own service time.',
      ),
    ],
  },
  {
    id: 'brute',
    label: m('Vét cạn', 'Brute force'),
    narration: m(
      'Thử mọi hoán vị của {n} khách cho {perms} thứ tự; mỗi thứ tự tính tổng chờ trong O(n). Với n ≤ 8 thì được, nhưng n! tăng cực nhanh.',
      'Trying every permutation of {n|customer|customers} gives {perms} orders, each costing O(n). Fine for n ≤ 8, but n! explodes.',
    ),
    hints: [
      m('Có bao nhiêu thứ tự xếp n khách?', 'How many orders are there for n customers?'),
      m(
        'n! = 1·2·…·n: với n = 10 đã hơn 3 triệu.',
        'n! = 1·2·…·n: for n = 10 it is already over 3 million.',
      ),
      m(
        'Vét cạn chỉ dùng cho n nhỏ (subtask 1); cần một quy tắc sắp xếp thông minh cho n lớn.',
        'Brute force serves only small n (subtask 1); large n needs a clever ordering rule.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng vét cạn luôn chấp nhận được vì máy nhanh: n! vượt xa mọi giới hạn khi n > 11.',
        'Thinking brute force is always fine because machines are fast: n! blows past every limit once n > 11.',
      ),
    ],
  },
  {
    id: 'swap-argument',
    label: m('Lập luận đổi chỗ', 'The exchange argument'),
    narration: m(
      'Xét hai khách kề nhau cần {x} rồi {y} phút, {x} > {y}. Khách thứ hai đợi thêm {x}. Nếu đổi chỗ, khách thứ hai đợi thêm {y} (ít hơn), còn mọi khách khác không đổi.',
      'Take two neighbours needing {x} then {y|minute|minutes}, {x} > {y}. The second one waits an extra {x}. After swapping, the second waits an extra {y} (less), and everyone else is unchanged.',
    ),
    ask: {
      text: m(
        'Theo em, đổi chỗ để khách ngắn đứng trước hay đứng sau thì tổng chờ giảm?',
        'Is the total wait smaller with the shorter customer in front or behind?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Khách ngắn đứng trước', 'Shorter customer in front'),
          m('Khách ngắn đứng sau', 'Shorter customer behind'),
        ],
        answer: (_frame, next) => (next && (next.meta.vars?.gain as number) > 0 ? 0 : 1),
      },
    },
    hints: [
      m(
        'Chỉ hai khách này đổi chỗ; những khách khác bị ảnh hưởng thế nào?',
        'Only these two swap; how are the others affected?',
      ),
      m(
        'Không: họ vẫn đợi cùng tổng thời gian của những người trước (cả hai khách này đều nằm trước họ).',
        'Not at all: they still wait for the same total time before them (both of these customers stand before them).',
      ),
      m(
        'Khách thứ hai chờ thêm thời gian của khách đứng trước nó: chọn khách ngắn đứng trước để khoản đó nhỏ nhất.',
        'The second customer waits for the one in front: put the shorter one in front so that part is smallest.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cho khách lâu đứng trước thì công bằng hơn: tổng chờ của cả hàng sẽ lớn hơn.',
        'Thinking letting the long customer go first is fairer: the total wait of the whole queue becomes larger.',
      ),
    ],
  },
  {
    id: 'sort',
    label: m('Sắp tăng dần', 'Sort increasingly'),
    narration: m(
      'Mỗi lần đổi một cặp kề nhau ngược thứ tự là ta giảm tổng chờ. Làm tới khi không còn cặp ngược: đó là thứ tự tăng dần theo thời gian phục vụ (SPT).',
      'Each swap of an out-of-order neighbouring pair lowers the total wait. Repeat until no such pair remains: that is increasing order of service time (SPT).',
    ),
    hints: [
      m('Khi nào ta không đổi chỗ được nữa?', 'When can we no longer swap?'),
      m(
        'Khi mọi cặp kề nhau đều ngắn trước dài sau, tức dãy đã tăng dần.',
        'When every neighbouring pair is short before long, that is, the sequence is increasing.',
      ),
      m(
        'Vậy thứ tự tối ưu là sắp tăng dần theo t[k]; sắp xếp mất O(n log n).',
        'So the optimal order is increasing t[k]; sorting costs O(n log n).',
      ),
    ],
    misconceptions: [
      m(
        'Sắp giảm dần: cho kết quả tệ nhất, vì khách lâu nhất làm mọi người sau phải đợi.',
        'Sorting decreasingly: that gives the worst result, since the longest customer makes everyone behind wait.',
      ),
    ],
  },
  {
    id: 'accumulate',
    label: m('Cộng dồn thời gian chờ', 'Accumulate waiting'),
    narration: m(
      'Khách {k} chờ {w} phút, chính là tổng thời gian phục vụ của các khách trước. Cộng thời gian chờ của từng khách ta được tổng {total} (tới đây).',
      'Customer {k} waits {w|minute|minutes}, the total service time of the customers before. Adding each customer’s wait gives the total {total} (so far).',
    ),
    hints: [
      m('Thời gian chờ của khách k tính từ đâu?', 'How is the wait of customer k computed?'),
      m(
        'wait của khách k = wait của khách k − 1 cộng thời gian phục vụ của khách k − 1.',
        'wait of customer k = wait of customer k − 1 plus the service time of customer k − 1.',
      ),
      m(
        'Duyệt một lần: total += wait; wait += t[k]. Chú ý dùng kiểu 64-bit khi t và n lớn.',
        'One pass: total += wait; wait += t[k]. Use 64-bit integers when t and n are large.',
      ),
    ],
    misconceptions: [
      m(
        'Cộng t[k] vào tổng trước khi cộng wait: sẽ tính thời gian hoàn thành, không phải thời gian chờ.',
        'Adding t[k] to the total before adding wait: that computes completion time, not waiting time.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng chờ nhỏ nhất là {total}. Cách làm là sắp tăng dần rồi duyệt một lần: O(n log n), thay cho O(n!·n) của vét cạn.',
      'The smallest total wait is {total}. Sort increasingly and make one pass: O(n log n) instead of the O(n!·n) of brute force.',
    ),
    hints: [
      m('Thuật toán tốn thời gian chủ yếu ở bước nào?', 'Which step takes most of the time?'),
      m(
        'Bước sắp xếp O(n log n); duyệt cộng dồn chỉ O(n).',
        'The sort, O(n log n); the accumulating pass is only O(n).',
      ),
      m(
        'Tổng O(n log n); tổng chờ có thể tới n²·max(t)/2 nên cần long long khi n, t lớn.',
        'In total O(n log n); the total can reach n²·max(t)/2 so use long long when n and t are large.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng có nhiều đáp án tối ưu khác nhau về tổng: tổng nhỏ nhất là duy nhất, dù có thể có nhiều thứ tự đạt nó.',
        'Thinking different optimal answers differ in total: the minimum total is unique, though several orders may reach it.',
      ),
    ],
  },
];

const totalWait = (t: readonly number[]): number => {
  let wait = 0;
  let total = 0;
  for (const x of t) {
    total += wait;
    wait += x;
  }
  return total;
};

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const original = [...input.t];
  const n = original.length;
  const waitsOf = (t: readonly number[]): number[] => {
    const res: number[] = [];
    let wait = 0;
    for (const x of t) {
      res.push(wait);
      wait += x;
    }
    return res;
  };

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    order: readonly number[],
    waits: readonly (number | null)[],
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    emit(
      {
        values: [...order],
        mode: 'bars',
        rows: [{ label: msg(m('chờ', 'wait'), ctx.locale), values: [...waits], offset: 0 }],
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

  const total0 = totalWait(original);
  put(EX.start, 1, { n, total: total0 }, original, waitsOf(original), {}, 'start');

  // brute force over all permutations (heap's algorithm would also do; a recursive one keeps it simple)
  let perms = 0;
  let best = Infinity;
  const permute = (rest: number[], acc: number[]): void => {
    if (rest.length === 0) {
      tick();
      perms++;
      best = Math.min(best, totalWait(acc));
      return;
    }
    for (let i = 0; i < rest.length; i++)
      permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, rest[i]]);
  };
  permute(original, []);
  put(EX.brute, 1, { n, perms, best }, original, waitsOf(original), {}, 'brute');

  // exchange argument on the first adjacent pair in the wrong order, if there is one
  const k = original.findIndex((x, i) => i + 1 < n && x > original[i + 1]);
  if (k >= 0) {
    const x = original[k];
    const y = original[k + 1];
    put(
      EX.ask,
      1,
      { x, y },
      original,
      waitsOf(original),
      { [k]: 'compare', [k + 1]: 'compare' },
      'swap-argument',
    );
    const swapped = [...original];
    [swapped[k], swapped[k + 1]] = [swapped[k + 1], swapped[k]];
    const after = totalWait(swapped);
    put(
      EX.swapped,
      1,
      { y, gain: total0 - after, before: total0, after },
      swapped,
      waitsOf(swapped),
      { [k]: 'result', [k + 1]: 'compare' },
    );
  }

  const sorted = [...original].sort((p, q) => p - q);
  put(EX.sort, 1, { total: totalWait(sorted) }, sorted, waitsOf(sorted), {}, 'sort');

  let wait = 0;
  let total = 0;
  const built: (number | null)[] = Array<number | null>(n).fill(null);
  for (let c = 0; c < n; c++) {
    tick();
    total += wait;
    built[c] = wait;
    put(
      EX.acc,
      4,
      { k: c + 1, w: wait, tk: sorted[c], total },
      sorted,
      built,
      { [c]: 'active', [`r0:${c}`]: 'result' },
      'accumulate',
    );
    wait += sorted[c];
  }
  put(
    EX.done,
    5,
    { total },
    sorted,
    built,
    Object.fromEntries(sorted.map((_, i) => [String(i), 'result' as HighlightKind])),
    'done',
  );
}

export const minTotalWaitEntry: WalkthroughEntry<In, S> = {
  id: 'min-total-wait',
  entryRev: 3,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t3-greedy'],
  title: m(
    'Bài giải đề: tổng thời gian chờ nhỏ nhất',
    'Problem walkthrough: minimum total waiting time',
  ),
  code: {
    pseudo: [
      'sắp các khách tăng dần theo t',
      'wait ← 0; total ← 0',
      'for k ← 0 .. n − 1:',
      '    total ← total + wait; wait ← wait + t[k]',
      'return total',
    ],
    impl: {
      cpp: [
        'long long min_total_wait(std::vector<int> t) {',
        '    std::sort(t.begin(), t.end());',
        '    long long wait = 0, total = 0;',
        '    for (int x : t) {',
        '        total += wait;',
        '        wait += x;',
        '    }',
        '    return total;',
        '}',
      ],
      py: [
        'def min_total_wait(t):',
        '    wait = total = 0',
        '    for x in sorted(t):',
        '        total += wait',
        '        wait += x',
        '    return total',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5, 6], 5: [8] },
      py: { 1: [3], 2: [2], 3: [3], 4: [4, 5], 5: [6] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { t: { kind: 'int-array', len: [1, 8], range: [1, 20] } },
  },
  customInput: false,
  presets: [
    { id: 'classic', label: m('Ví dụ chuẩn', 'Standard example'), input: { t: [8, 3, 5, 1] } },
    { id: 'sorted', label: m('Đã sắp xếp', 'Already sorted'), input: { t: [1, 2, 3, 4] } },
    { id: 'equal', label: m('Mọi khách như nhau', 'All customers equal'), input: { t: [4, 4, 4] } },
    { id: 'single', label: m('Một khách', 'One customer'), input: { t: [6] } },
  ],
  beatDefs,
  problem: {
    statement: {
      'vi-VN':
        'Một quầy phục vụ n khách; khách i cần t[i] phút. Hãy sắp thứ tự phục vụ để tổng thời gian chờ của mọi khách nhỏ nhất (thời gian chờ của khách là tổng thời gian phục vụ của những khách đứng trước).',
      'en-US':
        'One counter serves n customers; customer i needs t[i] minutes. Order the service so that the total waiting time of all customers is smallest (a customer’s wait is the total service time of the customers before).',
    },
    constraints: [
      { 'vi-VN': '1 ≤ n ≤ 10^5', 'en-US': '1 ≤ n ≤ 10^5' },
      { 'vi-VN': '1 ≤ t[i] ≤ 10^9', 'en-US': '1 ≤ t[i] ≤ 10^9' },
    ],
    subtasks: [
      {
        id: 'brute',
        limit: { 'vi-VN': 'n ≤ 8', 'en-US': 'n ≤ 8' },
        idea: {
          'vi-VN': 'Thử mọi hoán vị và lấy tổng chờ nhỏ nhất.',
          'en-US': 'Try every permutation and keep the smallest total wait.',
        },
        complexity: 'O(n!·n)',
      },
      {
        id: 'greedy',
        limit: { 'vi-VN': 'n ≤ 10^5', 'en-US': 'n ≤ 10^5' },
        idea: {
          'vi-VN':
            'Sắp tăng dần theo thời gian phục vụ (SPT) rồi cộng dồn; chứng minh bằng phép đổi chỗ hai khách kề nhau.',
          'en-US':
            'Sort by increasing service time (SPT) and accumulate; proved by swapping two neighbouring customers.',
        },
        complexity: 'O(n log n)',
      },
      {
        id: 'big',
        limit: { 'vi-VN': 't ≤ 10^9', 'en-US': 't ≤ 10^9' },
        idea: {
          'vi-VN':
            'Cùng cách làm, nhưng tổng chờ có thể tới khoảng 5·10^18 nên cần long long (int 32 bit không đủ).',
          'en-US':
            'The same method, but the total can reach about 5·10^18, so long long is needed (a 32-bit int is not enough).',
        },
        complexity: 'O(n log n)',
      },
    ],
  },
  pitfalls: [
    {
      beat: 'accumulate',
      text: m(
        'Thời gian chờ không gồm thời gian phục vụ của chính khách đó; cộng t[k] vào tổng sẽ cho thời gian hoàn thành.',
        'Waiting time excludes the customer’s own service time; adding t[k] into the total would give completion time.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'accumulate',
      text: m(
        'Tổng chờ có thể vượt int khi n = 10^5, t = 10^9 (tới khoảng 5·10^18): dùng long long cho wait và total. Long long (tối đa khoảng 9,2·10^18) đủ chứa, không cần __int128.',
        'The total can overflow int at n = 10^5, t = 10^9 (up to about 5·10^18): use long long for wait and total. Long long (max about 9.2·10^18) holds it, so __int128 is not needed.',
      ),
    },
    {
      lang: 'py',
      beat: 'sort',
      text: m(
        'sorted(t) trả về danh sách mới và giữ nguyên t; t.sort() sắp tại chỗ và đổi t. Python có số nguyên lớn nên không tràn.',
        'sorted(t) returns a new list and keeps t; t.sort() sorts in place and changes t. Python has big integers so nothing overflows.',
      ),
    },
  ],
  maxFrames: 40,
  maxSteps: 50_000, // brute force walks up to 8! = 40320 orders, one tick each
  maxBytes: 200_000,
  run,
};
