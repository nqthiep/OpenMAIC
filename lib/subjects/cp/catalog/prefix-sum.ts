/**
 * Walkthrough entry: prefix sums, answering "sum of a[l..r]" in O(1) after an O(n) build
 * (SCHEMA §5, card 2A-01). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[]; l: number; r: number };
type S = {
  values: number[];
  mode: 'cells';
  /** one extra row: P[0..n], `null` for cells not built yet */
  rows: { label: string; values: (number | null)[]; offset: number }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Cần tính tổng a[{l}..{r}]. Ta dựng mảng cộng dồn P, bắt đầu bằng P[0] = 0 (tổng của đoạn rỗng).',
    'We need the sum of a[{l}..{r}]. We build a prefix array P, starting with P[0] = 0 (the sum of nothing).',
  ),
  naive: m(
    'Cách chậm: cộng từng phần tử a[{l}..{r}] = {direct}, tốn {count} phép cộng cho MỖI truy vấn, tức O(n).',
    'The slow way: add up a[{l}..{r}] = {direct}, {count|addition|additions} for EVERY query, which is O(n).',
  ),
  build: m(
    'Dựng P[{j}] = P[{i}] + a[{i}] = {pi} + {ai} = {pn}.',
    'Build P[{j}] = P[{i}] + a[{i}] = {pi} + {ai} = {pn}.',
  ),
  query: m(
    'P đã dựng xong. Muốn tổng a[{l}..{r}], lấy P[{r1}] (tổng từ đầu tới a[{r}]) rồi trừ đi một phần của P.',
    'P is built. For the sum of a[{l}..{r}], take P[{r1}] (the sum up to a[{r}]) and subtract one more entry of P.',
  ),
  answer: m(
    'Tổng a[{l}..{r}] = P[{r1}] − P[{l}] = {hiP} − {loP} = {total}.',
    'Sum of a[{l}..{r}] = P[{r1}] − P[{l}] = {hiP} − {loP} = {total}.',
  ),
  done: m(
    'Kết quả: tổng a[{l}..{r}] = {total}. Mỗi truy vấn chỉ một phép trừ, O(1); dựng P chỉ tốn O(n) một lần.',
    'Result: the sum of a[{l}..{r}] is {total}. Each query is one subtraction, O(1); building P costs O(n) once.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Bài toán: cho mảng a, trả lời tổng a[{l}..{r}]. Ta chuẩn bị mảng P với P[0] = 0.',
      'The task: given an array a, answer the sum of a[{l}..{r}]. We prepare an array P with P[0] = 0.',
    ),
    hints: [
      m(
        'Nếu có rất nhiều truy vấn, cộng lại từ đầu mỗi lần có ổn không?',
        'With very many queries, is re-adding from scratch each time fine?',
      ),
      m(
        'Có thể làm trước một lần để mỗi truy vấn chỉ cần vài phép tính không?',
        'Can we do some work once so that each query needs only a few operations?',
      ),
      m(
        'Lưu tổng của mọi đoạn đầu a[0..i−1] vào P[i]; một đoạn bất kỳ là hiệu của hai đoạn đầu.',
        'Store the sum of every prefix a[0..i−1] in P[i]; any range is the difference of two prefixes.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng P[0] là a[0]: thật ra P[0] = 0, tổng của không phần tử nào.',
        'Thinking P[0] is a[0]: actually P[0] = 0, the sum of no elements.',
      ),
    ],
  },
  {
    id: 'naive',
    label: m('Cách chậm', 'The slow way'),
    narration: m(
      'Cộng trực tiếp a[{l}..{r}] = {direct} cần {count} phép cộng. Với q truy vấn dài ta mất O(n·q).',
      'Adding a[{l}..{r}] directly gives {direct} and takes {count|addition|additions}. With q long queries that is O(n·q).',
    ),
    hints: [
      m(
        'Mỗi truy vấn cộng bao nhiêu phần tử trong trường hợp xấu nhất?',
        'How many elements does one query add in the worst case?',
      ),
      m(
        'Nếu đoạn dài gần n và có q truy vấn, tổng số phép cộng là bao nhiêu?',
        'If the range is almost n long and there are q queries, how many additions in total?',
      ),
      m(
        'Khoảng n·q phép cộng. Với n, q cỡ 10^5 là quá chậm: cần mỗi truy vấn O(1).',
        'About n·q additions. For n and q around 10^5 that is too slow: we want O(1) per query.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cộng trực tiếp luôn đủ nhanh vì máy tính nhanh; với n, q lớn thì không.',
        'Thinking direct summing is always fast enough; for large n and q it is not.',
      ),
    ],
  },
  {
    id: 'build',
    label: m('Dựng P', 'Build P'),
    narration: m(
      'Mỗi phần tử P[{j}] bằng phần tử trước cộng thêm a[{i}]: P[{j}] = {pi} + {ai} = {pn}.',
      'Each entry P[{j}] is the previous one plus a[{i}]: P[{j}] = {pi} + {ai} = {pn}.',
    ),
    hints: [
      m('P[i+1] là tổng của những phần tử nào của a?', 'Which elements of a does P[i+1] add up?'),
      m(
        'P[i+1] là tổng a[0..i]; P[i] là tổng a[0..i−1]. Hai số này khác nhau ở phần tử nào?',
        'P[i+1] is the sum a[0..i]; P[i] is the sum a[0..i−1]. Which element is the difference?',
      ),
      m(
        'Khác nhau đúng một phần tử a[i], nên P[i+1] = P[i] + a[i].',
        'They differ by exactly a[i], so P[i+1] = P[i] + a[i].',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng P[i] = a[0] + … + a[i]: ở đây P[i] chỉ tới a[i−1], nên P dài n + 1.',
        'Thinking P[i] = a[0] + … + a[i]: here P[i] stops at a[i−1], so P has n + 1 entries.',
      ),
    ],
  },
  {
    id: 'query',
    label: m('Truy vấn', 'Query'),
    narration: m(
      'Cần tổng a[{l}..{r}]. P[{r1}] là tổng mọi phần tử từ a[0] tới a[{r}]; phải bỏ đi phần đứng trước a[{l}].',
      'We need the sum of a[{l}..{r}]. P[{r1}] adds everything from a[0] to a[{r}]; we must remove the part before a[{l}].',
    ),
    ask: {
      text: m(
        'Tổng a[l..r] = P[r+1] − P[?]. Ô nào của P cần trừ đi?',
        'The sum of a[l..r] = P[r+1] − P[?]. Which entry of P do we subtract?',
      ),
      predict: {
        kind: 'choice',
        options: [m('P[l]', 'P[l]'), m('P[l − 1]', 'P[l − 1]')],
        answer: (frame, next) => {
          const l = frame.meta.vars?.l;
          return next?.meta.highlights?.[`r0:${l}`] === 'compare' ? 0 : 1;
        },
      },
    },
    hints: [
      m(
        'Phần cần bỏ gồm những phần tử nào của a?',
        'Which elements of a make up the part we must remove?',
      ),
      m(
        'Phần cần bỏ là a[0..l−1]. Tổng của nó nằm ở đâu trong P?',
        'The part to remove is a[0..l−1]. Where is its sum stored in P?',
      ),
      m(
        'P[i] là tổng a[0..i−1], nên tổng a[0..l−1] là P[l]. Đáp án: P[r+1] − P[l].',
        'P[i] is the sum a[0..i−1], so the sum a[0..l−1] is P[l]. The answer: P[r+1] − P[l].',
      ),
    ],
    misconceptions: [
      m(
        'Trừ P[l − 1]: khi l = 0 chỉ số −1 không tồn tại, và còn mất phần tử a[l − 1].',
        'Subtracting P[l − 1]: when l = 0 index −1 does not exist, and it also drops a[l − 1].',
      ),
      m(
        'Dùng P[r] thay cho P[r + 1]: sẽ thiếu mất a[r].',
        'Using P[r] instead of P[r + 1]: that would miss a[r].',
      ),
    ],
  },
  {
    id: 'answer',
    label: m('Đáp án', 'The answer'),
    narration: m(
      'Lấy P[{r1}] − P[{l}] = {hiP} − {loP} = {total}. Hai ô này cùng được dựng sẵn nên chỉ tốn một phép trừ.',
      'Take P[{r1}] − P[{l}] = {hiP} − {loP} = {total}. Both entries were prepared, so this is one subtraction.',
    ),
    hints: [
      m('Hai ô nào của P được dùng?', 'Which two entries of P are used?'),
      m(
        'Ô thứ nhất là P[r+1], ô thứ hai là P[l]; đọc giá trị của chúng trên hàng P.',
        'The first is P[r+1], the second is P[l]; read their values on row P.',
      ),
      m(
        'Lấy giá trị P[r+1] trừ giá trị P[l]; kết quả là tổng cần tìm.',
        'Subtract the value of P[l] from the value of P[r+1]; that is the sum we want.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải cộng lại các phần tử trong đoạn: P đã làm việc đó rồi.',
        'Thinking we must add the range up again: P already did that work.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tổng a[{l}..{r}] = {total}. Dựng P mất O(n) một lần; sau đó mỗi truy vấn chỉ O(1).',
      'The sum of a[{l}..{r}] is {total}. Building P costs O(n) once; after that each query is O(1).',
    ),
    hints: [
      m('Tổng chi phí khi có q truy vấn là gì?', 'What is the total cost with q queries?'),
      m('Dựng P tốn O(n); mỗi truy vấn tốn O(1).', 'Building P costs O(n); each query costs O(1).'),
      m(
        'Tổng O(n + q), tốt hơn nhiều so với O(n·q) của cách cộng trực tiếp.',
        'In total O(n + q), far better than the O(n·q) of direct summing.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng P chỉ dùng được cho một truy vấn: nó dùng lại cho mọi đoạn [l, r].',
        'Thinking P serves only one query: it is reused for every range [l, r].',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { values: a, l, r } = input;
  const n = a.length;
  const P: (number | null)[] = [0, ...Array<number | null>(n).fill(null)];
  const loP = a.slice(0, l).reduce((s, x) => s + x, 0);
  const hiP = a.slice(0, r + 1).reduce((s, x) => s + x, 0);

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    highlights: Record<string, HighlightKind>,
    pointers: Record<string, number>,
    tag?: string,
  ): void => {
    emit(
      { values: a, mode: 'cells', rows: [{ label: 'P', values: P, offset: 0 }] },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        pointers,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };
  const range = (kind: HighlightKind): Record<string, HighlightKind> => {
    const h: Record<string, HighlightKind> = {};
    for (let i = l; i <= r; i++) h[i] = kind;
    return h;
  };

  put(EX.start, 1, { l, r }, { 'r0:0': 'result' }, {}, 'start');
  put(
    EX.naive,
    4,
    { l, r, count: r - l + 1, direct: hiP - loP },
    range('active'),
    { l, r },
    'naive',
  );
  for (let i = 0; i < n; i++) {
    tick();
    const pi = P[i] as number;
    P[i + 1] = pi + a[i];
    put(
      EX.build,
      3,
      { i, j: i + 1, pi, ai: a[i], pn: pi + a[i] },
      { [i]: 'active', [`r0:${i}`]: 'compare', [`r0:${i + 1}`]: 'result' },
      { i },
      'build',
    );
  }
  put(
    EX.query,
    5,
    { l, r, r1: r + 1 },
    { ...range('active'), [`r0:${r + 1}`]: 'result' },
    { l, r },
    'query',
  );
  put(
    EX.answer,
    5,
    { l, r, r1: r + 1, hiP, loP, total: hiP - loP },
    { ...range('active'), [`r0:${r + 1}`]: 'result', [`r0:${l}`]: 'compare' },
    { l, r },
    'answer',
  );
  put(EX.done, 5, { l, r, total: hiP - loP }, range('result'), { l, r }, 'done');
}

export const prefixSumEntry: WalkthroughEntry<In, S> = {
  id: 'prefix-sum',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t1-array-prefix'],
  title: m('Mảng cộng dồn (prefix sum)', 'Prefix sums'),
  code: {
    pseudo: [
      'P[0] ← 0',
      'for i ← 0 .. n − 1:',
      '    P[i + 1] ← P[i] + a[i]',
      'query(l, r):',
      '    return P[r + 1] − P[l]',
    ],
    impl: {
      cpp: [
        'long long range_sum(const std::vector<int>& a, int l, int r) {',
        '    std::vector<long long> P(a.size() + 1, 0);',
        '    for (size_t i = 0; i < a.size(); i++) {',
        '        P[i + 1] = P[i] + a[i];',
        '    }',
        '    return P[r + 1] - P[l];',
        '}',
      ],
      py: [
        'def range_sum(a, l, r):',
        '    P = [0]',
        '    for x in a:',
        '        P.append(P[-1] + x)',
        '    return P[r + 1] - P[l]',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [1], 5: [6] },
      py: { 1: [2], 2: [3], 3: [4], 4: [1], 5: [5] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      values: { kind: 'int-array', len: [1, 10], range: [-99, 99] },
      l: { kind: 'int', range: [0, 9] },
      r: { kind: 'int', range: [0, 9] },
    },
  },
  check: (input) => {
    const issues: string[] = [];
    if (input.l > input.r) issues.push('l-after-r');
    if (input.r >= input.values.length) issues.push('r-out-of-range');
    return issues;
  },
  customInput: false,
  presets: [
    {
      id: 'basic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: { values: [3, 1, 4, 1, 5, 9, 2, 6], l: 2, r: 5 },
    },
    {
      id: 'whole',
      label: m('Cả mảng', 'The whole array'),
      input: { values: [3, 1, 4, 1, 5, 9, 2, 6], l: 0, r: 7 },
    },
    {
      id: 'one-cell',
      label: m('Một ô', 'A single cell'),
      input: { values: [3, 1, 4, 1, 5, 9, 2, 6], l: 3, r: 3 },
    },
    {
      id: 'negative',
      label: m('Có số âm', 'With negatives'),
      input: { values: [-2, 5, -1, 3, -4], l: 1, r: 3 },
    },
    {
      id: 'n1',
      label: m('Mảng một phần tử', 'Single element'),
      input: { values: [7], l: 0, r: 0 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'answer',
      text: m(
        'Lệch chỉ số: đáp án là P[r + 1] − P[l], không phải P[r] − P[l] hay P[r] − P[l − 1].',
        'Off-by-one: the answer is P[r + 1] − P[l], not P[r] − P[l] or P[r] − P[l − 1].',
      ),
    },
    {
      lang: 'cpp',
      beat: 'build',
      text: m(
        'Tổng lớn có thể vượt int: khai báo P là long long (tổng của 10^5 số tới 10^9 là 10^14).',
        'Large sums can overflow int: declare P as long long (10^5 numbers up to 10^9 sum to 10^14).',
      ),
    },
    {
      lang: 'py',
      beat: 'answer',
      text: m(
        'sum(a[l:r + 1]) trông gọn nhưng vẫn là O(n) mỗi truy vấn; muốn O(1) phải dùng P dựng sẵn.',
        'sum(a[l:r + 1]) looks short but is still O(n) per query; for O(1) use a prebuilt P.',
      ),
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
