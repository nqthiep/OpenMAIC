/**
 * Walkthrough entry: quick sort with Lomuto partition (SCHEMA §5, card 2A-05).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[] };
type S = { values: number[]; mode: 'bars' };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Sắp xếp {n} số bằng quick sort: chọn pivot, chia mảng thành phần ≤ pivot và phần > pivot, rồi sắp từng phần.',
    'Sort {n} numbers with quick sort: pick a pivot, split the array into ≤ pivot and > pivot, then sort each part.',
  ),
  pick: m(
    'Đoạn [{lo}, {hi}]: chọn pivot = a[{hi}] = {pivot} (phần tử cuối). i = {i} đứng ngay trước đoạn.',
    'Range [{lo}, {hi}]: pick pivot = a[{hi}] = {pivot} (the last element). i = {i} sits just before the range.',
  ),
  compare: m(
    'Xét j = {j}: so a[{j}] = {aj} với pivot = {pivot}.',
    'Look at j = {j}: compare a[{j}] = {aj} with pivot = {pivot}.',
  ),
  swap: m(
    '{aj} ≤ {pivot}: tăng i lên {i} rồi đổi chỗ a[{i}] với a[{j}]. Số nhỏ được gom về bên trái.',
    '{aj} ≤ {pivot}: raise i to {i} and swap a[{i}] with a[{j}]. Small numbers are gathered on the left.',
  ),
  stay: m(
    '{aj} > {pivot}: giữ nguyên, a[{j}] thuộc phần lớn hơn pivot. i vẫn là {i}.',
    '{aj} > {pivot}: leave it, a[{j}] belongs to the part above the pivot. i stays {i}.',
  ),
  place: m(
    'Đặt pivot vào vị trí p = {p} (đổi chỗ a[{p}] với a[{hi}]): bên trái ≤ {pivot}, bên phải > {pivot}. Pivot đã đúng chỗ.',
    'Place the pivot at p = {p} (swap a[{p}] with a[{hi}]): the left is ≤ {pivot}, the right is > {pivot}. The pivot is in place.',
  ),
  recurse: m(
    'Vào đoạn con [{lo}, {hi}]: lặp lại cách làm trên cho đoạn này.',
    'Enter the sub-range [{lo}, {hi}]: repeat the same steps on it.',
  ),
  done: m(
    'Mọi đoạn đã còn không quá một phần tử: mảng {n} số đã sắp xếp tăng dần.',
    'Every range now has at most one element: the array of {n} numbers is sorted increasingly.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Quick sort chia để trị: chọn một pivot, đưa số nhỏ sang trái, số lớn sang phải, rồi sắp từng phần. Mảng có {n} số.',
      'Quick sort divides and conquers: pick a pivot, move small numbers left and large ones right, then sort each part. The array has {n} numbers.',
    ),
    hints: [
      m(
        'Nếu biết một số đã đứng đúng chỗ cuối cùng, phần còn lại có dễ hơn không?',
        'If one number were already in its final place, would the rest be easier?',
      ),
      m(
        'Đặt một số (pivot) vào đúng chỗ: các số nhỏ hơn ở trái, lớn hơn ở phải.',
        'Put one number (the pivot) in place: smaller ones on its left, larger ones on its right.',
      ),
      m(
        'Sau đó chỉ cần sắp xếp hai đoạn hai bên pivot, theo đúng cách đó (đệ quy).',
        'Then only the two ranges beside the pivot need sorting, in the same way (recursion).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng sau một lần chia, mỗi bên đã sắp xếp: mới chỉ có pivot đứng đúng chỗ.',
        'Thinking each side is sorted after one split: only the pivot is in its final place.',
      ),
    ],
  },
  {
    id: 'pick-pivot',
    label: m('Chọn pivot', 'Pick the pivot'),
    narration: m(
      'Với đoạn [{lo}, {hi}], ta lấy phần tử cuối a[{hi}] = {pivot} làm pivot. i đánh dấu ô cuối của vùng "≤ pivot" và bắt đầu là {i}.',
      'For the range [{lo}, {hi}] we take the last element a[{hi}] = {pivot} as the pivot. i marks the end of the "≤ pivot" zone and starts at {i}.',
    ),
    hints: [
      m(
        'Pivot được chọn ở vị trí nào của đoạn?',
        'At which position of the range is the pivot taken?',
      ),
      m(
        'Ở đây ta lấy phần tử cuối a[hi]; đưa nó ra khỏi cuộc duyệt để so với các số còn lại.',
        'Here we take the last element a[hi]; it stays out of the scan and is compared with the others.',
      ),
      m(
        'Vùng "≤ pivot" lúc đầu rỗng, nên i = lo − 1.',
        'The "≤ pivot" zone starts empty, so i = lo − 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng pivot phải là số ở giữa hoặc số trung vị: chọn sai chỉ làm chậm, không làm sai kết quả.',
        'Thinking the pivot must be the middle or median value: a poor choice only slows it down, it does not break correctness.',
      ),
    ],
  },
  {
    id: 'compare',
    label: m('So với pivot', 'Compare with the pivot'),
    narration: m(
      'Ta duyệt j từ đầu đoạn. Với j = {j}, so a[{j}] = {aj} với pivot = {pivot} để biết nó thuộc bên nào.',
      'We scan j from the start of the range. For j = {j}, compare a[{j}] = {aj} with the pivot = {pivot} to see which side it belongs to.',
    ),
    ask: {
      text: m(
        'Theo em, a[j] sẽ ở bên trái hay bên phải pivot?',
        'Will a[j] end up on the left or on the right of the pivot?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Bên trái (≤ pivot)', 'Left (≤ pivot)'),
          m('Bên phải (> pivot)', 'Right (> pivot)'),
        ],
        answer: (_frame, next) => (next?.meta.tags?.includes('beat:swap') ? 0 : 1),
      },
    },
    hints: [
      m('So sánh a[j] với pivot.', 'Compare a[j] with the pivot.'),
      m(
        'Số nhỏ hơn hoặc bằng pivot thì thuộc vùng bên trái.',
        'A number less than or equal to the pivot belongs to the left zone.',
      ),
      m(
        'a[j] ≤ pivot ⇒ gom sang trái (tăng i, đổi chỗ); a[j] > pivot ⇒ để nguyên.',
        'a[j] ≤ pivot ⇒ gather on the left (raise i, swap); a[j] > pivot ⇒ leave it.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng < thay cho ≤: số bằng pivot bị bỏ ở phía phải, vẫn đúng nhưng mất cân bằng khi nhiều số trùng.',
        'Using < instead of ≤: numbers equal to the pivot go right; still correct, but unbalanced when many are equal.',
      ),
    ],
  },
  {
    id: 'swap',
    label: m('Gom sang trái', 'Gather left'),
    narration: m(
      'a[{j}] = {aj} không lớn hơn pivot {pivot}: tăng i thành {i} rồi đổi chỗ a[{i}] với a[{j}] để vùng ≤ pivot dài thêm một ô.',
      'a[{j}] = {aj} is not above the pivot {pivot}: raise i to {i} and swap a[{i}] with a[{j}], so the ≤ pivot zone grows by one.',
    ),
    hints: [
      m(
        'Vùng "≤ pivot" muốn dài thêm một ô thì i cần làm gì?',
        'To grow the "≤ pivot" zone by one cell, what must i do?',
      ),
      m(
        'Tăng i. Ô a[i] mới có thể đang chứa số lớn hơn pivot.',
        'Raise i. The new a[i] may hold a number above the pivot.',
      ),
      m(
        'Đổi chỗ a[i] với a[j]: số nhỏ vào vùng trái, số lớn đẩy về phía j.',
        'Swap a[i] with a[j]: the small number joins the left zone, the large one moves toward j.',
      ),
    ],
    misconceptions: [
      m(
        'Đổi chỗ trước khi tăng i: sẽ ghi đè lên phần tử cuối của vùng ≤ pivot.',
        'Swapping before raising i: that overwrites the last element of the ≤ pivot zone.',
      ),
    ],
  },
  {
    id: 'place-pivot',
    label: m('Đặt pivot', 'Place the pivot'),
    narration: m(
      'Duyệt xong, ta đổi pivot về ô p = {p} ngay sau vùng ≤ pivot. Từ giờ a[{p}] = {pivot} đứng đúng chỗ cuối cùng.',
      'The scan is over, so we swap the pivot into cell p = {p}, right after the ≤ pivot zone. From now on a[{p}] = {pivot} is in its final place.',
    ),
    hints: [
      m(
        'Pivot đang ở cuối đoạn; chỗ đúng của nó là đâu?',
        'The pivot is at the end of the range; where does it belong?',
      ),
      m(
        'Ngay sau vùng các số ≤ pivot, tức ô i + 1.',
        'Right after the zone of numbers ≤ pivot, that is cell i + 1.',
      ),
      m(
        'Đổi a[i + 1] với a[hi]; sau đó mọi số bên trái ≤ pivot < mọi số bên phải.',
        'Swap a[i + 1] with a[hi]; afterwards everything on the left is ≤ pivot < everything on the right.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng pivot vẫn có thể bị di chuyển ở các bước sau: từ lúc này nó cố định.',
        'Thinking the pivot may still move later: from now on it is fixed.',
      ),
    ],
  },
  {
    id: 'recurse',
    label: m('Vào đoạn con', 'Sub-range'),
    narration: m(
      'Ta sắp xếp riêng đoạn [{lo}, {hi}] bằng đúng cách đó. Đoạn chỉ có một phần tử hoặc rỗng thì đã xong.',
      'We sort the range [{lo}, {hi}] on its own in the same way. A range with one element or none is already done.',
    ),
    hints: [
      m(
        'Sau khi đặt pivot, những phần tử nào còn chưa đúng chỗ?',
        'After placing the pivot, which elements are still not in place?',
      ),
      m(
        'Hai đoạn hai bên pivot: [lo, p − 1] và [p + 1, hi].',
        'The two ranges beside the pivot: [lo, p − 1] and [p + 1, hi].',
      ),
      m(
        'Gọi lại quicksort cho từng đoạn; đoạn ≤ 1 phần tử thì dừng (lo ≥ hi).',
        'Call quicksort on each range; a range of ≤ 1 element stops (lo ≥ hi).',
      ),
    ],
    misconceptions: [
      m(
        'Đệ quy (lo, p) hoặc (p, hi) thay vì (lo, p − 1) và (p + 1, hi): pivot bị xét lại, có thể lặp vô hạn.',
        'Recursing on (lo, p) or (p, hi) instead of (lo, p − 1) and (p + 1, hi): the pivot is revisited, possibly forever.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Mảng {n} số đã sắp xếp. Chia cân thì O(n log n); nhưng nếu pivot luôn là số lớn nhất hay nhỏ nhất (như mảng đã sắp) thì tới O(n²).',
      'The array of {n} numbers is sorted. With balanced splits it is O(n log n); if the pivot is always the largest or smallest (as on a sorted array) it degrades to O(n²).',
    ),
    hints: [
      m('Số lần so sánh phụ thuộc vào điều gì?', 'What does the number of comparisons depend on?'),
      m(
        'Vào việc pivot chia đoạn thành hai phần có cân bằng không.',
        'On whether the pivot splits the range into balanced parts.',
      ),
      m(
        'Cân bằng ⇒ log n tầng, mỗi tầng n so sánh; lệch hết ⇒ n tầng, tổng O(n²).',
        'Balanced ⇒ log n levels of n comparisons; fully lopsided ⇒ n levels, O(n²) in total.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng quick sort luôn O(n log n): với pivot cuối trên mảng đã sắp xếp nó chậm O(n²).',
        'Thinking quick sort is always O(n log n): with the last element as pivot on a sorted array it takes O(n²).',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a = [...input.values];
  const n = a.length;
  const fixed: boolean[] = a.map(() => false);

  interface Mark {
    lo: number;
    hi: number;
    /** end of the ≤ pivot zone, or undefined outside a partition */
    i?: number;
    j?: number;
    pivotAt?: number;
  }

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    mk: Mark,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let k = 0; k < n; k++) {
      highlights[k] = fixed[k] ? 'result' : k >= mk.lo && k <= mk.hi ? 'active' : 'muted';
    }
    if (mk.i !== undefined) {
      for (let k = mk.lo; k <= mk.i; k++) if (!fixed[k]) highlights[k] = 'visited';
    }
    const pointers: Record<string, number> = {};
    if (mk.pivotAt !== undefined) {
      highlights[mk.pivotAt] = 'compare';
      pointers.pivot = mk.pivotAt;
      pointers.i = mk.i!;
    }
    if (mk.j !== undefined) {
      highlights[mk.j] = 'compare';
      pointers.j = mk.j;
    }
    emit(
      { values: [...a], mode: 'bars' },
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

  put(EX.start, 1, { n, lo: 0, hi: n - 1 }, { lo: 0, hi: n - 1 }, 'start');

  function sort(lo: number, hi: number): void {
    tick();
    if (lo > hi) return;
    if (lo === hi) {
      fixed[lo] = true;
      return;
    }
    const pivot = a[hi];
    let i = lo - 1;
    put(EX.pick, 3, { lo, hi, pivot, i }, { lo, hi, i, pivotAt: hi }, 'pick-pivot');
    for (let j = lo; j < hi; j++) {
      tick();
      put(
        EX.compare,
        5,
        { lo, hi, i, j, aj: a[j], pivot },
        { lo, hi, i, j, pivotAt: hi },
        'compare',
      );
      if (a[j] <= pivot) {
        i++;
        [a[i], a[j]] = [a[j], a[i]];
        put(EX.swap, 5, { lo, hi, i, j, aj: a[i], pivot }, { lo, hi, i, j, pivotAt: hi }, 'swap');
      } else {
        put(EX.stay, 5, { lo, hi, i, j, aj: a[j], pivot }, { lo, hi, i, j, pivotAt: hi });
      }
    }
    const p = i + 1;
    [a[p], a[hi]] = [a[hi], a[p]];
    fixed[p] = true;
    put(EX.place, 6, { lo, hi, p, pivot }, { lo, hi }, 'place-pivot');
    for (const [l, r] of [
      [lo, p - 1],
      [p + 1, hi],
    ]) {
      if (l < r) put(EX.recurse, 7, { lo: l, hi: r }, { lo: l, hi: r }, 'recurse');
      sort(l, r);
    }
  }
  sort(0, n - 1);
  put(EX.done, 2, { n }, { lo: 0, hi: -1 }, 'done');
}

