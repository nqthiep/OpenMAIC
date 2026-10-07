/**
 * Clip template: the ε-band definition of a limit (card 3B-T8): find N so that every term from N on lies in
 * (L − ε, L + ε). TypeScript half only (the Manim scene is task 3B-M8). Deterministic and browser-safe (ADR 0006):
 * the comparison |aₙ − L| < ε is done in integers (ε in hundredths), so no rounding can decide it.
 * Curriculum topic `sequences-limits` follows the SCHEMA §7 outline [Inference].
 */
import { defineClip, hints3 as hints, m } from '@/lib/clips/define';
import type { ClipEntry, ClipModule } from '@/lib/clips/types';

type Seq = 'inv-n' | 'n1-over-n' | 'alt-inv-n';
type In = { seq: Seq; eps: number };

const inputSpec = {
  kind: 'record',
  fields: {
    seq: { kind: 'enum', values: ['inv-n', 'n1-over-n', 'alt-inv-n'] },
    eps: { kind: 'number', range: [0.05, 0.5], step: 0.05 },
  },
} as const;

/** the limit of each sequence: 1/n → 0, (n+1)/n → 1, (−1)ⁿ/n → 0 */
const limitOf = (s: Seq): number => (s === 'n1-over-n' ? 1 : 0);
/** ε in hundredths, an integer: 0.05 → 5, 0.5 → 50 */
const hundredths = (eps: number): number => Math.round(eps * 100);

/**
 * Does the n-th term lie strictly inside the band? Every one of the three sequences has |aₙ − L| = 1/n, so the test
 * is 1/n < ε/100·100, that is 100 < ε_hundredths · n, in integers.
 */
export function inBand(i: In, n: number): boolean {
  return 100 < hundredths(i.eps) * n;
}

/** The smallest N with every term from N on inside the band, found by scanning up to `limit` terms. */
export function smallestN(i: In, limit = 1000): number | null {
  let candidate = limit + 1;
  for (let n = limit; n >= 1; n--) {
    if (!inBand(i, n)) break;
    candidate = n;
  }
  return candidate > limit ? null : candidate;
}

