/**
 * Walkthrough entry: Multiplication modulo n on a clock (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m2-modular-arith`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import {
  Figure,
  circlePoint,
  gcd,
  framePut,
  sup,
  type FigState,
  type Pt,
} from '@/lib/subjects/math/figure';

type In = { n: number; a: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: { n: { kind: 'int', range: [5, 31] }, a: { kind: 'int', range: [2, 30] } },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Mặt đồng hồ', 'The clock'),
    narration: m(
      'Ta đặt các số từ 0 đến n trừ 1 đều nhau quanh một vòng tròn, như mặt đồng hồ chỉ có n giờ. Cộng và nhân trên đồng hồ này quay vòng trở lại sau số n trừ 1.',
      'We place the numbers 0 to n minus 1 evenly around a circle, like a clock with only n hours. Adding and multiplying on this clock wrap around after n minus 1.',
    ),
    hints: [
      m('Trên đồng hồ n giờ, 5 + n là giờ nào?', 'On an n-hour clock, which hour is 5 + n?'),
      m(
        'Cùng giờ với 5, vì quay đúng một vòng.',
        'The same hour as 5, since we turn exactly one full circle.',
      ),
      m(
        'Hai số cùng giờ khi hiệu của chúng chia hết cho n.',
        'Two numbers are the same hour when their difference is divisible by n.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng sau n − 1 là n: trên đồng hồ modulo n sau n − 1 quay về 0.',
        'Thinking n follows n − 1: on a clock modulo n, 0 follows n − 1.',
      ),
    ],
  },
  {
    id: 'multiply',
    label: m('Nhân với a', 'Multiplying by a'),
    narration: m(
      'Ta bắt đầu từ điểm 1 và nhân với a nhiều lần: từ mỗi điểm x ta kẻ một mũi tên tới a nhân x lấy số dư khi chia cho n. Mỗi mũi tên cho biết một điểm bị nhân với a sẽ nhảy tới đâu.',
      'We start at the point 1 and keep multiplying by a: from each point x we draw an arrow to a times x, taken modulo n. Each arrow shows where a point lands when multiplied by a.',
    ),
    ask: {
      text: m(
        'Theo em, điểm 1 sau khi nhân với a nhảy tới số nào?',
        'Which number do you think the point 1 jumps to when multiplied by a?',
      ),
      predict: {
        kind: 'choice',
        options: [m('Tới a', 'To a'), m('Tới a + 1', 'To a + 1'), m('Tới n − a', 'To n − a')],
        // a·1 = a, and a < n so there is nothing to wrap around
        answer: () => 0,
      },
    },
    hints: [
      m('Điểm 1 nhảy tới đâu khi nhân với a?', 'Where does the point 1 jump when multiplied by a?'),
      m('Tới a, vì 1·a = a (lấy theo n).', 'To a, since 1·a = a (modulo n).'),
      m('Điểm k nhảy tới a·k mod n.', 'The point k jumps to a·k mod n.'),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng phép nhân với a luôn cho n điểm khác nhau: nếu a và n có ước chung thì nhiều điểm trùng nhau.',
        'Thinking multiplying by a always gives n different points: if a and n share a factor, many points coincide.',
      ),
    ],
  },
  {
    id: 'powers',
    label: m('Các luỹ thừa', 'The powers'),
    narration: m(
      'Ta nhân liên tiếp với a, được a, a bình phương, a lập phương, và cứ thế, mỗi lần lấy số dư theo n. Vì chỉ có n số trên đồng hồ, các luỹ thừa sớm muộn phải lặp lại.',
      'We multiply by a again and again, getting a, a squared, a cubed and so on, each time modulo n. Since the clock has only n numbers, the powers must repeat sooner or later.',
    ),
    ask: {
      text: m(
        'Theo em, dãy các luỹ thừa a, a², a³, … modulo n có lặp lại không?',
        'Does the sequence of powers a, a², a³, … modulo n repeat?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Có, sớm muộn sẽ lặp', 'Yes, sooner or later it repeats'),
          m('Không, chúng mới mãi', 'No, they are always new'),
        ],
        // only n values exist, so a value must come back (pigeonhole)
        answer: () => 0,
      },
    },
    hints: [
      m(
        'Có bao nhiêu giá trị khác nhau modulo n?',
        'How many different values are there modulo n?',
      ),
      m('Đúng n giá trị.', 'Exactly n.'),
      m(
        'Dãy dài hơn n số hạng thì có hai số hạng giống nhau (nguyên lý Dirichlet), nên lặp.',
        'A sequence longer than n terms has two equal terms (pigeonhole), so it repeats.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng luỹ thừa của a luôn tăng mãi: modulo n chúng chỉ nhận n giá trị nên phải lặp lại.',
        'Thinking the powers of a keep growing: modulo n they take only n values, so they must repeat.',
      ),
    ],
  },
  {
    id: 'cycle',
    label: m('Chu kỳ', 'The cycle'),
    narration: m(
      'Ta tô sáng đoạn dãy lặp lại và đếm độ dài của nó. Đó là chu kỳ của luỹ thừa của a modulo n, và nó không phải lúc nào cũng bằng n trừ 1.',
      'We highlight the stretch of the sequence that repeats and count its length. That is the cycle of the powers of a modulo n, and it is not always n minus 1.',
    ),
    hints: [
      m('Chu kỳ là gì?', 'What is the period?'),
      m(
        'Số bước nhỏ nhất để dãy luỹ thừa quay lại một giá trị đã gặp trong phần lặp.',
        'The least number of steps for the sequence of powers to return to a value met in the repeating part.',
      ),
      m(
        'Nếu a và n nguyên tố cùng nhau, chu kỳ chia hết φ(n); với n nguyên tố, nó chia hết n − 1.',
        'If a and n are coprime the period divides φ(n); for a prime n it divides n − 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng mọi a đều có chu kỳ n − 1: chỉ có với căn nguyên thuỷ modulo số nguyên tố.',
        'Thinking every a has period n − 1: only a primitive root modulo a prime does.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Luỹ thừa của a modulo n luôn lặp lại vì chỉ có n giá trị. Độ dài chu kỳ phụ thuộc vào a và n, và không phải lúc nào cũng là n − 1. Đổi mẫu để thử các cặp khác.',
      'The powers of a modulo n always repeat because there are only n values. The length of the cycle depends on a and n, and is not always n − 1. Change the preset to try other pairs.',
    ),
    hints: [
      m('Vì sao dãy luỹ thừa phải lặp lại?', 'Why must the sequence of powers repeat?'),
      m(
        'Vì modulo n chỉ có n giá trị, nên sớm muộn một giá trị xuất hiện lần nữa.',
        'Because modulo n there are only n values, so sooner or later one comes back.',
      ),
      m(
        'Chu kỳ dài nhất có thể là n − 1, đạt được khi a là căn nguyên thuỷ của số nguyên tố n.',
        'The longest possible cycle is n − 1, reached when a is a primitive root of a prime n.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng mọi a đều có chu kỳ n − 1: chỉ căn nguyên thuỷ modulo một số nguyên tố mới có.',
        'Thinking every a has a cycle of n − 1: only a primitive root modulo a prime does.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Mặt đồng hồ chỉ có n = {n} giờ: các số từ 0 đến {n1} nằm đều quanh vòng tròn, đi hết {n1} thì quay về 0.',
    'A clock with only n = {n|hour|hours}: the numbers 0 to {n1} sit evenly around the circle, and after {n1} comes 0 again.',
  ),
  multiply1: m(
    'Nhân với a = {a}: mũi tên đi từ điểm 1 tới điểm {a}, vì {a} × 1 = {a} (mod {n}).',
    'Multiply by a = {a}: the arrow goes from the point 1 to the point {a}, since {a} × 1 = {a} (mod {n}).',
  ),
  multiply2: m(
    'Mỗi điểm k nhảy tới {a}·k lấy dư cho {n}. Chỉ có {d} điểm đến khác nhau, vì ước chung lớn nhất của {a} và {n} là {g}.',
    'Each point k jumps to {a}·k modulo {n}. Only {d} different points are reached, because the gcd of {a} and {n} is {g}.',
  ),
  powers: m(
    'Luỹ thừa thứ {t}: {pw} ≡ {v} (mod {n}). Mũi tên nối kết quả trước với kết quả này.',
    'The power number {t}: {pw} ≡ {v} (mod {n}). The arrow joins the previous result to this one.',
  ),
  cyclePure: m(
    'Các luỹ thừa của {a} modulo {n} quay về điểm xuất phát sau {period} bước: chu kỳ là {period}, còn n − 1 = {n1}.',
    'The powers of {a} modulo {n} come back to the start after {period|step|steps}: the cycle is {period}, while n − 1 = {n1}.',
  ),
  cycleTail: m(
    'Sau {tail} số hạng đầu, các luỹ thừa của {a} modulo {n} đi vào một vòng lặp độ dài {period} (nét đậm); n − 1 = {n1}.',
    'After the first {tail|term|terms} the powers of {a} modulo {n} enter a loop of length {period} (bold); n − 1 = {n1}.',
  ),
  done: m(
    'Luỹ thừa của {a} modulo {n} lặp lại với chu kỳ {period}, không nhất thiết bằng n − 1 = {n1}.',
    'The powers of {a} modulo {n} repeat with a cycle of {period}, not necessarily n − 1 = {n1}.',
  ),
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { n, a } = input;
  const R = 3;
  const g = gcd(a, n);
  const bounds = { xmin: -4, xmax: 4, ymin: -4, ymax: 4 };
  /** the clock: 0 at the top and the numbers going clockwise */
  const at = (k: number): Pt => circlePoint(90 - (360 * k) / n, R);
  const clock = (): Figure => {
    const fig = new Figure(bounds);
    for (let k = 0; k < n; k++) fig.point(`c${k}`, at(k), `${k}`, { r: 5 });
    return fig;
  };
  /** the powers 1, a, a², …: s[i] = aⁱ mod n, until the first value that has been seen before */
  const s: number[] = [1 % n];
  const seen = new Map<number, number>([[s[0], 0]]);
  let tail = 0;
  let period = 0;
  for (;;) {
    const next = (s[s.length - 1] * a) % n;
    if (seen.has(next)) {
      tail = seen.get(next)!;
      period = s.length - tail;
      s.push(next);
      break;
    }
    seen.set(next, s.length);
    s.push(next);
  }
  /** the arrows s[k − 1] → s[k] for k = 1..upTo (a value that maps to itself has no arrow to draw) */
  const chain = (
    fig: Figure,
    upTo: number,
    mark: (k: number) => HighlightKind,
  ): Record<string, HighlightKind> => {
    const marks: Record<string, HighlightKind> = {};
    for (let k = 1; k <= upTo; k++) {
      if (s[k - 1] !== s[k]) {
        fig.seg(`w${k}`, `c${s[k - 1]}`, `c${s[k]}`, { arrow: true });
        marks[`w${k}`] = mark(k);
      }
    }
    return marks;
  };
  const put = framePut(emit, ctx.locale);
  const base = { n, n1: n - 1, a };

  put(EX.start, 1, clock(), base, 'start', { c0: 'active' });
  put(
    EX.multiply1,
    2,
    (() => {
      const fig = clock();
      if (a % n !== 1) fig.seg('m1', 'c1', `c${a % n}`, { arrow: true });
      return fig;
    })(),
    base,
    'multiply',
    { c1: 'active', [`c${a % n}`]: 'result', m1: 'active' },
  );
  {
    const fig = clock();
    const marks: Record<string, HighlightKind> = {};
    for (let k = 1; k < n; k++) {
      const img = (a * k) % n;
      if (img !== k) {
        fig.seg(`m${k}`, `c${k}`, `c${img}`, { arrow: true });
        marks[`m${k}`] = k === 1 ? 'active' : 'compare';
      }
    }
    put(EX.multiply2, 2, fig, { ...base, g, d: n / g }, undefined, marks);
  }
  const shown = Math.min(s.length - 1, 8);
  for (let t = 1; t <= shown; t++) {
    const fig = clock();
    const marks = chain(fig, t, (k) => (k === t ? 'active' : 'result'));
    marks[`c${s[t]}`] = 'active';
    put(
      EX.powers,
      3,
      fig,
      { ...base, t, v: s[t], pw: `${a}${sup(t)}` },
      t === 1 ? 'powers' : undefined,
      marks,
    );
  }
  const loop = clock();
  const loopMarks = chain(loop, s.length - 1, (k) => (k > tail ? 'active' : 'muted'));
  const v = { ...base, tail, period };
  put(tail === 0 ? EX.cyclePure : EX.cycleTail, 4, loop, v, 'cycle', loopMarks);
  put(EX.done, 4, loop, v, 'done', loopMarks);
}

