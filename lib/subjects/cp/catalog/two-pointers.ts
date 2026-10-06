/**
 * Walkthrough entry: two pointers on an increasing array, finding a pair with a given sum
 * (SCHEMA §5, card 2A-02). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[]; target: number };
type S = { values: number[]; mode: 'cells' };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Mảng đã sắp tăng dần. Đặt hai con trỏ ở hai đầu: i = {i}, j = {j}. Ta tìm cặp i < j có tổng bằng {target}.',
    'The array is sorted increasingly. Put two pointers at the ends: i = {i}, j = {j}. We look for i < j with sum {target}.',
  ),
  compare: m(
    'i = {i}, j = {j}: a[{i}] + a[{j}] = {ai} + {aj} = {sum}. Đem so với target = {target}.',
    'i = {i}, j = {j}: a[{i}] + a[{j}] = {ai} + {aj} = {sum}. Compare it with target = {target}.',
  ),
  right: m(
    '{sum} < {target}: tổng còn nhỏ. a[j] đã là số lớn nhất còn lại, nên tăng i để tổng lớn lên: i = {i}.',
    '{sum} < {target}: the sum is too small. a[j] is already the largest left, so move i up to grow it: i = {i}.',
  ),
  left: m(
    '{sum} > {target}: tổng quá lớn. a[i] đã là số nhỏ nhất còn lại, nên giảm j: j = {j}.',
    '{sum} > {target}: the sum is too big. a[i] is already the smallest left, so move j down: j = {j}.',
  ),
  found: m(
    'a[{i}] + a[{j}] = {ai} + {aj} = {sum} đúng bằng target = {target}: tìm thấy cặp ({i}, {j}).',
    'a[{i}] + a[{j}] = {ai} + {aj} = {sum} equals target = {target}: found the pair ({i}, {j}).',
  ),
  doneHit: m(
    'Trả về cặp ({i}, {j}) sau {steps} lần so sánh.',
    'Return the pair ({i}, {j}) after {steps} comparisons.',
  ),
  miss: m(
    'i = {i} không còn nhỏ hơn j = {j}: hết cặp để thử, không có cặp nào có tổng {target}.',
    'i = {i} is no longer below j = {j}: no pairs are left, so no pair has sum {target}.',
  ),
  doneMiss: m(
    'Không có cặp nào, sau {steps} lần so sánh.',
    'There is no such pair, after {steps} comparisons.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Mảng đã sắp tăng dần. Ta đặt i ở đầu (i = {i}) và j ở cuối (j = {j}), tìm hai phần tử có tổng {target}.',
      'The array is sorted increasingly. We put i at the start (i = {i}) and j at the end (j = {j}) and look for two elements with sum {target}.',
    ),
    hints: [
      m(
        'Thử mọi cặp thì mất bao nhiêu phép so sánh khi mảng dài?',
        'How many comparisons does trying every pair take when the array is long?',
      ),
      m(
        'Mảng đã sắp xếp: nếu một tổng quá lớn, ta loại được gì?',
        'The array is sorted: if a sum is too big, what can we rule out?',
      ),
      m(
        'Hai con trỏ ở hai đầu; mỗi lần so tổng với target ta loại được ít nhất một phần tử, nên chỉ cần O(n).',
        'Two pointers at the ends; each comparison with target rules out at least one element, so O(n) is enough.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng cách hai con trỏ cũng dùng được cho mảng chưa sắp xếp.',
        'Thinking the two-pointer method also works on an unsorted array.',
      ),
    ],
  },
  {
    id: 'compare',
    label: m('So tổng', 'Compare the sum'),
    narration: m(
      'Cộng hai đầu: a[{i}] + a[{j}] = {sum}, so với target = {target}. Kết quả quyết định con trỏ nào dời.',
      'Add the two ends: a[{i}] + a[{j}] = {sum}, compared with target = {target}. The result decides which pointer moves.',
    ),
    ask: {
      text: m(
        'Theo em, bước tiếp theo con trỏ nào dời (hay đã tìm thấy)?',
        'Which pointer moves next (or have we found it)?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('i tăng', 'i moves up'),
          m('j giảm', 'j moves down'),
          m('Không dời: tìm thấy', 'Neither: found it'),
        ],
        answer: (_frame, next) => {
          const tags = next?.meta.tags ?? [];
          if (tags.includes('beat:move-right')) return 0;
          if (tags.includes('beat:move-left')) return 1;
          return 2; // beat:found
        },
      },
    },
    hints: [
      m('So sánh tổng với target.', 'Compare the sum with target.'),
      m(
        'Nếu tổng lớn hơn target, ta cần làm tổng nhỏ đi: đổi số nào?',
        'If the sum is bigger than target we must make it smaller: which number do we change?',
      ),
      m(
        'Tổng < target ⇒ tăng i; tổng > target ⇒ giảm j; bằng nhau ⇒ tìm thấy.',
        'Sum < target ⇒ move i up; sum > target ⇒ move j down; equal ⇒ found.',
      ),
    ],
    misconceptions: [
      m(
        'Dời nhầm con trỏ: khi tổng nhỏ hơn target mà giảm j thì tổng càng nhỏ đi.',
        'Moving the wrong pointer: when the sum is below target, moving j down makes it even smaller.',
      ),
    ],
  },
  {
    id: 'move-right',
    label: m('Tăng i', 'Move i up'),
    narration: m(
      'Tổng {sum} nhỏ hơn {target}. Mọi cặp với a[i] hiện tại đều không đủ lớn, nên bỏ nó: i = {i}.',
      'The sum {sum} is below {target}. Every pair with the current a[i] falls short, so drop it: i = {i}.',
    ),
    hints: [
      m(
        'Tổng nhỏ hơn target: để tổng lớn lên ta đổi phần tử nào?',
        'The sum is below target: which element do we replace to make it larger?',
      ),
      m(
        'a[j] đã lớn nhất trong phần còn lại, nên chỉ còn cách thay a[i] bằng số lớn hơn.',
        'a[j] is already the largest left, so the only way is to replace a[i] by a bigger number.',
      ),
      m(
        'Vì mảng tăng, a[i + 1] lớn hơn a[i]: tăng i.',
        'Since the array increases, a[i + 1] is bigger than a[i]: move i up.',
      ),
    ],
    misconceptions: [
      m(
        'Tăng j khi tổng nhỏ: j đã ở số lớn nhất còn lại, tăng thêm thì vượt khỏi vùng đang xét.',
        'Moving j up when the sum is small: j is already at the largest left, going further leaves the range.',
      ),
    ],
  },
  {
    id: 'move-left',
    label: m('Giảm j', 'Move j down'),
    narration: m(
      'Tổng {sum} lớn hơn {target}. Mọi cặp với a[j] hiện tại đều quá lớn, nên bỏ nó: j = {j}.',
      'The sum {sum} is above {target}. Every pair with the current a[j] is too big, so drop it: j = {j}.',
    ),
    hints: [
      m(
        'Tổng lớn hơn target: để tổng nhỏ đi ta đổi phần tử nào?',
        'The sum is above target: which element do we replace to make it smaller?',
      ),
      m(
        'a[i] đã nhỏ nhất trong phần còn lại, nên chỉ còn cách thay a[j] bằng số nhỏ hơn.',
        'a[i] is already the smallest left, so the only way is to replace a[j] by a smaller number.',
      ),
      m(
        'Vì mảng tăng, a[j − 1] nhỏ hơn a[j]: giảm j.',
        'Since the array increases, a[j − 1] is smaller than a[j]: move j down.',
      ),
    ],
    misconceptions: [
      m(
        'Giảm i khi tổng lớn: i đang ở số nhỏ nhất còn lại, không thể đi thấp hơn trong vùng đang xét.',
        'Moving i down when the sum is big: i is already at the smallest left and cannot go lower.',
      ),
    ],
  },
  {
    id: 'found',
    label: m('Tìm thấy', 'Found'),
    narration: m(
      'a[{i}] + a[{j}] = {sum} đúng bằng {target}: cặp cần tìm là ({i}, {j}), dừng vòng lặp.',
      'a[{i}] + a[{j}] = {sum} equals {target}: the pair is ({i}, {j}); stop the loop.',
    ),
    hints: [
      m('So tổng với target: hai số thế nào?', 'Compare the sum with target: how do they relate?'),
      m('Hai số bằng nhau thì đã đạt yêu cầu của bài.', 'When they are equal the task is met.'),
      m(
        'Tổng = target ⇒ trả về (i, j) ngay, không dời con trỏ nữa.',
        'Sum = target ⇒ return (i, j) at once, without moving the pointers.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phải dời tiếp để tìm hết mọi cặp: bài này chỉ cần một cặp.',
        'Thinking we must keep moving to find every pair: this task needs only one.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Xong sau {steps} lần so sánh. Mỗi lần dời loại bớt ít nhất một phần tử, nên tối đa n − 1 lần: O(n).',
      'Done after {steps} comparisons. Each move rules out at least one element, so at most n − 1 of them: O(n).',
    ),
    hints: [
      m('Vòng lặp dừng vì lý do nào?', 'Why did the loop stop?'),
      m(
        'Có hai cách dừng: tìm được cặp, hoặc i gặp j.',
        'There are two ways to stop: a pair is found, or i meets j.',
      ),
      m(
        'Mỗi bước loại một phần tử trong n, nên tổng số bước nhỏ hơn n: O(n), không phải O(n²).',
        'Each step rules out one of n elements, so the number of steps is below n: O(n), not O(n²).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng hai con trỏ vẫn phải xét n² cặp: nhờ sắp xếp, ta bỏ cả dải cặp mỗi lần dời.',
        'Thinking two pointers still check n² pairs: thanks to sorting, each move skips a whole band of pairs.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { values: a, target } = input;
  const state: S = { values: a, mode: 'cells' };
  let i = 0;
  let j = a.length - 1;
  let steps = 0; // sums compared so far

  /** `mark` draws i and j; without it the frame shows only the range and no sum. */
  const at = (
    text: Messages,
    codeLine: number,
    tag?: string,
    mark?: HighlightKind,
    withSum = false,
  ): void => {
    const vars: Record<string, number> = { i, j, target };
    if (withSum) {
      vars.ai = a[i];
      vars.aj = a[j];
      vars.sum = a[i] + a[j];
    }
    if (tag === 'done') vars.steps = steps;
    const highlights: Record<string, HighlightKind> = {};
    for (let k = 0; k < a.length; k++) highlights[k] = k < i || k > j ? 'muted' : 'active';
    if (mark) {
      highlights[i] = mark;
      highlights[j] = mark;
    }
    emit(state, {
      explanation: fill(msg(text, ctx.locale), vars),
      codeLine,
      highlights,
      pointers: { i, j },
      vars,
      ...(tag ? { tags: [`beat:${tag}`] } : {}),
    });
  };

  at(EX.start, 1, 'start');
  while (i < j) {
    tick();
    steps++;
    at(EX.compare, 3, 'compare', 'compare', true);
    const sum = a[i] + a[j];
    if (sum === target) {
      at(EX.found, 4, 'found', 'result', true);
      return at(EX.doneHit, 4, 'done', 'result');
    }
    if (sum < target) {
      i++;
      at(EX.right, 5, 'move-right', undefined, true);
    } else {
      j--;
      at(EX.left, 6, 'move-left', undefined, true);
    }
  }
  at(EX.miss, 7);
  at(EX.doneMiss, 7, 'done');
}

