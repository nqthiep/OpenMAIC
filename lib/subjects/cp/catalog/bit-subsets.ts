/**
 * Walkthrough entry: counting subsets with a given sum by bit masks (SCHEMA §5, card 2B-03).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { items: number[]; target: number };
type S = {
  /** bit i of the mask at index i; '' while the bits are hidden (the question frame) */
  values: (number | string)[];
  mode: 'bits';
  rows: { label: string; values: number[]; offset: number }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Có {n} phần tử nên có {total} mặt nạ bit từ 0 đến {last}: mỗi mặt nạ là một tập con. Đếm các tập có tổng bằng {target}.',
    'There are {n} items, so {total} bit masks from 0 to {last}: each mask is one subset. Count the subsets whose sum is {target}.',
  ),
  test: m(
    'Mặt nạ mask = {mask}. Bit i = {i} của nó, (mask >> {i}) & 1, đang bật hay tắt?',
    'The mask is {mask}. Is its bit i = {i}, (mask >> {i}) & 1, on or off?',
  ),
  mask: m(
    'mask = {mask}: các bit bật chọn {picked}; tổng = {sum}.',
    'mask = {mask}: the set bits pick {picked}; the sum is {sum}.',
  ),
  maskEmpty: m(
    'mask = {mask}: không bit nào bật, tập rỗng; tổng = {sum}.',
    'mask = {mask}: no bit is set, the empty set; the sum is {sum}.',
  ),
  match: m(
    'Tổng {sum} bằng target = {target}: tìm thêm một tập con. Đã có {count}.',
    'The sum {sum} equals target = {target}: another subset found. So far {count}.',
  ),
  done: m(
    'Có {count} tập con có tổng {target} trong {total} tập con.',
    'There are {count} subsets with sum {target} out of {total}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Mỗi tập con của {n} phần tử tương ứng với một số nguyên từ 0 đến {last}: bit i bật nghĩa là phần tử a[i] được chọn. Ta duyệt cả {total} mặt nạ.',
      'Each subset of {n} items matches an integer from 0 to {last}: bit i set means a[i] is picked. We go through all {total} masks.',
    ),
    hints: [
      m(
        'Mỗi phần tử có hai trạng thái: chọn hay không. Có thể mã hoá bằng một bit không?',
        'Each item has two states: picked or not. Can one bit encode that?',
      ),
      m(
        'Có: bit 1 là chọn, bit 0 là không. n phần tử cần n bit, tức một số nguyên.',
        'Yes: bit 1 is picked, bit 0 is not. n items need n bits, one integer.',
      ),
      m(
        'Mọi số từ 0 đến 2^n − 1 là một mặt nạ, nên chỉ cần một vòng for để duyệt mọi tập con.',
        'Every number from 0 to 2^n − 1 is a mask, so one for loop visits every subset.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng mặt nạ bit chỉ dùng được khi phần tử là số nhị phân: nó mã hoá việc chọn, không phải giá trị.',
        'Thinking bit masks need binary numbers as items: they encode the choice, not the values.',
      ),
    ],
  },
  {
    id: 'mask',
    label: m('Một mặt nạ', 'One mask'),
    narration: m(
      'Với mask = {mask}, các bit bật cho ta tập {picked}. Cộng các phần tử được chọn: tổng = {sum}.',
      'For mask = {mask}, the set bits give the set {picked}. Adding the picked items: the sum is {sum}.',
    ),
    hints: [
      m(
        'Các bit bật của mask chọn những phần tử nào?',
        'Which items do the set bits of the mask pick?',
      ),
      m(
        'Bit i bật thì a[i] có mặt trong tập; ở bảng các bit bật được tô sáng.',
        'If bit i is set, a[i] is in the set; the set bits are highlighted in the table.',
      ),
      m(
        'Cộng a[i] cho mọi bit i bật: đó là tổng của tập con ứng với mask.',
        'Add a[i] for every set bit i: that is the sum of the subset for this mask.',
      ),
    ],
    misconceptions: [
      m(
        'Đọc bit từ trái sang phải trong khi bit 0 là bit thấp nhất: ở đây bit i ứng với a[i].',
        'Reading bits left to right when bit 0 is the lowest: here bit i matches a[i].',
      ),
    ],
  },
  {
    id: 'test-bit',
    label: m('Kiểm tra một bit', 'Test one bit'),
    narration: m(
      'Để biết a[{i}] có được chọn không, ta dịch mask = {mask} sang phải {i} bit rồi lấy bit thấp nhất: (mask >> {i}) & 1.',
      'To know whether a[{i}] is picked, shift mask = {mask} right by {i} bits and take the lowest bit: (mask >> {i}) & 1.',
    ),
    ask: {
      text: m('Theo em, bit i của mask này bật hay tắt?', 'Is bit i of this mask on or off?'),
      predict: {
        kind: 'choice',
        options: [m('Bật (1)', 'On (1)'), m('Tắt (0)', 'Off (0)')],
        answer: (frame) => {
          const mask = frame.meta.vars?.mask;
          const i = frame.meta.vars?.i;
          if (typeof mask !== 'number' || typeof i !== 'number') return -1;
          return Math.floor(mask / 2 ** i) % 2 === 1 ? 0 : 1;
        },
      },
    },
    hints: [
      m(
        'Viết mask ở dạng nhị phân rồi đếm từ bit thấp nhất (bit 0).',
        'Write the mask in binary and count from the lowest bit (bit 0).',
      ),
      m(
        'Dịch phải i bit đưa bit i xuống vị trí thấp nhất; & 1 giữ lại đúng bit đó.',
        'Shifting right by i bits brings bit i to the lowest place; & 1 keeps just that bit.',
      ),
      m(
        'Bit i bật nếu (mask >> i) & 1 bằng 1; cần ngoặc vì & có độ ưu tiên thấp hơn >>.',
        'Bit i is set when (mask >> i) & 1 is 1; the parentheses are needed because & has lower precedence than >>.',
      ),
    ],
    misconceptions: [
      m(
        'Viết mask >> i & 1 không ngoặc rồi tưởng nó là mask >> (i & 1): thứ tự ưu tiên khác.',
        'Writing mask >> i & 1 without parentheses and expecting mask >> (i & 1): the precedence differs.',
      ),
    ],
  },
  {
    id: 'match',
    label: m('Khớp target', 'A match'),
    narration: m(
      'Tổng {sum} đúng bằng target = {target}: tập con này được đếm. Đã có {count} tập thoả.',
      'The sum {sum} equals target = {target}: this subset is counted. {count} subsets match so far.',
    ),
    hints: [
      m('Khi nào ta tăng biến đếm?', 'When do we raise the counter?'),
      m(
        'Khi tổng của tập con bằng đúng target.',
        'When the sum of the subset equals the target exactly.',
      ),
      m(
        'sum = target ⇒ count ← count + 1; các mặt nạ khác tổng thì bỏ qua.',
        'sum = target ⇒ count ← count + 1; masks with another sum are skipped.',
      ),
    ],
    misconceptions: [
      m(
        'Dừng ngay khi gặp tập đầu tiên khớp: bài yêu cầu đếm mọi tập.',
        'Stopping at the first match: the task asks to count every subset.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Có {count} tập con có tổng {target} trong {total}. Duyệt mặt nạ tốn cỡ 2^n·n, dùng được khi n nhỏ (khoảng 20).',
      'There are {count} subsets with sum {target} out of {total}. Walking the masks costs about 2^n·n, usable for small n (about 20).',
    ),
    hints: [
      m(
        'Có bao nhiêu mặt nạ, và mỗi mặt nạ tốn bao nhiêu để cộng?',
        'How many masks are there, and what does each cost to add up?',
      ),
      m(
        '2^n mặt nạ, mỗi cái n bit: cỡ n·2^n phép toán.',
        '2^n masks, each with n bits: about n·2^n operations.',
      ),
      m(
        'Với n = 20 đã hơn 20 triệu phép; n lớn hơn cần cách khác (quy hoạch động, meet-in-the-middle).',
        'For n = 20 that is over 20 million operations; larger n needs other ideas (DP, meet-in-the-middle).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng duyệt mặt nạ nhanh với mọi n: số mặt nạ gấp đôi mỗi khi thêm một phần tử.',
        'Thinking mask enumeration is fast for every n: the number of masks doubles with each extra item.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { items, target } = input;
  const n = items.length;
  const total = 1 << n;
  let count = 0;
  const row = [{ label: 'a', values: [...items], offset: 0 }];

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    bits: (number | string)[],
    marks: Record<string, HighlightKind>,
    tag: string,
  ): void => {
    emit(
      { values: bits, mode: 'bits', rows: row },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  put(EX.start, 1, { n, total, last: total - 1, target }, Array<string>(n).fill(''), {}, 'start');
  for (let mask = 0; mask < total; mask++) {
    tick();
    // question: the bits are hidden, one position is asked about
    const i = mask % n;
    put(EX.test, 4, { mask, i }, Array<string>(n).fill(''), { [`r0:${i}`]: 'compare' }, 'test-bit');
    const bits = items.map((_, k) => (mask >> k) & 1);
    const picked = items.filter((_, k) => bits[k] === 1);
    const sum = picked.reduce((s, x) => s + x, 0);
    const marks: Record<string, HighlightKind> = {};
    bits.forEach((b, k) => {
      if (b === 1) {
        marks[String(k)] = 'active';
        marks[`r0:${k}`] = 'active';
      }
    });
    put(
      picked.length > 0 ? EX.mask : EX.maskEmpty,
      4,
      { mask, picked: picked.length > 0 ? picked.join(' + ') : '∅', sum },
      bits,
      marks,
      'mask',
    );
    if (sum === target) {
      count++;
      const hit: Record<string, HighlightKind> = {};
      bits.forEach((b, k) => {
        if (b === 1) {
          hit[String(k)] = 'result';
          hit[`r0:${k}`] = 'result';
        }
      });
      put(EX.match, 5, { sum, target, count }, bits, hit, 'match');
    }
  }
  put(EX.done, 6, { count, target, total }, Array<string>(n).fill(''), {}, 'done');
}

export const bitSubsetsEntry: WalkthroughEntry<In, S> = {
  id: 'bit-subsets',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t2-bitwise'],
  title: m('Duyệt tập con bằng mặt nạ bit', 'Enumerating subsets with bit masks'),
  code: {
    pseudo: [
      'count ← 0',
      'for mask ← 0 .. 2^n − 1:',
      '    sum ← 0',
      '    for i ← 0 .. n − 1: if (mask >> i) & 1: sum ← sum + a[i]',
      '    if sum = target: count ← count + 1',
      'return count',
    ],
    impl: {
      cpp: [
        'int count_subsets(const std::vector<int>& a, int target) {',
        '    int n = a.size(), count = 0;',
        '    for (int mask = 0; mask < (1 << n); mask++) {',
        '        int sum = 0;',
        '        for (int i = 0; i < n; i++) {',
        '            if ((mask >> i) & 1) sum += a[i];',
        '        }',
        '        if (sum == target) count++;',
        '    }',
        '    return count;',
        '}',
      ],
      py: [
        'def count_subsets(a, target):',
        '    n, count = len(a), 0',
        '    for mask in range(1 << n):',
        '        s = 0',
        '        for i in range(n):',
        '            if (mask >> i) & 1:',
        '                s += a[i]',
        '        if s == target:',
        '            count += 1',
        '    return count',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5, 6, 7], 5: [8], 6: [10] },
      py: { 1: [2], 2: [3], 3: [4], 4: [5, 6, 7], 5: [8, 9], 6: [10] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      items: { kind: 'int-array', len: [1, 4], range: [1, 9] },
      target: { kind: 'int', range: [0, 36] },
    },
  },
  customInput: false,
  presets: [
    { id: 'n3', label: m('Ba phần tử', 'Three items'), input: { items: [2, 3, 5], target: 5 } },
    { id: 'n1', label: m('Một phần tử', 'One item'), input: { items: [4], target: 4 } },
    {
      id: 'none',
      label: m('Không có tập nào', 'No subset'),
      input: { items: [1, 2, 4, 8], target: 16 },
    },
    {
      id: 'many',
      label: m('Nhiều tập, số trùng', 'Many subsets, repeated numbers'),
      input: { items: [1, 1, 2, 2], target: 3 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'test-bit',
      text: m(
        '(mask >> i) & 1 cần ngoặc: & có độ ưu tiên thấp hơn so sánh và dịch bit trong C++, viết thiếu ngoặc dễ sai.',
        '(mask >> i) & 1 needs parentheses: & has lower precedence than comparison and shifts in C++, so leaving them out is error-prone.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'start',
      text: m(
        '1 << n tràn int khi n ≥ 31: với n lớn dùng 1LL << n và biến mask kiểu long long.',
        '1 << n overflows int when n ≥ 31: for large n use 1LL << n and a long long mask.',
      ),
    },
    {
      lang: 'py',
      beat: 'start',
      text: m(
        'range(1 << n) duyệt đủ 2^n mặt nạ; viết range(1 << n - 1) sẽ thành 1 << (n - 1) vì + − có độ ưu tiên cao hơn <<.',
        'range(1 << n) walks all 2^n masks; range(1 << n - 1) means 1 << (n - 1) because + and − bind tighter than <<.',
      ),
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
