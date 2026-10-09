/**
 * Walkthrough entry: valid brackets with a stack (SCHEMA §5, card 2A-03, README D14: stack only,
 * the queue is taught in `bfs`). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { s: string };
type S = { values: string[]; mode: 'cells' };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** closing bracket → the opening bracket it needs */
const NEED: Readonly<Record<string, string>> = { ')': '(', ']': '[', '}': '{' };

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Xâu có {n} ký tự. Duyệt từng ký tự với một stack (vào sau ra trước); lúc đầu stack rỗng.',
    'The string has {n} characters. Scan it with a stack (last in, first out); at first the stack is empty.',
  ),
  push: m(
    'Ký tự {c} ở vị trí {i} là ngoặc mở: đẩy vào stack. Stack có {size} ký tự.',
    'Character {c} at position {i} is an opening bracket: push it. Stack size: {size}.',
  ),
  check: m(
    'Ký tự {c} ở vị trí {i} là ngoặc đóng. Đỉnh stack là {top}. Hai ký tự có khớp nhau không?',
    'Character {c} at position {i} is a closing bracket. The top of the stack is {top}. Do the two match?',
  ),
  checkEmpty: m(
    'Ký tự {c} ở vị trí {i} là ngoặc đóng, nhưng stack đang rỗng. Có ngoặc mở nào để khớp không?',
    'Character {c} at position {i} is a closing bracket, but the stack is empty. Is there an opening bracket to match?',
  ),
  pop: m(
    'Khớp: {c} đóng đúng {top}. Lấy {top} khỏi stack, còn {size} ký tự.',
    'Match: {c} closes {top}. Pop {top}; stack size: {size}.',
  ),
  failMismatch: m(
    'Không khớp: {c} cần {need} nhưng đỉnh stack là {top}. Xâu không hợp lệ.',
    'No match: {c} needs {need} but the top is {top}. The string is invalid.',
  ),
  failEmpty: m(
    'Stack rỗng khi gặp {c}: không có ngoặc mở nào để đóng. Xâu không hợp lệ.',
    'The stack is empty at {c}: there is no opening bracket to close. The string is invalid.',
  ),
  failLeft: m(
    'Hết xâu nhưng stack còn {size} ngoặc mở chưa được đóng. Xâu không hợp lệ.',
    'The string ended but the stack still holds {size} unclosed opening brackets. The string is invalid.',
  ),
  doneValid: m(
    'Hết xâu và stack rỗng: mọi ngoặc đều được đóng đúng. Xâu hợp lệ.',
    'The string ended and the stack is empty: every bracket was closed correctly. The string is valid.',
  ),
  doneInvalid: m(
    'Kết luận: xâu không hợp lệ, dừng ngay khi gặp lỗi đầu tiên.',
    'Conclusion: the string is invalid; we stop at the first error.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Xâu có {n} ký tự gồm ngoặc tròn, vuông, nhọn. Ta dùng một stack để nhớ các ngoặc mở chưa được đóng.',
      'The string has {n} characters of round, square and curly brackets. We use a stack to remember the opening brackets not closed yet.',
    ),
    hints: [
      m(
        'Khi gặp một ngoặc đóng, ngoặc mở nào cần khớp với nó?',
        'When we meet a closing bracket, which opening bracket must it match?',
      ),
      m(
        'Đó là ngoặc mở gần nhất chưa được đóng. Cấu trúc nào lấy ra phần tử gần nhất vừa cất?',
        'It is the nearest opening bracket not yet closed. Which structure returns the most recently stored item?',
      ),
      m(
        'Stack (vào sau ra trước): đẩy ngoặc mở vào, gặp ngoặc đóng thì so với đỉnh.',
        'A stack (last in, first out): push opening brackets, and on a closing bracket compare with the top.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ cần đếm số ngoặc mở và đóng bằng nhau: "([)]" có số lượng đều nhưng sai.',
        'Thinking it is enough to count equal opening and closing brackets: "([)]" is balanced in count but wrong.',
      ),
    ],
  },
  {
    id: 'push',
    label: m('Đẩy ngoặc mở', 'Push an opener'),
    narration: m(
      'Ký tự {c} ở vị trí {i} là ngoặc mở, chưa biết khi nào được đóng nên cất vào stack. Stack giờ có {size} ký tự.',
      'Character {c} at position {i} is an opening bracket; we do not know yet when it closes, so we store it. Stack size now: {size}.',
    ),
    hints: [
      m(
        'Ngoặc mở vừa gặp đã có thể đóng chưa?',
        'Can the opening bracket we just met be closed already?',
      ),
      m(
        'Chưa: ngoặc đóng của nó nằm ở phía sau. Ta cần nhớ nó cho tới lúc đó.',
        'Not yet: its closing bracket comes later. We must remember it until then.',
      ),
      m('Đẩy nó lên đỉnh stack.', 'Push it onto the top of the stack.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải so ngoặc mở với ngoặc kế tiếp ngay: ngoặc đóng của nó có thể ở rất xa.',
        'Thinking an opening bracket must be compared with the next character at once: its closer may be far away.',
      ),
    ],
  },
  {
    id: 'pop-check',
    label: m('So với đỉnh', 'Compare with the top'),
    narration: m(
      'Ký tự {c} ở vị trí {i} là ngoặc đóng. Ngoặc mở nó đóng phải đang ở đỉnh stack; ta so hai ký tự.',
      'Character {c} at position {i} is a closing bracket. The opener it closes must be on top of the stack; we compare the two.',
    ),
    ask: {
      text: m(
        'Theo em, ký tự đóng này có khớp với đỉnh stack không?',
        'Does this closing bracket match the top of the stack?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Khớp', 'It matches'),
          m('Không khớp (hoặc stack rỗng)', 'No match (or empty stack)'),
        ],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:pop') ? 0 : 1),
      },
    },
    hints: [
      m(
        'Ngoặc đóng này cần ngoặc mở loại nào?',
        'Which kind of opening bracket does this closing bracket need?',
      ),
      m(
        'Đỉnh stack là ngoặc mở gần nhất chưa đóng. Có phải loại cần tìm không?',
        'The top is the nearest unclosed opener. Is it the kind we need?',
      ),
      m(
        'Khớp ⇒ lấy đỉnh ra; khác loại hoặc stack rỗng ⇒ xâu sai.',
        'Match ⇒ pop the top; a different kind or an empty stack ⇒ the string is invalid.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ kiểm có ngoặc mở nào đó trong stack mà không so loại: "(]" bị coi là đúng.',
        'Checking only that the stack is non-empty without comparing kinds: "(]" would pass.',
      ),
      m(
        'Nghĩ rằng ngoặc đóng khớp với ngoặc mở xa hơn đỉnh: bắt buộc phải là ngoặc ở đỉnh.',
        'Thinking a closer may match an opener below the top: it must be the one on top.',
      ),
    ],
  },
  {
    id: 'pop',
    label: m('Lấy đỉnh ra', 'Pop the top'),
    narration: m(
      '{c} khớp với {top} ở đỉnh, cặp này đã đóng đúng. Ta lấy {top} khỏi stack; còn {size} ký tự.',
      '{c} matches the {top} on top, so this pair is closed correctly. We pop {top}; stack size: {size}.',
    ),
    hints: [
      m(
        'Cặp ngoặc vừa khớp còn cần nhớ nữa không?',
        'Do we still need to remember the matched pair?',
      ),
      m(
        'Không: ngoặc mở đó đã được đóng, nên không còn chờ nữa.',
        'No: that opener has been closed, so it no longer waits.',
      ),
      m('Lấy nó ra khỏi đỉnh stack.', 'Pop it from the top of the stack.'),
    ],
    misconceptions: [
      m(
        'Quên lấy ngoặc mở ra sau khi khớp: stack đầy dần và cuối xâu báo sai dù xâu đúng.',
        'Forgetting to pop after a match: the stack keeps growing and a valid string is rejected at the end.',
      ),
    ],
  },
  {
    id: 'fail',
    label: m('Phát hiện lỗi', 'Error found'),
    narration: m(
      'Xâu sai khi xảy ra một trong ba lỗi: ngoặc đóng gặp stack rỗng, ngoặc đóng không khớp đỉnh, hoặc hết xâu mà stack còn ngoặc mở.',
      'The string is invalid on any of three errors: a closer meets an empty stack, a closer does not match the top, or the string ends with openers left.',
    ),
    hints: [
      m('Em thấy điều gì sai ở khung hình này?', 'What looks wrong in this frame?'),
      m(
        'Thử xem stack và ký tự đang xét: có đỉnh để khớp không, có đúng loại không?',
        'Look at the stack and the current character: is there a top to match, and is it the right kind?',
      ),
      m(
        'Ba lỗi: stack rỗng khi cần pop, đỉnh khác loại, hoặc còn dư ngoặc mở sau khi hết xâu.',
        'Three errors: an empty stack at a pop, a top of another kind, or openers left after the string ends.',
      ),
    ],
    misconceptions: [
      m(
        'Chỉ nhớ hai lỗi đầu và bỏ sót lỗi cuối: "(((" không có ngoặc đóng nào sai nhưng vẫn không hợp lệ.',
        'Remembering only the first two errors: "(((" has no wrong closer yet is still invalid.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Xâu hợp lệ khi không có lỗi nào và stack rỗng lúc hết xâu. Mỗi ký tự vào hoặc ra stack tối đa một lần: O(n).',
      'The string is valid when no error occurs and the stack is empty at the end. Each character enters or leaves the stack at most once: O(n).',
    ),
    hints: [
      m('Khi nào ta kết luận xâu hợp lệ?', 'When do we conclude the string is valid?'),
      m(
        'Cần hai điều: không lỗi giữa chừng, và không còn ngoặc mở nào chưa đóng.',
        'Two things: no error on the way, and no opener left unclosed.',
      ),
      m(
        'Tức là stack rỗng sau khi duyệt hết xâu.',
        'That is, the stack is empty after scanning the whole string.',
      ),
    ],
    misconceptions: [
      m(
        'Quên kiểm stack rỗng ở cuối nên "((" bị coi là hợp lệ.',
        'Forgetting the final empty-stack check, so "((" is accepted.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const chars = Array.from(input.s);
  const n = chars.length;
  const stack: { ch: string; idx: number }[] = [];
  // 0 not reached, 1 opener waiting on the stack, 2 matched
  const status: number[] = chars.map(() => 0);

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<number, HighlightKind>,
    i?: number,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    status.forEach((st, k) => {
      if (st === 1) highlights[k] = 'active';
      if (st === 2) highlights[k] = 'visited';
    });
    for (const [k, kind] of Object.entries(marks)) highlights[k] = kind;
    emit(
      { values: chars, mode: 'cells' },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        pointers: i === undefined ? {} : { i },
        aux: [{ id: 'stack', label: 'Stack', items: stack.map((e) => e.ch) }],
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n, size: 0 }, {}, undefined, 'start');
  for (let i = 0; i < n; i++) {
    tick();
    const c = chars[i];
    if (!(c in NEED)) {
      stack.push({ ch: c, idx: i });
      status[i] = 1;
      put(EX.push, 3, { i, c, size: stack.length }, { [i]: 'compare' }, i, 'push');
      continue;
    }
    const top = stack[stack.length - 1];
    const size = stack.length;
    put(
      top ? EX.check : EX.checkEmpty,
      5,
      top ? { i, c, top: top.ch, size } : { i, c, size },
      top ? { [i]: 'compare', [top.idx]: 'compare' } : { [i]: 'compare' },
      i,
      'pop-check',
    );
    if (!top) {
      put(EX.failEmpty, 5, { i, c, size }, { [i]: 'compare' }, i, 'fail');
      return put(EX.doneInvalid, 5, { n, size }, { [i]: 'compare' }, i, 'done');
    }
    if (top.ch !== NEED[c]) {
      put(
        EX.failMismatch,
        5,
        { i, c, top: top.ch, need: NEED[c], size },
        { [i]: 'compare', [top.idx]: 'compare' },
        i,
        'fail',
      );
      return put(EX.doneInvalid, 5, { n, size }, { [i]: 'compare' }, i, 'done');
    }
    stack.pop();
    status[top.idx] = 2;
    status[i] = 2;
    put(
      EX.pop,
      6,
      { i, c, top: top.ch, size: stack.length },
      { [i]: 'result', [top.idx]: 'result' },
      i,
      'pop',
    );
  }
  if (stack.length > 0) {
    put(EX.failLeft, 7, { size: stack.length }, {}, undefined, 'fail');
    return put(EX.doneInvalid, 7, { n, size: stack.length }, {}, undefined, 'done');
  }
  const all: Record<number, HighlightKind> = {};
  chars.forEach((_, k) => (all[k] = 'result'));
  put(EX.doneValid, 7, { n, size: 0 }, all, undefined, 'done');
}

export const stackQueueEntry: WalkthroughEntry<In, S> = {
  id: 'stack-queue',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t1-stack-queue'],
  title: m('Stack: kiểm tra ngoặc hợp lệ', 'Stack: valid brackets'),
  code: {
    pseudo: [
      'st ← stack rỗng',
      'for i ← 0 .. n − 1:',
      '    if s[i] là ngoặc mở: push(s[i])',
      '    else:',
      '        if st rỗng hoặc top(st) không khớp s[i]: return sai',
      '        pop(st)',
      'return (st rỗng)',
    ],
    impl: {
      cpp: [
        'bool is_valid(const std::string& s) {',
        '    std::stack<char> st;',
        '    for (char c : s) {',
        "        if (c == '(' || c == '[' || c == '{') {",
        '            st.push(c);',
        '        } else {',
        '            if (st.empty()) return false;',
        '            char t = st.top();',
        "            if ((c == ')' && t != '(') || (c == ']' && t != '[') || (c == '}' && t != '{')) return false;",
        '            st.pop();',
        '        }',
        '    }',
        '    return st.empty();',
        '}',
      ],
      py: [
        'def is_valid(s):',
        '    st = []',
        "    pairs = {')': '(', ']': '[', '}': '{'}",
        '    for c in s:',
        "        if c in '([{':",
        '            st.append(c)',
        '        else:',
        '            if not st or st[-1] != pairs[c]:',
        '                return False',
        '            st.pop()',
        '    return not st',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4, 5], 4: [6], 5: [7, 8, 9], 6: [10], 7: [13] },
      py: { 1: [2], 2: [4], 3: [5, 6], 4: [7], 5: [8, 9], 6: [10], 7: [11] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { s: { kind: 'string', len: [1, 12], alphabet: 'brackets' } },
  },
  customInput: false,
  presets: [
    { id: 'nested', label: m('Lồng nhau', 'Nested'), input: { s: '([]{})' } },
    { id: 'sequence', label: m('Nối tiếp', 'In sequence'), input: { s: '()[]{}' } },
    { id: 'mismatch', label: m('Sai loại', 'Wrong kind'), input: { s: '([)]' } },
    { id: 'unclosed', label: m('Thiếu ngoặc đóng', 'Unclosed'), input: { s: '((()' } },
    { id: 'extra-close', label: m('Thừa ngoặc đóng', 'Extra closer'), input: { s: '())' } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'done',
      text: m(
        'Quên kiểm stack rỗng ở cuối xâu: "((" không có lỗi giữa chừng nhưng vẫn không hợp lệ.',
        'Forgetting the empty-stack check at the end: "((" has no error on the way but is still invalid.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'pop-check',
      text: m(
        'st.top() khi stack rỗng là hành vi không xác định: luôn kiểm st.empty() trước khi gọi top()/pop().',
        'st.top() on an empty stack is undefined behaviour: always check st.empty() before top()/pop().',
      ),
    },
    {
      lang: 'py',
      beat: 'pop-check',
      text: m(
        'st[-1] khi list rỗng ném IndexError: kiểm `not st` trước khi đọc đỉnh.',
        'st[-1] on an empty list raises IndexError: test `not st` before reading the top.',
      ),
    },
  ],
  maxFrames: 30,
  maxBytes: 200_000,
  run,
};
