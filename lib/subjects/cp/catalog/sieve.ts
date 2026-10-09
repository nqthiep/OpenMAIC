/**
 * Walkthrough entry: the sieve of Eratosthenes (SCHEMA §5, card 2B-01).
 * Deterministic and browser-safe: no Intl/Date/Math.random (ADR 0006).
 */
import { fill, msg } from '@/lib/tutor/catalog/messages';
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';

type In = { n: number };
type S = { rows: number; cols: number; cells: (number | null)[][] };

const COLS = 10;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

/** Per-frame explanation templates; '{var}' is filled from the frame's vars. Each ≤ 160 chars. */
const EX = {
  start: m(
    'Tìm mọi số nguyên tố ≤ {n}. Số 1 không phải số nguyên tố nên bị loại; bắt đầu với p = 2, số nguyên tố đầu tiên.',
    'Find every prime ≤ {n}. The number 1 is not prime, so it is out; start with p = 2, the first prime.',
  ),
  next: m(
    'Số nhỏ nhất chưa bị gạch sau {prev} là p = {p}. Nó không có ước nhỏ hơn, nên p = {p} là số nguyên tố.',
    'The smallest number not crossed out after {prev} is p = {p}. It has no smaller divisor, so p = {p} is prime.',
  ),
  cross: m(
    'Gạch các bội của p = {p} từ p·p = {from} trở đi: có {new} số mới bị gạch.',
    'Cross out the multiples of p = {p} from p·p = {from} on: {new|new number|new numbers} are crossed.',
  ),
  crossNone: m(
    'Gạch các bội của p = {p} từ p·p = {from} trở đi: không có số mới nào bị gạch (đã bị gạch từ trước).',
    'Cross out the multiples of p = {p} from p·p = {from} on: no new number is crossed (all were crossed before).',
  ),
  stop: m(
    'p = {p}: p·p = {pp} > {n}, nên dừng. Mọi số chưa bị gạch đều là số nguyên tố.',
    'p = {p}: p·p = {pp} > {n}, so we stop. Every number not crossed out is prime.',
  ),
  done: m(
    'Có {count} số nguyên tố ≤ {n} (các ô sáng màu).',
    'There are {count|prime|primes} ≤ {n} (the highlighted cells).',
  ),
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Bắt đầu', 'Start'),
    narration: m(
      'Sàng Eratosthenes: viết các số từ 1 đến {n}, rồi gạch dần các hợp số. Những số không bị gạch là số nguyên tố.',
      'The sieve of Eratosthenes: write the numbers 1 to {n}, then cross out the composites one by one. The numbers never crossed out are prime.',
    ),
    hints: [
      m('Một hợp số khác số nguyên tố ở điểm nào?', 'How does a composite differ from a prime?'),
      m(
        'Hợp số là bội của một số nhỏ hơn nó. Nếu gạch mọi bội của các số nguyên tố thì còn gì?',
        'A composite is a multiple of a smaller number. If we cross out all multiples of primes, what is left?',
      ),
      m(
        'Còn đúng các số nguyên tố: ta chọn số chưa bị gạch nhỏ nhất, gạch bội của nó, rồi lặp lại.',
        'Exactly the primes: pick the smallest uncrossed number, cross out its multiples, and repeat.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng 1 là số nguyên tố: 1 chỉ có một ước nên không phải.',
        'Thinking 1 is prime: it has only one divisor, so it is not.',
      ),
    ],
  },
  {
    id: 'next-prime',
    label: m('Số nguyên tố kế tiếp', 'The next prime'),
    narration: m(
      'Sau {prev}, số nhỏ nhất chưa bị gạch là {p}. Mọi ước nhỏ hơn của nó đã gạch hết bội, nên {p} là số nguyên tố; giờ ta gạch bội của nó.',
      'After {prev}, the smallest number not crossed out is {p}. Every smaller divisor already crossed its multiples, so {p} is prime; now we cross out its multiples.',
    ),
    ask: {
      text: m(
        'Theo em, ta bắt đầu gạch từ bội nào của p?',
        'From which multiple of p do we start crossing?',
      ),
      predict: {
        kind: 'choice',
        options: [m('2p', '2p'), m('p·p', 'p·p')],
        answer: (frame, next) => {
          const p = frame.meta.vars?.p;
          return typeof p === 'number' && next?.meta.vars?.from === p * p ? 1 : 0;
        },
      },
    },
    hints: [
      m(
        'Bội nhỏ như 2p, 3p của p có thể đã bị gạch bởi số nào?',
        'Which number may already have crossed out small multiples such as 2p or 3p?',
      ),
      m(
        'k·p với k < p có ước k nhỏ hơn p, nên đã bị gạch ở lượt của ước nguyên tố của k.',
        'k·p with k < p has the smaller divisor k, so it was crossed out in the turn of a prime factor of k.',
      ),
      m(
        'Vì vậy bội đầu tiên chưa chắc bị gạch là p·p: bắt đầu từ p·p.',
        'So the first multiple not surely crossed out is p·p: start from p·p.',
      ),
    ],
    misconceptions: [
      m(
        'Gạch từ 2p cũng đúng nhưng thừa: các bội đó đã bị gạch rồi, tốn thời gian.',
        'Starting from 2p is also correct but wasteful: those multiples were already crossed out.',
      ),
    ],
  },
  {
    id: 'cross',
    label: m('Gạch bội', 'Cross out multiples'),
    narration: m(
      'Gạch p = {p}, {p} + {p}, … từ p·p = {from} đến hết bảng, bước nhảy p. Mọi số bị gạch đều là hợp số vì chia hết cho {p}.',
      'Cross out multiples of p = {p} from p·p = {from} to the end, stepping by p. Every crossed number is composite because {p} divides it.',
    ),
    hints: [
      m('Các bội của p cách nhau bao xa?', 'How far apart are the multiples of p?'),
      m(
        'Cách nhau đúng p: p·p, p·p + p, p·p + 2p, …',
        'Exactly p apart: p·p, p·p + p, p·p + 2p, …',
      ),
      m(
        'Gạch hết trong một lượt đến n; số đã bị gạch trước đó không sao, gạch lại cũng được.',
        'Cross all of them in one pass up to n; numbers already crossed do not matter.',
      ),
    ],
    misconceptions: [
      m(
        'Gạch luôn cả p: p là số nguyên tố, chỉ gạch bội thật sự của nó.',
        'Crossing out p itself: p is prime, only its proper multiples are crossed.',
      ),
    ],
  },
  {
    id: 'stop',
    label: m('Điều kiện dừng', 'The stopping test'),
    narration: m(
      'Khi p·p = {pp} vượt {n}, mọi hợp số ≤ {n} đã bị gạch: một hợp số có ước nguyên tố nhỏ nhất không quá căn bậc hai của nó.',
      'Once p·p = {pp} exceeds {n}, every composite ≤ {n} has been crossed out: a composite has a prime factor at most its square root.',
    ),
    hints: [
      m(
        'Một hợp số c ≤ n luôn viết được thành a·b với a ≤ b. a lớn nhất có thể là bao nhiêu?',
        'A composite c ≤ n can be written a·b with a ≤ b. How large can a be?',
      ),
      m('a·a ≤ a·b = c ≤ n, nên a ≤ √n.', 'a·a ≤ a·b = c ≤ n, so a ≤ √n.'),
      m(
        'Vậy c bị gạch bởi ước nguyên tố p ≤ √n; chỉ cần lặp khi p·p ≤ n.',
        'So c is crossed out by a prime p ≤ √n; looping while p·p ≤ n is enough.',
      ),
    ],
    misconceptions: [
      m(
        'Lặp p tới n cho chắc: vẫn đúng nhưng chậm hơn nhiều so với chỉ tới √n.',
        'Looping p up to n to be safe: still correct but much slower than stopping at √n.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Có {count} số nguyên tố ≤ {n}. Sàng tốn khoảng n log log n phép gạch, nhanh hơn nhiều so với thử chia từng số.',
      'There are {count|prime|primes} ≤ {n}. The sieve costs about n log log n crossings, far faster than trial division of each number.',
    ),
    hints: [
      m(
        'Mỗi số bị gạch nhiều nhất bao nhiêu lần?',
        'At most how many times is each number crossed out?',
      ),
      m(
        'Ít lần: chỉ một lần cho mỗi ước nguyên tố nhỏ hơn √n của nó.',
        'Only a few: once per prime factor not above √n.',
      ),
      m(
        'Tổng chi phí cỡ n log log n, gần như tuyến tính.',
        'The total cost is about n log log n, nearly linear.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng sàng kiểm tra từng số có chia hết không: nó chỉ gạch bội, không chia.',
        'Thinking the sieve tests each number for divisibility: it only crosses multiples, no division.',
      ),
    ],
  },
];

