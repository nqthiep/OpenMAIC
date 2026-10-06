/**
 * Walkthrough entry: Knuth–Morris–Pratt, the failure function and the search (SCHEMA §5, card 2E-01).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { text: string; pattern: string };
type Row = { label: string; values: (number | string | null)[]; offset: number };
type S = { values: string[]; mode: 'cells'; rows: Row[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
const ASKED_JUMPS = 2;
const ASKED_FAILS = 2;

const EX = {
  start: m(
    'Tìm "{p}" trong "{t}" mà không lùi con trỏ text. Trước hết tính fail[i] = tiền tố thực sự dài nhất của mẫu cũng là hậu tố của p[0..i].',
    'Find "{p}" in "{t}" without moving the text pointer back. First fail[i] = the longest proper prefix of the pattern that is also a suffix of p[0..i].',
  ),
  askFail: m(
    'Tính fail[{i}] cho p[0..{i}] = "{pre}". Tiền tố thực sự dài nhất cũng là hậu tố của xâu này có độ dài bao nhiêu?',
    'Compute fail[{i}] for p[0..{i}] = "{pre}". How long is its longest proper prefix that is also a suffix?',
  ),
  fail: m(
    'fail[{i}] = {f}: tiền tố dài {f} của mẫu trùng với hậu tố của "{pre}".',
    'fail[{i}] = {f}: the prefix of length {f} of the pattern equals a suffix of "{pre}".',
  ),
  match: m(
    't[{i}] = {c} = p[{j0}]: khớp, j tăng lên {j}. Mẫu đang đặt ở vị trí {s}.',
    't[{i}] = {c} = p[{j0}]: a match, j grows to {j}. The pattern sits at position {s}.',
  ),
  askJump: m(
    't[{i}] = {c} ≠ p[{j}] sau khi đã khớp {j} ký tự. Ta lùi j về đâu, mà không lùi con trỏ text?',
    't[{i}] = {c} ≠ p[{j}] after {j} matched characters. Where does j fall back to, without moving the text pointer back?',
  ),
  jump: m(
    'j ← fail[{j0}] = {j}: bỏ phần đầu của mẫu đã khớp, giữ phần tiền tố vẫn còn khớp.',
    'j ← fail[{j0}] = {j}: drop the head of the matched part and keep the prefix that still matches.',
  ),
  miss: m(
    't[{i}] = {c} ≠ p[0] và j = 0: không khớp, con trỏ text tiến tiếp.',
    't[{i}] = {c} ≠ p[0] and j = 0: no match, the text pointer moves on.',
  ),
  found: m(
    'j = {m}: tìm thấy mẫu bắt đầu ở vị trí {pos}. Đã có {count} lần; đặt j ← fail[{m1}] = {j} để tìm tiếp (cho phép chồng lấn).',
    'j = {m}: the pattern is found starting at position {pos}. {count} so far; set j ← fail[{m1}] = {j} to go on (overlaps allowed).',
  ),
  done: m(
    'Có {count} lần xuất hiện. Mỗi ký tự text được xét một lần và j chỉ lùi bằng số lần nó đã tăng: O(n + m).',
    'There are {count} occurrences. Each text character is read once and j falls back only as often as it grew: O(n + m).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'So khớp ngây thơ lùi con trỏ text mỗi khi sai, tốn O(n·m). KMP dùng hàm fail của mẫu "{p}" để không bao giờ lùi: O(n + m).',
      'Naive matching moves the text pointer back on every mismatch, O(n·m). KMP uses the failure function of the pattern "{p}" to never move back: O(n + m).',
    ),
    hints: [
      m(
        'Khi sai sau khi đã khớp một đoạn, ta đã biết gì về text?',
        'After a mismatch following a partial match, what do we already know about the text?',
      ),
      m(
        'Ta biết đoạn text vừa khớp bằng đầu mẫu; một phần của nó có thể vẫn là đầu mẫu.',
        'We know the text just matched the head of the pattern; part of it may still be a head of the pattern.',
      ),
      m(
        'fail[i] cho biết phần đó dài bao nhiêu, nên ta chỉ lùi j trong mẫu.',
        'fail[i] says how long that part is, so we only move j back in the pattern.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng KMP nhanh vì so sánh ít ký tự hơn mỗi bước: nó nhanh vì không so lại ký tự text đã khớp.',
        'Thinking KMP is fast because it compares fewer characters per step: it is fast because it never re-reads matched text.',
      ),
    ],
  },
  {
    id: 'build-fail',
    label: m('Dựng fail', 'Build fail'),
    narration: m(
      'fail[i] là độ dài tiền tố thực sự dài nhất của mẫu cũng là hậu tố của p[0..i]. Ta tính từ trái sang phải, tái dùng giá trị đã có bằng chính cách so khớp mẫu với bản thân nó.',
      'fail[i] is the length of the longest proper prefix of the pattern that is also a suffix of p[0..i]. We compute it left to right, reusing earlier values by matching the pattern against itself.',
    ),
    ask: {
      text: m('Theo em, fail[i] bằng bao nhiêu?', 'What is fail[i]?'),
      predict: {
        kind: 'choice',
        options: [m('0', '0'), m('1', '1'), m('2', '2'), m('3 trở lên', '3 or more')],
        answer: (_frame, next) => {
          const f = next?.meta.vars?.f;
          return typeof f === 'number' ? Math.min(f, 3) : -1;
        },
      },
    },
    hints: [
      m(
        'Viết các tiền tố thực sự và hậu tố của xâu rồi tìm cặp bằng nhau dài nhất.',
        'List the proper prefixes and suffixes of the string and find the longest equal pair.',
      ),
      m(
        'Tiền tố thực sự là tiền tố ngắn hơn cả xâu; "abab" có tiền tố "ab" trùng hậu tố "ab".',
        'A proper prefix is shorter than the whole string; "abab" has the prefix "ab" equal to its suffix "ab".',
      ),
      m(
        'Dùng k đang giữ fail[i − 1]: khớp p[i] với p[k], sai thì k ← fail[k − 1] (while).',
        'Use k holding fail[i − 1]: match p[i] against p[k], on a mismatch k ← fail[k − 1] (a while).',
      ),
    ],
    misconceptions: [
      m(
        'Tính cả tiền tố bằng chính xâu: tiền tố phải THỰC SỰ ngắn hơn, không thì fail luôn bằng độ dài.',
        'Counting the whole string as a prefix: the prefix must be PROPER, otherwise fail would always equal the length.',
      ),
    ],
  },
  {
    id: 'match',
    label: m('Khớp một ký tự', 'Match a character'),
    narration: m(
      'Ký tự text {c} bằng ký tự mẫu ở vị trí j, nên khớp thêm một ký tự: j tăng lên {j}. Con trỏ text luôn chỉ tiến.',
      'The text character {c} equals the pattern character at j, so one more character matches: j grows to {j}. The text pointer only moves forward.',
    ),
    hints: [
      m('Hai ký tự bằng nhau thì làm gì?', 'What do we do when two characters are equal?'),
      m('Tăng j để so ký tự kế tiếp của mẫu.', 'Raise j to compare the next pattern character.'),
      m(
        'Khi j bằng độ dài mẫu thì đã tìm thấy một lần xuất hiện.',
        'When j equals the pattern length one occurrence is found.',
      ),
    ],
    misconceptions: [
      m(
        'Đặt lại j = 0 khi sai: mất phần đã khớp có ích, đó là cách ngây thơ.',
        'Resetting j = 0 on a mismatch: that throws away useful matched part, the naive way.',
      ),
    ],
  },
  {
    id: 'jump',
    label: m('Lùi j', 'Fall back j'),
    narration: m(
      'Sai ở ký tự thứ {j}: không lùi con trỏ text mà đặt j = fail[j − 1], độ dài tiền tố dài nhất vẫn khớp với đuôi text vừa đọc, rồi thử lại. Dùng while vì có thể phải lùi nhiều lần.',
      'A mismatch at character {j}: instead of moving the text pointer back we set j = fail[j − 1], the longest prefix that still matches the text tail just read, then retry. Use a while since several falls may be needed.',
    ),
    ask: {
      text: m('Theo em, j lùi về đâu?', 'Where does j fall back to?'),
      predict: {
        kind: 'choice',
        options: [
          m('j = 0', 'j = 0'),
          m('j = fail[j − 1]', 'j = fail[j − 1]'),
          m('j = j − 1', 'j = j − 1'),
        ],
        answer: (_frame, next) => (next ? 1 : -1),
      },
    },
    hints: [
      m(
        'Đoạn text đã khớp có phần đuôi trùng đầu mẫu không?',
        'Does the matched text have a tail equal to a head of the pattern?',
      ),
      m(
        'Phần trùng dài nhất chính là fail[j − 1].',
        'The longest such part is exactly fail[j − 1].',
      ),
      m(
        'Đặt j ← fail[j − 1] và so lại ký tự text với p[j].',
        'Set j ← fail[j − 1] and compare the text character with p[j] again.',
      ),
    ],
    misconceptions: [
      m(
        'Lùi j chỉ một đơn vị (j − 1): đó là so khớp ngây thơ, có thể bỏ sót hoặc chậm.',
        'Lowering j by one: that is naive matching, slow or wrong.',
      ),
    ],
  },
  {
    id: 'found',
    label: m('Tìm thấy', 'Found'),
    narration: m(
      'j chạm độ dài mẫu: tìm thấy một lần xuất hiện, bắt đầu ở vị trí {pos}. Để tìm tiếp cho phép chồng lấn ta đặt j = fail[{m1}].',
      'j reached the pattern length: one occurrence found, starting at position {pos}. To go on and allow overlaps we set j = fail[{m1}].',
    ),
    hints: [
      m(
        'Sau khi tìm thấy, có phải bắt đầu lại từ đầu mẫu?',
        'After a find, must we restart from the head of the pattern?',
      ),
      m(
        'Không: một phần đuôi mẫu có thể là đầu của lần xuất hiện kế.',
        'No: a tail of the pattern may be the head of the next occurrence.',
      ),
      m('j ← fail[m − 1] giữ phần chồng lấn.', 'j ← fail[m − 1] keeps the overlap.'),
    ],
    misconceptions: [
      m(
        'Đặt j = 0 sau khi tìm thấy: bỏ sót các lần xuất hiện chồng lấn như "aa" trong "aaaaa".',
        'Setting j = 0 after a find: it misses overlapping occurrences such as "aa" in "aaaaa".',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Tìm thấy {count} lần. j tăng tối đa n lần và mỗi lần lùi giảm j, nên tổng số lần lùi không quá n: O(n + m) kể cả bước dựng fail.',
      'Found {count} times. j grows at most n times and each fall lowers j, so falls total at most n: O(n + m) including building fail.',
    ),
    hints: [
      m('Vì sao tổng số lần lùi bị chặn?', 'Why is the total number of falls bounded?'),
      m(
        'j không âm và chỉ tăng khi tiến text; mỗi lần lùi tiêu một phần j đã tăng.',
        'j is never negative and only grows as the text advances; each fall spends some of that growth.',
      ),
      m('Vậy tổng thời gian tuyến tính (khấu hao).', 'So the total time is linear (amortised).'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng vòng while lồng làm O(n²): phân tích khấu hao cho thấy vẫn tuyến tính.',
        'Thinking the nested while makes it O(n²): amortised analysis shows it is still linear.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const T = Array.from(input.text);
  const P = Array.from(input.pattern);
  const n = T.length;
  const mm = P.length;
  const fail: (number | null)[] = Array(mm).fill(null);
  let askedFail = 0;
  let askedJump = 0;
  const found: number[] = [];

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    pointers: Record<string, number>,
    offset: number,
    tag?: string,
  ): void => {
    emit(
      {
        values: T,
        mode: 'cells',
        rows: [
          { label: msg(m('mẫu', 'pat'), ctx.locale), values: P, offset },
          { label: 'fail', values: [...fail], offset },
        ],
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        pointers,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };
  const pre = (i: number): string => P.slice(0, i + 1).join('');

  put(EX.start, 1, { p: input.pattern, t: input.text }, {}, {}, 0, 'start');
  fail[0] = 0;
  let k = 0;
  for (let i = 1; i < mm; i++) {
    tick();
    if (askedFail < ASKED_FAILS) {
      askedFail++;
      put(EX.askFail, 2, { i, pre: pre(i) }, { [`r0:${i}`]: 'active' }, { i }, 0, 'build-fail');
    }
    while (k > 0 && P[i] !== P[k]) k = fail[k - 1] as number;
    if (P[i] === P[k]) k++;
    fail[i] = k;
    put(EX.fail, 2, { i, f: k, pre: pre(i) }, { [`r1:${i}`]: 'result' }, { i }, 0);
  }

  let j = 0;
  for (let i = 0; i < n; i++) {
    tick();
    while (j > 0 && T[i] !== P[j]) {
      tick();
      if (askedJump < ASKED_JUMPS) {
        askedJump++;
        put(
          EX.askJump,
          4,
          { i, c: T[i], j },
          { [String(i)]: 'compare', [`r0:${j}`]: 'compare' },
          { i },
          i - j,
          'jump',
        );
      }
      const j0 = j - 1;
      j = fail[j - 1] as number;
      put(EX.jump, 4, { j0, j }, { [String(i)]: 'compare', [`r1:${j0}`]: 'active' }, { i }, i - j);
    }
    if (T[i] === P[j]) {
      const j0 = j;
      j++;
      put(
        EX.match,
        5,
        { i, c: T[i], j0, j, s: i - j + 1 },
        { [String(i)]: 'result', [`r0:${j0}`]: 'result' },
        { i },
        i - j + 1,
        'match',
      );
    } else {
      put(EX.miss, 4, { i, c: T[i] }, { [String(i)]: 'muted' }, { i }, i, undefined);
    }
    if (j === mm) {
      found.push(i - mm + 1);
      const marks: Record<string, HighlightKind> = {};
      for (let q = 0; q < mm; q++) marks[String(i - mm + 1 + q)] = 'result';
      const fj = fail[j - 1] as number;
      put(
        EX.found,
        6,
        { m: mm, m1: mm - 1, pos: i - mm + 1, count: found.length, j: fj },
        marks,
        { i },
        i - mm + 1,
        'found',
      );
      j = fj;
    }
  }
  put(EX.done, 6, { count: found.length }, {}, {}, 0, 'done');
}

export const kmpEntry: WalkthroughEntry<In, S> = {
  id: 'kmp',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t4-string-advanced'],
  title: m('KMP: tìm mẫu trong văn bản', 'KMP: finding a pattern in a text'),
  code: {
    pseudo: [
      'fail[0] ← 0; k ← 0',
      'for i ← 1 .. m − 1: while k > 0 và p[i] ≠ p[k]: k ← fail[k − 1]; nếu p[i] = p[k]: k ← k + 1; fail[i] ← k',
      'j ← 0; for i ← 0 .. n − 1:',
      '    while j > 0 và t[i] ≠ p[j]: j ← fail[j − 1]',
      '    nếu t[i] = p[j]: j ← j + 1',
      '    nếu j = m: ghi vị trí i − m + 1; j ← fail[j − 1]',
    ],
    impl: {
      cpp: [
        'int count_occurrences(const std::string& t, const std::string& p) {',
        '    int n = t.size(), m = p.size();',
        '    std::vector<int> fail(m, 0);',
        '    for (int i = 1, k = 0; i < m; i++) {',
        '        while (k > 0 && p[i] != p[k]) k = fail[k - 1];',
        '        if (p[i] == p[k]) k++;',
        '        fail[i] = k;',
        '    }',
        '    int j = 0, count = 0;',
        '    for (int i = 0; i < n; i++) {',
        '        while (j > 0 && t[i] != p[j]) j = fail[j - 1];',
        '        if (t[i] == p[j]) j++;',
        '        if (j == m) {',
        '            count++;',
        '            j = fail[j - 1];',
        '        }',
        '    }',
        '    return count;',
        '}',
      ],
      py: [
        'def count_occurrences(t, p):',
        '    n, m = len(t), len(p)',
        '    fail = [0] * m',
        '    k = 0',
        '    for i in range(1, m):',
        '        while k > 0 and p[i] != p[k]:',
        '            k = fail[k - 1]',
        '        if p[i] == p[k]:',
        '            k += 1',
        '        fail[i] = k',
        '    j = 0',
        '    count = 0',
        '    for i in range(n):',
        '        while j > 0 and t[i] != p[j]:',
        '            j = fail[j - 1]',
        '        if t[i] == p[j]:',
        '            j += 1',
        '        if j == m:',
        '            count += 1',
        '            j = fail[j - 1]',
        '    return count',
      ],
    },
    map: {
      cpp: { 1: [3], 2: [4, 5, 6, 7, 8], 3: [9, 10], 4: [11], 5: [12], 6: [13, 14, 15, 16, 18] },
      py: {
        1: [3, 4],
        2: [5, 6, 7, 8, 9, 10],
        3: [11, 12, 13],
        4: [14, 15],
        5: [16, 17],
        6: [18, 19, 20, 21],
      },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      text: { kind: 'string', len: [1, 12], alphabet: 'ab' },
      pattern: { kind: 'string', len: [1, 5], alphabet: 'ab' },
    },
  },
  check: (input) => (input.pattern.length <= input.text.length ? [] : ['pattern-longer-than-text']),
  customInput: false,
  presets: [
    {
      id: 'twice',
      label: m('Xuất hiện hai lần', 'Occurs twice'),
      input: { text: 'ababbabab', pattern: 'abab' },
    },
    {
      id: 'none',
      label: m('Không xuất hiện', 'No occurrence'),
      input: { text: 'aaaa', pattern: 'b' },
    },
    {
      id: 'whole',
      label: m('Mẫu là cả text', 'The pattern is the text'),
      input: { text: 'abba', pattern: 'abba' },
    },
    {
      id: 'periodic',
      label: m('Chồng lấn', 'Overlapping'),
      input: { text: 'aaaaa', pattern: 'aa' },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'build-fail',
      text: m(
        'fail[i] là độ dài tiền tố-hậu tố THỰC SỰ dài nhất; khi sai phải lùi bằng while (không phải if), và sau khi khớp xong đặt j = fail[j − 1].',
        'fail[i] is the length of the longest PROPER prefix-suffix; on a mismatch fall back with a while (not an if), and after a full match set j = fail[j − 1].',
      ),
    },
    {
      lang: 'cpp',
      beat: 'jump',
      text: m(
        'p.size() không dấu: so sánh j == m với int; và fail[j − 1] chỉ hợp lệ khi j > 0.',
        'p.size() is unsigned: compare j == m with ints; and fail[j − 1] is valid only when j > 0.',
      ),
    },
    {
      lang: 'py',
      beat: 'found',
      text: m(
        't.find(p) chỉ cho lần đầu và không tính chồng lấn; muốn đếm hết phải tự cài đặt như trên.',
        't.find(p) gives only the first hit and ignores overlaps; counting them all needs the loop above.',
      ),
    },
  ],
  maxFrames: 60,
  maxBytes: 200_000,
  run,
};
