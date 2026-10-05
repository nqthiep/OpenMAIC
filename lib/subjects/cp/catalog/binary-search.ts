/**
 * Reference walkthrough entry: binary search on a sorted array (SCHEMA §4.1, CONTENT-DESIGN §5).
 * Deterministic and browser-safe: no Intl/Date/Math.random (lint-enforced, ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[]; target: number };
type S = { values: number[]; mode: 'bars' };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Tìm {target} trong mảng đã sắp xếp. Lúc đầu cả mảng đều có thể chứa nó: lo = {lo}, hi = {hi}.',
    'Look for {target} in the sorted array. At first the whole array may contain it: lo = {lo}, hi = {hi}.',
  ),
  check: m(
    'Kiểm tra lo ≤ hi: {lo} ≤ {hi} đúng, khoảng tìm còn phần tử nên tiếp tục.',
    'Check lo ≤ hi: {lo} ≤ {hi} holds, so the range still has elements and we continue.',
  ),
  mid: m(
    'Lấy phần tử ở giữa khoảng [{lo}, {hi}]: mid = {mid}, a[mid] = {amid}.',
    'Take the middle of the range [{lo}, {hi}]: mid = {mid}, a[mid] = {amid}.',
  ),
  hit: m(
    'a[{mid}] = {amid} bằng target = {target}: tìm thấy, trả về chỉ số {mid}.',
    'a[{mid}] = {amid} equals target = {target}: found, return index {mid}.',
  ),
  right: m(
    'a[{mid}] = {amid} nhỏ hơn target = {target}, nên target ở bên phải. Bỏ nửa trái: lo = {lo}.',
    'a[{mid}] = {amid} is smaller than target = {target}, so target is on the right. Drop the left half: lo = {lo}.',
  ),
  left: m(
    'a[{mid}] = {amid} lớn hơn target = {target}, nên target ở bên trái. Bỏ nửa phải: hi = {hi}.',
    'a[{mid}] = {amid} is larger than target = {target}, so target is on the left. Drop the right half: hi = {hi}.',
  ),
  miss: m(
    'lo = {lo} > hi = {hi}: khoảng tìm rỗng, {target} không có trong mảng nên trả về −1.',
    'lo = {lo} > hi = {hi}: the range is empty, {target} is not in the array, so return −1.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Mảng đã sắp xếp tăng dần. Ta tìm {target}; khoảng tìm ban đầu là cả mảng: lo = {lo}, hi = {hi}.',
      'The array is sorted in increasing order. We look for {target}; the range starts as the whole array: lo = {lo}, hi = {hi}.',
    ),
    hints: [
      m(
        'Mảng đã sắp xếp giúp ích gì khi tìm một số?',
        'How does the array being sorted help when searching?',
      ),
      m(
        'Nếu so với phần tử ở giữa, ta loại được nửa nào?',
        'If we compare with the middle element, which half can we drop?',
      ),
      m(
        'Mỗi lần so với phần tử giữa, ta loại cả một nửa khoảng đang xét.',
        'Each comparison with the middle element removes a whole half of the current range.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng tìm nhị phân dùng được cho cả mảng chưa sắp xếp.',
        'Thinking binary search also works on an unsorted array.',
      ),
    ],
  },
  {
    id: 'mid',
    label: m('Chọn mid', 'Pick mid'),
    narration: m(
      'Ta lấy phần tử ở giữa: mid = {mid}, a[mid] = {amid}. So nó với target = {target}.',
      'We take the middle: mid = {mid}, a[mid] = {amid}. Compare it with target = {target}.',
    ),
    ask: {
      text: m('Theo em, bước tiếp theo lo hay hi đổi?', 'Which changes next, lo or hi?'),
      predict: {
        kind: 'choice',
        options: [m('lo', 'lo'), m('hi', 'hi')],
        answerFrom: 'next-frame',
      },
    },
    hints: [
      m('So a[mid] với target.', 'Compare a[mid] with target.'),
      m(
        'Nếu a[mid] nhỏ hơn target thì target nằm bên nào?',
        'If a[mid] is smaller than target, which side is target on?',
      ),
      m(
        'a[mid] < target ⇒ bỏ nửa trái ⇒ lo = mid + 1; ngược lại hi = mid − 1.',
        'a[mid] < target ⇒ drop the left half ⇒ lo = mid + 1; otherwise hi = mid − 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng lo = mid (không +1) vẫn dừng được.',
        'Believing lo = mid (without +1) still terminates.',
      ),
      m(
        'Nghĩ rằng mid là chỉ số giữa của cả mảng, không phải giữa của [lo, hi].',
        'Thinking mid is the middle of the whole array, not of [lo, hi].',
      ),
    ],
  },
  {
    id: 'go-right',
    label: m('Sang phải', 'Go right'),
    narration: m(
      'a[mid] = {amid} nhỏ hơn {target}, nên target nằm bên phải mid. Bỏ cả mid lẫn nửa trái: lo = {lo}.',
      'a[mid] = {amid} is smaller than {target}, so target is right of mid. Drop mid and the left half: lo = {lo}.',
    ),
    hints: [
      m(
        'a[mid] nhỏ hơn target: các phần tử bên trái mid thì sao?',
        'a[mid] is smaller than target: what about the elements left of mid?',
      ),
      m(
        'Mảng tăng dần, nên mọi phần tử bên trái mid đều không lớn hơn a[mid].',
        'The array is increasing, so every element left of mid is at most a[mid].',
      ),
      m(
        'Vì vậy bỏ cả mid lẫn nửa trái: lo = mid + 1.',
        'So drop both mid and the left half: lo = mid + 1.',
      ),
    ],
    misconceptions: [
      m(
        'Đặt lo = mid thay vì mid + 1: mid đã được xét nên có thể lặp mãi.',
        'Setting lo = mid instead of mid + 1: mid was already checked, so the loop may never end.',
      ),
    ],
  },
  {
    id: 'go-left',
    label: m('Sang trái', 'Go left'),
    narration: m(
      'a[mid] = {amid} lớn hơn {target}, nên target nằm bên trái mid. Bỏ cả mid lẫn nửa phải: hi = {hi}.',
      'a[mid] = {amid} is larger than {target}, so target is left of mid. Drop mid and the right half: hi = {hi}.',
    ),
    hints: [
      m(
        'a[mid] lớn hơn target: các phần tử bên phải mid thì sao?',
        'a[mid] is larger than target: what about the elements right of mid?',
      ),
      m(
        'Mảng tăng dần, nên mọi phần tử bên phải mid đều không nhỏ hơn a[mid].',
        'The array is increasing, so every element right of mid is at least a[mid].',
      ),
      m(
        'Vì vậy bỏ cả mid lẫn nửa phải: hi = mid − 1.',
        'So drop both mid and the right half: hi = mid − 1.',
      ),
    ],
    misconceptions: [
      m(
        'Đặt hi = mid thay vì mid − 1: mid đã được xét nên có thể lặp mãi.',
        'Setting hi = mid instead of mid − 1: mid was already checked, so the loop may never end.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Kết thúc: trả về chỉ số của {target} nếu tìm thấy, ngược lại trả về −1.',
      'Done: return the index of {target} if it was found, otherwise return −1.',
    ),
    hints: [
      m('Vòng lặp dừng vì lý do nào?', 'Why did the loop stop?'),
      m(
        'Có hai cách dừng: tìm thấy a[mid] = target, hoặc lo > hi.',
        'There are two ways to stop: a[mid] = target is found, or lo > hi.',
      ),
      m(
        'Khi lo > hi, khoảng tìm rỗng nên target không có trong mảng: trả về −1.',
        'When lo > hi the range is empty, so target is not in the array: return −1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng khi không thấy thì hàm trả về vị trí gần nhất, thay vì −1.',
        'Thinking the function returns the nearest position when not found, instead of −1.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { values: a, target } = input;
  const state: S = { values: a, mode: 'bars' };
  let lo = 0;
  let hi = a.length - 1;
  let mid = -1; // -1 until the first mid is computed

  /** `mark`: how to draw mid in this frame; omit to hide the mid pointer. */
  const at = (text: Messages, codeLine: number, tag?: string, mark?: HighlightKind): void => {
    const vars: Record<string, number> = { lo, hi };
    if (mid >= 0) {
      vars.mid = mid;
      vars.amid = a[mid];
    }
    vars.target = target;
    const highlights: Record<string, HighlightKind> = {};
    for (let i = 0; i < a.length; i++) highlights[i] = i < lo || i > hi ? 'muted' : 'active';
    const pointers: Record<string, number> = { lo, hi };
    if (mark) {
      highlights[mid] = mark;
      pointers.mid = mid;
    }
    emit(state, {
      explanation: fill(msg(text, ctx.locale), vars),
      codeLine,
      highlights,
      pointers,
      vars,
      ...(tag ? { tags: [`beat:${tag}`] } : {}),
    });
  };

  at(EX.start, 1, 'start');
  while (lo <= hi) {
    tick();
    at(EX.check, 2);
    mid = Math.floor((lo + hi) / 2);
    at(EX.mid, 3, 'mid', 'compare');
    if (a[mid] === target) return at(EX.hit, 4, 'done', 'result');
    if (a[mid] < target) {
      lo = mid + 1;
      at(EX.right, 5, 'go-right', 'muted');
    } else {
      hi = mid - 1;
      at(EX.left, 6, 'go-left', 'muted');
    }
  }
  at(EX.miss, 7, 'done');
}

