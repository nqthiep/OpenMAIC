/**
 * Walkthrough entry: longest strictly increasing subsequence, O(n²) DP (SCHEMA §5, card 2B-11).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { values: number[] };
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
    'Tìm dãy con tăng ngặt dài nhất của {n} số. dp[i] = độ dài dãy tăng dài nhất kết thúc đúng tại a[i].',
    'Find the longest strictly increasing subsequence of {n} numbers. dp[i] = the length of the longest increasing run ending exactly at a[i].',
  ),
  init: m(
    'Mỗi số tự nó là một dãy tăng dài 1, nên lúc đầu dp[i] = 1 cho mọi i.',
    'Every number alone is an increasing sequence of length 1, so at first dp[i] = 1 for all i.',
  ),
  ask: m(
    'Xét i = {i}, j = {j}: a[{j}] = {aj} < a[{i}] = {ai}. Nối a[{i}] vào sau dãy kết thúc tại {j} có làm dp[{i}] = {di} tăng không?',
    'Take i = {i}, j = {j}: a[{j}] = {aj} < a[{i}] = {ai}. Does appending a[{i}] to the run ending at {j} raise dp[{i}] = {di}?',
  ),
  up: m(
    'dp[{j}] + 1 = {cand} > dp[{i}]: cập nhật dp[{i}] = {cand}, đi tới {i} từ {j}.',
    'dp[{j}] + 1 = {cand} > dp[{i}]: update dp[{i}] = {cand}, reaching {i} from {j}.',
  ),
  same: m(
    'dp[{j}] + 1 = {cand} không lớn hơn dp[{i}] = {di}: giữ nguyên dp[{i}].',
    'dp[{j}] + 1 = {cand} is not above dp[{i}] = {di}: dp[{i}] stays.',
  ),
  notLess: m(
    'a[{j}] = {aj} không nhỏ hơn a[{i}] = {ai} (cần tăng ngặt): không nối được.',
    'a[{j}] = {aj} is not smaller than a[{i}] = {ai} (strictly increasing is needed): no link.',
  ),
  best: m(
    'Đáp án là max(dp) = {best}, ở vị trí {at}, không phải dp[n − 1]: dãy tốt nhất không cần kết thúc ở phần tử cuối.',
    'The answer is max(dp) = {best}, at position {at}, not dp[n − 1]: the best sequence need not end at the last element.',
  ),
  trace: m(
    'Truy vết: a[{i}] = {ai} thuộc dãy; phần tử trước nó là a[{p}] = {ap}.',
    'Trace: a[{i}] = {ai} is in the sequence; the element before it is a[{p}] = {ap}.',
  ),
  traceFirst: m(
    'Truy vết: a[{i}] = {ai} là phần tử đầu tiên của dãy (dp[{i}] = 1).',
    'Trace: a[{i}] = {ai} is the first element of the sequence (dp[{i}] = 1).',
  ),
  done: m(
    'Dãy tăng ngặt dài nhất có {best} phần tử: {seq}.',
    'The longest strictly increasing subsequence has {best} elements: {seq}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Dãy con tăng ngặt giữ thứ tự, có thể bỏ phần tử, và mỗi số lớn hơn số trước. Ta tính dp[i] cho từng i, rồi lấy lớn nhất. Có {n} số.',
      'A strictly increasing subsequence keeps order, may skip elements, and each number exceeds the previous one. We compute dp[i] for every i, then take the maximum. There are {n} numbers.',
    ),
    hints: [
      m(
        'Thử mọi dãy con có bao nhiêu khả năng?',
        'How many candidates does trying every subsequence give?',
      ),
      m(
        '2^n: quá nhiều. Hãy tìm dãy tốt nhất kết thúc tại từng vị trí.',
        '2^n: too many. Find the best run ending at each position instead.',
      ),
      m(
        'dp[i] = 1 + max dp[j] với j < i và a[j] < a[i]; đáp án là max của cả mảng dp.',
        'dp[i] = 1 + max dp[j] over j < i with a[j] < a[i]; the answer is the maximum of the whole dp array.',
      ),
    ],
    misconceptions: [
      m(
        'Nhầm dãy con với dãy con liên tiếp (đoạn): dãy con có thể bỏ phần tử ở giữa.',
        'Mixing up a subsequence with a contiguous run: a subsequence may skip elements in between.',
      ),
    ],
  },
  {
    id: 'init',
    label: m('Khởi tạo', 'Initialise'),
    narration: m(
      'Mỗi phần tử đứng một mình đã là dãy tăng độ dài 1. Vì vậy dp[i] ≥ 1 và lúc đầu ta đặt cả hàng dp bằng 1.',
      'A single element is already an increasing sequence of length 1. So dp[i] ≥ 1 and at first we set the whole dp row to 1.',
    ),
    hints: [
      m('Dãy chỉ có một số có tăng không?', 'Is a sequence with one number increasing?'),
      m(
        'Có, độ dài 1. Vậy dp[i] ít nhất là bao nhiêu?',
        'Yes, length 1. So what is the least dp[i] can be?',
      ),
      m(
        'dp[i] = 1 với mọi i lúc đầu; các vị trí trước có thể làm nó lớn hơn.',
        'dp[i] = 1 for all i at first; earlier positions may raise it.',
      ),
    ],
    misconceptions: [
      m(
        'Khởi tạo dp[i] = 0: dãy chỉ có a[i] vẫn có độ dài 1.',
        'Initialising dp[i] = 0: the sequence containing just a[i] still has length 1.',
      ),
    ],
  },
  {
    id: 'extend',
    label: m('Nối thêm', 'Extend'),
    narration: m(
      'Với i = {i}, ta thử từng j < i. Vì a[{j}] = {aj} nhỏ hơn a[{i}] = {ai}, ta có thể nối a[{i}] vào dãy kết thúc tại {j}, được độ dài dp[{j}] + 1.',
      'For i = {i} we try every j < i. Since a[{j}] = {aj} is smaller than a[{i}] = {ai}, we can append a[{i}] to the run ending at {j}, giving length dp[{j}] + 1.',
    ),
    ask: {
      text: m('Theo em, dp[i] có tăng nhờ j này không?', 'Does dp[i] increase thanks to this j?'),
      predict: {
        kind: 'choice',
        options: [
          m('Có, dp[i] tăng', 'Yes, dp[i] increases'),
          m('Không, giữ nguyên', 'No, it stays'),
        ],
        answer: (_frame, next) => (next?.meta.vars?.up === 1 ? 0 : 1),
      },
    },
    hints: [
      m('So dp[j] + 1 với dp[i] hiện tại.', 'Compare dp[j] + 1 with the current dp[i].'),
      m(
        'dp[i] chỉ đổi khi dp[j] + 1 lớn hơn hẳn nó.',
        'dp[i] changes only if dp[j] + 1 is strictly larger.',
      ),
      m(
        'Tăng nếu dp[j] + 1 > dp[i]; nếu bằng hoặc nhỏ hơn thì giữ.',
        'It rises if dp[j] + 1 > dp[i]; if equal or smaller, it stays.',
      ),
    ],
    misconceptions: [
      m(
        'Dùng a[j] ≤ a[i] thay vì <: sẽ cho phép hai số bằng nhau trong dãy, không còn tăng ngặt.',
        'Using a[j] ≤ a[i] instead of <: equal numbers would be allowed, so it is no longer strictly increasing.',
      ),
    ],
  },
  {
    id: 'best',
    label: m('Lấy lớn nhất', 'Take the maximum'),
    narration: m(
      'Mỗi dp[i] chỉ nói dãy tốt nhất kết thúc tại i. Dãy tốt nhất của cả mảng có thể kết thúc ở bất kỳ đâu, nên ta lấy max(dp) = {best}.',
      'Each dp[i] only gives the best run ending at i. The best run of the whole array can end anywhere, so we take max(dp) = {best}.',
    ),
    hints: [
      m('dp[n − 1] có luôn là đáp án không?', 'Is dp[n − 1] always the answer?'),
      m(
        'Không: nếu số cuối nhỏ, dãy tốt nhất có thể kết thúc sớm hơn.',
        'No: if the last number is small, the best run may end earlier.',
      ),
      m(
        'Đáp án = max(dp[0..n − 1]); ví dụ [5, 4, 3, 2, 1] cho dp toàn 1.',
        'The answer = max(dp[0..n − 1]); for example [5, 4, 3, 2, 1] gives dp all 1.',
      ),
    ],
    misconceptions: [
      m(
        'Trả về dp[n − 1]: sai khi phần tử cuối nhỏ hơn các phần tử trước.',
        'Returning dp[n − 1]: wrong when the last element is smaller than earlier ones.',
      ),
    ],
  },
  {
    id: 'traceback',
    label: m('Truy vết', 'Traceback'),
    narration: m(
      'Để lấy chính dãy, ta đi ngược từ vị trí tốt nhất: mỗi bước nhảy về phần tử đã giúp dp tăng (mũi tên), tới khi gặp dp = 1.',
      'To recover the sequence itself we walk back from the best position: each step jumps to the element that raised dp (the arrow), until dp = 1.',
    ),
    hints: [
      m(
        'Làm sao biết phần tử nào đứng trước a[i] trong dãy tốt nhất?',
        'How do we know which element comes before a[i] in the best sequence?',
      ),
      m(
        'Đó là j đã làm dp[i] tăng lần cuối; ta lưu nó (mũi tên).',
        'It is the j that last raised dp[i]; we keep it (the arrow).',
      ),
      m(
        'Đi theo mũi tên ngược lại cho đến phần tử có dp = 1, rồi đảo thứ tự.',
        'Follow the arrows back to an element with dp = 1, then reverse the order.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dãy tốt nhất là mọi phần tử có dp tăng dần: chúng thuộc nhiều dãy khác nhau.',
        'Thinking the best sequence is every element with rising dp: they belong to many different runs.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Dãy tăng ngặt dài nhất có {best} phần tử. Hai vòng lặp lồng nhau cho O(n²) thời gian; có cách O(n log n) bằng tìm kiếm nhị phân.',
      'The longest strictly increasing subsequence has {best} elements. Two nested loops give O(n²) time; an O(n log n) method with binary search exists.',
    ),
    hints: [
      m('Có bao nhiêu cặp (j, i)?', 'How many pairs (j, i) are there?'),
      m('Cỡ n²/2 cặp, mỗi cặp O(1).', 'About n²/2 pairs, each O(1).'),
      m(
        'O(n²) thời gian, O(n) bộ nhớ; với n lớn (10^5) cần cách O(n log n).',
        'O(n²) time and O(n) memory; for large n (10^5) an O(n log n) method is needed.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dãy tăng dài nhất là duy nhất: có thể có nhiều dãy cùng độ dài tối đa.',
        'Thinking the longest increasing sequence is unique: several may share the maximum length.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a = input.values;
  const n = a.length;
  const dp: (number | undefined)[] = Array(n).fill(undefined);
  const parent: number[] = Array(n).fill(-1);
  const key = (r: number, c: number): string => `${r},${c}`;
  const arrowsNow = (): { from: string; to: string }[] =>
    parent.flatMap((p, i) => (p >= 0 ? [{ from: key(1, p), to: key(1, i) }] : []));
  const colLabels = Array.from({ length: n }, (_, k) => String(k));

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number | string>,
    marks: Record<string, HighlightKind>,
    tag?: string,
  ): void => {
    emit(
      {
        rows: 2,
        cols: n,
        cells: [[...a], dp.map((x) => (x === undefined ? '' : x))],
        rowLabels: ['a', 'dp'],
        colLabels,
        arrows: arrowsNow(),
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

  put(EX.start, 1, { n }, {}, 'start');
  for (let i = 0; i < n; i++) dp[i] = 1;
  put(
    EX.init,
    1,
    {},
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [key(1, i), 'visited' as HighlightKind]),
    ),
    'init',
  );
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      tick();
      const di = dp[i] as number;
      const dj = dp[j] as number;
      const marks: Record<string, HighlightKind> = {
        [key(0, i)]: 'active',
        [key(0, j)]: 'compare',
        [key(1, i)]: 'active',
        [key(1, j)]: 'compare',
      };
      if (!(a[j] < a[i])) {
        put(EX.notLess, 3, { i, j, ai: a[i], aj: a[j], up: 0 }, marks);
        continue;
      }
      put(EX.ask, 3, { i, j, ai: a[i], aj: a[j], di }, marks, 'extend');
      const cand = dj + 1;
      if (cand > di) {
        dp[i] = cand;
        parent[i] = j;
        put(EX.up, 3, { i, j, cand, up: 1 }, { ...marks, [key(1, i)]: 'result' });
      } else {
        put(EX.same, 3, { i, j, cand, di, up: 0 }, marks);
      }
    }
  }
  const values = dp as number[];
  let at = 0;
  for (let i = 1; i < n; i++) if (values[i] > values[at]) at = i; // first maximum
  const best = values[at];
  put(EX.best, 4, { best, at }, { [key(1, at)]: 'result' }, 'best');
  const seq: number[] = [];
  const path: Record<string, HighlightKind> = {};
  for (let i = at; i >= 0; i = parent[i]) {
    tick();
    seq.unshift(a[i]);
    path[key(0, i)] = 'result';
    path[key(1, i)] = 'result';
    if (parent[i] >= 0) {
      put(EX.trace, 4, { i, ai: a[i], p: parent[i], ap: a[parent[i]] }, path, 'traceback');
    } else {
      put(EX.traceFirst, 4, { i, ai: a[i] }, path, 'traceback');
    }
  }
  put(EX.done, 4, { best, seq: seq.join(', ') }, path, 'done');
}

export const lisEntry: WalkthroughEntry<In, S> = {
  id: 'lis',
  entryRev: 1,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t3-dp-basic'],
  title: m('Dãy con tăng dài nhất (O(n²))', 'Longest increasing subsequence (O(n²))'),
  code: {
    pseudo: [
      'dp[i] ← 1 với mọi i',
      'for i ← 1 .. n − 1:  for j ← 0 .. i − 1:',
      '    if a[j] < a[i]: dp[i] ← max(dp[i], dp[j] + 1)',
      'return max(dp)   (truy vết theo mũi tên để lấy dãy)',
    ],
    impl: {
      cpp: [
        'int lis(const std::vector<int>& a) {',
        '    int n = a.size();',
        '    std::vector<int> dp(n, 1);',
        '    for (int i = 1; i < n; i++) {',
        '        for (int j = 0; j < i; j++) {',
        '            if (a[j] < a[i]) dp[i] = std::max(dp[i], dp[j] + 1);',
        '        }',
        '    }',
        '    return *std::max_element(dp.begin(), dp.end());',
        '}',
      ],
      py: [
        'def lis(a):',
        '    n = len(a)',
        '    dp = [1] * n',
        '    for i in range(1, n):',
        '        for j in range(i):',
        '            if a[j] < a[i]:',
        '                dp[i] = max(dp[i], dp[j] + 1)',
        '    return max(dp)',
      ],
    },
    map: {
      cpp: { 1: [3], 2: [4, 5], 3: [6], 4: [9] },
      py: { 1: [3], 2: [4, 5], 3: [6, 7], 4: [8] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: { values: { kind: 'int-array', len: [1, 8], range: [-99, 99] } },
  },
  customInput: false,
  presets: [
    {
      id: 'mixed',
      label: m('Dãy lộn xộn', 'A mixed sequence'),
      input: { values: [3, 10, 2, 1, 20, 4, 6, 7] },
    },
    { id: 'increasing', label: m('Tăng dần', 'Increasing'), input: { values: [1, 2, 3, 4, 5] } },
    { id: 'decreasing', label: m('Giảm dần', 'Decreasing'), input: { values: [5, 4, 3, 2, 1] } },
    { id: 'single', label: m('Một phần tử', 'One element'), input: { values: [7] } },
    {
      id: 'dups',
      label: m('Có số bằng nhau', 'With equal numbers'),
      input: { values: [2, 2, 2, 3] },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'extend',
      text: m(
        'Tăng NGẶT: so a[j] < a[i], không phải ≤. Với [2, 2, 2, 3] đáp án là 2, không phải 4.',
        'STRICTLY increasing: compare a[j] < a[i], not ≤. For [2, 2, 2, 3] the answer is 2, not 4.',
      ),
    },
    {
      beat: 'best',
      text: m(
        'Đáp án là max(dp), không phải dp[n − 1]: dp[i] chỉ tính các dãy kết thúc đúng tại i.',
        'The answer is max(dp), not dp[n − 1]: dp[i] counts only runs ending exactly at i.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'best',
      text: m(
        'std::max_element trả về iterator: dùng *std::max_element(...) để lấy giá trị; với vector rỗng nó trả về end(), không được dereference.',
        'std::max_element returns an iterator: use *std::max_element(...) for the value; on an empty vector it returns end(), which must not be dereferenced.',
      ),
    },
    {
      lang: 'py',
      beat: 'init',
      text: m(
        'dp = [1] * n tạo n số 1 độc lập (số nguyên bất biến) nên an toàn; với list lồng nhau thì không như vậy.',
        'dp = [1] * n makes n independent 1s (integers are immutable), which is safe; nested lists would not be.',
      ),
    },
  ],
  maxFrames: 100,
  maxBytes: 200_000,
  run,
};