export const limitEpsilonEntry: ClipEntry<In> = defineClip<In>({
  id: 'limit-epsilon',
  curriculumTopics: ['sequences-limits'],
  title: m('Giới hạn của dãy: dải ε và số N', 'The limit of a sequence: the ε-band and N'),
  inputSpec,
  presets: [
    { id: 'inv-0.2', label: m('1/n, ε = 0,2', '1/n, ε = 0.2'), input: { seq: 'inv-n', eps: 0.2 } },
    {
      id: 'inv-0.05',
      label: m('1/n, ε = 0,05 (nhỏ nhất)', '1/n, ε = 0.05 (smallest)'),
      input: { seq: 'inv-n', eps: 0.05 },
    },
    {
      id: 'n1-0.1',
      label: m('(n + 1)/n, ε = 0,1', '(n + 1)/n, ε = 0.1'),
      input: { seq: 'n1-over-n', eps: 0.1 },
    },
    {
      id: 'alt-0.25',
      label: m('(−1)ⁿ/n, ε = 0,25', '(−1)ⁿ/n, ε = 0.25'),
      input: { seq: 'alt-inv-n', eps: 0.25 },
    },
  ],
  chapters: [
    {
      id: 'sequence',
      startSec: 0,
      endSec: 10,
      label: m('Dãy số', 'The sequence'),
      before: m(
        'Ta vẽ các số hạng của dãy trên một đường thẳng đứng, mỗi chấm là một số hạng.',
        'We plot the terms of the sequence on a vertical line, each dot a term.',
      ),
      after: m('Các chấm dồn dần về một giá trị L.', 'The dots crowd toward one value L.'),
    },
    {
      id: 'band',
      startSec: 10,
      endSec: 21,
      label: m('Dải ε', 'The ε-band'),
      before: m(
        'Quanh L ta vẽ một dải rộng từ L trừ epsilon đến L cộng epsilon.',
        'Around L we draw a band from L minus epsilon to L plus epsilon.',
      ),
      after: m(
        'Một vài số hạng đầu nằm ngoài dải, nhưng sau đó có vẻ chúng đều vào trong.',
        'A few first terms lie outside the band, but after that they all seem to be inside.',
      ),
      caption: m('L − ε < aₙ < L + ε', 'L − ε < aₙ < L + ε'),
      ask: m(
        'Theo em, các số hạng đầu tiên có nằm trong dải không?',
        'Do the very first terms lie inside the band?',
      ),
    },
    {
      id: 'find-n',
      startSec: 21,
      endSec: 36,
      label: m('Tìm N', 'Finding N'),
      before: m(
        'Ta tìm số N nhỏ nhất sao cho mọi số hạng từ N trở đi đều nằm trong dải.',
        'We look for the smallest N such that every term from N on lies inside the band.',
      ),
      after: m(
        'Từ số hạng thứ N, không còn số hạng nào rơi ra ngoài dải.',
        'From the Nth term on, no term falls outside the band.',
      ),
      caption: m('n ≥ N ⇒ trong dải', 'n ≥ N ⇒ inside'),
      ask: m(
        'Nếu ta thu hẹp dải, số N lớn lên hay nhỏ đi?',
        'If we narrow the band, does N grow or shrink?',
      ),
    },
    {
      id: 'shrink',
      startSec: 36,
      endSec: 48,
      label: m('Thu nhỏ ε', 'Shrinking ε'),
      before: m(
        'Ta thu nhỏ dải dần dần và với mỗi dải ta tìm lại N.',
        'We shrink the band step by step and find N again for each band.',
      ),
      after: m(
        'Dải càng hẹp, N càng lớn, nhưng luôn tìm được một N. Đó chính là ý nghĩa của giới hạn.',
        'The narrower the band, the larger N, but there is always an N. That is exactly what a limit means.',
      ),
    },
  ],
  invariants: (i) => {
    const n = smallestN(i);
    if (n === null) return false;
    // every term from N to 1000 is inside the band, and (unless N = 1) the term N − 1 is outside
    for (let k = n; k <= 1000; k++) if (!inBand(i, k)) return false;
    return n === 1 || !inBand(i, n - 1);
  },
  sheet: {
    chapters: [
      {
        id: 'sequence',
        shows: m(
          'các chấm a₁, a₂, … trên một đường thẳng, dồn về L',
          'the dots a₁, a₂, … on a line crowding toward L',
        ),
        formulas: [
          '\\(a_n = \\frac{1}{n}\\)',
          '\\(a_n = \\frac{n + 1}{n}\\)',
          '\\(a_n = \\frac{(-1)^n}{n}\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng dãy tiến tới L nghĩa là có số hạng bằng L: dãy 1/n tiến tới 0 mà không số hạng nào bằng 0.',
            'Thinking a sequence tending to L has a term equal to L: the sequence 1/n tends to 0 and no term is 0.',
          ),
        ],
        hints: hints(
          'Dãy 1/n có số hạng nào bằng 0 không?',
          'Không, 1/n luôn dương.',
          'Nhưng nó đến gần 0 bao nhiêu cũng được, và đó là điều "tiến tới" nghĩa là.',
          'Does the sequence 1/n have a term equal to 0?',
          'No, 1/n is always positive.',
          'But it gets as close to 0 as we like, and that is what "tends to" means.',
        ),
      },
      {
        id: 'band',
        shows: m(
          'dải ngang từ L − ε đến L + ε quanh L',
          'a horizontal band from L − ε to L + ε around L',
        ),
        formulas: ['\\(|a_n - L| < \\varepsilon\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng dải chỉ cần chứa vài số hạng: nó phải chứa mọi số hạng từ một chỉ số nào đó trở đi.',
            'Thinking the band only needs to hold a few terms: it must hold every term from some index on.',
          ),
        ],
        hints: hints(
          'Dải rộng bao nhiêu?',
          'Rộng 2ε, đối xứng quanh L.',
          'Số hạng aₙ nằm trong dải khi |aₙ − L| < ε.',
          'How wide is the band?',
          '2ε wide, symmetric around L.',
          'A term aₙ is inside the band when |aₙ − L| < ε.',
        ),
      },
      {
        id: 'find-n',
        shows: m(
          'một đường đứng ở N: bên phải nó mọi chấm đều trong dải',
          'a vertical line at N: to its right every dot is inside the band',
        ),
        formulas: [
          '\\(n \\ge N \\Rightarrow |a_n - L| < \\varepsilon\\)',
          '\\(N = \\left\\lfloor \\frac{1}{\\varepsilon} \\right\\rfloor + 1\\)',
        ],
        misconceptions: [
          m(
            'Nghĩ rằng N không phụ thuộc vào ε: ε càng nhỏ thì N càng lớn.',
            'Thinking N does not depend on ε: the smaller ε is, the larger N gets.',
          ),
        ],
        hints: hints(
          'Với dãy 1/n, khi nào 1/n < ε?',
          'Khi n > 1/ε.',
          'Số nguyên nhỏ nhất thoả điều đó là N = ⌊1/ε⌋ + 1.',
          'For the sequence 1/n, when is 1/n < ε?',
          'When n > 1/ε.',
          'The smallest integer with that property is N = ⌊1/ε⌋ + 1.',
        ),
      },
      {
        id: 'shrink',
        shows: m(
          'dải hẹp dần, đường đứng N dịch sang phải',
          'the band narrowing, the vertical line N moving to the right',
        ),
        formulas: ['\\(\\varepsilon \\to 0 \\Rightarrow N \\to \\infty\\)'],
        misconceptions: [
          m(
            'Nghĩ rằng nếu N tăng vô hạn thì giới hạn không tồn tại: với mỗi ε vẫn có một N hữu hạn, và đó là định nghĩa.',
            'Thinking that if N grows without bound the limit does not exist: for each ε there is still a finite N, and that is the definition.',
          ),
        ],
        hints: hints(
          'Khi ε giảm, N thay đổi thế nào?',
          'N tăng, vì ta phải đi xa hơn trong dãy.',
          'Điều quan trọng là với mọi ε đều tìm được một N hữu hạn.',
          'As ε shrinks, how does N change?',
          'N grows, since we must go further along the sequence.',
          'What matters is that for every ε a finite N can be found.',
        ),
      },
    ],
  },
});

/** The numbers the scene writes to manifest.json: the limit L and the smallest N. */
export function expectedDisplay(i: Readonly<In>): Record<string, number> {
  return { L: limitOf(i.seq), N: smallestN(i)! };
}

const limitEpsilon: ClipModule<In> = { entry: limitEpsilonEntry, expectedDisplay };
export default limitEpsilon;
