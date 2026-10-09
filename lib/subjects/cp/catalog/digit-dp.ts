/**
 * Walkthrough entry: digit DP, counting the numbers in [0, N] whose digit sum is S
 * (SCHEMA §5, card 2E-03). The table g[r][s] counts r free digits with sum s (the non-tight state);
 * the tight prefix of N is walked separately. Deterministic and browser-safe: no Intl/Date/Math.random.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number; s: number };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const EX = {
  start: m(
    'Đếm số trong [0, {n}] có tổng chữ số {s}, theo từng vị trí chữ số. Hàng r của bảng là số cách điền r chữ số tự do.',
    'Count the numbers in [0, {n}] with digit sum {s}, position by position. Row r of the table counts ways to fill r free digits.',
  ),
  row: m(
    'Hàng {r}: g[{r}][t] = Σ g[{r1}][t − c] với c = 0..9: chữ số đầu tiên chọn c, {r1} chữ số còn lại tổng t − c.',
    'Row {r}: g[{r}][t] = Σ g[{r1}][t − c] for c = 0..9: the first digit picks c and the remaining {r1|digit|digits} sum to t − c.',
  ),
  digit: m(
    'Vị trí {i} của {n} (chữ số {di}), đã dùng tổng {pre}. Nếu còn bám sát N (tight), chữ số ở đây được chọn tối đa bằng bao nhiêu?',
    'Position {i} of {n} (digit {di}), used sum {pre}. While still tight to N, what is the largest digit allowed here?',
  ),
  brk: m(
    'Chọn c = {c} < {di}: thoát tight, {rem} chữ số sau tự do cần tổng {need}: g[{rem}][{need}] = {val}. Tổng đếm = {ans}.',
    'Pick c = {c} < {di}: leave tight, the {rem} later digits are free and need sum {need}: g[{rem}][{need}] = {val}. Count = {ans}.',
  ),
  brkNone: m(
    'Chọn c = {c} < {di}: tổng cần cho {rem} chữ số sau là {need} < 0: không có cách nào. Tổng đếm = {ans}.',
    'Pick c = {c} < {di}: the sum needed for the later {rem|digit|digits} is {need} < 0: no way. Count = {ans}.',
  ),
  next: m(
    'Giữ chữ số {di} bằng N (vẫn tight): tổng đã dùng thành {pre}.',
    'Keep the digit {di} equal to N (still tight): the used sum becomes {pre}.',
  ),
  self: m(
    'Cuối cùng chính N = {n} có tổng chữ số {pre}: {ver} Tổng đếm = {ans}.',
    'Finally N = {n} itself has digit sum {pre}: {ver} Count = {ans}.',
  ),
  done: m(
    'Có {ans} số trong [0, {n}] với tổng chữ số {s}. Chỉ cần bảng cỡ (số chữ số) × S thay vì duyệt N số.',
    'There are {ans|number|numbers} in [0, {n}] with digit sum {s}. A table of (number of digits) × S replaces visiting N numbers.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Đếm số trong [0, {n}] có tổng chữ số {s}. Với N tới 10^18 không thể duyệt hết; DP chữ số chia việc theo từng vị trí và nhớ "còn bao nhiêu chữ số tự do, cần tổng bao nhiêu".',
      'Count the numbers in [0, {n}] with digit sum {s}. For N up to 10^18 we cannot visit them all; digit DP splits the work by position and remembers "how many free digits remain and what sum they need".',
    ),
    hints: [
      m(
        'Khi đã chọn một chữ số nhỏ hơn chữ số của N, các chữ số sau bị ràng buộc không?',
        'After choosing a digit below the digit of N, are the later digits constrained?',
      ),
      m('Không: chúng tự do từ 0 tới 9.', 'No: they are free from 0 to 9.'),
      m(
        'Vậy chỉ cần số cách điền r chữ số tự do với tổng cho trước: bảng g.',
        'So we only need the number of ways to fill r free digits with a given sum: the table g.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải kiểm từng số: số số quá lớn; bảng chỉ có vài trăm ô.',
        'Thinking each number must be tested: there are far too many; the table has only a few hundred cells.',
      ),
    ],
  },
  {
    id: 'accumulate',
    label: m('Dựng bảng', 'Build the table'),
    narration: m(
      'g[r][t] đếm các chuỗi r chữ số (cho phép số 0 đứng đầu) có tổng t. Chữ số đầu chọn c từ 0 đến 9 thì còn r − 1 chữ số tổng t − c: cộng mười ô của hàng trên.',
      'g[r][t] counts strings of r digits (leading zeros allowed) with sum t. If the first digit is c from 0 to 9, r − 1 digits remain with sum t − c: add ten cells of the row above.',
    ),
    hints: [
      m('g[0][0] bằng bao nhiêu?', 'What is g[0][0]?'),
      m(
        '1: chuỗi rỗng có tổng 0, còn g[0][t] với t > 0 bằng 0.',
        '1: the empty string has sum 0, and g[0][t] for t > 0 is 0.',
      ),
      m(
        'g[r][t] = tổng g[r − 1][t − c] với c = 0..9 (t − c ≥ 0).',
        'g[r][t] = the sum of g[r − 1][t − c] for c = 0..9 (t − c ≥ 0).',
      ),
    ],
    misconceptions: [
      m(
        'Quên trường hợp t − c < 0: chỉ cộng các ô có chỉ số không âm.',
        'Forgetting the case t − c < 0: add only cells with a non-negative index.',
      ),
    ],
  },
  {
    id: 'digit',
    label: m('Chữ số bám sát N', 'The tight digit'),
    narration: m(
      'Đi qua các chữ số của N từ trái sang phải. Chừng nào các chữ số đã chọn trùng N (tight), chữ số ở vị trí {i} chỉ được chọn tới {di}, không quá chữ số của N.',
      'Walk through the digits of N from left to right. As long as the chosen digits equal N (tight), the digit at position {i} may go only up to {di}, not beyond the digit of N.',
    ),
    ask: {
      text: m(
        'Theo em, chữ số ở vị trí này được chọn tối đa bằng bao nhiêu?',
        'What is the largest digit allowed at this position?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Bằng chữ số của N ở vị trí đó', 'The digit of N at that position'),
          m('9', '9'),
          m('0', '0'),
        ],
        answer: (_frame, next) => (next ? 0 : -1),
      },
    },
    hints: [
      m(
        'Số ta xây phải không vượt N: so với chữ số của N ở vị trí này thì sao?',
        'The number we build must not exceed N: what about the digit of N here?',
      ),
      m(
        'Nếu các chữ số trước đã bằng N thì chữ số này không được lớn hơn chữ số của N.',
        'If the earlier digits equal N, this digit may not exceed the digit of N.',
      ),
      m(
        'Chọn đúng bằng thì còn tight; chọn nhỏ hơn thì thoát tight và các chữ số sau tự do.',
        'Choosing exactly equal keeps it tight; choosing less leaves tight and frees the later digits.',
      ),
    ],
    misconceptions: [
      m(
        'Cho phép chữ số tới 9 ngay cả khi còn tight: sẽ đếm cả số lớn hơn N.',
        'Allowing up to 9 even when still tight: that would count numbers above N.',
      ),
    ],
  },
  {
    id: 'tight-break',
    label: m('Thoát tight', 'Leave tight'),
    narration: m(
      'Chọn c nhỏ hơn chữ số {di} của N thì số đã chắc chắn nhỏ hơn N, nên {rem} chữ số sau tự do. Số cách là g[{rem}][tổng còn cần], đọc thẳng từ bảng.',
      'Choosing c below the digit {di} of N makes the number surely smaller than N, so the {rem} later digits are free. The count is g[{rem}][sum still needed], read straight from the table.',
    ),
    hints: [
      m(
        'Chọn nhỏ hơn thì các chữ số sau còn bị ràng buộc bởi N không?',
        'After choosing less, are the later digits still bound by N?',
      ),
      m('Không, chúng tự do: dùng bảng g.', 'No, they are free: use the table g.'),
      m(
        'Cần tổng còn lại S − (tổng đã dùng) − c; âm thì không có cách nào.',
        'The sum still needed is S − (sum used) − c; negative means no way.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ nhớ trạng thái tight trong bảng: ở đây bảng chỉ lưu trạng thái KHÔNG tight, phần tight đi bằng vòng lặp.',
        'Storing the tight state in the table: here the table keeps only the NOT tight state, the tight part is a loop.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Kết quả {ans}. Độ phức tạp cỡ (số chữ số) × S × 10: rất nhỏ so với N. Nhớ đếm cả chính N và số 0 nếu tổng của chúng bằng S.',
      'The result is {ans}. The cost is about (number of digits) × S × 10, tiny compared with N. Remember to count N itself and the number 0 when their sum equals S.',
    ),
    hints: [
      m('Chi phí phụ thuộc vào N thế nào?', 'How does the cost depend on N?'),
      m(
        'Chỉ qua số chữ số của N (logarit), không phải N.',
        'Only through the number of digits of N (a logarithm), not N.',
      ),
      m(
        'Đừng quên chính N và số 0: chúng nằm trong đoạn [0, N].',
        'Do not forget N itself and 0: both lie in [0, N].',
      ),
    ],
    misconceptions: [
      m(
        'Quên đếm N: vòng chỉ đếm các số nhỏ hơn N, nên cần kiểm riêng N.',
        'Forgetting to count N: the loop counts numbers below N, so N must be checked separately.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n, s } = input;
  const digits = Array.from(String(n), Number);
  const L = digits.length;
  const g: (number | undefined)[][] = Array.from({ length: L + 1 }, () =>
    Array<number | undefined>(s + 1).fill(undefined),
  );
  const key = (r: number, t: number): string => `${r},${t}`;
  let ans = 0;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    emit(
      {
        rows: L + 1,
        cols: s + 1,
        cells: g.map((row) => row.map((x) => (x === undefined ? '' : x))),
        rowLabels: Array.from({ length: L + 1 }, (_, r) => `r=${r}`),
        colLabels: Array.from({ length: s + 1 }, (_, t) => String(t)),
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

  put(EX.start, 1, { n, s }, {}, 'start');
  g[0][0] = 1;
  for (let t = 1; t <= s; t++) g[0][t] = 0;
  put(EX.row, 1, { r: 0, r1: 0 }, { [key(0, 0)]: 'result' }, 'accumulate');
  for (let r = 1; r <= L; r++) {
    tick();
    for (let t = 0; t <= s; t++) {
      let sum = 0;
      for (let c = 0; c <= 9 && c <= t; c++) sum += g[r - 1][t - c] as number;
      g[r][t] = sum;
    }
    put(
      EX.row,
      2,
      { r, r1: r - 1 },
      Object.fromEntries(
        Array.from({ length: s + 1 }, (_, t) => [key(r, t), 'visited' as HighlightKind]),
      ),
      'accumulate',
    );
  }
  let pre = 0;
  for (let i = 0; i < L; i++) {
    tick();
    const di = digits[i];
    const rem = L - i - 1;
    put(EX.digit, 3, { i, n, di, pre }, {}, 'digit');
    for (let c = 0; c < di; c++) {
      const need = s - pre - c;
      if (need >= 0) {
        const val = g[rem][need] as number;
        ans += val;
        put(
          EX.brk,
          4,
          { c, di, rem, need, val, ans },
          { [key(rem, need)]: 'active' },
          'tight-break',
        );
      } else {
        put(EX.brkNone, 4, { c, di, rem, need, ans }, {}, 'tight-break');
      }
    }
    pre += di;
    put(EX.next, 5, { di, pre }, {});
  }
  const ver =
    pre === s
      ? msg(m('bằng S, cộng thêm 1.', 'equals S, add 1.'), ctx.locale)
      : msg(m('khác S, không cộng.', 'differs from S, add nothing.'), ctx.locale);
  if (pre === s) ans++;
  put(EX.self, 6, { n, pre, ver, ans }, {}, undefined);
  put(EX.done, 6, { ans, n, s }, {}, 'done');
}

export const digitDpEntry: WalkthroughEntry<In, S> = {
  id: 'digit-dp',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t4-dp-digit'],
  title: m('DP chữ số: đếm số có tổng chữ số cho trước', 'Digit DP: counting numbers by digit sum'),
  code: {
    pseudo: [
      'g[0][0] ← 1',
      'g[r][t] ← Σ g[r − 1][t − c] với c = 0..9  (r chữ số tự do, tổng t)',
      'for vị trí i của N (trái sang phải), pre ← tổng các chữ số đã đi theo N:',
      '    for c < N[i]: ans ← ans + g[còn lại][S − pre − c]   (chọn nhỏ hơn: thoát tight)',
      '    pre ← pre + N[i]',
      'ans ← ans + (pre = S ? 1 : 0)  (chính N); return ans',
    ],
    impl: {
      cpp: [
        'int count_digit_sum(int n, int s) {',
        '    std::string d = std::to_string(n);',
        '    int L = d.size();',
        '    std::vector<std::vector<int>> g(L + 1, std::vector<int>(s + 1, 0));',
        '    g[0][0] = 1;',
        '    for (int r = 1; r <= L; r++)',
        '        for (int t = 0; t <= s; t++)',
        '            for (int c = 0; c <= 9 && c <= t; c++) g[r][t] += g[r - 1][t - c];',
        '    int ans = 0, pre = 0;',
        '    for (int i = 0; i < L; i++) {',
        "        int di = d[i] - '0';",
        '        for (int c = 0; c < di; c++)',
        '            if (s - pre - c >= 0) ans += g[L - i - 1][s - pre - c];',
        '        pre += di;',
        '    }',
        '    if (pre == s) ans++;',
        '    return ans;',
        '}',
      ],
      py: [
        'def count_digit_sum(n, s):',
        '    d = [int(ch) for ch in str(n)]',
        '    L = len(d)',
        '    g = [[0] * (s + 1) for _ in range(L + 1)]',
        '    g[0][0] = 1',
        '    for r in range(1, L + 1):',
        '        for t in range(s + 1):',
        '            for c in range(min(9, t) + 1):',
        '                g[r][t] += g[r - 1][t - c]',
        '    ans, pre = 0, 0',
        '    for i in range(L):',
        '        for c in range(d[i]):',
        '            if s - pre - c >= 0:',
        '                ans += g[L - i - 1][s - pre - c]',
        '        pre += d[i]',
        '    if pre == s:',
        '        ans += 1',
        '    return ans',
      ],
    },
    map: {
      cpp: { 1: [5], 2: [6, 7, 8], 3: [9, 10, 11], 4: [12, 13], 5: [14], 6: [16, 17] },
      py: { 1: [4, 5], 2: [6, 7, 8, 9], 3: [10, 11], 4: [12, 13, 14], 5: [15], 6: [16, 17, 18] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { n: { kind: 'int', range: [0, 999] }, s: { kind: 'int', range: [0, 12] } },
  },
  customInput: false,
  presets: [
    { id: 'n999-s5', label: m('N = 999, S = 5', 'N = 999, S = 5'), input: { n: 999, s: 5 } },
    { id: 'n0-s0', label: m('Biên N = 0, S = 0', 'Edge N = 0, S = 0'), input: { n: 0, s: 0 } },
    { id: 'n100-s1', label: m('N = 100, S = 1', 'N = 100, S = 1'), input: { n: 100, s: 1 } },
    { id: 'n345-s12', label: m('N = 345, S = 12', 'N = 345, S = 12'), input: { n: 345, s: 12 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'tight-break',
      text: m(
        'Cờ tight: bảng chỉ lưu trạng thái KHÔNG tight; phần bám sát N đi bằng vòng lặp qua các chữ số. Đừng quên đếm chính N và số 0.',
        'The tight flag: the table stores only the NOT tight state; the part following N is a loop over its digits. Do not forget to count N itself and 0.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'accumulate',
      text: m(
        'Chỉ cộng g[r − 1][t − c] khi t − c ≥ 0 (điều kiện c ≤ t); chỉ số âm là hành vi không xác định.',
        'Add g[r − 1][t − c] only when t − c ≥ 0 (the condition c ≤ t); a negative index is undefined behaviour.',
      ),
    },
    {
      lang: 'py',
      beat: 'accumulate',
      text: m(
        'Chỉ số âm của list Python không báo lỗi mà lấy từ cuối: dùng range(min(9, t) + 1) để c ≤ t.',
        'A negative Python list index does not fail but wraps from the end: use range(min(9, t) + 1) so c ≤ t.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
