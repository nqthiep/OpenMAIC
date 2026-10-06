/**
 * Entry `bs-answer-mini`: small "answer binary search" problem (wood cutting), SCHEMA §4.2.
 * Largest integer H with sum(max(0, h[i] - H)) >= m. Pure and deterministic (ADR 0006 decision 7).
 */
import type { Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, Frame, FrameMeta, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

export interface BsAnswerMiniInput {
  h: number[];
  m: number;
}

export interface BsAnswerMiniState {
  values: number[];
  mode: 'bars';
  /** the cutting height H, drawn as a horizontal line */
  threshold?: { value: number; label: string };
}

/** Brute force shows at most this many attempts (from the tallest tree downwards). */
const BRUTE_TRIES = 3;
/** The H-axis band lists every candidate up to this many; wider bands are shortened with an ellipsis. */
const BAND_FULL = 8;

const same = (s: string): Messages => ({ 'vi-VN': s, 'en-US': s });

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
/** Wood each tree gives when cut at H. */
const woodPer = (h: readonly number[], H: number): number[] => h.map((x) => Math.max(0, x - H));
const wood = (h: readonly number[], H: number): number => sum(woodPer(h, H));

const varOf = (f: Frame<unknown> | undefined, key: string): number | undefined => {
  const v = f?.meta.vars?.[key];
  return typeof v === 'number' ? v : undefined;
};

/** Candidate H values lo..hi for the band row; long bands keep both ends and the second value. */
const band = (lo: number, hi: number): (number | string)[] => {
  if (hi - lo + 1 <= BAND_FULL) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  return [lo, lo + 1, '…', hi - 1, hi];
};

interface PutOpts {
  kind?: HighlightKind;
  /** per-tree wood row; hidden on frames that ask whether the wood is enough */
  cut?: boolean;
  /** candidate band [lo, hi] on the H axis */
  range?: readonly [number, number];
}

function run(
  input: Readonly<BsAnswerMiniInput>,
  emit: Emit<BsAnswerMiniState>,
  tick: () => void,
  ctx: RunContext,
): void {
  const { h, m } = input;
  const vi = ctx.locale === 'vi-VN';
  const t = (a: string, b: string): string => (vi ? a : b);
  const top = Math.max(...h);

  /** One frame: bars + line at H (if any); trees taller than H are the ones being cut. */
  const put = (
    H: number | undefined,
    meta: Omit<FrameMeta, 'index'>,
    { kind = 'active', cut = true, range }: PutOpts = {},
  ): void => {
    const state: BsAnswerMiniState = { values: [...h], mode: 'bars' };
    const extra: {
      highlights?: Record<string, HighlightKind>;
      aux?: { id: string; label: string; items: (number | string)[] }[];
    } = {};
    const aux: NonNullable<typeof extra.aux> = [];
    if (H !== undefined) {
      state.threshold = { value: H, label: 'H' };
      const highlights: Record<string, HighlightKind> = {};
      h.forEach((x, i) => {
        if (x > H) highlights[String(i)] = kind;
      });
      extra.highlights = highlights;
      if (cut) {
        aux.push({
          id: 'cut',
          label: t('Gỗ mỗi cây = max(0, h − H)', 'Wood per tree = max(0, h − H)'),
          items: woodPer(h, H),
        });
      }
    }
    if (range) {
      aux.push({
        id: 'range',
        label: t('Các H còn có thể là đáp án', 'H values still possible'),
        items: band(range[0], range[1]),
      });
    }
    if (aux.length > 0) extra.aux = aux;
    emit(state, { ...meta, ...extra });
  };

  // brute: try H from the tallest tree downwards, stop when there is enough wood
  const tries: { H: number; got: number }[] = [];
  for (let k = 0; k < BRUTE_TRIES && top - k >= 0; k++) {
    const H = top - k;
    tries.push({ H, got: wood(h, H) });
    if (tries[k].got >= m) break;
  }
  tries.forEach(({ H, got }, k) => {
    tick();
    const isLast = k === tries.length - 1;
    const enough = got >= m;
    put(H, {
      explanation: vi
        ? `Thử H = ${H}: wood(H) = ${got}, ${enough ? 'đủ' : 'chưa đủ'} m = ${m}.${isLast && !enough ? ' Cứ thử mãi thế này thì quá chậm.' : ''}`
        : `Try H = ${H}: wood(H) = ${got}, ${enough ? 'enough' : 'not enough'} for m = ${m}.${isLast && !enough ? ' Trying them all like this is too slow.' : ''}`,
      codeLine: 1,
      vars: {
        H,
        got,
        m,
        top,
        ...(isLast && { tried: tries.map((x) => x.H).join(', ') }),
      },
      // the narrated brute beat sits on the last try and covers all of them
      tags: isLast ? ['beat:brute'] : undefined,
    });
  });

  // monotonic: raise H by one from the middle height; wood strictly drops (the tallest tree loses 1).
  // The question frame shows only the old H; the next frame reveals the drop.
  const Hold = Math.floor(top / 2);
  const H1 = Hold + 1;
  const gotOld = wood(h, Hold);
  const got1 = wood(h, H1);
  put(Hold, {
    explanation: t(
      `Cưa ở H = ${Hold} được ${gotOld} mét. Nếu nâng H lên một đơn vị thì tổng gỗ thay đổi thế nào?`,
      `Cutting at H = ${Hold} gives ${gotOld} meters. If we raise H by one, how does the total wood change?`,
    ),
    codeLine: 1,
    vars: { H: Hold, got: gotOld, m, top },
    tags: ['beat:monotonic'],
  });
  put(H1, {
    explanation: t(
      `Nâng H từ ${Hold} lên ${H1}: gỗ từ ${gotOld} xuống ${got1}. H càng cao, gỗ càng ít.`,
      `Raise H from ${Hold} to ${H1}: wood drops from ${gotOld} to ${got1}. The higher H, the less wood.`,
    ),
    codeLine: 1,
    vars: { H: H1, got: got1, Hold, gotOld, m, top },
  });

  // binary search on H; invariant: wood(lo) >= m (m <= sum(h) = wood(0)) and no H > hi works
  let lo = 0;
  let hi = top;
  put(
    undefined,
    {
      explanation: t(
        `Chặt nhị phân trên H: lo = ${lo} luôn đủ gỗ (m ≤ tổng), hi = ${hi} là cây cao nhất.`,
        `Binary search on H: lo = ${lo} always works (m ≤ total), hi = ${hi} is the tallest tree.`,
      ),
      codeLine: 2,
      vars: { lo, hi, m },
      tags: ['beat:init'],
    },
    { range: [lo, hi] },
  );
  while (lo < hi) {
    tick();
    const mid = Math.floor((lo + hi + 1) / 2); // round up, or lo = mid would loop forever
    const got = wood(h, mid);
    const ok = got >= m;
    // question frame: H line at mid, but neither the wood nor the verdict is shown yet
    put(
      mid,
      {
        explanation: t(
          `Còn [${lo}, ${hi}]. Thử cưa ở H = ${mid} (giữa, làm tròn lên): có đủ m = ${m} mét gỗ không?`,
          `Remaining: [${lo}, ${hi}]. Try cutting at H = ${mid} (middle, rounded up): is there enough wood for m = ${m}?`,
        ),
        codeLine: 4,
        vars: { lo, hi, mid, m },
        tags: ['beat:check'],
      },
      { cut: false, range: [lo, hi] },
    );
    // result frame: wood and verdict, the bounds are still the old ones
    put(
      mid,
      {
        explanation: t(
          `Cưa ở H = ${mid}: được ${got} mét, ${ok ? 'đủ' : 'chưa đủ'} m = ${m}.`,
          `Cut at H = ${mid}: ${got} meters, ${ok ? 'enough' : 'not enough'} for m = ${m}.`,
        ),
        codeLine: 5,
        vars: { lo, hi, mid, got, m },
        tags: ['beat:narrow'],
      },
      { range: [lo, hi] },
    );
    if (ok) lo = mid;
    else hi = mid - 1;
    put(
      mid,
      {
        explanation: ok
          ? t(
              `Đủ gỗ nên đáp án ≥ ${mid}: lo = ${lo}. Còn [${lo}, ${hi}].`,
              `Enough wood, so the answer is ≥ ${mid}: lo = ${lo}. Remaining: [${lo}, ${hi}].`,
            )
          : t(
              `Thiếu gỗ nên đáp án < ${mid}: hi = ${hi}. Còn [${lo}, ${hi}].`,
              `Not enough wood, so the answer is < ${mid}: hi = ${hi}. Remaining: [${lo}, ${hi}].`,
            ),
        codeLine: ok ? 5 : 6,
        vars: { lo, hi, mid, got, m },
      },
      { range: [lo, hi] },
    );
  }

  const got = wood(h, lo);
  put(
    lo,
    {
      explanation: t(
        `lo = hi = ${lo}: H lớn nhất là ${lo}, được ${got} mét, đủ m = ${m}.`,
        `lo = hi = ${lo}: the largest H is ${lo}, giving ${got} meters, enough for m = ${m}.`,
      ),
      codeLine: 7,
      vars: { lo, hi, got, m },
      tags: ['beat:done'],
    },
    { kind: 'result' },
  );
}

export const bsAnswerMiniEntry: WalkthroughEntry<BsAnswerMiniInput, BsAnswerMiniState> = {
  id: 'bs-answer-mini',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t2-binary-search'],
  title: {
    'vi-VN': 'Bài giải đề: cắt gỗ (bản nhỏ)',
    'en-US': 'Problem walkthrough: cutting wood (mini)',
  },
  code: {
    pseudo: [
      'wood(H) = Σ max(0, h[i] − H)',
      'lo ← 0; hi ← max(h)',
      'while lo < hi:',
      '    mid ← ⌈(lo + hi) / 2⌉',
      '    if wood(mid) ≥ m: lo ← mid',
      '    else: hi ← mid − 1',
      'return lo',
    ],
    impl: {
      cpp: [
        'long long wood(const std::vector<int>& h, int H) {',
        '    long long s = 0;',
        '    for (int x : h) s += std::max(0, x - H);',
        '    return s;',
        '}',
        'int best_height(const std::vector<int>& h, long long m) {',
        '    int lo = 0, hi = *std::max_element(h.begin(), h.end());',
        '    while (lo < hi) {',
        '        int mid = lo + (hi - lo + 1) / 2;',
        '        if (wood(h, mid) >= m) lo = mid;',
        '        else hi = mid - 1;',
        '    }',
        '    return lo;',
        '}',
      ],
      py: [
        'def wood(h, H):',
        '    return sum(max(0, x - H) for x in h)',
        'def best_height(h, m):',
        '    lo, hi = 0, max(h)',
        '    while lo < hi:',
        '        mid = (lo + hi + 1) // 2',
        '        if wood(h, mid) >= m:',
        '            lo = mid',
        '        else:',
        '            hi = mid - 1',
        '    return lo',
      ],
    },
    map: {
      cpp: { 1: [1, 2, 3, 4, 5], 2: [7], 3: [8], 4: [9], 5: [10], 6: [11], 7: [13] },
      py: { 1: [1, 2], 2: [4], 3: [5], 4: [6], 5: [7, 8], 6: [9, 10], 7: [11] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      h: { kind: 'int-array', len: [1, 8], range: [1, 40] },
      m: { kind: 'int', range: [1, 100] },
    },
  },
  check: (input) => (input.m <= sum(input.h) ? [] : ['m-exceeds-total']),
  customInput: false,
  presets: [
    {
      id: 'classic',
      label: { 'vi-VN': 'Ví dụ chuẩn', 'en-US': 'Standard example' },
      input: { h: [20, 15, 10, 17], m: 7 },
    },
    {
      id: 'all-equal',
      label: { 'vi-VN': 'Các cây bằng nhau', 'en-US': 'All trees equal' },
      input: { h: [5, 5, 5, 5], m: 8 },
    },
    {
      id: 'one-tree',
      label: { 'vi-VN': 'Một cây', 'en-US': 'A single tree' },
      input: { h: [30], m: 12 },
    },
    {
      id: 'take-all',
      label: { 'vi-VN': 'Lấy hết (H = 0)', 'en-US': 'Take all the wood (H = 0)' },
      input: { h: [3, 8, 2], m: 13 },
    },
    {
      id: 'tiny-need',
      label: { 'vi-VN': 'Cần rất ít gỗ', 'en-US': 'Very little wood needed' },
      input: { h: [9, 4, 7], m: 1 },
    },
  ],
  beatDefs: [
    {
      id: 'brute',
      required: true,
      label: { 'vi-VN': 'Vét cạn', 'en-US': 'Brute force' },
      narration: {
        'vi-VN':
          'Vét cạn: thử H lần lượt {tried}, từ cây cao nhất ({top}) hạ dần. Ở H = {H} được {got} mét, cần m = {m}. Thử từng H thế này quá chậm khi h rất lớn.',
        'en-US':
          'Brute force: try H = {tried}, going down from the tallest tree ({top}). At H = {H} we get {got} meters and need m = {m}. Trying every H like this is too slow when h is huge.',
      },
      hints: [
        {
          'vi-VN': 'Mỗi lần thử một H, em phải làm gì với từng cây?',
          'en-US': 'For each H you try, what do you do with every tree?',
        },
        {
          'vi-VN': 'Cây cao hơn H cho h[i] − H mét gỗ, cây thấp hơn cho 0. Cộng lại được wood(H).',
          'en-US':
            'A tree taller than H gives h[i] − H meters, a shorter one gives 0. Add them up to get wood(H).',
        },
        {
          'vi-VN':
            'Bắt đầu từ H cao nhất rồi hạ dần; H đầu tiên có wood(H) ≥ m là đáp án. Nhưng h tới 10^9 thì số lần thử quá lớn.',
          'en-US':
            'Start at the highest H and go down; the first H with wood(H) ≥ m is the answer. But with h up to 10^9 there are far too many tries.',
        },
      ],
      misconceptions: [
        {
          'vi-VN': 'Nghĩ rằng cưa ở H thì cây thấp hơn H cũng cho gỗ (cho số âm hoặc cho cả cây).',
          'en-US':
            'Thinking a tree shorter than H also gives wood (a negative amount or the whole tree).',
        },
      ],
    },
    {
      id: 'monotonic',
      label: { 'vi-VN': 'Gỗ giảm khi H tăng', 'en-US': 'Wood shrinks as H grows' },
      narration: {
        'vi-VN':
          'Cưa ở H = {H} được {got} mét. Nâng H lên thì mỗi cây cao hơn H mất bớt gỗ, nên gỗ chỉ giảm hoặc giữ nguyên: một H đủ gỗ thì mọi H thấp hơn cũng đủ.',
        'en-US':
          'Cutting at H = {H} gives {got} meters. Raising H makes every tree taller than H lose wood, so the total never grows: if some H has enough wood then every lower H does too.',
      },
      ask: {
        text: {
          'vi-VN': 'Theo em, nâng H lên thì tổng gỗ tăng hay giảm?',
          'en-US': 'If we raise H, does the total wood go up or down?',
        },
        predict: {
          kind: 'choice',
          options: [
            { 'vi-VN': 'Tăng', 'en-US': 'Goes up' },
            { 'vi-VN': 'Giảm', 'en-US': 'Goes down' },
            { 'vi-VN': 'Không đổi', 'en-US': 'Stays the same' },
          ],
          answer: (frame, next) => {
            const before = varOf(frame, 'got');
            const after = varOf(next, 'got');
            if (before === undefined || after === undefined) return -1;
            return after > before ? 0 : after < before ? 1 : 2;
          },
        },
      },
      hints: [
        {
          'vi-VN': 'Hình dung vạch H đi lên: mỗi cây cho thêm hay bớt gỗ?',
          'en-US': 'Picture the H line moving up: does each tree give more or less wood?',
        },
        {
          'vi-VN':
            'Mỗi cây cho max(0, h[i] − H). Khi H tăng 1, giá trị này giảm 1 hoặc giữ nguyên 0.',
          'en-US':
            'Each tree gives max(0, h[i] − H). When H grows by 1 this drops by 1, or stays at 0.',
        },
        {
          'vi-VN':
            'Không cây nào cho thêm gỗ khi H tăng, nên wood(H) không tăng. Nhờ vậy ta chặt nhị phân được: đủ gỗ ở H thì đủ ở mọi H nhỏ hơn.',
          'en-US':
            'No tree gives more wood when H grows, so wood(H) never goes up. That is what lets us binary search: enough wood at H means enough at every smaller H.',
        },
      ],
      misconceptions: [
        {
          'vi-VN': 'Nghĩ rằng cưa cao hơn thì lấy được nhiều gỗ hơn (nhầm H với lượng gỗ).',
          'en-US': 'Thinking a higher cut gives more wood (mixing up H with the amount of wood).',
        },
        {
          'vi-VN':
            'Nghĩ rằng wood(H) lúc nào cũng giảm thật sự; khi H ≥ cây cao nhất thì nó đứng yên ở 0.',
          'en-US':
            'Thinking wood(H) always strictly drops; once H ≥ the tallest tree it stays at 0.',
        },
      ],
    },
    {
      id: 'init',
      label: { 'vi-VN': 'Khoảng ban đầu', 'en-US': 'Starting range' },
      narration: {
        'vi-VN':
          'Ta chặt nhị phân trên H. Bất biến: lo = {lo} luôn đủ gỗ vì m = {m} không vượt tổng chiều cao, và không H nào lớn hơn hi = {hi} đủ gỗ. Đáp án nằm trong [{lo}, {hi}].',
        'en-US':
          'We binary search on H. Invariant: lo = {lo} always has enough wood because m = {m} does not exceed the total height, and no H above hi = {hi} does. The answer lies in [{lo}, {hi}].',
      },
      hints: [
        {
          'vi-VN': 'Trước khi chặt, đáp án H có thể nằm trong khoảng nào?',
          'en-US': 'Before searching, which range can the answer H lie in?',
        },
        {
          'vi-VN': 'H nhỏ nhất là 0 (lấy hết gỗ); H lớn hơn cây cao nhất thì không có gỗ nào.',
          'en-US':
            'The smallest H is 0 (take all the wood); an H above the tallest tree gives no wood.',
        },
        {
          'vi-VN':
            'lo = 0 luôn đủ gỗ vì m ≤ tổng; mọi H lớn hơn hi đều thiếu gỗ. Đáp án thuộc [lo, hi].',
          'en-US':
            'lo = 0 always has enough wood since m ≤ total; every H above hi falls short. The answer is in [lo, hi].',
        },
      ],
      misconceptions: [
        {
          'vi-VN': 'Nghĩ rằng lo phải bắt đầu từ 1: khi m bằng tổng chiều cao thì đáp án là 0.',
          'en-US': 'Thinking lo must start at 1: when m equals the total height the answer is 0.',
        },
      ],
    },
    {
      id: 'check',
      label: { 'vi-VN': 'Kiểm tra mid', 'en-US': 'Check mid' },
      narration: {
        'vi-VN':
          'Khoảng đang xét còn [{lo}, {hi}]. Thử H ở giữa, làm tròn lên: mid = {mid}. Cần wood(mid) ≥ m = {m}.',
        'en-US':
          'The range is [{lo}, {hi}]. Try the middle H, rounded up: mid = {mid}. We need wood(mid) ≥ m = {m}.',
      },
      ask: {
        text: {
          'vi-VN': 'Theo em, cưa ở mid này có đủ gỗ (wood(mid) ≥ m) không?',
          'en-US': 'Do you think cutting at this mid gives enough wood (wood(mid) ≥ m)?',
        },
        predict: {
          kind: 'choice',
          options: [
            { 'vi-VN': 'Đủ gỗ', 'en-US': 'Enough wood' },
            { 'vi-VN': 'Thiếu gỗ', 'en-US': 'Not enough wood' },
          ],
          answer: (_frame, next) => {
            const got = varOf(next, 'got');
            const m = varOf(next, 'm');
            if (got === undefined || m === undefined) return -1;
            return got >= m ? 0 : 1;
          },
        },
      },
      hints: [
        {
          'vi-VN': 'Muốn biết mid có đủ gỗ không, em cần tính đại lượng nào?',
          'en-US': 'To know whether mid gives enough wood, which quantity do you compute?',
        },
        {
          'vi-VN': 'Tính wood(mid) = Σ max(0, h[i] − mid) rồi so với m.',
          'en-US': 'Compute wood(mid) = Σ max(0, h[i] − mid) and compare it with m.',
        },
        {
          'vi-VN': 'Nếu wood(mid) ≥ m thì mid dùng được, đáp án ≥ mid. Ngược lại đáp án < mid.',
          'en-US':
            'If wood(mid) ≥ m then mid works and the answer is ≥ mid. Otherwise the answer is < mid.',
        },
      ],
      misconceptions: [
        {
          'vi-VN':
            'Nghĩ rằng phải thử từng H một mới biết đáp án; thực ra mỗi lần kiểm loại được một nửa.',
          'en-US': 'Thinking you must try every H; each check actually discards half of the range.',
        },
        {
          'vi-VN': 'Nhầm "mid đủ gỗ" với "mid là đáp án": mới chỉ biết đáp án ≥ mid.',
          'en-US':
            'Confusing "mid has enough wood" with "mid is the answer": we only know the answer is ≥ mid.',
        },
      ],
    },
    {
      id: 'narrow',
      label: { 'vi-VN': 'Thu hẹp', 'en-US': 'Narrow down' },
      narration: {
        'vi-VN':
          'Cưa ở H = {mid} được {got} mét, so với m = {m}. Đủ gỗ thì đáp án ≥ mid nên lo = mid; thiếu gỗ thì đáp án < mid nên hi = mid − 1.',
        'en-US':
          'Cutting at H = {mid} gives {got} meters, compared with m = {m}. Enough wood: the answer is ≥ mid, so lo = mid. Not enough: the answer is < mid, so hi = mid − 1.',
      },
      ask: {
        text: {
          'vi-VN': 'Theo em, bước tiếp theo lo hay hi đổi?',
          'en-US': 'Which changes next, lo or hi?',
        },
        predict: {
          kind: 'choice',
          options: [
            { 'vi-VN': 'lo', 'en-US': 'lo' },
            { 'vi-VN': 'hi', 'en-US': 'hi' },
          ],
          answer: (frame, next) => {
            const before = varOf(frame, 'lo');
            const after = varOf(next, 'lo');
            if (before === undefined || after === undefined) return -1;
            return after !== before ? 0 : 1;
          },
        },
      },
      hints: [
        {
          'vi-VN': 'Nhìn kết quả vừa kiểm: wood(mid) có đạt m không?',
          'en-US': 'Look at the check you just made: does wood(mid) reach m?',
        },
        {
          'vi-VN': 'Đạt thì mid dùng được, đáp án từ mid trở lên. Chưa đạt thì đáp án nhỏ hơn mid.',
          'en-US':
            'If it does, mid works and the answer is mid or more. If not, the answer is below mid.',
        },
        {
          'vi-VN': 'Đạt: lo = mid. Chưa đạt: hi = mid − 1.',
          'en-US': 'Enough: lo = mid. Not enough: hi = mid − 1.',
        },
      ],
      misconceptions: [
        {
          'vi-VN':
            'Khi chưa đạt mà đặt hi = mid: mid đã kiểm là thiếu gỗ nên phải loại, tức hi = mid − 1.',
          'en-US':
            'Setting hi = mid when it fell short: mid was checked and fails, so drop it: hi = mid − 1.',
        },
        {
          'vi-VN':
            'Khi đạt mà đặt lo = mid + 1: mid vẫn có thể là đáp án nên phải giữ lại, lo = mid.',
          'en-US':
            'Setting lo = mid + 1 when it works: mid may be the answer, so keep it: lo = mid.',
        },
      ],
    },
    {
      id: 'done',
      required: true,
      label: { 'vi-VN': 'Kết quả', 'en-US': 'Result' },
      narration: {
        'vi-VN': 'Khi lo = hi = {lo}, đó là H lớn nhất: cưa ở đó được {got} mét, đủ m = {m}.',
        'en-US':
          'When lo = hi = {lo}, that is the largest H: cutting there gives {got} meters, enough for m = {m}.',
      },
      hints: [
        {
          'vi-VN': 'Khi lo và hi gặp nhau, còn bao nhiêu ứng viên?',
          'en-US': 'When lo and hi meet, how many candidates are left?',
        },
        {
          'vi-VN': 'Bất biến: wood(lo) ≥ m, và mọi H lớn hơn hi đều thiếu gỗ.',
          'en-US': 'Invariant: wood(lo) ≥ m, and every H above hi falls short.',
        },
        {
          'vi-VN': 'lo = hi nên chỉ còn một giá trị, và đó là H lớn nhất đủ gỗ.',
          'en-US': 'Since lo = hi only one value is left: the largest H with enough wood.',
        },
      ],
      misconceptions: [
        {
          'vi-VN': 'Nghĩ rằng đáp án phải lớn hơn 0; khi m bằng tổng chiều cao thì H = 0.',
          'en-US': 'Thinking the answer must be above 0; when m equals the total height, H = 0.',
        },
      ],
    },
  ],
  problem: {
    statement: {
      'vi-VN':
        'Có n cây, cây thứ i cao h[i] mét; cần ít nhất m mét gỗ. Đặt máy cưa ở độ cao H: cây cao hơn H bị cắt phần trên, cây thấp hơn giữ nguyên. Tìm H nguyên lớn nhất để tổng gỗ thu được không ít hơn m.',
      'en-US':
        'There are n trees, tree i is h[i] meters tall; at least m meters of wood are needed. The saw is set at height H: trees taller than H lose their top, shorter trees stay. Find the largest integer H whose total wood is at least m.',
    },
    constraints: [same('1 ≤ n ≤ 10^5'), same('1 ≤ h[i] ≤ 10^9'), same('1 ≤ m ≤ Σ h[i]')],
    subtasks: [
      {
        id: 'brute',
        limit: same('n ≤ 100, h ≤ 100'),
        idea: {
          'vi-VN': 'Thử mọi H từ cao xuống thấp, mỗi lần cộng gỗ của mọi cây.',
          'en-US': 'Try every H from high to low, adding up the wood of every tree each time.',
        },
        complexity: 'O(n·maxH)',
      },
      {
        id: 'binary',
        limit: same('n ≤ 10^5, h ≤ 10^9'),
        idea: {
          'vi-VN': 'Chặt nhị phân trên H vì wood(H) không tăng khi H tăng; mỗi lần kiểm tốn O(n).',
          'en-US':
            'Binary search on H because wood(H) never increases with H; each check costs O(n).',
        },
        complexity: 'O(n log maxH)',
      },
    ],
  },
  pitfalls: [
    {
      lang: 'cpp',
      beat: 'check',
      text: {
        'vi-VN': 'Tổng gỗ có thể vượt int (tới 10^14 khi n, h lớn): dùng long long cho wood và m.',
        'en-US':
          'The total wood can overflow int (up to 10^14 for large n, h): use long long for wood and m.',
      },
    },
    {
      lang: 'py',
      beat: 'check',
      text: {
        'vi-VN': 'Python: tính mid bằng // (chia nguyên); / cho số thực và làm mid sai.',
        'en-US': 'Python: compute mid with // (integer division); / gives a float and breaks mid.',
      },
    },
    {
      beat: 'check',
      text: {
        'vi-VN':
          'Làm tròn xuống mid = (lo + hi) / 2 thì lo = mid có thể lặp vô hạn (khi hi = lo + 1): phải làm tròn lên.',
        'en-US':
          'Rounding down mid = (lo + hi) / 2 can loop forever with lo = mid (when hi = lo + 1): round up instead.',
      },
    },
    {
      beat: 'done',
      text: {
        'vi-VN':
          'Quên biên H = 0: khi m bằng tổng chiều cao thì lo phải bắt đầu từ 0, không phải 1.',
        'en-US': 'Forgetting H = 0: when m equals the total height, lo must start at 0, not 1.',
      },
    },
  ],
  maxFrames: 40,
  maxBytes: 200_000,
  run,
};