export const quickSortEntry: WalkthroughEntry<In, S> = {
  id: 'quick-sort',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t2-sorting', 't2-divide-conquer'],
  title: m('Quick sort (phân hoạch Lomuto)', 'Quick sort (Lomuto partition)'),
  code: {
    pseudo: [
      'quicksort(lo, hi):',
      '    if lo ≥ hi: return',
      '    pivot ← a[hi]; i ← lo − 1',
      '    for j ← lo .. hi − 1:',
      '        if a[j] ≤ pivot: i ← i + 1; swap(a[i], a[j])',
      '    swap(a[i + 1], a[hi]); p ← i + 1',
      '    quicksort(lo, p − 1); quicksort(p + 1, hi)',
    ],
    impl: {
      cpp: [
        'int partition_lomuto(std::vector<int>& a, int lo, int hi) {',
        '    int pivot = a[hi], i = lo - 1;',
        '    for (int j = lo; j < hi; j++) {',
        '        if (a[j] <= pivot) {',
        '            i++;',
        '            std::swap(a[i], a[j]);',
        '        }',
        '    }',
        '    std::swap(a[i + 1], a[hi]);',
        '    return i + 1;',
        '}',
        'void quicksort(std::vector<int>& a, int lo, int hi) {',
        '    if (lo >= hi) return;',
        '    int p = partition_lomuto(a, lo, hi);',
        '    quicksort(a, lo, p - 1);',
        '    quicksort(a, p + 1, hi);',
        '}',
      ],
      py: [
        'def partition_lomuto(a, lo, hi):',
        '    pivot, i = a[hi], lo - 1',
        '    for j in range(lo, hi):',
        '        if a[j] <= pivot:',
        '            i += 1',
        '            a[i], a[j] = a[j], a[i]',
        '    a[i + 1], a[hi] = a[hi], a[i + 1]',
        '    return i + 1',
        'def quicksort(a, lo, hi):',
        '    if lo >= hi:',
        '        return',
        '    p = partition_lomuto(a, lo, hi)',
        '    quicksort(a, lo, p - 1)',
        '    quicksort(a, p + 1, hi)',
      ],
    },
    map: {
      cpp: { 1: [12], 2: [13], 3: [2], 4: [3], 5: [4, 5, 6], 6: [9, 10], 7: [14, 15, 16] },
      py: { 1: [9], 2: [10, 11], 3: [2], 4: [3], 5: [4, 5, 6], 6: [7, 8], 7: [12, 13, 14] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { values: { kind: 'int-array', len: [2, 8], range: [-999, 999] } },
  },
  customInput: false,
  presets: [
    {
      id: 'random',
      label: m('Mảng ngẫu nhiên', 'A random array'),
      input: { values: [5, 2, 8, 1, 9, 3] },
    },
    {
      id: 'sorted',
      label: m('Đã sắp xếp (trường hợp xấu)', 'Already sorted (worst case)'),
      input: { values: [1, 2, 3, 4, 5, 6] },
    },
    { id: 'dups', label: m('Có số trùng', 'With duplicates'), input: { values: [3, 1, 3, 2, 3] } },
    { id: 'n2', label: m('Hai phần tử', 'Two elements'), input: { values: [2, 1] } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'recurse',
      text: m(
        'Đệ quy phải là (lo, p − 1) và (p + 1, hi): pivot đã cố định, đưa nó vào lại đoạn con có thể lặp vô hạn.',
        'Recurse on (lo, p − 1) and (p + 1, hi): the pivot is fixed, putting it back into a range can loop forever.',
      ),
    },
    {
      beat: 'done',
      text: m(
        'Mảng đã sắp xếp (hoặc toàn số bằng nhau) với pivot là phần tử cuối cho O(n²); trong thực tế chọn pivot ngẫu nhiên hoặc trung vị của ba số.',
        'A sorted array (or all-equal numbers) with the last element as pivot gives O(n²); in practice pick a random pivot or the median of three.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'pick-pivot',
      text: m(
        'Khi lo = 0, i = lo − 1 = −1: dùng int có dấu cho i; nếu dùng size_t, −1 tràn thành số rất lớn.',
        'When lo = 0, i = lo − 1 = −1: use a signed int for i; with size_t, −1 wraps to a huge number.',
      ),
    },
    {
      lang: 'py',
      beat: 'recurse',
      text: m(
        'Cắt lát a[lo:hi] tạo bản sao nên sắp xếp trên lát cắt không đổi mảng gốc; hãy truyền chỉ số lo, hi như ở trên.',
        'A slice a[lo:hi] makes a copy, so sorting the slice does not change the original; pass lo, hi indices as above.',
      ),
    },
  ],
  maxFrames: 120,
  maxBytes: 200_000,
  run,
};