function run(input: Readonly<In>, emit: Emit<S>, tick: () => void, ctx: RunContext): void {
  const { n } = input;
  const rows = Math.ceil(n / COLS);
  const crossed: boolean[] = Array(n + 1).fill(false); // index 1..n
  crossed[1] = true;
  const confirmed = new Set<number>(); // primes whose multiples are already crossed
  const cell = (k: number): string => `${Math.floor((k - 1) / COLS)},${(k - 1) % COLS}`;

  const put = (
    text: Messages,
    codeLine: number,
    vars: Record<string, number>,
    current: number | undefined,
    allPrimes: boolean,
    tag: string,
  ): void => {
    const highlights: Record<string, HighlightKind> = {};
    for (let k = 1; k <= n; k++) {
      if (crossed[k]) highlights[cell(k)] = 'muted';
      else if (allPrimes || confirmed.has(k)) highlights[cell(k)] = 'result';
    }
    if (current !== undefined) highlights[cell(current)] = 'active';
    emit(
      {
        rows,
        cols: COLS,
        cells: Array.from({ length: rows }, (_, r) =>
          Array.from({ length: COLS }, (_, c) => (r * COLS + c + 1 <= n ? r * COLS + c + 1 : null)),
        ),
      },
      {
        explanation: fill(msg(text, ctx.locale), vars),
        codeLine,
        highlights,
        vars,
        tags: [`beat:${tag}`],
      },
    );
  };

  /** Cross out p·p, p·p + p, … once; returns how many numbers were new. */
  const crossFrom = (p: number): number => {
    let fresh = 0;
    for (let k = p * p; k <= n; k += p) {
      tick();
      if (!crossed[k]) fresh++;
      crossed[k] = true;
    }
    return fresh;
  };
  const doCross = (p: number): void => {
    const fresh = crossFrom(p);
    confirmed.add(p);
    put(fresh > 0 ? EX.cross : EX.crossNone, 4, { p, from: p * p, new: fresh }, p, false, 'cross');
  };

  put(EX.start, 2, { n }, 2, false, 'start');
  let prev = 1;
  let p = 2;
  while (p * p <= n) {
    tick();
    if (!crossed[p]) {
      if (p > 2) put(EX.next, 3, { prev, p }, p, false, 'next-prime');
      doCross(p);
      prev = p;
    }
    p++;
  }
  put(EX.stop, 2, { p, pp: p * p, n }, undefined, true, 'stop');
  let count = 0;
  for (let k = 2; k <= n; k++) if (!crossed[k]) count++;
  put(EX.done, 5, { n, count }, undefined, true, 'done');
}