export const twoPointersEntry: WalkthroughEntry<In, S> = {
  id: 'two-pointers',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t1-array-prefix'],
  title: m('Hai con trỏ: tìm cặp có tổng cho trước', 'Two pointers: a pair with a given sum'),
  code: {
    pseudo: [
      'i ← 0; j ← n − 1',
      'while i < j:',
      '    sum ← a[i] + a[j]',
      '    if sum = target: return (i, j)',
      '    if sum < target: i ← i + 1',
      '    else: j ← j − 1',
      'return không có cặp',
    ],
    impl: {
      cpp: [
        'std::pair<int, int> find_pair(const std::vector<int>& a, int target) {',
        '    int i = 0, j = (int)a.size() - 1;',
        '    while (i < j) {',
        '        int sum = a[i] + a[j];',
        '        if (sum == target) return {i, j};',
        '        if (sum < target) i++;',
        '        else j--;',
        '    }',
        '    return {-1, -1};',
        '}',
      ],
      py: [
        'def find_pair(a, target):',
        '    i, j = 0, len(a) - 1',
        '    while i < j:',
        '        s = a[i] + a[j]',
        '        if s == target:',
        '            return (i, j)',
        '        if s < target:',
        '            i += 1',
        '        else:',
        '            j -= 1',
        '    return (-1, -1)',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5], 5: [6], 6: [7], 7: [9] },
      py: { 1: [2], 2: [3], 3: [4], 4: [5, 6], 5: [7, 8], 6: [9, 10], 7: [11] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      values: { kind: 'int-array', len: [2, 10], range: [-99, 99], strictlyIncreasing: true },
      target: { kind: 'int', range: [-198, 198] },
    },
  },
  customInput: false,
  presets: [
    {
      id: 'middle',
      label: m('Cặp ở giữa', 'A pair in the middle'),
      input: { values: [1, 3, 4, 6, 8, 11], target: 10 },
    },
    {
      id: 'ends',
      label: m('Cặp ở hai đầu', 'The two ends'),
      input: { values: [1, 3, 4, 6, 8, 11], target: 12 },
    },
    {
      id: 'absent',
      label: m('Không có cặp', 'No pair'),
      input: { values: [1, 3, 4, 6, 8, 11], target: 2 },
    },
    {
      id: 'n2',
      label: m('Mảng hai phần tử', 'Two elements'),
      input: { values: [2, 7], target: 9 },
    },
    {
      id: 'negative',
      label: m('Có số âm', 'With negatives'),
      input: { values: [-5, -2, 0, 3, 7], target: 1 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Điều kiện vòng lặp là i < j, không phải i ≤ j: dùng ≤ sẽ ghép một phần tử với chính nó.',
        'The loop condition is i < j, not i ≤ j: with ≤ an element would be paired with itself.',
      ),
    },
    {
      beat: 'compare',
      text: m(
        'Dời nhầm con trỏ: tổng nhỏ hơn target thì tăng i, tổng lớn hơn thì giảm j; đảo lại là sai.',
        'Moving the wrong pointer: a small sum moves i up, a big sum moves j down; swapping them is wrong.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'start',
      text: m(
        'a.size() có kiểu không dấu: a.size() - 1 với mảng rỗng tràn thành số rất lớn. Ép (int)a.size() - 1.',
        'a.size() is unsigned: a.size() - 1 on an empty array wraps to a huge number. Cast with (int)a.size() - 1.',
      ),
    },
    {
      lang: 'py',
      beat: 'compare',
      text: m(
        'Đừng dùng a.index(x) hay `in` trong vòng lặp để tìm bù: mỗi lần O(n) làm cả thuật toán thành O(n²).',
        'Do not use a.index(x) or `in` inside the loop to find the complement: O(n) each makes the whole thing O(n²).',
      ),
    },
  ],
  maxFrames: 30,
  maxBytes: 200_000,
  run,
};