export const modularClockEntry: WalkthroughEntry<In, S> = {
  id: 'modular-clock',
  entryRev: 3,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m2-modular-arith'],
  title: m('Nhân modulo trên mặt đồng hồ', 'Multiplication modulo n on a clock'),
  code: {
    pseudo: [
      'n điểm đều nhau trên vòng tròn, đánh số 0 tới n − 1',
      'mũi tên từ 1 tới a, rồi các mũi tên nối k tới a·k mod n',
      'dãy 1, a, a², … mod n được ghi và nối bằng các mũi tên',
      'đoạn lặp được tô đậm cùng độ dài chu kỳ',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  check: (i) => (i.a >= i.n ? ['a-not-less-than-n'] : []),
  customInput: false,
  presets: [
    { id: 'n10-a2', label: m('n = 10, a = 2', 'n = 10, a = 2'), input: { n: 10, a: 2 } },
    {
      id: 'n7-a3',
      label: m(
        'n = 7, a = 3 (sinh mọi số khác 0)',
        'n = 7, a = 3 (generates every non-zero value)',
      ),
      input: { n: 7, a: 3 },
    },
    { id: 'n12-a5', label: m('n = 12, a = 5', 'n = 12, a = 5'), input: { n: 12, a: 5 } },
    { id: 'n5-a4', label: m('n = 5, a = 4', 'n = 5, a = 4'), input: { n: 5, a: 4 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng sau n − 1 là n: trên đồng hồ modulo n sau n − 1 quay về 0.',
        'Thinking n follows n − 1: on a clock modulo n, 0 follows n − 1.',
      ),
    },
    {
      beat: 'multiply',
      text: m(
        'Nghĩ rằng phép nhân với a luôn cho n điểm khác nhau: nếu a và n có ước chung thì nhiều điểm trùng nhau.',
        'Thinking multiplying by a always gives n different points: if a and n share a factor, many points coincide.',
      ),
    },
    {
      beat: 'powers',
      text: m(
        'Nghĩ rằng luỹ thừa của a luôn tăng mãi: modulo n chúng chỉ nhận n giá trị nên phải lặp lại.',
        'Thinking the powers of a keep growing: modulo n they take only n values, so they must repeat.',
      ),
    },
    {
      beat: 'cycle',
      text: m(
        'Nghĩ rằng mọi a đều có chu kỳ n − 1: chỉ có với căn nguyên thuỷ modulo số nguyên tố.',
        'Thinking every a has period n − 1: only a primitive root modulo a prime does.',
      ),
    },
  ],
  maxFrames: 14,
  maxBytes: 200_000,
  run,
};
