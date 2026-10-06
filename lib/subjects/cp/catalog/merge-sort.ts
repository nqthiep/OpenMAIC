/**
 * Walkthrough entry: top-down merge sort (SCHEMA §5, card 2A-06).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[] };
type S = {
  values: number[];
  mode: 'bars';
  /** the merge buffer `tmp`, drawn under the columns lo..hi it will be copied back to */
  rows: { label: string; values: (number | null)[]; offset: number }[];
};

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Sắp xếp {n} số bằng merge sort: chia đôi đến khi mỗi đoạn có một phần tử, rồi trộn hai đoạn đã sắp thành một.',
    'Sort {n} numbers with merge sort: halve until each range has one element, then merge sorted ranges into one.',
  ),
  split: m(
    'Chia đoạn [{lo}, {hi}] tại mid = {mid} thành nửa trái [{lo}, {mid}] và nửa phải [{r0}, {hi}].',
    'Split the range [{lo}, {hi}] at mid = {mid} into the left half [{lo}, {mid}] and the right half [{r0}, {hi}].',
  ),
  compare: m(
    'Trộn [{lo}, {hi}]: so a[{i}] = {ai} (nửa trái) với a[{j}] = {aj} (nửa phải).',
    'Merging [{lo}, {hi}]: compare a[{i}] = {ai} (left half) with a[{j}] = {aj} (right half).',
  ),
  left: m(
    '{v} ≤ {w}: lấy {v} từ nửa trái đặt vào tmp[{k}]. Dùng ≤ để giữ nguyên thứ tự hai số bằng nhau.',
    '{v} ≤ {w}: take {v} from the left half into tmp[{k}]. Using ≤ keeps equal numbers in their original order.',
  ),
  right: m(
    '{w} > {v}: lấy {v} từ nửa phải đặt vào tmp[{k}].',
    '{w} > {v}: take {v} from the right half into tmp[{k}].',
  ),
  restLeft: m(
    'Nửa phải đã hết. Chép nốt {cnt} số còn lại của nửa trái vào tmp; chúng đã sắp xếp sẵn.',
    'The right half is used up. Copy the {cnt} remaining numbers of the left half into tmp; they are already sorted.',
  ),
  restRight: m(
    'Nửa trái đã hết. Chép nốt {cnt} số còn lại của nửa phải vào tmp; chúng đã sắp xếp sẵn.',
    'The left half is used up. Copy the {cnt} remaining numbers of the right half into tmp; they are already sorted.',
  ),
  merged: m(
    'Chép tmp về a[{lo}..{hi}]: đoạn [{lo}, {hi}] đã sắp xếp tăng dần.',
    'Copy tmp back to a[{lo}..{hi}]: the range [{lo}, {hi}] is now sorted increasingly.',
  ),
  done: m(
    'Cả mảng {n} số đã sắp xếp. Mỗi tầng trộn tốn O(n) và có khoảng log n tầng: O(n log n).',
    'The whole array of {n} numbers is sorted. Each level of merging costs O(n) and there are about log n levels: O(n log n).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Merge sort chia để trị: chia mảng {n} số làm đôi cho tới khi mỗi đoạn một phần tử, rồi trộn lại theo thứ tự.',
      'Merge sort divides and conquers: halve the array of {n} numbers until each range holds one element, then merge them back in order.',
    ),
    hints: [
      m(
        'Một đoạn chỉ có một phần tử thì đã sắp xếp chưa?',
        'Is a range with a single element already sorted?',
      ),
      m(
        'Rồi. Vấn đề còn lại: ghép hai đoạn đã sắp thành một đoạn đã sắp.',
        'Yes. What remains: combine two sorted ranges into one sorted range.',
      ),
      m(
        'Chia đôi đệ quy tới đoạn một phần tử, rồi trộn từng cặp: việc trộn chỉ cần O(n).',
        'Halve recursively down to single elements, then merge pair by pair: a merge needs only O(n).',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng việc chia đôi đã làm mảng gần sắp xếp: phần chia chỉ tách đoạn, việc sắp xếp xảy ra khi trộn.',
        'Thinking halving already gets the array closer to sorted: splitting only separates ranges, the sorting happens while merging.',
      ),
    ],
  },
  {
    id: 'split',
    label: m('Chia đôi', 'Split in half'),
    narration: m(
      'Đoạn [{lo}, {hi}] có từ hai phần tử trở lên nên được chia tại mid = {mid}: nửa trái [{lo}, {mid}], nửa phải [{r0}, {hi}].',
      'The range [{lo}, {hi}] has two or more elements, so it is split at mid = {mid}: left [{lo}, {mid}], right [{r0}, {hi}].',
    ),
    hints: [
      m('Khi nào ta còn phải chia tiếp?', 'When do we still have to split?'),
      m(
        'Khi đoạn có ít nhất hai phần tử (lo < hi).',
        'When the range has at least two elements (lo < hi).',
      ),
      m(
        'mid = ⌊(lo + hi) / 2⌋; sắp riêng [lo, mid] và [mid + 1, hi] rồi trộn.',
        'mid = ⌊(lo + hi) / 2⌋; sort [lo, mid] and [mid + 1, hi] separately, then merge.',
      ),
    ],
    misconceptions: [
      m(
        'Nửa phải bắt đầu ở mid thay vì mid + 1: phần tử mid bị xử lý hai lần.',
        'Starting the right half at mid instead of mid + 1: the element mid would be handled twice.',
      ),
    ],
  },
  {
    id: 'merge-compare',
    label: m('So hai đầu', 'Compare the fronts'),
    narration: m(
      'Hai nửa đã sắp xếp, ta chỉ cần xem số nhỏ nhất của mỗi nửa: a[{i}] = {ai} và a[{j}] = {aj}. Số nhỏ hơn sẽ được lấy trước.',
      'Both halves are sorted, so we only look at the smallest of each: a[{i}] = {ai} and a[{j}] = {aj}. The smaller one is taken first.',
    ),
    ask: {
      text: m(
        'Theo em, số tiếp theo vào tmp lấy từ nửa trái hay nửa phải?',
        'Will the next number for tmp come from the left or the right half?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Nửa trái', 'The left half'), m('Nửa phải', 'The right half')],
        answer: (frame, next) => (next?.meta.vars?.i !== frame.meta.vars?.i ? 0 : 1),
      },
    },
    hints: [
      m(
        'Mỗi nửa đã sắp xếp: số nhỏ nhất của nửa nằm ở đâu?',
        'Each half is sorted: where is its smallest number?',
      ),
      m(
        'Ở đầu nửa đó. Số nhỏ nhất cả hai nửa là số nhỏ hơn trong hai số đầu.',
        'At its front. The smallest of both halves is the smaller of the two fronts.',
      ),
      m(
        'a[i] ≤ a[j] ⇒ lấy từ nửa trái; ngược lại lấy từ nửa phải.',
        'a[i] ≤ a[j] ⇒ take from the left half; otherwise from the right half.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng < thay cho ≤ khi so: hai số bằng nhau có thể bị đảo thứ tự, mất tính ổn định.',
        'Using < instead of ≤: equal numbers may swap order, which loses stability.',
      ),
    ],
  },
  {
    id: 'copy-rest',
    label: m('Chép phần còn lại', 'Copy the rest'),
    narration: m(
      'Một nửa đã hết, nửa còn lại còn {cnt} số đã sắp xếp và đều lớn hơn mọi số đã lấy: chép nguyên vào tmp.',
      'One half is used up; the other still has {cnt} sorted numbers, all larger than everything taken: copy them as they are.',
    ),
    hints: [
      m(
        'Khi một nửa hết, phần còn lại của nửa kia cần so sánh nữa không?',
        'When one half is used up, does the rest of the other half still need comparing?',
      ),
      m(
        'Không: chúng đã sắp xếp và không nhỏ hơn số nào đã lấy.',
        'No: they are sorted and not smaller than anything already taken.',
      ),
      m(
        'Chép hết phần còn lại vào tmp; quên bước này thì mất phần tử.',
        'Copy the whole rest into tmp; skipping this step loses elements.',
      ),
    ],
    misconceptions: [
      m(
        'Quên chép phần còn lại: vòng lặp chính dừng khi một nửa hết, nửa kia vẫn còn số chưa vào tmp.',
        'Forgetting to copy the rest: the main loop stops when one half ends, but the other still has numbers not in tmp.',
      ),
    ],
  },
  {
    id: 'merged',
    label: m('Đã trộn xong', 'Merged'),
    narration: m(
      'tmp đã chứa đoạn [{lo}, {hi}] theo thứ tự tăng dần. Ta chép nó về a[{lo}..{hi}] để các tầng trên dùng tiếp.',
      'tmp now holds the range [{lo}, {hi}] in increasing order. We copy it back to a[{lo}..{hi}] for the levels above.',
    ),
    hints: [
      m('Vì sao phải chép tmp về mảng gốc?', 'Why must tmp be copied back to the original array?'),
      m(
        'Tầng trên sẽ trộn tiếp từ mảng a, không từ tmp.',
        'The level above merges from the array a, not from tmp.',
      ),
      m(
        'Chép đúng đoạn [lo, hi] từ tmp về a; chép lệch chỗ sẽ làm hỏng các đoạn khác.',
        'Copy exactly the range [lo, hi] from tmp back to a; a shifted copy would corrupt other ranges.',
      ),
    ],
    misconceptions: [
      m(
        'Mảng phụ tmp sai kích thước hoặc chép về sai vị trí (từ 0 thay vì từ lo).',
        'A wrongly sized tmp, or copying back to the wrong place (from 0 instead of from lo).',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Cả mảng {n} số đã sắp xếp. Chia đôi cho log n tầng, mỗi tầng trộn O(n), nên O(n log n) cho mọi đầu vào, đổi lại cần thêm bộ nhớ phụ O(n).',
      'The whole array of {n} numbers is sorted. Halving gives log n levels, each merge level costs O(n), so O(n log n) for every input, at the price of O(n) extra memory.',
    ),
    hints: [
      m('Có bao nhiêu tầng chia đôi?', 'How many levels of halving are there?'),
      m(
        'Mỗi lần chia đôi độ dài, nên khoảng log n tầng.',
        'Each split halves the length, so about log n levels.',
      ),
      m(
        'Mỗi tầng trộn tổng cộng n phần tử: O(n log n), không phụ thuộc mảng đã sắp hay chưa.',
        'Each level merges n elements in total: O(n log n), whether or not the array was sorted.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng merge sort sắp tại chỗ: nó cần mảng phụ tmp cỡ n.',
        'Thinking merge sort works in place: it needs an auxiliary array tmp of size n.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a = [...input.values];
  const n = a.length;
  const sortedRange: boolean[] = a.map(() => false);

  interface View {
    lo: number;
    hi: number;
    mid?: number;
    i?: number;
    j?: number;
    tmp?: (number | null)[];
    /** `r0:k` cells to mark */
    tmpMark?: number;
  }

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    v: View,
    tag?: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let k = 0; k < n; k++) {
      highlights[k] = k >= v.lo && k <= v.hi ? 'active' : sortedRange[k] ? 'visited' : 'muted';
    }
    const pointers: Record<string, number> = {};
    if (v.mid !== undefined) {
      for (let k = v.lo; k <= v.mid; k++) highlights[k] = 'group-0';
      for (let k = v.mid + 1; k <= v.hi; k++) highlights[k] = 'group-1';
    }
    if (v.i !== undefined && v.j !== undefined) {
      for (let k = v.lo; k < v.i; k++) highlights[k] = 'visited';
      for (let k = v.mid! + 1; k < v.j; k++) highlights[k] = 'visited';
      if (v.i <= v.mid!) {
        highlights[v.i] = 'compare';
        pointers.i = v.i;
      }
      if (v.j <= v.hi) {
        highlights[v.j] = 'compare';
        pointers.j = v.j;
      }
    }
    const rowHl: Record<string, HighlightKind> = {};
    if (v.tmpMark !== undefined) rowHl[`r0:${v.tmpMark}`] = 'result';
    emit(
      {
        values: [...a],
        mode: 'bars',
        rows: v.tmp ? [{ label: 'tmp', values: [...v.tmp], offset: v.lo }] : [],
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: { ...highlights, ...rowHl },
        pointers,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  put(EX.start, 1, { n }, { lo: 0, hi: n - 1 }, 'start');

  function sort(lo: number, hi: number): void {
    tick();
    if (lo >= hi) return;
    const mid = Math.floor((lo + hi) / 2);
    put(EX.split, 3, { lo, hi, mid, r0: mid + 1 }, { lo, hi, mid }, 'split');
    sort(lo, mid);
    sort(mid + 1, hi);

    const tmp: (number | null)[] = Array<number | null>(hi - lo + 1).fill(null);
    let i = lo;
    let j = mid + 1;
    let k = 0;
    while (i <= mid && j <= hi) {
      tick();
      put(
        EX.compare,
        5,
        { lo, mid, hi, i, j, ai: a[i], aj: a[j] },
        { lo, hi, mid, i, j, tmp },
        'merge-compare',
      );
      const takeLeft = a[i] <= a[j];
      const v = takeLeft ? a[i] : a[j];
      const w = takeLeft ? a[j] : a[i];
      tmp[k] = v;
      if (takeLeft) i++;
      else j++;
      put(
        takeLeft ? EX.left : EX.right,
        5,
        { lo, mid, hi, i, j, v, w, k },
        { lo, hi, mid, i, j, tmp, tmpMark: k },
      );
      k++;
    }
    const fromLeft = i <= mid;
    const cnt = fromLeft ? mid - i + 1 : hi - j + 1;
    while (i <= mid) tmp[k++] = a[i++];
    while (j <= hi) tmp[k++] = a[j++];
    put(
      fromLeft ? EX.restLeft : EX.restRight,
      6,
      { lo, mid, hi, i, j, cnt },
      { lo, hi, mid, i, j, tmp },
      'copy-rest',
    );
    for (let t = 0; t < tmp.length; t++) a[lo + t] = tmp[t] as number;
    for (let t = lo; t <= hi; t++) sortedRange[t] = true;
    put(EX.merged, 7, { lo, hi }, { lo, hi, tmp }, 'merged');
  }
  sort(0, n - 1);
  const all: Record<string, HighlightKind> = {};
  a.forEach((_, k) => (all[k] = 'result'));
  emit(
    { values: [...a], mode: 'bars', rows: [] },
    {
      explanation: fill(msg(EX.done, ctx.locale), { n }),
      codeLine: 2,
      highlights: all,
      pointers: {},
      vars: { n },
      tags: ['beat:done'],
    },
  );
}

export const mergeSortEntry: WalkthroughEntry<In, S> = {
  id: 'merge-sort',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t2-sorting', 't2-divide-conquer'],
  title: m('Merge sort (trộn từ trên xuống)', 'Merge sort (top-down)'),
  code: {
    pseudo: [
      'mergesort(lo, hi):',
      '    if lo ≥ hi: return',
      '    mid ← ⌊(lo + hi) / 2⌋; mergesort(lo, mid); mergesort(mid + 1, hi)',
      '    i ← lo; j ← mid + 1; k ← 0',
      '    while i ≤ mid và j ≤ hi: tmp[k] ← số nhỏ hơn của a[i], a[j] (a[i] ≤ a[j] thì lấy a[i])',
      '    chép phần còn lại của nửa trái hoặc nửa phải vào tmp',
      '    chép tmp về a[lo..hi]',
    ],
    impl: {
      cpp: [
        'void merge_sort(std::vector<int>& a, int lo, int hi) {',
        '    if (lo >= hi) return;',
        '    int mid = (lo + hi) / 2;',
        '    merge_sort(a, lo, mid);',
        '    merge_sort(a, mid + 1, hi);',
        '    std::vector<int> tmp;',
        '    int i = lo, j = mid + 1;',
        '    while (i <= mid && j <= hi) {',
        '        if (a[i] <= a[j]) tmp.push_back(a[i++]);',
        '        else tmp.push_back(a[j++]);',
        '    }',
        '    while (i <= mid) tmp.push_back(a[i++]);',
        '    while (j <= hi) tmp.push_back(a[j++]);',
        '    for (int k = 0; k < (int)tmp.size(); k++) a[lo + k] = tmp[k];',
        '}',
      ],
      py: [
        'def merge_sort(a, lo, hi):',
        '    if lo >= hi:',
        '        return',
        '    mid = (lo + hi) // 2',
        '    merge_sort(a, lo, mid)',
        '    merge_sort(a, mid + 1, hi)',
        '    tmp = []',
        '    i, j = lo, mid + 1',
        '    while i <= mid and j <= hi:',
        '        if a[i] <= a[j]:',
        '            tmp.append(a[i])',
        '            i += 1',
        '        else:',
        '            tmp.append(a[j])',
        '            j += 1',
        '    tmp.extend(a[i:mid + 1])',
        '    tmp.extend(a[j:hi + 1])',
        '    a[lo:hi + 1] = tmp',
      ],
    },
    map: {
      cpp: { 1: [1], 2: [2], 3: [3, 4, 5], 4: [6, 7], 5: [8, 9, 10, 11], 6: [12, 13], 7: [14] },
      py: {
        1: [1],
        2: [2, 3],
        3: [4, 5, 6],
        4: [7, 8],
        5: [9, 10, 11, 12, 13, 14, 15],
        6: [16, 17],
        7: [18],
      },
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
    { id: 'reverse', label: m('Giảm dần', 'Reversed'), input: { values: [6, 5, 4, 3, 2, 1] } },
    { id: 'dups', label: m('Có số trùng', 'With duplicates'), input: { values: [3, 1, 3, 2, 3] } },
    { id: 'n2', label: m('Hai phần tử', 'Two elements'), input: { values: [2, 1] } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'merge-compare',
      text: m(
        'Dùng a[i] <= a[j] (không phải <) để hai số bằng nhau giữ nguyên thứ tự ban đầu: merge sort ổn định.',
        'Use a[i] <= a[j] (not <) so equal numbers keep their original order: merge sort is stable.',
      ),
    },
    {
      beat: 'copy-rest',
      text: m(
        'Quên chép phần còn lại của nửa chưa hết vào tmp: các số đó bị mất khỏi mảng.',
        'Forgetting to copy what is left of the unfinished half into tmp: those numbers vanish from the array.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'merged',
      text: m(
        'Cấp phát tmp mới ở mọi lần trộn tốn thời gian; có thể dùng một mảng phụ cỡ n dùng chung. Chép về a[lo + k], không phải a[k].',
        'Allocating a new tmp for every merge costs time; one shared buffer of size n works. Copy back to a[lo + k], not a[k].',
      ),
    },
    {
      lang: 'py',
      beat: 'merged',
      text: m(
        'a[lo:hi + 1] = tmp gán cả lát cắt: chiều dài tmp phải đúng bằng hi − lo + 1, nếu không mảng đổi kích thước.',
        'a[lo:hi + 1] = tmp assigns a whole slice: tmp must have exactly hi − lo + 1 items, otherwise the list changes size.',
      ),
    },
  ],
  maxFrames: 120,
  maxBytes: 200_000,
  run,
};