const SORTED = [3, 8, 12, 17, 25, 31, 40, 52, 66, 79];

export const binarySearchEntry: WalkthroughEntry<In, S> = {
  id: 'binary-search',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t2-binary-search'],
  title: m('Tìm kiếm nhị phân', 'Binary search'),
  code: {
    pseudo: [
      'lo ← 0; hi ← n − 1',
      'while lo ≤ hi:',
      '    mid ← ⌊(lo + hi) / 2⌋',
      '    if a[mid] = target: return mid',
      '    if a[mid] < target: lo ← mid + 1',
      '    else: hi ← mid − 1',
      'return −1',
    ],
    impl: {
      cpp: [
        'int binary_search(const std::vector<int>& a, int target) {',
        '    int lo = 0, hi = (int)a.size() - 1;',
        '    while (lo <= hi) {',
        '        int mid = lo + (hi - lo) / 2;  // tránh tràn số',
        '        if (a[mid] == target) return mid;',
        '        if (a[mid] < target) lo = mid + 1;',
        '        else hi = mid - 1;',
        '    }',
        '    return -1;',
        '}',
      ],
      py: [
        'def binary_search(a, target):',
        '    lo, hi = 0, len(a) - 1',
        '    while lo <= hi:',
        '        mid = (lo + hi) // 2  # Python không tràn số',
        '        if a[mid] == target:',
        '            return mid',
        '        if a[mid] < target:',
        '            lo = mid + 1',
        '        else: hi = mid - 1',
        '    return -1',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5], 5: [6], 6: [7], 7: [9] },
      py: { 1: [2], 2: [3], 3: [4], 4: [5, 6], 5: [7, 8], 6: [9], 7: [10] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      values: { kind: 'int-array', len: [1, 12], range: [-999, 999], strictlyIncreasing: true },
      target: { kind: 'int', range: [-999, 999] },
    },
  },
  customInput: false,
  presets: [
    {
      id: 'mid-hit',
      label: m('Trúng ngay giữa', 'Hit at the first middle'),
      input: { values: SORTED, target: 25 },
    },
    {
      id: 'first',
      label: m('Phần tử đầu tiên', 'First element'),
      input: { values: SORTED, target: 3 },
    },
    {
      id: 'absent',
      label: m('Không có trong mảng', 'Not in the array'),
      input: { values: SORTED, target: 45 },
    },
    {
      id: 'single',
      label: m('Mảng một phần tử', 'Single element'),
      input: { values: [42], target: 42 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      lang: 'cpp',
      beat: 'mid',
      text: m(
        'Tràn số khi viết (lo + hi) / 2: lo + hi có thể vượt giới hạn int. Hãy viết lo + (hi - lo) / 2.',
        'Overflow in (lo + hi) / 2: lo + hi can exceed the int range. Write lo + (hi - lo) / 2.',
      ),
    },
    {
      lang: 'py',
      beat: 'mid',
      text: m(
        '`/` cho số thực; phải dùng `//` để chia nguyên.',
        '`/` gives a float; use `//` for integer division.',
      ),
    },
    {
      text: m(
        'Điều kiện vòng lặp là lo ≤ hi, không phải lo < hi: dùng lo < hi sẽ bỏ sót khoảng chỉ còn một phần tử.',
        'The loop condition is lo ≤ hi, not lo < hi: lo < hi misses a range with exactly one element left.',
      ),
    },
  ],
  maxFrames: 60, // [Inference] leader tunes after 1b-16 measures
  maxBytes: 200_000, // [Inference] leader tunes after 1b-16 measures
  run,
};
