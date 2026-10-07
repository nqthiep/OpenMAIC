/**
 * Walkthrough entry: the Cauchy–Schwarz inequality for two pairs, proved step by step with Lagrange's identity
 * (card 3B-W1, SCHEMA Phase 3 §4). Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 * Curriculum topic `inequality-classic` follows the Phase 3 SCHEMA §7 outline [Inference]; the math curriculum
 * research (3-R1) is not done yet.
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { a1: number; a2: number; b1: number; b2: number };
type Node = {
  id: string;
  kind: 'given' | 'goal' | 'have' | 'because' | 'therefore';
  text: string;
  parent?: string;
  status?: 'pending' | 'done';
};
type S = { nodes: Node[] };

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });
/** a number inside a formula: negatives get brackets */
const n = (x: number): string => (x < 0 ? `(${x})` : String(x));

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars; no TeX here. */
const EX = {
  start: m(
    'Với hai cặp số (a₁, a₂) và (b₁, b₂), bình phương của a₁b₁ + a₂b₂ không vượt quá tích của hai tổng bình phương. Ta sẽ chứng minh điều đó.',
    'For two pairs (a₁, a₂) and (b₁, b₂), the square of a₁b₁ + a₂b₂ never exceeds the product of the two sums of squares. We prove it.',
  ),
  given: m(
    'Lấy cụ thể a = ({a1}, {a2}) và b = ({b1}, {b2}) để kiểm từng bước bằng số.',
    'Take a = ({a1}, {a2}) and b = ({b1}, {b2}) so that every step can be checked with numbers.',
  ),
  expand: m(
    'Tính hai vế: vế trái = {L}, vế phải = {R}.',
    'Compute both sides: the left side is {L} and the right side is {R}.',
  ),
  lagrange: m(
    'Hiệu hai vế, vế phải trừ vế trái, bằng {d}. Hiệu này là bình phương của biểu thức nào?',
    'The difference of the sides, right minus left, is {d}. It is the square of which expression?',
  ),
  reveal: m(
    'Khai triển rút gọn cho hiệu = (a₁b₂ − a₂b₁)². Với số đã chọn, a₁b₂ − a₂b₁ = {k}, và {k}² = {d}.',
    'Expanding and simplifying gives the difference = (a₁b₂ − a₂b₁)². With these numbers a₁b₂ − a₂b₁ = {k}, and {k}² = {d}.',
  ),
  conclude: m(
    'Bình phương không âm, nên hiệu {d} ≥ 0. Vậy vế trái {L} ≤ vế phải {R}.',
    'A square is never negative, so the difference {d} ≥ 0. Hence the left side {L} ≤ the right side {R}.',
  ),
  equalYes: m(
    'Hiệu bằng 0, nên dấu bằng xảy ra: a₁b₂ = a₂b₁, tức hai cặp số tỉ lệ với nhau.',
    'The difference is 0, so equality holds: a₁b₂ = a₂b₁, that is, the two pairs are proportional.',
  ),
  equalNo: m(
    'Hiệu {d} > 0 nên với bộ số này dấu bằng không xảy ra; nó chỉ xảy ra khi a₁b₂ = a₂b₁.',
    'The difference {d} > 0, so equality does not hold for these numbers; it holds only when a₁b₂ = a₂b₁.',
  ),
  done: m(
    'Vậy (a₁b₁ + a₂b₂)² ≤ (a₁² + a₂²)(b₁² + b₂²), dấu bằng xảy ra khi và chỉ khi a₁b₂ = a₂b₁.',
    'So (a₁b₁ + a₂b₂)² ≤ (a₁² + a₂²)(b₁² + b₂²), with equality if and only if a₁b₂ = a₂b₁.',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Hôm nay ta chứng minh bất đẳng thức Cauchy–Schwarz cho hai cặp số. Ta không học thuộc nó, mà đi từng bước: cho gì, cần chứng minh gì, và vì sao mỗi bước đúng.',
      'Today we prove the Cauchy–Schwarz inequality for two pairs of numbers. We do not memorise it: we go step by step, what is given, what is to prove, and why each step holds.',
    ),
    hints: [
      m(
        'Bất đẳng thức nói về hai vế: vế nào lớn hơn?',
        'The inequality compares two sides: which one is larger?',
      ),
      m(
        'Vế phải là tích hai tổng bình phương; vế trái là bình phương của một tổng tích.',
        'The right side is a product of two sums of squares; the left is the square of a sum of products.',
      ),
      m(
        'Muốn chứng minh vế trái ≤ vế phải ta xét hiệu vế phải − vế trái và chứng tỏ nó không âm.',
        'To prove left ≤ right we look at right − left and show it is not negative.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng thử vài bộ số đúng là đã chứng minh xong: thử số chỉ kiểm tra, không thay cho chứng minh.',
        'Thinking that a few true examples already prove it: trying numbers checks the claim but is not a proof.',
      ),
    ],
  },
  {
    id: 'given',
    label: m('Cho', 'Given'),
    narration: m(
      'Để thấy rõ từng bước, ta lấy số cụ thể a = ({a1}, {a2}) và b = ({b1}, {b2}). Mọi bước sau đều chạy đúng với số bất kỳ, nhưng số cụ thể giúp ta tự kiểm.',
      'To see each step clearly we take the numbers a = ({a1}, {a2}) and b = ({b1}, {b2}). Every later step works for any numbers, but concrete ones let us check by hand.',
    ),
    hints: [
      m('Số cụ thể dùng để làm gì?', 'What are concrete numbers for?'),
      m(
        'Để kiểm xem bước biến đổi có cho đúng kết quả không.',
        'To check whether a transformation gives the right result.',
      ),
      m(
        'Sau mỗi bước, thay số vào hai vế và so sánh.',
        'After each step, put the numbers into both sides and compare.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bất đẳng thức chỉ đúng với các số đã chọn: nó đúng với mọi số thực.',
        'Thinking the inequality holds only for the chosen numbers: it holds for all real numbers.',
      ),
    ],
  },
  {
    id: 'expand',
    label: m('Khai triển hai vế', 'Expand both sides'),
    narration: m(
      'Ta tính hai vế bằng số. Vế trái là {L}, vế phải là {R}. Với các số này vế trái không lớn hơn vế phải, nhưng ta cần lý do cho mọi số.',
      'We compute both sides with numbers. The left side is {L} and the right side is {R}. For these numbers left is not larger than right, but we need a reason for all numbers.',
    ),
    hints: [
      m(
        'Vế trái là bình phương của một tổng; vế phải là tích hai tổng. Khai triển từng vế.',
        'The left side is the square of a sum; the right is a product of two sums. Expand each.',
      ),
      m(
        'Vế phải có bốn số hạng a₁²b₁², a₁²b₂², a₂²b₁², a₂²b₂².',
        'The right side has four terms a₁²b₁², a₁²b₂², a₂²b₁², a₂²b₂².',
      ),
      m(
        'Vế trái có a₁²b₁², 2a₁a₂b₁b₂ và a₂²b₂²: hai số hạng giống vế phải.',
        'The left side has a₁²b₁², 2a₁a₂b₁b₂ and a₂²b₂²: two terms equal to the right side.',
      ),
    ],
    misconceptions: [
      m(
        'Khai triển (x + y)² thành x² + y², quên số hạng 2xy.',
        'Expanding (x + y)² as x² + y², forgetting the term 2xy.',
      ),
    ],
  },
  {
    id: 'lagrange',
    label: m('Đẳng thức Lagrange', 'Lagrange identity'),
    narration: m(
      'Hiệu hai vế, vế phải trừ vế trái, bằng {d}. Hai số hạng giống nhau bị triệt tiêu, chỉ còn lại ba số hạng. Chúng gộp thành bình phương của một biểu thức.',
      'The difference of the sides, right minus left, is {d}. The two equal terms cancel and three terms remain. They combine into the square of one expression.',
    ),
    ask: {
      text: m(
        'Theo em, hiệu hai vế bằng bình phương của biểu thức nào?',
        'Which expression is the difference of the two sides the square of?',
      ),
      predict: {
        kind: 'choice',
        options: [m('a₁b₂ − a₂b₁', 'a₁b₂ − a₂b₁'), m('a₁b₁ − a₂b₂', 'a₁b₁ − a₂b₂')],
        answer: (frame) => {
          const v = frame.meta.vars as Record<string, number>;
          return (v.a1 * v.b2 - v.a2 * v.b1) ** 2 === v.d ? 0 : 1;
        },
      },
    },
    hints: [
      m(
        'Sau khi triệt tiêu còn a₁²b₂² − 2a₁a₂b₁b₂ + a₂²b₁². Nó có dạng gì?',
        'After cancelling we have a₁²b₂² − 2a₁a₂b₁b₂ + a₂²b₁². What form is it?',
      ),
      m(
        'Dạng x² − 2xy + y² với x = a₁b₂ và y = a₂b₁.',
        'The form x² − 2xy + y² with x = a₁b₂ and y = a₂b₁.',
      ),
      m(
        'x² − 2xy + y² = (x − y)², nên hiệu bằng (a₁b₂ − a₂b₁)².',
        'x² − 2xy + y² = (x − y)², so the difference is (a₁b₂ − a₂b₁)².',
      ),
    ],
    misconceptions: [
      m(
        'Chọn (a₁b₁ − a₂b₂)²: đó là bình phương hiệu hai tích cùng chỉ số, không phải tích chéo.',
        'Choosing (a₁b₁ − a₂b₂)²: that is the square of the difference of same-index products, not the cross products.',
      ),
    ],
  },
  {
    id: 'conclude',
    label: m('Kết luận bước chính', 'The main conclusion'),
    narration: m(
      'Hiệu {d} là một bình phương nên không âm. Do đó vế phải trừ vế trái không âm, tức vế trái {L} không vượt quá vế phải {R}.',
      'The difference {d} is a square, so it is not negative. Hence right minus left is not negative: the left side {L} does not exceed the right side {R}.',
    ),
    hints: [
      m('Bình phương của số thực có thể âm không?', 'Can the square of a real number be negative?'),
      m(
        'Không: bình phương luôn lớn hơn hoặc bằng 0.',
        'No: a square is always greater than or equal to 0.',
      ),
      m(
        'Vậy vế phải − vế trái ≥ 0, tức vế trái ≤ vế phải, với mọi số thực.',
        'So right − left ≥ 0, that is left ≤ right, for all real numbers.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng chỉ cần hiệu dương: hiệu có thể bằng 0, nên kết luận là không âm chứ không phải dương.',
        'Thinking the difference must be positive: it may be 0, so the conclusion is "not negative", not "positive".',
      ),
    ],
  },
  {
    id: 'equality',
    label: m('Dấu bằng', 'Equality case'),
    narration: m(
      'Dấu bằng xảy ra đúng khi hiệu bằng 0, tức a₁b₂ = a₂b₁: hai cặp số tỉ lệ. Với bộ số này hiệu là {d}.',
      'Equality holds exactly when the difference is 0, that is a₁b₂ = a₂b₁: the pairs are proportional. For these numbers the difference is {d}.',
    ),
    hints: [
      m('Khi nào một bình phương bằng 0?', 'When is a square equal to 0?'),
      m('Khi biểu thức trong bình phương bằng 0.', 'When the expression inside the square is 0.'),
      m(
        'a₁b₂ − a₂b₁ = 0, tức a₁b₂ = a₂b₁: hai cặp số tỉ lệ.',
        'a₁b₂ − a₂b₁ = 0, that is a₁b₂ = a₂b₁: the two pairs are proportional.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dấu bằng xảy ra khi a₁ = b₁ và a₂ = b₂: đó chỉ là một trường hợp, điều kiện đủ là tỉ lệ.',
        'Thinking equality needs a₁ = b₁ and a₂ = b₂: that is only one case, proportionality is the full condition.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Vậy (a₁b₁ + a₂b₂)² ≤ (a₁² + a₂²)(b₁² + b₂²) với mọi số thực, dấu bằng khi và chỉ khi a₁b₂ = a₂b₁. Chìa khoá là xét hiệu hai vế và viết nó thành một bình phương.',
      'So (a₁b₁ + a₂b₂)² ≤ (a₁² + a₂²)(b₁² + b₂²) for all real numbers, with equality if and only if a₁b₂ = a₂b₁. The key is to look at the difference of the sides and write it as a square.',
    ),
    hints: [
      m(
        'Mẹo gì giúp ta chứng minh một bất đẳng thức?',
        'Which trick helps us prove an inequality?',
      ),
      m(
        'Xét hiệu hai vế rồi viết thành tổng các bình phương.',
        'Look at the difference of the sides and write it as a sum of squares.',
      ),
      m(
        'Cách này còn dùng cho AM-GM: a + b − 2√(ab) = (√a − √b)².',
        'The same trick works for AM-GM: a + b − 2√(ab) = (√a − √b)².',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng bất đẳng thức chỉ có hai biến mỗi bên: dạng tổng quát có n số, chứng minh bằng cách tương tự.',
        'Thinking it holds only for two numbers per side: the general form has n numbers, proved in a similar way.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { a1, a2, b1, b2 } = input;
  const p = a1 * b1 + a2 * b2;
  const L = p * p;
  const R = (a1 * a1 + a2 * a2) * (b1 * b1 + b2 * b2);
  const d = R - L;
  const k = a1 * b2 - a2 * b1;
  const t = (vi: string, en: string): string => msg(m(vi, en), ctx.locale);

  const nodes: Node[] = [];
  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    tag?: string,
    marks: Record<string, HighlightKind> = {},
  ): void => {
    emit(
      { nodes: nodes.map((x) => ({ ...x })) },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights: marks,
        vars,
        ...(tag ? { tags: [`beat:${tag}`] } : {}),
      },
    );
  };

  nodes.push(
    {
      id: 'g',
      kind: 'given',
      text: t(
        'Cho \\(a_1, a_2, b_1, b_2\\) là các số thực',
        'Given real numbers \\(a_1, a_2, b_1, b_2\\)',
      ),
    },
    {
      id: 'goal',
      kind: 'goal',
      text:
        t('Chứng minh ', 'Prove ') +
        '\\((a_1b_1 + a_2b_2)^2 \\le (a_1^2 + a_2^2)(b_1^2 + b_2^2)\\)',
    },
  );
  put(EX.start, 2, {}, 'start', { goal: 'active' });

  nodes.push({
    id: 'nums',
    kind: 'given',
    parent: 'g',
    text:
      t('Số cụ thể: ', 'Concrete numbers: ') +
      `\\(a_1 = ${a1}, a_2 = ${a2}, b_1 = ${b1}, b_2 = ${b2}\\)`,
  });
  put(EX.given, 1, { a1, a2, b1, b2 }, 'given', { nums: 'active' });

  nodes.push(
    {
      id: 'left',
      kind: 'have',
      parent: 'goal',
      text:
        t('Vế trái ', 'Left side ') +
        `\\(= (${n(a1)}\\cdot ${n(b1)} + ${n(a2)}\\cdot ${n(b2)})^2 = ${L}\\)`,
    },
    {
      id: 'right',
      kind: 'have',
      parent: 'goal',
      text:
        t('Vế phải ', 'Right side ') +
        `\\(= (${n(a1)}^2 + ${n(a2)}^2)(${n(b1)}^2 + ${n(b2)}^2) = ${R}\\)`,
    },
  );
  put(EX.expand, 3, { L, R }, 'expand', { left: 'compare', right: 'compare' });

  nodes.push({
    id: 'diff',
    kind: 'have',
    parent: 'goal',
    text: t('Hiệu hai vế ', 'Difference ') + `\\(= ${R} - ${L} = ${d}\\)`,
  });
  put(EX.lagrange, 4, { a1, a2, b1, b2, d }, 'lagrange', { diff: 'active' });

  nodes.push(
    {
      id: 'identity',
      kind: 'because',
      parent: 'diff',
      text:
        t('Khai triển: ', 'Expanding: ') +
        '\\(a_1^2b_2^2 - 2a_1a_2b_1b_2 + a_2^2b_1^2 = (a_1b_2 - a_2b_1)^2\\)',
    },
    {
      id: 'square',
      kind: 'therefore',
      parent: 'diff',
      text: `\\((a_1b_2 - a_2b_1)^2 = (${k})^2 = ${d}\\)`,
    },
  );
  put(EX.reveal, 4, { k, d }, undefined, { identity: 'result', square: 'result' });

  nodes.push({
    id: 'main',
    kind: 'therefore',
    parent: 'goal',
    status: 'done',
    text:
      t('Bình phương không âm nên hiệu ', 'A square is not negative, so the difference ') +
      `\\(${d} \\ge 0\\)` +
      t(', tức vế trái ≤ vế phải', ', so left ≤ right'),
  });
  put(EX.conclude, 5, { d, L, R }, 'conclude', { main: 'result' });

  nodes.push({
    id: 'equal',
    kind: 'have',
    parent: 'main',
    status: d === 0 ? 'done' : 'pending',
    text:
      d === 0
        ? t('Dấu bằng xảy ra: ', 'Equality holds: ') + `\\(a_1b_2 = a_2b_1\\)` + ` (\\(k = ${k}\\))`
        : t('Dấu bằng chỉ khi ', 'Equality only when ') +
          `\\(a_1b_2 = a_2b_1\\)` +
          ` (\\(k = ${k} \\ne 0\\))`,
  });
  put(d === 0 ? EX.equalYes : EX.equalNo, 6, { d, k }, 'equality', { equal: 'active' });

  put(EX.done, 6, {}, 'done', { goal: 'result', main: 'result' });
}

export const cauchySchwarzEntry: WalkthroughEntry<In, S> = {
  id: 'cauchy-schwarz',
  entryRev: 1,
  subject: 'math',
  visualizer: 'proofOutline',
  curriculumTopics: ['inequality-classic'],
  title: m(
    'Bất đẳng thức Cauchy–Schwarz (hai cặp số)',
    'The Cauchy–Schwarz inequality (two pairs)',
  ),
  code: {
    pseudo: [
      'Cho a₁, a₂, b₁, b₂ là các số thực',
      'Cần chứng minh: (a₁b₁ + a₂b₂)² ≤ (a₁² + a₂²)(b₁² + b₂²)',
      'Khai triển hai vế: vế trái = a₁²b₁² + 2a₁a₂b₁b₂ + a₂²b₂²; vế phải = a₁²b₁² + a₁²b₂² + a₂²b₁² + a₂²b₂²',
      'Vế phải − vế trái = a₁²b₂² − 2a₁a₂b₁b₂ + a₂²b₁² = (a₁b₂ − a₂b₁)²   (đẳng thức Lagrange)',
      'Bình phương không âm nên vế phải − vế trái ≥ 0, tức vế trái ≤ vế phải',
      'Dấu bằng xảy ra khi và chỉ khi a₁b₂ = a₂b₁',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec: {
    kind: 'record',
    fields: {
      a1: { kind: 'int', range: [-5, 5] },
      a2: { kind: 'int', range: [-5, 5] },
      b1: { kind: 'int', range: [-5, 5] },
      b2: { kind: 'int', range: [-5, 5] },
    },
  },
  customInput: false,
  presets: [
    { id: 'generic', label: m('Tổng quát', 'Generic'), input: { a1: 1, a2: 2, b1: 3, b2: 4 } },
    {
      id: 'proportional',
      label: m('Tỉ lệ (dấu bằng)', 'Proportional (equality)'),
      input: { a1: 1, a2: 2, b1: 2, b2: 4 },
    },
    { id: 'zero', label: m('Có số 0', 'With zeros'), input: { a1: 0, a2: 0, b1: 3, b2: 4 } },
    {
      id: 'negative',
      label: m('Có số âm', 'With negatives'),
      input: { a1: -1, a2: 3, b1: 2, b2: -2 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'lagrange',
      text: m(
        'Chọn nhầm tích chéo: hiệu hai vế là (a₁b₂ − a₂b₁)², không phải (a₁b₁ − a₂b₂)². Kiểm bằng số: thay a, b cụ thể vào cả hai biểu thức.',
        'Mixing up the cross products: the difference is (a₁b₂ − a₂b₁)², not (a₁b₁ − a₂b₂)². Check with numbers: put concrete a and b into both expressions.',
      ),
    },
    {
      beat: 'conclude',
      text: m(
        'Kết luận là "không âm", không phải "dương": hiệu bằng 0 khi hai cặp số tỉ lệ, và khi đó dấu bằng xảy ra.',
        'The conclusion is "not negative", not "positive": the difference is 0 when the pairs are proportional, and then equality holds.',
      ),
    },
  ],
  maxFrames: 20,
  maxBytes: 600_000,
  run,
};
