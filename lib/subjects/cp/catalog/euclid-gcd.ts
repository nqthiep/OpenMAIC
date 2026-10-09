/**
 * Walkthrough entry: Euclid's algorithm for the greatest common divisor (SCHEMA §5, card 2B-02).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { a: number; b: number };
type Row = { label: string; values: (number | string)[]; offset: number };
type S = { values: (number | string)[]; mode: 'cells'; rows: Row[] };

/** The visualizer draws at most 8 extra rows; older steps scroll off. */
const MAX_HISTORY = 8;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Tìm ước chung lớn nhất của a = {a} và b = {b}. Ta sẽ thay cặp (a, b) bằng cặp nhỏ hơn cho tới khi b = 0.',
    'Find the greatest common divisor of a = {a} and b = {b}. We keep replacing the pair (a, b) by a smaller pair until b = 0.',
  ),
  insight: m(
    'Mọi ước chung của a và b cũng chia hết a mod b, nên gcd({a}, {b}) = gcd({b}, {a} mod {b}). Cặp mới nhỏ hơn.',
    'Every common divisor of a and b also divides a mod b, so gcd({a}, {b}) = gcd({b}, {a} mod {b}). The new pair is smaller.',
  ),
  mod: m(
    'Bước {k}: tính a mod b với a = {a}, b = {b}.',
    'Step {k}: compute a mod b with a = {a}, b = {b}.',
  ),
  step: m(
    '{a} mod {b} = {r}, nên cặp mới là (b, r) = ({b}, {r}).',
    '{a} mod {b} = {r}, so the new pair is (b, r) = ({b}, {r}).',
  ),
  stepSwap: m(
    '{a} < {b} nên {a} mod {b} = {r}: cặp mới ({b}, {r}) chỉ là đổi chỗ hai số.',
    '{a} < {b} so {a} mod {b} = {r}: the new pair ({b}, {r}) merely swaps the two numbers.',
  ),
  stop: m(
    'b = 0 nên dừng: gcd({a0}, {b0}) = a = {a}, vì mọi số chia hết cho 0 nên gcd({a}, 0) = {a}.',
    'b = 0, so stop: gcd({a0}, {b0}) = a = {a}, because every number divides 0, so gcd({a}, 0) = {a}.',
  ),
  done: m(
    'Kết quả: gcd({a0}, {b0}) = {g}, sau {steps} lần lấy dư.',
    'Result: gcd({a0}, {b0}) = {g}, after {steps|remainder step|remainder steps}.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Ước chung lớn nhất của {a} và {b} là số lớn nhất chia hết cả hai. Thử mọi ước thì chậm; Euclid làm nhanh hơn nhiều.',
      'The greatest common divisor of {a} and {b} is the largest number dividing both. Trying every divisor is slow; Euclid is much faster.',
    ),
    hints: [
      m(
        'Nếu d chia hết cả a và b, d có chia hết a − b không?',
        'If d divides both a and b, does d divide a − b?',
      ),
      m(
        'Có. Lặp lại: d chia hết cả a mod b (a trừ đi nhiều lần b).',
        'Yes. Repeat: d also divides a mod b (a minus b several times).',
      ),
      m(
        'Vậy cặp (a, b) và cặp (b, a mod b) có cùng các ước chung: thay cặp lớn bằng cặp nhỏ.',
        'So the pairs (a, b) and (b, a mod b) have the same common divisors: replace the big pair by the small one.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng gcd luôn nhỏ hơn cả hai số: gcd(12, 12) = 12 và gcd(7, 0) = 7.',
        'Thinking the gcd is always smaller than both numbers: gcd(12, 12) = 12 and gcd(7, 0) = 7.',
      ),
    ],
  },
  {
    id: 'insight',
    label: m('Ý tưởng chính', 'The key idea'),
    narration: m(
      'Ước chung của a và b trùng với ước chung của b và a mod b. Vì thế gcd({a}, {b}) = gcd({b}, {a} mod {b}), và cặp mới nhỏ hơn.',
      'The common divisors of a and b are those of b and a mod b. Hence gcd({a}, {b}) = gcd({b}, {a} mod {b}), and the new pair is smaller.',
    ),
    hints: [
      m(
        'a mod b được viết dưới dạng a − q·b. Một ước chung của a và b có chia hết số này không?',
        'a mod b equals a − q·b. Does a common divisor of a and b divide this number?',
      ),
      m(
        'Có, vì chia hết a và q·b. Ngược lại ước chung của b và a mod b cũng chia hết a = q·b + (a mod b).',
        'Yes, since it divides a and q·b. Conversely a common divisor of b and a mod b divides a = q·b + (a mod b).',
      ),
      m(
        'Hai cặp có cùng tập ước chung nên cùng gcd; dùng điều này lặp lại tới khi b = 0.',
        'The two pairs share the same set of common divisors, hence the same gcd; repeat until b = 0.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng gcd(a, b) = gcd(b, a mod b) chỉ đúng khi a > b: nó đúng với mọi a, b (khi a < b bước đầu chỉ đổi chỗ).',
        'Thinking gcd(a, b) = gcd(b, a mod b) needs a > b: it holds for all a, b (when a < b the first step just swaps).',
      ),
    ],
  },
  {
    id: 'mod-step',
    label: m('Lấy dư', 'Remainder step'),
    narration: m(
      'Bước {k}: lấy a = {a} chia cho b = {b} lấy phần dư r = a mod b, rồi đặt (a, b) ← (b, r).',
      'Step {k}: divide a = {a} by b = {b} and take the remainder r = a mod b, then set (a, b) ← (b, r).',
    ),
    ask: {
      text: m('Theo em, sau bước này b có bằng 0 không?', 'Will b be 0 after this step?'),
      predict: {
        kind: 'choice',
        options: [m('Có, b = 0', 'Yes, b = 0'), m('Không, b ≠ 0', 'No, b ≠ 0')],
        answer: (_frame, next) => (next?.meta.vars?.r === 0 ? 0 : 1),
      },
    },
    hints: [
      m('b mới là gì sau bước này?', 'What is the new b after this step?'),
      m(
        'b mới là phần dư r = a mod b. Khi nào phần dư bằng 0?',
        'The new b is the remainder r = a mod b. When is the remainder 0?',
      ),
      m(
        'Khi b chia hết a. Nếu có thì thuật toán dừng với a mới (cũ là b) là gcd.',
        'When b divides a. Then the algorithm stops, and the new a (the old b) is the gcd.',
      ),
    ],
    misconceptions: [
      m(
        'Quên đổi cặp: chỉ tính r mà không đặt a ← b, b ← r thì vòng lặp không tiến.',
        'Forgetting to move the pair: computing r without a ← b, b ← r means the loop makes no progress.',
      ),
    ],
  },
  {
    id: 'stop',
    label: m('Dừng', 'Stop'),
    narration: m(
      'b = 0 nên ta dừng. Mọi số chia hết cho 0, vậy ước chung lớn nhất của a = {a} và 0 chính là {a}; đó cũng là gcd của cặp ban đầu.',
      'b = 0, so we stop. Every number divides 0, so the gcd of a = {a} and 0 is {a}; it is also the gcd of the original pair.',
    ),
    hints: [
      m('Khi b = 0 thì gcd(a, 0) bằng bao nhiêu?', 'When b = 0, what is gcd(a, 0)?'),
      m(
        'Mọi số khác 0 đều chia hết 0, nên ước chung lớn nhất của a và 0 là a.',
        'Every nonzero number divides 0, so the greatest common divisor of a and 0 is a.',
      ),
      m(
        'Trả về a. Cặp ban đầu có cùng gcd với mọi cặp trung gian.',
        'Return a. The original pair has the same gcd as every intermediate pair.',
      ),
    ],
    misconceptions: [
      m(
        'Trả về b khi dừng: lúc đó b = 0, đáp án là a.',
        'Returning b at the end: then b = 0, the answer is a.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'gcd({a0}, {b0}) = {g}. Mỗi hai bước phần dư ít nhất giảm một nửa, nên số bước chỉ cỡ log của số lớn: rất nhanh.',
      'gcd({a0}, {b0}) = {g}. Every two steps the remainder at least halves, so the step count is about the log of the larger number: very fast.',
    ),
    hints: [
      m(
        'Số bước phụ thuộc vào độ lớn của số hay vào số ước?',
        'Does the step count depend on the size of the numbers or on the number of divisors?',
      ),
      m(
        'Vào độ lớn: phần dư giảm nhanh sau mỗi hai bước.',
        'On their size: the remainder shrinks fast every two steps.',
      ),
      m(
        'Phần dư giảm ít nhất một nửa sau hai bước, nên O(log min(a, b)) bước.',
        'The remainder at least halves in two steps, so O(log min(a, b)) steps.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng Euclid phải thử các ước: thuật toán không tìm ước nào cả, chỉ lấy dư.',
        'Thinking Euclid tests divisors: the algorithm tries no divisor, it only takes remainders.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const a0 = input.a;
  const b0 = input.b;
  let a = a0;
  let b = b0;
  let k = 0;
  const history: Row[] = [];
  const stepLabel = (i: number): string => `${msg(m('Bước', 'Step'), ctx.locale)} ${i}`;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    r: number | undefined,
    tag: string | undefined,
    marks: Record<string, HighlightKind>,
  ): void => {
    emit(
      {
        values: [a, b, r === undefined ? '' : r],
        mode: 'cells',
        rows: history.map((x) => ({ ...x, values: [...x.values] })),
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

  put(EX.start, 1, { a, b }, undefined, 'start', { '0': 'active', '1': 'active' });
  if (b !== 0) put(EX.insight, 2, { a, b }, undefined, 'insight', { '0': 'active', '1': 'active' });
  while (b !== 0) {
    tick();
    k++;
    put(EX.mod, 2, { k, a, b }, undefined, 'mod-step', { '0': 'active', '1': 'active' });
    const r = a % b;
    put(a < b ? EX.stepSwap : EX.step, 3, { a, b, r }, r, undefined, {
      '0': 'compare',
      '1': 'compare',
      '2': 'result',
    });
    history.push({ label: stepLabel(k), values: [a, b, r], offset: 0 });
    if (history.length > MAX_HISTORY) history.shift();
    a = b;
    b = r;
    // the pair after the assignment: shown in the next frame (mod-step or stop)
  }
  put(EX.stop, 4, { a, a0, b0 }, undefined, 'stop', { '0': 'result' });
  put(EX.done, 4, { a0, b0, g: a, steps: k }, undefined, 'done', { '0': 'result' });
}

export const euclidGcdEntry: WalkthroughEntry<In, S> = {
  id: 'euclid-gcd',
  entryRev: 2,
  subject: 'cp',
  visualizer: 'array',
  curriculumTopics: ['t2-number-basics'],
  title: m(
    'Thuật toán Euclid (ước chung lớn nhất)',
    "Euclid's algorithm (greatest common divisor)",
  ),
  code: {
    pseudo: ['while b ≠ 0:', '    r ← a mod b', '    a ← b; b ← r', 'return a'],
    impl: {
      cpp: [
        'int gcd_euclid(int a, int b) {',
        '    while (b != 0) {',
        '        int r = a % b;',
        '        a = b;',
        '        b = r;',
        '    }',
        '    return a;',
        '}',
      ],
      py: ['def gcd_euclid(a, b):', '    while b != 0:', '        a, b = b, a % b', '    return a'],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4, 5], 4: [7] },
      py: { 1: [2], 2: [3], 3: [3], 4: [4] },
    },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      a: { kind: 'int', range: [0, 200] },
      b: { kind: 'int', range: [0, 200] },
    },
  },
  check: (input) => (input.a === 0 && input.b === 0 ? ['both-zero'] : []),
  customInput: false,
  presets: [
    { id: 'basic', label: m('Ví dụ chuẩn', 'Standard example'), input: { a: 48, b: 18 } },
    { id: 'coprime', label: m('Nguyên tố cùng nhau', 'Coprime numbers'), input: { a: 35, b: 64 } },
    { id: 'b-zero', label: m('Biên b = 0', 'Edge b = 0'), input: { a: 7, b: 0 } },
    { id: 'equal', label: m('Hai số bằng nhau', 'Equal numbers'), input: { a: 12, b: 12 } },
    { id: 'a-less', label: m('a nhỏ hơn b', 'a smaller than b'), input: { a: 18, b: 48 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'mod-step',
      text: m(
        'Khi a < b không cần đổi chỗ trước: a mod b = a, nên bước đầu tự đổi hai số. Vòng lặp và đệ quy gcd(b, a mod b) là một.',
        'When a < b no pre-swap is needed: a mod b = a, so the first step swaps by itself. The loop and the recursion gcd(b, a mod b) are the same.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'mod-step',
      text: m(
        'a % b với b = 0 là chia cho 0: luôn kiểm b != 0 trước khi lấy dư.',
        'a % b with b = 0 divides by zero: always check b != 0 before taking the remainder.',
      ),
    },
    {
      lang: 'py',
      beat: 'stop',
      text: m(
        'math.gcd có sẵn nhưng nhiều đề yêu cầu tự cài đặt; hãy viết vòng lặp như trên để hiểu cách làm.',
        'math.gcd exists, but many tasks ask for your own implementation; write the loop above to see how it works.',
      ),
    },
  ],
  maxFrames: 30,
  maxBytes: 200_000,
  run,
};
