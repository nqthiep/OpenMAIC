/**
 * Walkthrough entry: counting character frequencies with a hash table (SCHEMA §5, card 2B-06).
 * Deterministic and browser-safe: no Intl/Date/Math.random/localeCompare (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { s: string };
type S = { values: string[]; mode: 'cells' };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Đếm số lần xuất hiện của từng ký tự trong xâu {n} ký tự bằng một bảng đếm (khoá là ký tự). Lúc đầu bảng rỗng.',
    'Count how often each character occurs in a string of {n|character|characters} with a count table (the key is the character). The table starts empty.',
  ),
  read: m(
    'Đọc s[{i}] = {c}. Ký tự này đã có trong bảng đếm chưa?',
    'Read s[{i}] = {c}. Is this character already in the count table?',
  ),
  newKey: m(
    '{c} chưa có trong bảng: thêm khoá mới {c} với số đếm 1.',
    '{c} is not in the table yet: add the new key {c} with count 1.',
  ),
  increment: m(
    '{c} đã có trong bảng: tăng số đếm của nó lên {k}.',
    '{c} is already in the table: raise its count to {k}.',
  ),
  max: m(
    'Duyệt bảng tìm số đếm lớn nhất: {best} xuất hiện {cnt} lần. Khi hoà lấy chữ cái nhỏ nhất.',
    'Scan the table for the biggest count: {best} occurs {cnt|time|times}. On a tie take the smallest letter.',
  ),
  done: m(
    'Ký tự nhiều nhất là {best}, xuất hiện {cnt} lần (trong {distinct} ký tự khác nhau).',
    'The most frequent character is {best}, occurring {cnt|time|times} (out of {distinct|distinct character|distinct characters}).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Ta cần biết mỗi ký tự trong xâu {n} ký tự xuất hiện bao nhiêu lần. Bảng đếm lưu cặp (ký tự, số lần) và tra cứu rất nhanh.',
      'We want to know how many times each character occurs in a string of {n|character|characters}. A count table stores (character, count) pairs and looks them up very fast.',
    ),
    hints: [
      m(
        'Nếu so từng cặp ký tự để đếm thì mất bao nhiêu phép so?',
        'How many comparisons does counting by comparing every pair take?',
      ),
      m(
        'Cỡ n²: quá chậm. Có thể cất số đếm của mỗi ký tự ở một nơi tra cứu nhanh không?',
        'About n²: too slow. Can we keep each character’s count somewhere we can look up quickly?',
      ),
      m(
        'Bảng băm (hay mảng cnt[26]): mỗi ký tự đọc một lần, tăng đúng một ô đếm: O(n).',
        'A hash table (or an array cnt[26]): read each character once, raise exactly one counter: O(n).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bảng băm sắp xếp các khoá: thứ tự duyệt của bảng băm không đảm bảo, ở đây ta liệt kê theo chữ cái.',
        'Thinking a hash table sorts its keys: its iteration order is not guaranteed; here we list in alphabetical order.',
      ),
    ],
  },
  {
    id: 'read',
    label: m('Đọc ký tự', 'Read a character'),
    narration: m(
      'Đọc ký tự thứ {i}: {c}. Ta tra bảng: nếu {c} đã là một khoá thì chỉ cần tăng số đếm, nếu chưa thì tạo khoá mới.',
      'Read character {i}: {c}. We look it up in the table: if {c} is already a key we just raise its count, otherwise we create the key.',
    ),
    ask: {
      text: m(
        'Theo em, ký tự này đã có trong bảng chưa?',
        'Is this character already in the table?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Đã có', 'Already there'), m('Chưa có', 'Not yet')],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:increment') ? 0 : 1),
      },
    },
    hints: [
      m(
        'Nhìn bảng đếm hiện tại: có dòng nào bắt đầu bằng ký tự này không?',
        'Look at the current count table: is there a row for this character?',
      ),
      m(
        'Ký tự đã xuất hiện ở vị trí trước thì đã được thêm vào bảng.',
        'A character that appeared at an earlier position was already added to the table.',
      ),
      m(
        'Có ở trước ⇒ đã có khoá; chưa từng xuất hiện ⇒ chưa có.',
        'Seen before ⇒ the key exists; never seen ⇒ it does not.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải duyệt cả bảng để tìm khoá: bảng băm tra cứu trực tiếp, gần như O(1).',
        'Thinking we must scan the whole table for the key: a hash table looks it up directly, in about O(1).',
      ),
    ],
  },
  {
    id: 'new-key',
    label: m('Khoá mới', 'A new key'),
    narration: m(
      '{c} chưa có trong bảng nên ta thêm khoá {c} với số đếm 1: đây là lần đầu ta gặp ký tự này.',
      '{c} is not in the table, so we add the key {c} with count 1: this is the first time we see it.',
    ),
    hints: [
      m(
        'Ký tự chưa có khoá thì số đếm trước đó là bao nhiêu?',
        'For a character without a key, what was its count before?',
      ),
      m(
        'Là 0: chưa gặp lần nào. Sau lần này nó là 1.',
        'It was 0: never seen. After this one it is 1.',
      ),
      m(
        'Thêm khoá mới với giá trị 1 (hoặc d.get(c, 0) + 1 trong Python).',
        'Add the new key with value 1 (or d.get(c, 0) + 1 in Python).',
      ),
    ],
    misconceptions: [
      m(
        'Tăng số đếm của một khoá chưa tồn tại: Python báo KeyError, nên phải khởi tạo hoặc dùng get.',
        'Raising the count of a key that does not exist: Python raises KeyError, so initialize it or use get.',
      ),
    ],
  },
  {
    id: 'increment',
    label: m('Tăng số đếm', 'Raise the count'),
    narration: m(
      '{c} đã có trong bảng, ta chỉ tăng số đếm của nó lên {k}. Không thêm dòng mới.',
      '{c} is already in the table, so we only raise its count to {k}. No new row is added.',
    ),
    hints: [
      m('Khoá đã có thì cần thêm dòng mới không?', 'If the key exists, do we need a new row?'),
      m('Không: chỉ thay giá trị của nó.', 'No: just change its value.'),
      m('cnt[c] ← cnt[c] + 1.', 'cnt[c] ← cnt[c] + 1.'),
    ],
    misconceptions: [
      m(
        'Đặt lại số đếm bằng 1 mỗi khi gặp ký tự: kết quả luôn là 1.',
        'Resetting the count to 1 at every occurrence: the result would always be 1.',
      ),
    ],
  },
  {
    id: 'max',
    label: m('Tìm nhiều nhất', 'Find the maximum'),
    narration: m(
      'Duyệt bảng đếm theo chữ cái để tìm số đếm lớn nhất: {best} với {cnt} lần. Khi hoà ta lấy chữ cái nhỏ nhất để kết quả duy nhất.',
      'Scan the count table in letter order for the biggest count: {best} with {cnt}. On a tie we take the smallest letter so the answer is unique.',
    ),
    hints: [
      m(
        'Nếu hai ký tự cùng có số đếm lớn nhất thì chọn cái nào?',
        'If two characters share the biggest count, which one do we choose?',
      ),
      m(
        'Đề phải có quy tắc: ở đây chọn chữ cái nhỏ nhất theo thứ tự bảng chữ cái.',
        'The task needs a rule: here the smallest letter in alphabetical order.',
      ),
      m(
        'Duyệt theo thứ tự chữ cái và chỉ cập nhật khi số đếm lớn hơn hẳn (không dùng ≥).',
        'Scan in alphabetical order and update only when the count is strictly larger (not ≥).',
      ),
    ],
    misconceptions: [
      m(
        'Dùng ≥ khi cập nhật: khi hoà sẽ lấy chữ cái lớn hơn thay vì nhỏ nhất.',
        'Updating with ≥: on a tie it would take the later letter instead of the smallest.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Kết quả: {best} xuất hiện {cnt} lần, trong {distinct} ký tự khác nhau. Mỗi ký tự chỉ đọc một lần nên cả quá trình là O(n).',
      'Result: {best} occurs {cnt|time|times}, among {distinct|distinct character|distinct characters}. Each character is read once, so the whole job is O(n).',
    ),
    hints: [
      m('Mỗi ký tự được đọc bao nhiêu lần?', 'How many times is each character read?'),
      m(
        'Một lần, và mỗi lần tra bảng tốn gần O(1).',
        'Once, and each table lookup costs about O(1).',
      ),
      m(
        'Tổng O(n) cộng với bước tìm lớn nhất trên bảng nhỏ (tối đa 26 khoá).',
        'In total O(n) plus the maximum scan over a small table (at most 26 keys).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng đếm bằng bảng băm luôn nhanh hơn mảng cnt[26]: với bảng chữ cái nhỏ, mảng thường nhanh hơn.',
        'Thinking a hash table always beats an array cnt[26]: for a small alphabet the array is usually faster.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const chars = Array.from(input.s);
  const n = chars.length;
  const count = new Map<string, number>();
  const table = (): string[] => [...count.keys()].sort().map((k) => `${k}:${count.get(k)}`);

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    i: number | undefined,
    marks: Record<string, HighlightKind>,
    tag: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    if (i !== undefined) for (let k = 0; k < i; k++) highlights[k] = 'visited';
    emit(
      { values: chars, mode: 'cells' },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...marks },
        pointers: i === undefined ? {} : { i },
        aux: [{ id: 'count', label: msg(m('Đếm', 'Count'), ctx.locale), items: table() }],
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  put(EX.start, 1, { n }, undefined, {}, 'start');
  for (let i = 0; i < n; i++) {
    tick();
    const c = chars[i];
    put(EX.read, 2, { i, c }, i, { [i]: 'active' }, 'read');
    const k = (count.get(c) ?? 0) + 1;
    const fresh = !count.has(c);
    count.set(c, k);
    put(
      fresh ? EX.newKey : EX.increment,
      3,
      { i, c, k },
      i,
      { [i]: 'result' },
      fresh ? 'new-key' : 'increment',
    );
  }
  // most frequent: scan letters in order, update only on a strictly larger count
  let best = '';
  let cnt = 0;
  for (const key of [...count.keys()].sort()) {
    if ((count.get(key) as number) > cnt) {
      best = key;
      cnt = count.get(key) as number;
    }
  }
  const marks: Record<string, HighlightKind> = {};
  chars.forEach((c, k) => {
    if (c === best) marks[k] = 'result';
  });
  put(EX.max, 4, { best, cnt }, undefined, marks, 'max');
  put(EX.done, 5, { best, cnt, distinct: count.size }, undefined, marks, 'done');
}

export const hashCountEntry: WalkthroughEntry<In, S> = {
  id: 'hash-count',
  entryRev: 4,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t1-hash'],
  title: m('Đếm tần suất bằng bảng băm', 'Counting frequencies with a hash table'),
  code: {
    pseudo: [
      'cnt ← bảng rỗng',
      'for i ← 0 .. n − 1:',
      '    cnt[s[i]] ← cnt[s[i]] + 1',
      'best ← ký tự có cnt lớn nhất (hoà: chữ cái nhỏ nhất)',
      'return best, cnt[best]',
    ],
    impl: {
      cpp: [
        'std::pair<char, int> most_frequent(const std::string& s) {',
        '    int cnt[26] = {0};',
        "    for (char c : s) cnt[c - 'a']++;",
        '    int best = 0;',
        '    for (int k = 1; k < 26; k++) {',
        '        if (cnt[k] > cnt[best]) best = k;',
        '    }',
        "    return {(char)('a' + best), cnt[best]};",
        '}',
      ],
      py: [
        'def most_frequent(s):',
        '    cnt = {}',
        '    for c in s:',
        '        cnt[c] = cnt.get(c, 0) + 1',
        '    best = min(cnt, key=lambda c: (-cnt[c], c))',
        '    return best, cnt[best]',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [3], 4: [4, 5, 6, 7], 5: [8] },
      py: { 1: [2], 2: [3], 3: [4], 4: [5], 5: [6] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { s: { kind: 'string', len: [1, 12], alphabet: 'a-z' } },
  },
  customInput: false,
  presets: [
    { id: 'repeat', label: m('Có ký tự lặp', 'With repeats'), input: { s: 'banana' } },
    { id: 'all-same', label: m('Toàn một ký tự', 'All the same'), input: { s: 'aaaa' } },
    { id: 'distinct', label: m('Mọi ký tự khác nhau', 'All distinct'), input: { s: 'abcdef' } },
    { id: 'single', label: m('Một ký tự', 'One character'), input: { s: 'z' } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'max',
      text: m(
        'Khi hai ký tự hoà số đếm phải có quy tắc chọn (ở đây chữ cái nhỏ nhất); duyệt theo thứ tự chữ cái và chỉ cập nhật khi lớn hơn hẳn.',
        'When two characters tie there must be a rule (here the smallest letter); scan in letter order and update only when strictly larger.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'increment',
      text: m(
        "Mảng cnt[26] cần chỉ số c - 'a' (0..25), không phải c; dùng unordered_map nếu ký tự bất kỳ. Khởi tạo bằng 0.",
        "The array cnt[26] needs the index c - 'a' (0..25), not c; use unordered_map for arbitrary characters. Initialise it with 0.",
      ),
    },
    {
      lang: 'py',
      beat: 'new-key',
      text: m(
        'd[c] += 1 trên khoá chưa có ném KeyError: dùng d.get(c, 0) + 1 hoặc collections.Counter.',
        'd[c] += 1 on a missing key raises KeyError: use d.get(c, 0) + 1 or collections.Counter.',
      ),
    },
  ],
  maxFrames: 30,
  maxBytes: 200_000,
  run,
};
