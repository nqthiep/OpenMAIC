/**
 * Walkthrough entry: longest common subsequence by dynamic programming (SCHEMA §5, card 2B-10).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { a: string; b: string };
type S = {
  rows: number;
  cols: number;
  cells: (number | string)[][];
  rowLabels: string[];
  colLabels: string[];
  arrows: { from: string; to: string }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Tìm dãy con chung dài nhất của a và b. dp[i][j] = độ dài LCS của i ký tự đầu của a và j ký tự đầu của b (nhãn hàng: a, nhãn cột: b).',
    'Find the longest common subsequence of a and b. dp[i][j] = the LCS length of the first i characters of a and the first j of b (row labels: a, column labels: b).',
  ),
  base: m(
    'Hàng 0 và cột 0: một xâu rỗng thì LCS với xâu nào cũng có độ dài 0. Mọi ô còn lại tính từ ba ô lân cận.',
    'Row 0 and column 0: an empty string has an LCS of length 0 with anything. Every other cell comes from three neighbours.',
  ),
  ask: m(
    'Ô dp[{i}][{j}]: a[{i}] = {ca} và b[{j}] = {cb} giống nhau. Giá trị ô này lấy từ ô nào?',
    'Cell dp[{i}][{j}]: a[{i}] = {ca} and b[{j}] = {cb} are equal. Which cell does its value come from?',
  ),
  match: m(
    '{ca} = {cb}: dp[{i}][{j}] = dp[{i1}][{j1}] + 1 = {diag} + 1 = {val}. Ký tự này nằm trong LCS.',
    '{ca} = {cb}: dp[{i}][{j}] = dp[{i1}][{j1}] + 1 = {diag} + 1 = {val}. This character is part of the LCS.',
  ),
  mismatch: m(
    '{ca} ≠ {cb}: dp[{i}][{j}] = max(trên {up}, trái {left}) = {val}.',
    '{ca} ≠ {cb}: dp[{i}][{j}] = max(above {up}, left {left}) = {val}.',
  ),
  traceMatch: m(
    'Truy vết ({i}, {j}): {ca} = {cb}, lấy ký tự này vào LCS và đi chéo lên ({i1}, {j1}).',
    'Trace ({i}, {j}): {ca} = {cb}, take this character into the LCS and step diagonally to ({i1}, {j1}).',
  ),
  traceUp: m(
    'Truy vết ({i}, {j}): ô trên {up} ≥ ô trái {left}, đi lên ({i1}, {j}).',
    'Trace ({i}, {j}): above {up} ≥ left {left}, step up to ({i1}, {j}).',
  ),
  traceLeft: m(
    'Truy vết ({i}, {j}): ô trên {up} < ô trái {left}, đi sang trái ({i}, {j1}).',
    'Trace ({i}, {j}): above {up} < left {left}, step left to ({i}, {j1}).',
  ),
  doneSome: m(
    'LCS dài {len}: "{lcs}" (ghép các ký tự lấy khi truy vết, theo thứ tự ngược lại).',
    'The LCS has length {len}: "{lcs}" (the characters taken while tracing, in reverse order).',
  ),
  doneNone: m(
    'LCS dài 0: hai xâu không có ký tự chung nào.',
    'The LCS has length 0: the two strings share no character.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Dãy con của một xâu là các ký tự giữ nguyên thứ tự nhưng có thể bỏ bớt. LCS là dãy con dài nhất của cả a và b. Ta lập bảng dp cỡ ({la} + 1) × ({lb} + 1).',
      'A subsequence keeps the characters in order but may drop some. The LCS is the longest subsequence of both a and b. We build a dp table of ({la} + 1) × ({lb} + 1).',
    ),
    hints: [
      m(
        'Thử mọi dãy con của a rồi kiểm có là dãy con của b: có bao nhiêu dãy con của a?',
        'Trying every subsequence of a and checking it against b: how many subsequences does a have?',
      ),
      m(
        '2^|a| dãy con: quá nhiều. Hãy chia bài toán theo tiền tố của a và b.',
        '2^|a| subsequences: too many. Split the problem by prefixes of a and b.',
      ),
      m(
        'dp[i][j] cho tiền tố i của a và tiền tố j của b; ô cuối là đáp án.',
        'dp[i][j] for the prefix of length i of a and length j of b; the last cell is the answer.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm dãy con với xâu con: dãy con không cần các ký tự liền nhau.',
        'Mixing up a subsequence with a substring: a subsequence need not be contiguous.',
      ),
    ],
  },
  {
    id: 'base',
    label: m('Hàng và cột cơ sở', 'Base row and column'),
    narration: m(
      'Hàng 0 ứng với tiền tố rỗng của a, cột 0 ứng với tiền tố rỗng của b. Xâu rỗng không có ký tự chung nào nên các ô này đều là 0.',
      'Row 0 stands for the empty prefix of a, column 0 for the empty prefix of b. An empty string shares no character, so these cells are 0.',
    ),
    hints: [
      m(
        'LCS của một xâu rỗng với một xâu bất kỳ dài bao nhiêu?',
        'How long is the LCS of an empty string and any string?',
      ),
      m(
        'Bằng 0, vì dãy con chung phải nằm trong xâu rỗng.',
        'Zero, because a common subsequence has to fit inside the empty string.',
      ),
      m(
        'Điền 0 vào hàng 0 và cột 0; các ô còn lại dùng chúng làm điểm tựa.',
        'Fill 0 into row 0 and column 0; the other cells lean on them.',
      ),
    ],
    misconceptions: [
      m(
        'Bắt đầu bảng từ hàng 1 mà không có hàng/cột 0: ô đầu tiên sẽ thiếu ô chéo để tựa vào.',
        'Starting the table at row 1 without row/column 0: the first cell would have no diagonal neighbour.',
      ),
    ],
  },
  {
    id: 'match',
    label: m('Hai ký tự bằng nhau', 'Equal characters'),
    narration: m(
      'Nếu a[i] = b[j] thì ký tự chung này kéo dài LCS của hai tiền tố ngắn hơn một ký tự: dp[i][j] = dp[i − 1][j − 1] + 1, lấy từ ô chéo.',
      'If a[i] = b[j] this common character extends the LCS of the two prefixes one character shorter: dp[i][j] = dp[i − 1][j − 1] + 1, from the diagonal cell.',
    ),
    ask: {
      text: m(
        'Theo em, khi a[i] = b[j], giá trị lấy từ ô nào?',
        'When a[i] = b[j], which cell does the value come from?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Ô chéo, cộng 1', 'The diagonal cell, plus 1'),
          m('max(ô trên, ô trái)', 'max(above, left)'),
        ],
        answer: (_frame, next) => (next ? 0 : -1),
      },
    },
    hints: [
      m(
        'Hai ký tự cuối bằng nhau: có nên dùng chúng làm ký tự cuối của dãy con chung không?',
        'The last two characters are equal: should they be the last character of the common subsequence?',
      ),
      m(
        'Có, và phần còn lại là LCS của hai tiền tố bỏ ký tự cuối: ô chéo.',
        'Yes, and the rest is the LCS of the two prefixes without the last character: the diagonal cell.',
      ),
      m('dp[i][j] = dp[i − 1][j − 1] + 1.', 'dp[i][j] = dp[i − 1][j − 1] + 1.'),
    ],
    misconceptions: [
      m(
        'Lấy max(trên, trái) cả khi hai ký tự bằng nhau: sẽ bỏ lỡ ký tự chung này và cho kết quả nhỏ hơn.',
        'Taking max(above, left) even when the characters match: that misses the common character and gives too small an answer.',
      ),
    ],
  },
  {
    id: 'mismatch',
    label: m('Hai ký tự khác nhau', 'Different characters'),
    narration: m(
      'Hai ký tự {ca} và {cb} khác nhau nên không thể cùng ở cuối dãy con chung. Ta bỏ ký tự cuối của a hoặc của b và lấy phương án tốt hơn: max(trên, trái) = {val}.',
      'The characters {ca} and {cb} differ, so they cannot both end the common subsequence. We drop the last of a or of b and take the better option: max(above, left) = {val}.',
    ),
    hints: [
      m(
        'Khi hai ký tự cuối khác nhau, có thể cả hai cùng nằm trong dãy con chung không?',
        'When the last two characters differ, can both be in the common subsequence?',
      ),
      m(
        'Không: ít nhất một trong chúng phải bị bỏ. Có hai khả năng.',
        'No: at least one of them must be dropped. There are two cases.',
      ),
      m(
        'Bỏ ký tự cuối của a (ô trên) hoặc của b (ô trái); lấy giá trị lớn hơn.',
        'Drop the last of a (the cell above) or of b (the cell to the left); take the larger.',
      ),
    ],
    misconceptions: [
      m(
        'Đặt ô bằng 0 khi hai ký tự khác nhau: LCS các tiền tố ngắn hơn vẫn có thể dài.',
        'Setting the cell to 0 when the characters differ: the LCS of the shorter prefixes can still be long.',
      ),
    ],
  },
  {
    id: 'traceback',
    label: m('Truy vết', 'Traceback'),
    narration: m(
      'Bảng cho độ dài; để lấy chính dãy ta đi ngược từ ô cuối: ký tự bằng nhau thì lấy và đi chéo, khác nhau thì đi về ô có giá trị lớn hơn.',
      'The table gives the length; to recover the sequence itself we walk back from the last cell: equal characters are taken and we step diagonally, otherwise we step to the larger neighbour.',
    ),
    hints: [
      m(
        'Từ ô (i, j), ta biết giá trị của nó đến từ ô nào không?',
        'From cell (i, j), do we know which neighbour its value came from?',
      ),
      m(
        'Bằng nhau thì đến từ ô chéo; khác nhau thì từ ô trên hoặc trái, ô nào có giá trị bằng nó.',
        'If equal, from the diagonal; if different, from above or left, whichever has the same value.',
      ),
      m(
        'Đi ngược tới khi i = 0 hoặc j = 0, gom các ký tự đã lấy rồi đảo ngược lại.',
        'Walk back until i = 0 or j = 0, collect the characters taken, then reverse them.',
      ),
    ],
    misconceptions: [
      m(
        'Quên đảo ngược: các ký tự thu được khi đi ngược nằm theo thứ tự ngược của dãy con.',
        'Forgetting to reverse: the characters gathered while walking back are in reverse order.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'LCS dài {len}. Bảng có |a|·|b| ô, mỗi ô O(1): thời gian và bộ nhớ O(|a|·|b|), tốt hơn nhiều so với 2^|a|.',
      'The LCS has length {len}. The table has |a|·|b| cells, each O(1): time and memory O(|a|·|b|), far better than 2^|a|.',
    ),
    hints: [
      m(
        'Có bao nhiêu ô và mỗi ô tính mất bao lâu?',
        'How many cells are there and how long does each take?',
      ),
      m('(|a| + 1)(|b| + 1) ô, mỗi ô O(1).', '(|a| + 1)(|b| + 1) cells, each O(1).'),
      m(
        'O(|a|·|b|) thời gian; nếu chỉ cần độ dài, giữ hai hàng là đủ.',
        'O(|a|·|b|) time; if only the length is needed, two rows are enough.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng LCS là duy nhất: có thể có nhiều dãy con chung dài nhất khác nhau.',
        'Thinking the LCS is unique: there can be several different longest common subsequences.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const A = Array.from(input.a);
  const B = Array.from(input.b);
  const la = A.length;
  const lb = B.length;
  const dp: (number | undefined)[][] = Array.from({ length: la + 1 }, () =>
    Array<number | undefined>(lb + 1).fill(undefined),
  );
  const key = (r: number, c: number): string => `${r},${c}`;
  const rowLabels = ['·', ...A];
  const colLabels = ['·', ...B];

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
        rows: la + 1,
        cols: lb + 1,
        cells: dp.map((row) => row.map((x) => (x === undefined ? '' : x))),
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

  put(EX.start, 1, { la, lb }, {}, [], 'start');
  for (let i = 0; i <= la; i++) dp[i][0] = 0;
  for (let j = 0; j <= lb; j++) dp[0][j] = 0;
  const border: Record<string, HighlightKind> = {};
  for (let i = 0; i <= la; i++) border[key(i, 0)] = 'visited';
  for (let j = 0; j <= lb; j++) border[key(0, j)] = 'visited';
  put(EX.base, 1, {}, border, [], 'base');

  for (let i = 1; i <= la; i++) {
    let asked = false;
    for (let j = 1; j <= lb; j++) {
      tick();
      const ca = A[i - 1];
      const cb = B[j - 1];
      const diag = dp[i - 1][j - 1] as number;
      const up = dp[i - 1][j] as number;
      const left = dp[i][j - 1] as number;
      if (ca === cb) {
        if (!asked) {
          asked = true;
          put(EX.ask, 3, { i, j, ca, cb }, { [key(i, j)]: 'active' }, [], 'match');
        }
        dp[i][j] = diag + 1;
        put(
          EX.match,
          3,
          { i, j, ca, cb, i1: i - 1, j1: j - 1, diag, val: diag + 1 },
          { [key(i, j)]: 'result', [key(i - 1, j - 1)]: 'compare' },
          [{ from: key(i - 1, j - 1), to: key(i, j) }],
        );
      } else {
        dp[i][j] = Math.max(up, left);
        put(
          EX.mismatch,
          4,
          { i, j, ca, cb, up, left, val: dp[i][j] as number },
          { [key(i, j)]: 'active', [key(i - 1, j)]: 'compare', [key(i, j - 1)]: 'compare' },
          [
            { from: key(i - 1, j), to: key(i, j) },
            { from: key(i, j - 1), to: key(i, j) },
          ],
          'mismatch',
        );
      }
    }
  }

  // traceback from the last cell
  const path: Record<string, HighlightKind> = {};
  const taken: string[] = [];
  let i = la;
  let j = lb;
  path[key(i, j)] = 'result';
  while (i > 0 && j > 0) {
    tick();
    const ca = A[i - 1];
    const cb = B[j - 1];
    const up = dp[i - 1][j] as number;
    const left = dp[i][j - 1] as number;
    if (ca === cb) {
      taken.push(ca);
      path[key(i - 1, j - 1)] = 'result';
      put(EX.traceMatch, 5, { i, j, ca, cb, i1: i - 1, j1: j - 1 }, path, [], 'traceback');
      i--;
      j--;
    } else if (up >= left) {
      path[key(i - 1, j)] = 'result';
      put(EX.traceUp, 5, { i, j, up, left, i1: i - 1 }, path, [], 'traceback');
      i--;
    } else {
      path[key(i, j - 1)] = 'result';
      put(EX.traceLeft, 5, { i, j, up, left, j1: j - 1 }, path, [], 'traceback');
      j--;
    }
  }
  const lcs = taken.reverse().join('');
  put(
    lcs.length > 0 ? EX.doneSome : EX.doneNone,
    5,
    lcs.length > 0 ? { len: lcs.length, lcs } : { len: 0 },
    path,
    [],
    'done',
  );
}

export const lcsEntry: WalkthroughEntry<In, S> = {
  id: 'lcs',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t3-dp-basic'],
  title: m('Dãy con chung dài nhất (LCS)', 'Longest common subsequence (LCS)'),
  code: {
    pseudo: [
      'dp[0][*] ← 0; dp[*][0] ← 0',
      'for i ← 1 .. |a|:  for j ← 1 .. |b|:',
      '    if a[i] = b[j]: dp[i][j] ← dp[i − 1][j − 1] + 1',
      '    else: dp[i][j] ← max(dp[i − 1][j], dp[i][j − 1])',
      'return dp[|a|][|b|]   (truy vết từ ô này để lấy dãy)',
    ],
    impl: {
      cpp: [
        'int lcs(const std::string& a, const std::string& b) {',
        '    int la = a.size(), lb = b.size();',
        '    std::vector<std::vector<int>> dp(la + 1, std::vector<int>(lb + 1, 0));',
        '    for (int i = 1; i <= la; i++) {',
        '        for (int j = 1; j <= lb; j++) {',
        '            if (a[i - 1] == b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;',
        '            else dp[i][j] = std::max(dp[i - 1][j], dp[i][j - 1]);',
        '        }',
        '    }',
        '    return dp[la][lb];',
        '}',
      ],
      py: [
        'def lcs(a, b):',
        '    la, lb = len(a), len(b)',
        '    dp = [[0] * (lb + 1) for _ in range(la + 1)]',
        '    for i in range(1, la + 1):',
        '        for j in range(1, lb + 1):',
        '            if a[i - 1] == b[j - 1]:',
        '                dp[i][j] = dp[i - 1][j - 1] + 1',
        '            else:',
        '                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])',
        '    return dp[la][lb]',
      ],
    },
    map: {
      cpp: { 1: [3], 2: [4, 5], 3: [6], 4: [7], 5: [10] },
      py: { 1: [3], 2: [4, 5], 3: [6, 7], 4: [8, 9], 5: [10] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      a: { kind: 'string', len: [1, 6], alphabet: 'a-z' },
      b: { kind: 'string', len: [1, 6], alphabet: 'a-z' },
    },
  },
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: m('Ví dụ chuẩn', 'Standard example'),
      input: { a: 'abcbda', b: 'bdcaba' },
    },
    {
      id: 'same',
      label: m('Hai xâu giống nhau', 'Identical strings'),
      input: { a: 'abc', b: 'abc' },
    },
    {
      id: 'disjoint',
      label: m('Không ký tự chung', 'No common character'),
      input: { a: 'abc', b: 'xyz' },
    },
    { id: 'single', label: m('Một ký tự', 'One character'), input: { a: 'a', b: 'a' } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'match',
      text: m(
        'dp[i][j] là độ dài LCS của TIỀN TỐ i và j ký tự, nên ký tự tương ứng là a[i − 1] và b[j − 1] (lệch một chỉ số).',
        'dp[i][j] is the LCS length of the PREFIXES of i and j characters, so the matching characters are a[i − 1] and b[j − 1] (off by one).',
      ),
    },
    {
      lang: 'cpp',
      beat: 'start',
      text: m(
        'Bảng cần (la + 1) × (lb + 1) ô; khai báo la × lb sẽ truy cập ngoài biên ở hàng/cột 0.',
        'The table needs (la + 1) × (lb + 1) cells; declaring la × lb reads out of bounds at row/column 0.',
      ),
    },
    {
      lang: 'py',
      beat: 'start',
      text: m(
        'Tạo bảng bằng [[0] * (lb + 1) for _ in range(la + 1)]; [[0] * (lb + 1)] * (la + 1) làm mọi hàng là cùng một list.',
        'Build the table with [[0] * (lb + 1) for _ in range(la + 1)]; [[0] * (lb + 1)] * (la + 1) makes every row the same list.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
