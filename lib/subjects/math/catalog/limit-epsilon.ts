/**
 * Walkthrough entry: The limit of a sequence: the ε-band and N (ADR 0015; replaces the clip of the same id). Deterministic and browser-safe (ADR 0006).
 * Curriculum topic `m3-sequences-limits`.
 */
import type { BeatDef, Messages, WalkthroughEntry } from '@/lib/tutor/catalog/types';
import type { Emit, HighlightKind, RunContext } from '@/lib/tutor/engine/types';
import type { InputSpec } from '@/lib/tutor/input-spec';
import { Figure, frac, framePut, type FigState } from '@/lib/subjects/math/figure';

type Seq = 'inv-n' | 'n1-over-n' | 'alt-inv-n';
/** ε = e/20, so every number on the page is an exact fraction */
type In = { seq: Seq; e: number };
type S = FigState;

const m = (vi: string, en: string): Messages => ({ 'vi-VN': vi, 'en-US': en });

const inputSpec: InputSpec = {
  kind: 'record',
  fields: {
    seq: { kind: 'enum', values: ['inv-n', 'n1-over-n', 'alt-inv-n'] },
    e: { kind: 'int', range: [1, 10] },
  },
};

const beatDefs: readonly BeatDef[] = [
  {
    id: 'start',
    required: true,
    label: m('Dãy số', 'The sequence'),
    narration: m(
      'Ta vẽ các số hạng của dãy: chỉ số n chạy ngang, giá trị đi lên, mỗi chấm là một số hạng. Các chấm dồn dần về một giá trị L.',
      'We plot the terms of the sequence: the index n runs across, the value goes up, each dot a term. The dots crowd toward one value L.',
    ),
    hints: [
      m('Dãy 1/n có số hạng nào bằng 0 không?', 'Does the sequence 1/n have a term equal to 0?'),
      m('Không, 1/n luôn dương.', 'No, 1/n is always positive.'),
      m(
        'Nhưng nó đến gần 0 bao nhiêu cũng được, và đó là điều "tiến tới" nghĩa là.',
        'But it gets as close to 0 as we like, and that is what "tends to" means.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dãy tiến tới L nghĩa là có số hạng bằng L: dãy 1/n tiến tới 0 mà không số hạng nào bằng 0.',
        'Thinking a sequence tending to L has a term equal to L: the sequence 1/n tends to 0 and no term is 0.',
      ),
    ],
  },
  {
    id: 'band',
    label: m('Dải ε', 'The ε-band'),
    narration: m(
      'Quanh L ta vẽ một dải rộng từ L trừ epsilon đến L cộng epsilon. Một vài số hạng đầu nằm ngoài dải, nhưng sau đó có vẻ chúng đều vào trong.',
      'Around L we draw a band from L minus epsilon to L plus epsilon. A few first terms lie outside the band, but after that they all seem to be inside.',
    ),
    ask: {
      text: m(
        'Theo em, các số hạng đầu tiên có nằm hết trong dải không?',
        'Do you think the very first terms all lie inside the band?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Có, nằm hết', 'Yes, all inside'),
          m('Không, vài số hạng nằm ngoài', 'No, a few lie outside'),
        ],
        // |aₙ − L| = 1/n, so the first terms (n ≤ 20/e, at least 2 of them) are outside every band of the input range
        answer: () => 1,
      },
    },
    hints: [
      m('Dải rộng bao nhiêu?', 'How wide is the band?'),
      m('Rộng 2ε, đối xứng quanh L.', '2ε wide, symmetric around L.'),
      m(
        'Số hạng aₙ nằm trong dải khi |aₙ − L| < ε.',
        'A term aₙ is inside the band when |aₙ − L| < ε.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng dải chỉ cần chứa vài số hạng: nó phải chứa mọi số hạng từ một chỉ số nào đó trở đi.',
        'Thinking the band only needs to hold a few terms: it must hold every term from some index on.',
      ),
    ],
  },
  {
    id: 'find-n',
    label: m('Tìm N', 'Finding N'),
    narration: m(
      'Ta tìm số N nhỏ nhất sao cho mọi số hạng từ N trở đi đều nằm trong dải. Từ số hạng thứ N, không còn số hạng nào rơi ra ngoài dải.',
      'We look for the smallest N such that every term from N on lies inside the band. From the Nth term on, no term falls outside the band.',
    ),
    ask: {
      text: m(
        'Nếu ta thu hẹp dải, số N lớn lên hay nhỏ đi?',
        'If we narrow the band, does N grow or shrink?',
      ),
      predict: {
        kind: 'choice',
        options: [
          m('Lớn lên', 'It grows'),
          m('Nhỏ đi', 'It shrinks'),
          m('Không đổi', 'It stays the same'),
        ],
        answer: () => 0,
      },
    },
    hints: [
      m('Với dãy 1/n, khi nào 1/n < ε?', 'For the sequence 1/n, when is 1/n < ε?'),
      m('Khi n > 1/ε.', 'When n > 1/ε.'),
      m(
        'Số nguyên nhỏ nhất thoả điều đó là N = ⌊1/ε⌋ + 1.',
        'The smallest integer with that property is N = ⌊1/ε⌋ + 1.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng N không phụ thuộc vào ε: ε càng nhỏ thì N càng lớn.',
        'Thinking N does not depend on ε: the smaller ε is, the larger N gets.',
      ),
    ],
  },
  {
    id: 'shrink',
    label: m('Thu nhỏ ε', 'Shrinking ε'),
    narration: m(
      'Ta thu nhỏ dải dần dần và với mỗi dải ta tìm lại N. Dải càng hẹp, N càng lớn, nhưng luôn tìm được một N. Đó chính là ý nghĩa của giới hạn.',
      'We shrink the band step by step and find N again for each band. The narrower the band, the larger N, but there is always an N. That is exactly what a limit means.',
    ),
    hints: [
      m('Khi ε giảm, N thay đổi thế nào?', 'As ε shrinks, how does N change?'),
      m(
        'N tăng, vì ta phải đi xa hơn trong dãy.',
        'N grows, since we must go further along the sequence.',
      ),
      m(
        'Điều quan trọng là với mọi ε đều tìm được một N hữu hạn.',
        'What matters is that for every ε a finite N can be found.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng nếu N tăng vô hạn thì giới hạn không tồn tại: với mỗi ε vẫn có một N hữu hạn, và đó là định nghĩa.',
        'Thinking that if N grows without bound the limit does not exist: for each ε there is still a finite N, and that is the definition.',
      ),
    ],
  },
  {
    id: 'done',
    required: true,
    label: m('Kết thúc', 'Done'),
    narration: m(
      'Dãy có giới hạn L nghĩa là: với mọi ε > 0 đều tìm được N sao cho từ số hạng thứ N trở đi mọi số hạng nằm trong dải. ε càng nhỏ thì N càng lớn, nhưng luôn tìm được. Đổi mẫu để thử dãy khác.',
      'A sequence has the limit L means: for every ε > 0 there is an N such that from the Nth term on every term lies inside the band. The smaller ε, the larger N, but one always exists. Change the preset to try another sequence.',
    ),
    hints: [
      m('Giới hạn nghĩa là gì theo ε và N?', 'What does the limit mean in terms of ε and N?'),
      m(
        'Với mọi ε > 0 đều tìm được N: từ số hạng thứ N trở đi mọi số hạng nằm trong dải.',
        'For every ε > 0 there is an N: from the Nth term on every term lies in the band.',
      ),
      m(
        'N phụ thuộc vào ε: dải hẹp hơn cần N lớn hơn.',
        'N depends on ε: a narrower band needs a larger N.',
      ),
    ],
    misconceptions: [
      m(
        'Nghĩ rằng một N dùng được cho mọi ε: N phụ thuộc vào ε, ε nhỏ hơn thì phải chọn N lớn hơn.',
        'Thinking one N works for every ε: N depends on ε, and a smaller ε needs a larger N.',
      ),
    ],
  },
];

