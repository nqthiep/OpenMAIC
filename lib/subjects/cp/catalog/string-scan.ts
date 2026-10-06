/**
 * Walkthrough entry: palindrome check with two pointers (SCHEMA §5, card 2B-05, README D14: counting
 * frequencies lives in `hash-count`). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
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
    'Kiểm tra xâu có đọc xuôi ngược như nhau không. Đặt hai con trỏ ở hai đầu: i = {i}, j = {j}.',
    'Check whether the string reads the same both ways. Put two pointers at the ends: i = {i}, j = {j}.',
  ),
  compare: m('So s[{i}] = {ci} với s[{j}] = {cj}.', 'Compare s[{i}] = {ci} with s[{j}] = {cj}.'),
  move: m(
    '{ci} = {cj}: cặp này khớp. Thu hẹp: i = {i}, j = {j}.',
    '{ci} = {cj}: this pair matches. Narrow in: i = {i}, j = {j}.',
  ),
  mismatch: m(
    '{ci} ≠ {cj}: hai ký tự đối xứng khác nhau, xâu không đối xứng.',
    '{ci} ≠ {cj}: the two mirrored characters differ, so the string is not a palindrome.',
  ),
  doneYes: m(
    'i = {i} không còn nhỏ hơn j = {j}: mọi cặp đều khớp, xâu đối xứng.',
    'i = {i} is no longer below j = {j}: every pair matched, the string is a palindrome.',
  ),
  doneNo: m(
    'Dừng ở lần so sánh không khớp đầu tiên: xâu không đối xứng.',
    'Stopped at the first mismatch: the string is not a palindrome.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Xâu đối xứng thì ký tự đầu bằng ký tự cuối, ký tự thứ hai bằng ký tự kề cuối, và cứ thế. Ta đặt i = {i} ở đầu, j = {j} ở cuối.',
      'A palindrome has its first character equal to its last, its second to the second last, and so on. We put i = {i} at the start and j = {j} at the end.',
    ),
    hints: [
      m(
        'Xâu "abba" đọc ngược lại thế nào? Hai ký tự nào phải bằng nhau?',
        'How does "abba" read backwards? Which two characters must be equal?',
      ),
      m(
        'Ký tự đầu phải bằng ký tự cuối, rồi tới cặp bên trong.',
        'The first must equal the last, then the next pair inside.',
      ),
      m(
        'Hai con trỏ i, j từ hai đầu tiến vào giữa và so từng cặp; không cần tạo xâu đảo ngược.',
        'Two pointers i, j move inward from the ends and compare each pair; no reversed string is needed.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng xâu đối xứng phải có độ dài chẵn: "racecar" độ dài lẻ vẫn đối xứng, ký tự giữa tự khớp với chính nó.',
        'Thinking a palindrome needs even length: "racecar" has odd length and still works, its middle matches itself.',
      ),
    ],
  },
  {
    id: 'compare',
    label: m('So một cặp', 'Compare a pair'),
    narration: m(
      'So hai ký tự đối xứng s[{i}] = {ci} và s[{j}] = {cj}. Chúng bằng nhau thì còn hy vọng, khác nhau thì xâu chắc chắn không đối xứng.',
      'Compare the mirrored characters s[{i}] = {ci} and s[{j}] = {cj}. If equal there is hope; if different the string is surely not a palindrome.',
    ),
    ask: {
      text: m('Theo em, s[i] và s[j] có bằng nhau không?', 'Are s[i] and s[j] equal?'),
      predict: {
        kind: 'choice',
        options: [m('Có, bằng nhau', 'Yes, equal'), m('Không, khác nhau', 'No, different')],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:mismatch') ? 1 : 0),
      },
    },
    hints: [
      m(
        'Đọc hai ký tự mà con trỏ i và j đang chỉ vào.',
        'Read the two characters the pointers i and j point at.',
      ),
      m(
        'Hai ký tự này nằm đối xứng nhau qua tâm xâu.',
        'These two characters mirror each other around the centre of the string.',
      ),
      m(
        'Nếu chúng giống nhau thì khớp; khác nhau thì không cần xét cặp nào khác.',
        'If they are the same it is a match; if different no other pair needs checking.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải so mọi cặp trước khi kết luận sai: một cặp lệch là đủ.',
        'Thinking every pair must be compared before saying no: one wrong pair is enough.',
      ),
    ],
  },
  {
    id: 'move',
    label: m('Thu hẹp', 'Narrow in'),
    narration: m(
      'Cặp vừa so khớp nhau, nên ta bỏ hai ký tự ngoài cùng: i tăng thành {i}, j giảm thành {j}, rồi xét cặp bên trong.',
      'The pair just compared matches, so we drop the two outer characters: i grows to {i}, j shrinks to {j}, and we look at the next pair inside.',
    ),
    hints: [
      m(
        'Khi cặp ngoài cùng đã khớp, ta cần xét tiếp phần nào?',
        'When the outer pair matches, which part do we still need to check?',
      ),
      m(
        'Phần ở giữa, bỏ hai ký tự ngoài cùng.',
        'The part in the middle, without the two outer characters.',
      ),
      m('i ← i + 1 và j ← j − 1 cùng lúc.', 'i ← i + 1 and j ← j − 1 together.'),
    ],
    misconceptions: [
      m(
        'Chỉ dịch một con trỏ: hai con trỏ phải cùng tiến vào giữa.',
        'Moving only one pointer: both pointers must move toward the middle.',
      ),
    ],
  },
  {
    id: 'mismatch',
    label: m('Không khớp', 'A mismatch'),
    narration: m(
      '{ci} và {cj} nằm đối xứng nhưng khác nhau. Một cặp đối xứng không khớp là đủ để kết luận xâu không đối xứng, ta dừng ngay.',
      '{ci} and {cj} mirror each other but differ. One mismatched mirrored pair is enough to say the string is not a palindrome, so we stop at once.',
    ),
    hints: [
      m(
        'Hai ký tự đối xứng khác nhau thì xâu đọc ngược có giống xuôi không?',
        'If two mirrored characters differ, can the string read the same backwards?',
      ),
      m(
        'Không: khi đọc ngược, ký tự ở vị trí i sẽ là s[j].',
        'No: read backwards, the character at position i would be s[j].',
      ),
      m(
        'Trả về "không" ngay, không xét thêm cặp nào.',
        'Return "no" at once, without checking more pairs.',
      ),
    ],
    misconceptions: [
      m(
        'Tiếp tục so các cặp còn lại rồi mới trả lời: vẫn đúng nhưng tốn công vô ích.',
        'Comparing the remaining pairs before answering: still correct but wasted work.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Hai con trỏ gặp nhau hoặc gặp lỗi đầu tiên thì dừng. Mỗi ký tự được xét nhiều nhất một lần: O(n) thời gian, O(1) bộ nhớ phụ.',
      'The pointers meet, or the first mismatch stops us. Each character is looked at at most once: O(n) time, O(1) extra memory.',
    ),
    hints: [
      m('Vòng lặp chạy tối đa bao nhiêu lần?', 'How many times can the loop run at most?'),
      m(
        'Mỗi lần hai con trỏ tiến vào 1 bước, nên tối đa n / 2 lần.',
        'Each time the two pointers move in by one, so at most n / 2 times.',
      ),
      m(
        'O(n) thời gian; không cần xâu đảo ngược nên bộ nhớ phụ O(1).',
        'O(n) time; no reversed string is needed so the extra memory is O(1).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải tạo xâu đảo ngược để so: hai con trỏ tránh được việc sao chép.',
        'Thinking we must build the reversed string to compare: two pointers avoid the copy.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const chars = Array.from(input.s);
  const n = chars.length;
  let i = 0;
  let j = n - 1;

  const put = (
    text: Messages,
    codeLine: number,
    withPair: boolean,
    mark: HighlightKind | undefined,
    tag: string,
  ): void => {
    const vars: Record<string, number | string> = { i, j };
    if (withPair) {
      vars.ci = chars[i];
      vars.cj = chars[j];
    }
    const highlights: Record<string, HighlightKind> = {};
    for (let k = 0; k < n; k++) highlights[k] = k < i || k > j ? 'visited' : 'active';
    if (mark && i <= j) {
      highlights[i] = mark;
      highlights[j] = mark;
    }
    emit(
      { values: chars, mode: 'cells' },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        pointers: { i, j },
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  put(EX.start, 1, false, undefined, 'start');
  while (i < j) {
    tick();
    put(EX.compare, 3, true, 'compare', 'compare');
    if (chars[i] !== chars[j]) {
      put(EX.mismatch, 3, true, 'compare', 'mismatch');
      return put(EX.doneNo, 3, false, undefined, 'done');
    }
    const [ci, cj] = [chars[i], chars[j]];
    i++;
    j--;
    // the pair that matched is still named in the explanation
    const vars: Record<string, number | string> = { i, j, ci, cj };
    const highlights: Record<string, HighlightKind> = {};
    for (let k = 0; k < n; k++) highlights[k] = k < i || k > j ? 'visited' : 'active';
    emit(
      { values: chars, mode: 'cells' },
      {
        explanation: fill(msg(EX.move, ctx.locale), vars),
        codeLine: 4,
        highlights,
        pointers: { i, j },
        vars,
        tags: ['beat:move'],
      },
    );
  }
  put(EX.doneYes, 5, false, undefined, 'done');
}

export const stringScanEntry: WalkthroughEntry<In, S> = {
  id: 'string-scan',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t1-string'],
  title: m('Kiểm tra xâu đối xứng', 'Checking a palindrome'),
  code: {
    pseudo: [
      'i ← 0; j ← n − 1',
      'while i < j:',
      '    if s[i] ≠ s[j]: return không',
      '    i ← i + 1; j ← j − 1',
      'return có',
    ],
    impl: {
      cpp: [
        'bool is_palindrome(const std::string& s) {',
        '    int i = 0, j = (int)s.size() - 1;',
        '    while (i < j) {',
        '        if (s[i] != s[j]) return false;',
        '        i++;',
        '        j--;',
        '    }',
        '    return true;',
        '}',
      ],
      py: [
        'def is_palindrome(s):',
        '    i, j = 0, len(s) - 1',
        '    while i < j:',
        '        if s[i] != s[j]:',
        '            return False',
        '        i += 1',
        '        j -= 1',
        '    return True',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5, 6], 5: [8] },
      py: { 1: [2], 2: [3], 3: [4, 5], 4: [6, 7], 5: [8] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { s: { kind: 'string', len: [1, 12], alphabet: 'a-z' } },
  },
  customInput: false,
  presets: [
    { id: 'odd', label: m('Độ dài lẻ', 'Odd length'), input: { s: 'racecar' } },
    { id: 'even', label: m('Độ dài chẵn', 'Even length'), input: { s: 'abba' } },
    { id: 'not', label: m('Không đối xứng', 'Not a palindrome'), input: { s: 'abca' } },
    { id: 'single', label: m('Một ký tự', 'One character'), input: { s: 'a' } },
    { id: 'near', label: m('Gần đối xứng', 'Almost a palindrome'), input: { s: 'abcdba' } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Điều kiện là i < j. Dùng i != j thì với độ dài chẵn hai con trỏ vượt nhau mà không bao giờ bằng nhau, vòng lặp chạy ra ngoài xâu.',
        'The condition is i < j. With i != j and an even length the pointers cross without ever being equal, and the loop runs off the string.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'start',
      text: m(
        's.size() có kiểu không dấu: s.size() - 1 khi xâu rỗng thành số rất lớn. Ép kiểu (int)s.size() - 1.',
        's.size() is unsigned: s.size() - 1 on an empty string wraps to a huge number. Cast with (int)s.size() - 1.',
      ),
    },
    {
      lang: 'py',
      beat: 'done',
      text: m(
        's == s[::-1] ngắn gọn nhưng tạo thêm một xâu đảo ngược, tốn thêm O(n) bộ nhớ; hai con trỏ chỉ cần O(1).',
        's == s[::-1] is short but builds a reversed copy, using O(n) extra memory; two pointers need only O(1).',
      ),
    },
  ],
  maxFrames: 20,
  maxBytes: 200_000,
  run,
};