export const sieveEntry: WalkthroughEntry<In, S> = {
  id: 'sieve',
  entryRev: 3,
  subject: 'cp',
  visualizer: 'grid',
  curriculumTopics: ['t2-number-basics'],
  title: m('Sàng Eratosthenes', 'The sieve of Eratosthenes'),
  code: {
    pseudo: [
      'isPrime[2..n] ← đúng',
      'for p ← 2; p · p ≤ n; p ← p + 1:',
      '    if isPrime[p]:',
      '        for m ← p · p; m ≤ n; m ← m + p: isPrime[m] ← sai',
      'return các p có isPrime[p] đúng',
    ],
    impl: {
      cpp: [
        'std::vector<int> sieve(int n) {',
        '    std::vector<bool> is_prime(n + 1, true);',
        '    for (int p = 2; p * p <= n; p++) {',
        '        if (is_prime[p]) {',
        '            for (int m = p * p; m <= n; m += p) is_prime[m] = false;',
        '        }',
        '    }',
        '    std::vector<int> primes;',
        '    for (int p = 2; p <= n; p++) if (is_prime[p]) primes.push_back(p);',
        '    return primes;',
        '}',
      ],
      py: [
        'def sieve(n):',
        '    is_prime = [True] * (n + 1)',
        '    p = 2',
        '    while p * p <= n:',
        '        if is_prime[p]:',
        '            for m in range(p * p, n + 1, p):',
        '                is_prime[m] = False',
        '        p += 1',
        '    return [p for p in range(2, n + 1) if is_prime[p]]',
      ],
    },
    map: {
      cpp: { 1: [2], 2: [3], 3: [4], 4: [5], 5: [8, 9, 10] },
      py: { 1: [2], 2: [3, 4, 8], 3: [5], 4: [6, 7], 5: [9] },
    },
  },
  inputSpec: { kind: 'record', fields: { n: { kind: 'int', range: [2, 60] } } },
  customInput: false,
  presets: [
    { id: 'n30', label: m('n = 30', 'n = 30'), input: { n: 30 } },
    { id: 'n2', label: m('Biên n = 2', 'Edge n = 2'), input: { n: 2 } },
    { id: 'n49', label: m('n = 49 (7² = n)', 'n = 49 (7² = n)'), input: { n: 49 } },
    { id: 'n60', label: m('n = 60', 'n = 60'), input: { n: 60 } },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'cross',
      text: m(
        'Bắt đầu gạch từ p·p chứ không phải 2p; và điều kiện vòng ngoài là p·p ≤ n, không phải p ≤ n.',
        'Start crossing at p·p, not 2p; and the outer condition is p·p ≤ n, not p ≤ n.',
      ),
    },
    {
      lang: 'cpp',
      beat: 'cross',
      text: m(
        'p·p có thể tràn int khi n gần 2^31: dùng long long cho p·p. vector<bool>(n + 1) cần n + 1 phần tử để chỉ số n hợp lệ.',
        'p·p can overflow int when n is near 2^31: use long long for p·p. vector<bool>(n + 1) needs n + 1 elements so index n is valid.',
      ),
    },
    {
      lang: 'py',
      beat: 'cross',
      text: m(
        'range(p * p, n + 1, p) có cận trên n + 1 để gồm cả n; viết range(p * p, n, p) sẽ bỏ sót n.',
        'range(p * p, n + 1, p) uses the upper bound n + 1 to include n; range(p * p, n, p) would miss n.',
      ),
    },
  ],
  maxFrames: 30,
  maxBytes: 200_000,
  run,
};
