/**
 * Clip template: multiplication modulo n on a clock (card 3B-T13): the chords k → a·k mod n, the powers
 * a, a², a³, … mod n and the length of their cycle. TypeScript half only (the Manim scene is task 3B-M13).
 * Deterministic and browser-safe (ADR 0006): integers only.
 * Curriculum topic `modular-arith` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type In = { n: number; a: number };

const inputSpec = {
  kind: 'record',
  fields: { n: { kind: 'int', range: [5, 31] }, a: { kind: 'int', range: [2, 30] } },
} as const;

/** a^k mod n for k = 1, 2, … until a value repeats: the powers, the index where the cycle starts and its length */
export function powerCycle(i: In): { powers: number[]; start: number; period: number } {
  const seenAt = new Map<number, number>();
  const powers: number[] = [];
  let x = i.a % i.n;
  for (let k = 0; ; k++) {
    const at = seenAt.get(x);
    if (at !== undefined) return { powers, start: at, period: k - at };
    seenAt.set(x, k);
    powers.push(x);
    x = (x * i.a) % i.n;
  }
}

export const modularClockEntry: ClipEntry<In> = defineClip<In>({
  id: 'modular-clock',
  curriculumTopics: ['modular-arith'],
  title: m('Nhân modulo trên mặt đồng hồ', 'Multiplication modulo n on a clock'),
  inputSpec,
  check: (i) => (i.a >= i.n ? ['a-not-less-than-n'] : []),
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
  chapters: [
    {
      id: 'clock',
      startSec: 0,
      endSec: 9,
      label: m('Mặt đồng hồ', 'The clock'),
      before: m(
        'Ta đặt các số từ 0 đến n trừ 1 đều nhau quanh một vòng tròn, như mặt đồng hồ chỉ có n giờ.',
        'We place the numbers 0 to n minus 1 evenly around a circle, like a clock with only n hours.',
      ),
      after: m(
        'Cộng và nhân trên đồng hồ này quay vòng trở lại sau số n trừ 1.',
        'Adding and multiplying on this clock wrap around after n minus 1.',
      ),
    },
    {
      id: 'multiply',
      startSec: 9,
      endSec: 21,
      label: m('Nhân với a', 'Multiplying by a'),
      before: m(
        'Từ mỗi điểm k ta kẻ một dây tới a nhân k lấy số dư khi chia cho n.',
        'From each point k we draw a chord to a times k, taken modulo n.',
      ),
      after: m(
        'Mỗi dây cho biết điểm k bị nhân với a sẽ nhảy tới đâu.',
        'Each chord shows where the point k lands when multiplied by a.',
      ),
      caption: m('k → a·k mod n', 'k → a·k mod n'),
      ask: m(
        'Điểm 1 sau khi nhân với a nhảy tới số nào?',
        'Which number does the point 1 jump to when multiplied by a?',
      ),
    },
    {
      id: 'powers',
      startSec: 21,
      endSec: 35,
      label: m('Các luỹ thừa', 'The powers'),
      before: m(
        'Ta nhân liên tiếp với a, được a, a bình phương, a lập phương, và cứ thế, mỗi lần lấy số dư theo n.',
        'We multiply by a again and again, getting a, a squared, a cubed and so on, each time modulo n.',
      ),
      after: m(
        'Vì chỉ có n số trên đồng hồ, các luỹ thừa sớm muộn phải lặp lại.',
        'Since the clock has only n numbers, the powers must repeat sooner or later.',
      ),
      caption: m('aᵏ mod n', 'aᵏ mod n'),
      ask: m('Theo em, dãy luỹ thừa có lặp lại không?', 'Does the sequence of powers repeat?'),
    },
    {
      id: 'cycle',
      startSec: 35,
      endSec: 46,
      label: m('Chu kỳ', 'The cycle'),
      before: m(
        'Ta tô sáng đoạn dãy lặp lại và đếm độ dài của nó.',
        'We highlight the stretch of the sequence that repeats and count its length.',
      ),
      after: m(
        'Đó là chu kỳ của luỹ thừa của a modulo n, và nó không phải lúc nào cũng bằng n trừ 1.',
        'That is the cycle of the powers of a modulo n, and it is not always n minus 1.',
      ),
      caption: m('chu kỳ', 'period'),
    },
  ],
  invariants: (i) => {
    const { powers, start, period } = powerCycle(i);
    if (period < 1 || start + period !== powers.length) return false;
    // the sequence really is periodic from `start` with this period, and no shorter period works
    let x = i.a % i.n;
    const seq: number[] = [];
    for (let k = 0; k < 4 * i.n; k++) {
      seq.push(x);
      x = (x * i.a) % i.n;
    }
    for (let k = start; k + period < seq.length; k++) if (seq[k] !== seq[k + period]) return false;
    for (let p = 1; p < period; p++) {
      let all = true;
      for (let k = start; k + p < seq.length; k++)
        if (seq[k] !== seq[k + p]) {
          all = false;
          break;
        }
      if (all) return false;
    }
    return true;
  },
  sheet: {
    chapters: [
      {
        id: 'clock',
        shows: m(
          'n điểm đều nhau trên vòng tròn, đánh số 0 tới n − 1',
          'n evenly spaced points on a circle, numbered 0 to n − 1',
        ),
        formulas: ['\\(\\mathbb{Z}_n = \\{0, 1, \\dots, n - 1\\}\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng sau n − 1 là n: trên đồng hồ modulo n sau n − 1 quay về 0.',
            'Thinking n follows n − 1: on a clock modulo n, 0 follows n − 1.',
          ),
        ],
        hints: hints(
          'Trên đồng hồ n giờ, 5 + n là giờ nào?',
          'Cùng giờ với 5, vì quay đúng một vòng.',
          'Hai số cùng giờ khi hiệu của chúng chia hết cho n.',
          'On an n-hour clock, which hour is 5 + n?',
          'The same hour as 5, since we turn exactly one full circle.',
          'Two numbers are the same hour when their difference is divisible by n.',
        ),
      },
      {
        id: 'multiply',
        shows: m('các dây nối k tới a·k mod n', 'chords joining k to a·k mod n'),
        formulas: ['\\(k \\mapsto a k \\bmod n\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng phép nhân với a luôn cho n điểm khác nhau: nếu a và n có ước chung thì nhiều điểm trùng nhau.',
            'Thinking multiplying by a always gives n different points: if a and n share a factor, many points coincide.',
          ),
        ],
        hints: hints(
          'Điểm 1 nhảy tới đâu khi nhân với a?',
          'Tới a, vì 1·a = a (lấy theo n).',
          'Điểm k nhảy tới a·k mod n.',
          'Where does the point 1 jump when multiplied by a?',
          'To a, since 1·a = a (modulo n).',
          'The point k jumps to a·k mod n.',
        ),
      },
      {
        id: 'powers',
        shows: m(
          'dãy a, a², a³, … mod n được ghi và nối bằng các mũi tên',
          'the sequence a, a², a³, … mod n written out and joined with arrows',
        ),
        formulas: ['\\(a^k \\bmod n\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng luỹ thừa của a luôn tăng mãi: modulo n chúng chỉ nhận n giá trị nên phải lặp lại.',
            'Thinking the powers of a keep growing: modulo n they take only n values, so they must repeat.',
          ),
        ],
        hints: hints(
          'Có bao nhiêu giá trị khác nhau modulo n?',
          'Đúng n giá trị.',
          'Dãy dài hơn n số hạng thì có hai số hạng giống nhau (nguyên lý Dirichlet), nên lặp.',
          'How many different values are there modulo n?',
          'Exactly n.',
          'A sequence longer than n terms has two equal terms (pigeonhole), so it repeats.',
        ),
      },
      {
        id: 'cycle',
        shows: m(
          'đoạn lặp được tô sáng cùng độ dài của nó',
          'the repeating stretch highlighted with its length',
        ),
        formulas: ['\\(\\operatorname{ord}_n(a)\\)', '\\(a^{\\varphi(n)} \\equiv 1 \\pmod n\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng mọi a đều có chu kỳ n − 1: chỉ có với căn nguyên thuỷ modulo số nguyên tố.',
            'Thinking every a has period n − 1: only a primitive root modulo a prime does.',
          ),
        ],
        hints: hints(
          'Chu kỳ là gì?',
          'Số bước nhỏ nhất để dãy luỹ thừa quay lại một giá trị đã gặp trong phần lặp.',
          'Nếu a và n nguyên tố cùng nhau, chu kỳ chia hết φ(n); với n nguyên tố, nó chia hết n − 1.',
          'What is the period?',
          'The least number of steps for the sequence of powers to return to a value met in the repeating part.',
          'If a and n are coprime the period divides φ(n); for a prime n it divides n − 1.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the length of the final cycle of a^k mod n. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { period: powerCycle(i).period };
}

const modularClock: ClipModule<In> = { entry: modularClockEntry, expectedDisplay };
export default modularClock;