const EX = {
  start: m(
    'Các số hạng a₁, a₂, … của dãy {seq} dồn về L = {L}: chỉ số n chạy ngang, giá trị đi lên, mỗi chấm là một số hạng.',
    'The terms a₁, a₂, … of the sequence {seq} crowd toward L = {L}: the index n runs across, the value goes up, each dot a term.',
  ),
  band: m(
    'Dải từ L − ε đến L + ε với ε = {eps}: {out} số hạng đầu nằm ngoài dải (cam), sau đó có vẻ chúng đều vào trong (xanh).',
    'The band from L − ε to L + ε with ε = {eps}: the first {out|term|terms} lie outside it (orange), after that they all seem to be inside (green).',
  ),
  findN: m(
    'Vì |aₙ − L| = 1/n, số hạng thứ n nằm trong dải khi 1/n < {eps}, tức n > {bound}. Vậy N = {N}: từ số hạng thứ {N} không còn số hạng nào ngoài dải.',
    'Since |aₙ − L| = 1/n, the nth term is inside when 1/n < {eps}, that is n > {bound}. So N = {N}: from the {N}th term on no term is outside the band.',
  ),
  shrink: m(
    'Thu hẹp dải còn ε = {eps} (hình phóng to quanh L): cần n > {bound}, nên N = {N}, lớn hơn trước.',
    'Narrow the band to ε = {eps} (the picture is zoomed in on L): we need n > {bound}, so N = {N}, larger than before.',
  ),
  done: m(
    'Với ε = {eps} thì N = {N}; ε nhỏ hơn thì N lớn hơn, nhưng với mọi ε đều tìm được N. Đó là ý nghĩa của giới hạn.',
    'For ε = {eps} we get N = {N}; a smaller ε gives a larger N, but every ε has one. That is what a limit means.',
  ),
};

const SEQ: Record<Seq, { name: string; L: number }> = {
  'inv-n': { name: '1/n', L: 0 },
  'n1-over-n': { name: '(n + 1)/n', L: 1 },
  'alt-inv-n': { name: '(−1)ⁿ/n', L: 0 },
};

function run(input: Readonly<In>, emit: Emit<S>, _tick: () => void, ctx: RunContext): void {
  const { seq, e } = input;
  const { name, L } = SEQ[seq];
  /** the n-th term: L plus or minus 1/n (the sign alternates only for (−1)ⁿ/n), so |aₙ − L| = 1/n for the three sequences */
  const term = (n: number): number => L + (seq === 'alt-inv-n' && n % 2 === 1 ? -1 : 1) / n;
  /** ε = e/(20·2^j): the band after j halvings; a term is inside when 1/n < ε, that is n·e > 20·2^j */
  const half = (j: number): number => 20 * 2 ** j;
  const eps = (j: number): string => frac(e, half(j));
  const bigN = (j: number): number => Math.floor(half(j) / e) + 1;
  const bound = (j: number): string => frac(half(j), e);
  const inside = (n: number, j: number): boolean => n * e > half(j);

  /**
   * The picture for the band after j halvings: the terms a₁… that fall in the window, the band, the line at N. The first frames
   * show the whole sequence (j = 0 with the window L ± 5/4); after that the window is zoomed to L ± 4ε.
   */
  const picture = (j: number, withBand: boolean, withN: boolean, wide: boolean) => {
    const epsNum = e / half(j);
    const N = bigN(j);
    const K = wide ? 30 : N + 10;
    const h = wide ? 1.25 : 4 * epsNum;
    // the picture keeps the proportions of the page: the n axis is scaled so the window is about 1.7 times as wide as it is tall
    const sx = (3.4 * h) / (K + 1);
    // the window is rounded outwards so that the rounded points never stick out of it
    const bounds = {
      xmin: 0,
      xmax: Math.ceil((K + 1) * sx * 1000) / 1000,
      ymin: Math.floor((L - h) * 1000) / 1000,
      ymax: Math.ceil((L + h) * 1000) / 1000,
    };
    const fig = new Figure(bounds)
      .anchor('l0', [0, L])
      .anchor('l1', [(K + 1) * sx, L])
      .seg('lim', 'l0', 'l1', { dashed: true })
      .anchor('lt', [0.9 * sx, L], 'L', true);
    const marks: Record<string, HighlightKind> = { lim: 'muted' };
    if (withBand) {
      fig.rect('band', 0, L - epsNum, (K + 1) * sx, L + epsNum);
      marks.band = 'group-0';
    }
    for (let n = 1; n <= K; n++) {
      if (Math.abs(term(n) - L) > h) continue; // outside the window
      fig.point(`t${n}`, [n * sx, term(n)], '', { r: 5 });
      marks[`t${n}`] = withBand ? (inside(n, j) ? 'result' : 'compare') : 'active';
    }
    if (withN) {
      fig
        .anchor('n0', [(N - 0.5) * sx, L - h])
        .anchor('n1', [(N - 0.5) * sx, L + h])
        .seg('lineN', 'n0', 'n1', { dashed: true });
      marks.lineN = 'result';
    }
    return { fig, marks };
  };
  const put = framePut(emit, ctx.locale);
  const at = (
    text: Messages,
    codeLine: number,
    pic: { fig: Figure; marks: Record<string, HighlightKind> },
    vars: Record<string, number | string>,
    beat?: string,
  ): void => put(text, codeLine, pic.fig, vars, beat, pic.marks);
  const N0 = bigN(0);

  at(EX.start, 1, picture(0, false, false, true), { seq: name, L }, 'start');
  at(EX.band, 2, picture(0, true, false, true), { eps: eps(0), out: N0 - 1 }, 'band');
  at(EX.findN, 3, picture(0, true, true, true), { eps: eps(0), bound: bound(0), N: N0 }, 'find-n');
  [1, 2].forEach((j) =>
    at(
      EX.shrink,
      4,
      picture(j, true, true, false),
      { eps: eps(j), bound: bound(j), N: bigN(j) },
      j === 1 ? 'shrink' : undefined,
    ),
  );
  at(EX.done, 4, picture(0, true, true, true), { eps: eps(0), N: N0 }, 'done');
}

export const limitEpsilonEntry: WalkthroughEntry<In, S> = {
  id: 'limit-epsilon',
  entryRev: 1,
  subject: 'math',
  visualizer: 'geometry',
  curriculumTopics: ['m3-sequences-limits'],
  title: m('Giới hạn của dãy: dải ε và số N', 'The limit of a sequence: the ε-band and N'),
  code: {
    pseudo: [
      'các chấm a₁, a₂, … trên một đường thẳng, dồn về L',
      'dải ngang từ L − ε đến L + ε quanh L',
      'một đường đứng ở N: bên phải nó mọi chấm đều trong dải',
      'dải hẹp dần, đường đứng N dịch sang phải',
    ],
    impl: { cpp: [], py: [] },
    map: { cpp: {}, py: {} },
  },
  inputSpec,
  customInput: false,
  presets: [
    { id: 'inv-0.2', label: m('1/n, ε = 0,2', '1/n, ε = 0.2'), input: { seq: 'inv-n', e: 4 } },
    {
      id: 'inv-0.05',
      label: m('1/n, ε = 0,05 (nhỏ nhất)', '1/n, ε = 0.05 (smallest)'),
      input: { seq: 'inv-n', e: 1 },
    },
    {
      id: 'n1-0.1',
      label: m('(n + 1)/n, ε = 0,1', '(n + 1)/n, ε = 0.1'),
      input: { seq: 'n1-over-n', e: 2 },
    },
    {
      id: 'alt-0.25',
      label: m('(−1)ⁿ/n, ε = 0,25', '(−1)ⁿ/n, ε = 0.25'),
      input: { seq: 'alt-inv-n', e: 5 },
    },
  ],
  beatDefs,
  pitfalls: [
    {
      beat: 'start',
      text: m(
        'Nghĩ rằng dãy tiến tới L nghĩa là có số hạng bằng L: dãy 1/n tiến tới 0 mà không số hạng nào bằng 0.',
        'Thinking a sequence tending to L has a term equal to L: the sequence 1/n tends to 0 and no term is 0.',
      ),
    },
    {
      beat: 'band',
      text: m(
        'Nghĩ rằng dải chỉ cần chứa vài số hạng: nó phải chứa mọi số hạng từ một chỉ số nào đó trở đi.',
        'Thinking the band only needs to hold a few terms: it must hold every term from some index on.',
      ),
    },
    {
      beat: 'find-n',
      text: m(
        'Nghĩ rằng N không phụ thuộc vào ε: ε càng nhỏ thì N càng lớn.',
        'Thinking N does not depend on ε: the smaller ε is, the larger N gets.',
      ),
    },
    {
      beat: 'shrink',
      text: m(
        'Nghĩ rằng nếu N tăng vô hạn thì giới hạn không tồn tại: với mỗi ε vẫn có một N hữu hạn, và đó là định nghĩa.',
        'Thinking that if N grows without bound the limit does not exist: for each ε there is still a finite N, and that is the definition.',
      ),
    },
  ],
  maxFrames: 8,
  maxBytes: 200_000,
  run,
};
